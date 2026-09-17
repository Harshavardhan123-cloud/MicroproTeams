/**
 * MeetingWebRTCManager — the mobile mediasoup/SFU engine.
 *
 * Ported 1:1 in shape from `frontend/src/services/MeetingWebRTCManager.ts` so both
 * clients speak the identical wire protocol to `backend/sfu/server.js`, with the
 * React Native deviations and the deliberate bug fixes documented inline.
 *
 * MODULE PREREQUISITE
 * -------------------
 * `registerGlobals()` from react-native-webrtc MUST have run before the first
 * `new Device()`: mediasoup-client's `detectDevice()` only selects its
 * `ReactNative106` handler when `global.RTCPeerConnection` and
 * `global.RTCRtpTransceiver` exist, and otherwise returns `undefined`, which makes
 * the Device constructor throw `UnsupportedError`. The canonical place for that
 * call is `mobile/index.js`, before anything imports this module;
 * `ensureWebRTCGlobals()` below is only a safety net for a Fast Refresh cycle that
 * dropped them.
 *
 * SFU CONTRACT NOTES THAT DRIVE THIS FILE
 * ---------------------------------------
 *  - Every emit goes through `request()`, which ALWAYS supplies an ack callback.
 *    The SFU calls `callback(...)` unguarded on several paths (including inside its
 *    own catch blocks), so a single ack-less emit throws in the server's event
 *    handler and — with no `unhandledRejection` handler installed there — takes the
 *    whole SFU process down, dropping every active room.
 *  - `request()` also imposes its own timeout: `joinRoom` on the server has no
 *    try/catch at all, so a throw inside it leaves the ack un-invoked forever.
 *  - `produce`'s ack is a bare `{ id }` (NOT wrapped in `params`).
 *  - `getProducers`' ack is a BARE ARRAY (not an object).
 *  - The JWT travels in `socket.handshake.auth.token` as a RAW token — no
 *    `Bearer ` prefix — and a successful connect is NOT proof of authentication
 *    (the server accepts unauthenticated sockets).
 */

import { AppState, PermissionsAndroid, Platform } from 'react-native';
import type { AppStateStatus } from 'react-native';
import { MediaStream, MediaStreamTrack, mediaDevices, registerGlobals } from 'react-native-webrtc';
import { Device } from 'mediasoup-client';
import type { types as MediasoupTypes } from 'mediasoup-client';
import { io, Socket } from 'socket.io-client';

import { getSfuHostUrl, getStoredToken, getTargetHostUrl } from '../api/client';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * The web manager's exact 12-member union, kept verbatim for API parity.
 * `'JOINED'` is dead on web (declared, never assigned); it is kept in the type
 * for parity but is never transitioned into here either.
 */
export type MeetingState =
  | 'IDLE'
  | 'CONNECTING'
  | 'AUTHENTICATING'
  | 'JOINING'
  | 'JOINED'
  | 'CONNECTING_MEDIA'
  | 'MEDIA_CONNECTED'
  | 'IN_MEETING'
  | 'RECONNECTING'
  | 'LEAVING'
  | 'LEFT'
  | 'FAILED';

/**
 * React Native has no DOM lib, so there is no global `MediaDeviceInfo`. This
 * mirrors what react-native-webrtc's `enumerateDevices()` actually returns.
 *
 * Android reality check: the list contains video inputs plus exactly one
 * synthetic `{ deviceId: 'audio-1', kind: 'audioinput' }` entry and NEVER any
 * `audiooutput` entry, and `devicechange` never fires. Drive mic/speaker UI off
 * `LocalDeviceState.audioRoute`, not off these arrays.
 */
export interface MediaDeviceInfo {
  deviceId: string;
  kind: 'audioinput' | 'audiooutput' | 'videoinput';
  label: string;
  groupId?: string;
  /** Non-standard react-native-webrtc addition on Android video inputs. */
  facing?: 'front' | 'environment';
}

/**
 * One remote *producer* — NOT one remote participant. `remoteStreamsMap` is keyed
 * by `producerId`, so a single peer publishing mic + camera + screen occupies
 * three entries that share a `participantId`. Grouping into per-participant tiles
 * is the UI's job.
 */
export interface RemoteParticipantStream {
  producerId: string;
  /** The remote peer's SFU `socket.id` — it changes on every reconnect. */
  participantId: string;
  userName: string;
  kind: 'audio' | 'video';
  source: 'microphone' | 'camera' | 'screen';
  /** Always carries exactly one track. */
  stream: MediaStream;
}

export interface LocalDeviceState {
  micEnabled: boolean;
  camEnabled: boolean;
  screenSharing: boolean;
  selectedMicId: string;
  selectedCamId: string;
  selectedSpeakerId: string;
  availableMics: MediaDeviceInfo[];
  availableCams: MediaDeviceInfo[];
  availableSpeakers: MediaDeviceInfo[];
  // ── React Native additions (no web analogue)
  cameraFacing: CameraFacing;
  audioRoute: AudioRoute;
}

export type CameraFacing = 'front' | 'environment';
export type AudioRoute = 'speaker' | 'earpiece' | 'bluetooth';

export interface MeetingError {
  type: string;
  message: string;
  details?: unknown;
}

export type StateChangeListener = (state: MeetingState) => void;
export type RemoteStreamsListener = (streams: RemoteParticipantStream[]) => void;
export type LocalStreamListener = (stream: MediaStream | null) => void;
export type LocalDeviceStateListener = (deviceState: LocalDeviceState) => void;
export type ErrorListener = (error: MeetingError) => void;

export type Unsubscribe = () => void;

// ---------------------------------------------------------------------------
// Wire types (exactly the shapes backend/sfu/server.js sends)
// ---------------------------------------------------------------------------

interface IceServerConfig {
  urls: string | string[];
  username?: string;
  credential?: string;
}

interface SfuTransportParams {
  id: string;
  iceParameters: MediasoupTypes.IceParameters;
  iceCandidates: MediasoupTypes.IceCandidate[];
  dtlsParameters: MediasoupTypes.DtlsParameters;
  /** Always populated by the server, but mediasoup-client will not read it out of
   *  `params` for you — it has to be forwarded explicitly into createXTransport. */
  iceServers?: IceServerConfig[];
}

interface SfuJoinRoomResponse {
  routerRtpCapabilities: MediasoupTypes.RtpCapabilities;
}

interface SfuCreateTransportResponse {
  params: SfuTransportParams;
}

/** `produce` acks with a BARE `{ id }` — it is not wrapped in `params`. */
interface SfuProduceResponse {
  id: string;
}

interface SfuConsumeResponse {
  params: {
    id: string;
    producerId: string;
    kind: 'audio' | 'video';
    rtpParameters: MediasoupTypes.RtpParameters;
  };
}

interface SfuProducerAppData {
  source?: 'microphone' | 'camera' | 'screen';
  [key: string]: unknown;
}

/** One element of `getProducers`' bare-array ack, and the `newProducer` payload. */
interface SfuProducerInfo {
  producerId: string;
  peerId: string;
  userName?: string;
  kind: 'audio' | 'video';
  appData?: SfuProducerAppData;
}

interface SfuCandidate {
  url: string;
  path: string;
}

/**
 * socket.io's `DefaultEventsMap` types every handler as `(...args: any[]) => void`.
 * Matching that signature exactly is what lets `socket.off(event, handler)`
 * type-check, so the `any[]` here is forced by the library, not a shortcut.
 */
type SocketEventHandler = (...args: any[]) => void;

type SocketHandlerEntry = [event: string, handler: SocketEventHandler];

/**
 * mediasoup-client's typings are written against the DOM lib, which this project
 * does not load (`tsconfig.json` → `lib: ["es2017"]`). react-native-webrtc's
 * MediaStreamTrack is the runtime equivalent, so these two helpers are the only
 * places where the two nominal track types are bridged.
 */
type MediasoupTrack = NonNullable<MediasoupTypes.ProducerOptions['track']>;

const toMediasoupTrack = (track: MediaStreamTrack): MediasoupTrack =>
  track as unknown as MediasoupTrack;

const toNativeTrack = (track: unknown): MediaStreamTrack => track as MediaStreamTrack;

/** Minimal structural view used to opportunistically observe a track's `ended`
 *  event; the RN typings for the vendored event-target shim are not resolvable. */
interface TrackEndedTarget {
  addEventListener?: (type: 'ended', listener: () => void) => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** The room the web overlay uses for 1:1 calls that have no conversation id. */
const DEFAULT_ROOM_ID = 'direct-call-room';

/** Direct (unproxied) SFU listener — `http.createServer(app)` on :3010. */
const SFU_DIRECT_PORT = 3010;
const SFU_DIRECT_PATH = '/socket.io';
/** nginx: `location /sfu/ { proxy_pass http://sfu_app/; }` rewrites the prefix away. */
const SFU_PROXY_PATH = '/sfu/socket.io';

/** Mirrors the three STUN URLs the SFU itself returns. No TURN exists anywhere. */
const DEFAULT_ICE_SERVERS: IceServerConfig[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
];

/** Self-healing discovery poll. Recovers any `newProducer` that arrived before the
 *  recv transport existed, and any consume that lost the race and was dropped. */
const RESYNC_INTERVAL_MS = 2500;

/** Every signalling round trip is bounded — see the `joinRoom` note in the header. */
const DEFAULT_REQUEST_TIMEOUT_MS = 10000;

/** Android has no reliable "user stopped sharing from the system UI" callback, so
 *  the screen track's readyState is polled as well. */
const SCREEN_SHARE_WATCHDOG_MS = 1000;

/** The server rewrites these (and any falsy name) to the literal 'User' in
 *  joinRoom, in the newProducer fan-out and in getProducers. The identical
 *  coercion has to happen client-side in all three places or display names
 *  diverge between web and mobile inside the same room. */
const SENTINEL_USER_NAMES = ['Participant', 'Teammate'];

const coerceUserName = (name?: string | null): string =>
  name && !SENTINEL_USER_NAMES.includes(name) ? name : 'User';

const errorMessage = (err: unknown): string => {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  const message = (err as { message?: unknown } | null)?.message;
  return typeof message === 'string' ? message : '';
};

const toError = (err: unknown): Error =>
  err instanceof Error ? err : new Error(errorMessage(err) || 'Unknown error');

/**
 * Derives `<protocol>//<host>:3010` from the backend origin, dropping the backend's
 * own port — identical to the web derivation. Parsed with a regex rather than
 * `new URL()` because React Native's URL implementation is a partial polyfill.
 */
const HOST_PATTERN = /^(https?:)\/\/([^/:?#]+)(?::\d+)?/i;

const deriveDirectSfuUrl = (base: string): string | null => {
  const match = HOST_PATTERN.exec(base);
  if (!match) return null;
  return `${match[1]}//${match[2]}:${SFU_DIRECT_PORT}`;
};

const stripTrailingSlashes = (value: string): string => value.trim().replace(/\/+$/, '');

/**
 * mediasoup-client selects its ReactNative106 handler purely from these globals.
 * `registerGlobals()` is idempotent (it only assigns), so re-running it is safe.
 */
const ensureWebRTCGlobals = (): void => {
  const scope = globalThis as unknown as Record<string, unknown>;
  if (typeof scope.RTCPeerConnection === 'undefined' || typeof scope.RTCRtpTransceiver === 'undefined') {
    console.warn('[SFU] WebRTC globals missing — calling registerGlobals() late. index.js should do this at startup.');
    registerGlobals();
  }
};

// ---------------------------------------------------------------------------
// Manager
// ---------------------------------------------------------------------------

class MeetingWebRTCManager {
  private state: MeetingState = 'IDLE';
  private roomId: string | null = null;
  private userName: string = 'User';

  private socket: Socket | null = null;
  private device: Device | null = null;

  private sendTransport: MediasoupTypes.Transport | null = null;
  private recvTransport: MediasoupTypes.Transport | null = null;

  private audioProducer: MediasoupTypes.Producer | null = null;  // appData.source === 'microphone'
  private videoProducer: MediasoupTypes.Producer | null = null;  // appData.source === 'camera'
  private screenProducer: MediasoupTypes.Producer | null = null; // appData.source === 'screen'

  /** key = consumer.id */
  private consumers: Map<string, MediasoupTypes.Consumer> = new Map();
  /** key = producerId (NOT peerId — one peer can occupy several entries) */
  private remoteStreamsMap: Map<string, RemoteParticipantStream> = new Map();

  /**
   * producerId -> consumerId reverse index. MANDATORY, not an optimisation:
   * `consumerClosed` is the only server event keyed by a consumer id while every
   * producer-lifecycle event is keyed by a producer id, and on a peer disconnect
   * the remaining peers receive `peerClosed` AND `consumerClosed` but NEVER
   * `producerClosed`. Without this index, `peerClosed` cannot close the orphaned
   * consumers and the SFU-side media leaks.
   */
  private consumerIdByProducerId: Map<string, string> = new Map();

  /**
   * producerIds claimed synchronously before the first await in
   * `consumeRemoteTrack`. `newProducer` and the 2.5 s poll routinely race for the
   * same producer; the web version's `remoteStreamsMap.has()` check happens before
   * several awaits and therefore loses that race, producing a duplicate consumer.
   */
  private pendingConsumes: Set<string> = new Set();

  private localAudioTrack: MediaStreamTrack | null = null;
  private localVideoTrack: MediaStreamTrack | null = null;
  private localScreenTrack: MediaStreamTrack | null = null;
  private combinedLocalStream: MediaStream = new MediaStream();

  private deviceState: LocalDeviceState = {
    micEnabled: true,
    camEnabled: true,
    screenSharing: false,
    selectedMicId: 'default',
    selectedCamId: 'default',
    selectedSpeakerId: 'default',
    availableMics: [],
    availableCams: [],
    availableSpeakers: [],
    cameraFacing: 'front',
    audioRoute: 'earpiece',
  };

  private stateListeners: Set<StateChangeListener> = new Set();
  private remoteStreamsListeners: Set<RemoteStreamsListener> = new Set();
  private localStreamListeners: Set<LocalStreamListener> = new Set();
  private deviceStateListeners: Set<LocalDeviceStateListener> = new Set();
  private errorListeners: Set<ErrorListener> = new Set();

  private resyncInterval: ReturnType<typeof setInterval> | null = null;
  private screenShareWatchdog: ReturnType<typeof setInterval> | null = null;

  /**
   * Explicit handles for every Socket-level listener. `socket.removeAllListeners()`
   * detaches Socket-level handlers only — the Manager-level `socket.io.on()`
   * handler survives it — so both are tracked and detached deliberately.
   */
  private socketHandlers: SocketHandlerEntry[] = [];
  private managerReconnectHandler: (() => void) | null = null;

  private appStateSub: ReturnType<typeof AppState.addEventListener> | null = null;

  /** Re-read on every connect attempt so a refreshed access token gets used. */
  private joinToken: string | null = null;

  private candidates: SfuCandidate[] = [];
  private candidateIndex = 0;
  /** socket.io keeps retrying the last candidate forever; only toast once. */
  private sfuConnectFailedEmitted = false;

  private audioRouteWarningLogged = false;

  // NOTE: intentionally no work in the constructor. The web version enumerates
  // devices and installs a `navigator.mediaDevices.ondevicechange` handler here;
  // on RN this singleton is constructed at import time, before native modules are
  // guaranteed ready, and `devicechange` never fires anyway. Enumeration happens
  // in `join()` (after permissions) and after each successful device acquisition.

  // ─────────────────────────────────────────────────────────────────────────
  // Pub/sub. Four of the five registries replay current state to a new
  // subscriber immediately; `onError` does not (errors are events, not state).
  // Registering the same function reference twice is idempotent (Set semantics).
  // ─────────────────────────────────────────────────────────────────────────

  public onStateChange(fn: StateChangeListener): Unsubscribe {
    this.stateListeners.add(fn);
    fn(this.state);
    return () => {
      this.stateListeners.delete(fn);
    };
  }

  public onRemoteStreamsChange(fn: RemoteStreamsListener): Unsubscribe {
    this.remoteStreamsListeners.add(fn);
    fn(Array.from(this.remoteStreamsMap.values()));
    return () => {
      this.remoteStreamsListeners.delete(fn);
    };
  }

  public onLocalStreamChange(fn: LocalStreamListener): Unsubscribe {
    this.localStreamListeners.add(fn);
    fn(this.combinedLocalStream);
    return () => {
      this.localStreamListeners.delete(fn);
    };
  }

  public onDeviceStateChange(fn: LocalDeviceStateListener): Unsubscribe {
    this.deviceStateListeners.add(fn);
    fn(this.deviceState);
    return () => {
      this.deviceStateListeners.delete(fn);
    };
  }

  public onError(fn: ErrorListener): Unsubscribe {
    this.errorListeners.add(fn);
    return () => {
      this.errorListeners.delete(fn);
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Emit helpers
  // ─────────────────────────────────────────────────────────────────────────

  /** Notifies synchronously and unconditionally — no dedupe, even on a same-value
   *  set. The web behaves this way and screens rely on the redundant emissions. */
  private setState(newState: MeetingState): void {
    console.log(`[MEETING] State transition: ${this.state} -> ${newState}`);
    this.state = newState;
    this.stateListeners.forEach(fn => fn(this.state));
  }

  private emitError(type: string, message: string, details?: unknown): void {
    console.error(`[MEETING ERROR] ${type}: ${message}`, details ?? '');
    this.errorListeners.forEach(fn => fn({ type, message, details }));
  }

  /** Always emits a brand-new array so consumers can rely on identity changes. */
  private notifyRemoteStreams(): void {
    const list = Array.from(this.remoteStreamsMap.values());
    this.remoteStreamsListeners.forEach(fn => fn(list));
  }

  /**
   * Rebuilds the local preview stream. The new `MediaStream` *object identity* is
   * load-bearing on RN: `<RTCView streamURL={stream.toURL()} />` only rebinds when
   * the URL changes, and `toURL()` is derived from the stream instance.
   */
  private updateCombinedLocalStream(): void {
    const tracks: MediaStreamTrack[] = [];
    if (this.localAudioTrack && this.localAudioTrack.enabled) tracks.push(this.localAudioTrack);
    if (this.localVideoTrack && this.localVideoTrack.enabled) tracks.push(this.localVideoTrack);
    // Deliberately NOT filtered on `.enabled` — matches the web manager.
    if (this.localScreenTrack) tracks.push(this.localScreenTrack);

    this.combinedLocalStream = new MediaStream(tracks);
    this.localStreamListeners.forEach(fn => fn(this.combinedLocalStream));
  }

  private updateDeviceState(partial: Partial<LocalDeviceState>): void {
    this.deviceState = { ...this.deviceState, ...partial };
    this.deviceStateListeners.forEach(fn => fn(this.deviceState));
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Signalling
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * The single choke point for every client -> server emit.
   *
   * Two non-negotiable properties:
   *  1. An ack callback is ALWAYS supplied. `joinRoom` and `getProducers` invoke
   *     `callback(...)` unguarded, and the catch blocks of
   *     createWebRtcTransport / connectWebRtcTransport / produce / consume call
   *     `callback({ error })` unguarded too. An ack-less emit therefore throws
   *     inside the SFU's handler, and because `backend/sfu` installs no
   *     `unhandledRejection` / `uncaughtException` handler on node:20-slim, the
   *     process dies and every room on the server is dropped.
   *  2. A local timeout is ALWAYS armed. The server's `joinRoom` handler has no
   *     try/catch, so any throw inside it leaves the ack un-invoked forever and a
   *     naive promise would hang for the lifetime of the app.
   */
  private request<T>(
    type: string,
    data: Record<string, unknown> = {},
    timeoutMs: number = DEFAULT_REQUEST_TIMEOUT_MS,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const socket = this.socket;
      if (!socket) {
        reject(new Error('No socket connection'));
        return;
      }

      let done = false;
      const timer = setTimeout(() => {
        if (done) return;
        done = true;
        reject(new Error(`SFU request timed out: ${type}`));
      }, timeoutMs);

      socket.emit(type, data, (res: unknown) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        // The error convention is `{ error: '<string>' }`; anything else — including
        // a bare array (getProducers) or `undefined` — is a success.
        const errorText = (res as { error?: unknown } | null | undefined)?.error;
        if (errorText) {
          reject(new Error(String(errorText)));
        } else {
          resolve(res as T);
        }
      });
    });
  }

  /**
   * Ordered SFU connection candidates. RN has no `window.location.origin`, so the
   * web's "proxy first, fall back to :3010" logic is replaced by an explicit list:
   *
   *  1. The user's explicit override, if any. A value ending in `/sfu` means "go
   *     through the nginx proxy", which needs `path: '/sfu/socket.io'`.
   *  2. The direct `:3010` listener derived from the backend host — the only thing
   *     that works for a LAN backend such as `http://192.168.1.147:8000`.
   *  3. The backend origin with the proxied path — the only thing that can work
   *     behind a Cloudflare tunnel, which cannot expose :3010 at all.
   */
  private buildCandidates(): SfuCandidate[] {
    const explicit = stripTrailingSlashes(getSfuHostUrl() || '');
    const backend = stripTrailingSlashes(getTargetHostUrl() || '');
    const out: SfuCandidate[] = [];

    if (explicit) {
      if (/\/sfu$/i.test(explicit)) {
        out.push({ url: explicit.replace(/\/sfu$/i, ''), path: SFU_PROXY_PATH });
      } else {
        out.push({ url: explicit, path: SFU_DIRECT_PATH });
      }
    }

    if (backend) {
      const direct = deriveDirectSfuUrl(backend);
      if (direct) out.push({ url: direct, path: SFU_DIRECT_PATH });
      out.push({ url: backend, path: SFU_PROXY_PATH });
    }

    if (out.length === 0) {
      out.push({ url: `http://localhost:${SFU_DIRECT_PORT}`, path: SFU_DIRECT_PATH });
    }

    const seen = new Set<string>();
    return out.filter(candidate => {
      const key = `${candidate.url}|${candidate.path}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  private bindSocket(socket: Socket, event: string, handler: SocketEventHandler): void {
    socket.on(event, handler);
    this.socketHandlers.push([event, handler]);
  }

  /** Detaches BOTH the Socket-level handlers and the Manager-level `reconnect`
   *  handler, then disconnects. Used before every socket rebuild and in `leave()`. */
  private detachSocket(): void {
    const socket = this.socket;
    this.socket = null;
    if (!socket) {
      this.socketHandlers = [];
      this.managerReconnectHandler = null;
      return;
    }

    for (const [event, handler] of this.socketHandlers) {
      try {
        socket.off(event, handler);
      } catch (err) {
        console.warn(`[SFU] Failed detaching socket handler '${event}':`, err);
      }
    }
    this.socketHandlers = [];

    if (this.managerReconnectHandler) {
      try {
        socket.io.off('reconnect', this.managerReconnectHandler);
      } catch (err) {
        console.warn('[SFU] Failed detaching manager reconnect handler:', err);
      }
      this.managerReconnectHandler = null;
    }

    try {
      socket.disconnect();
    } catch (err) {
      console.warn('[SFU] Socket disconnect warning:', err);
    }
    try {
      socket.removeAllListeners();
    } catch (err) {
      console.warn('[SFU] Socket removeAllListeners warning:', err);
    }
  }

  private connectSocketAtCandidate(index: number): void {
    const candidate = this.candidates[index];
    if (!candidate) {
      this.setState('FAILED');
      this.emitError('SFU_CONNECT_FAILED', 'No SFU server address could be resolved.');
      return;
    }

    this.detachSocket();

    console.log(`[MEETING] Attempting SFU connection to ${candidate.url} with path ${candidate.path}`);

    const socket = io(candidate.url, {
      path: candidate.path,
      transports: ['websocket', 'polling'],
      autoConnect: true,
      // Raw JWT — the SFU reads `socket.handshake.auth.token` and must NOT see a
      // 'Bearer ' prefix. Note the server accepts unauthenticated sockets, so a
      // successful connect is not proof of authentication.
      auth: { token: this.joinToken },
      timeout: 5000,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });
    this.socket = socket;

    this.bindSocket(socket, 'connect', () => {
      console.log(`[MEETING] SFU socket connected to ${candidate.url}`);
      this.setState('JOINING');
      void this.onSocketConnected();
    });

    this.bindSocket(socket, 'connect_error', (err: Error) => {
      this.handleConnectError(candidate, err);
    });

    this.bindSocket(socket, 'disconnect', (reason: string) => {
      console.warn('[MEETING] SFU socket disconnected:', reason);
      // No media teardown here — a reconnect may still recover the session, and
      // the full rebuild happens in the Manager-level 'reconnect' handler.
      if (this.state !== 'LEAVING' && this.state !== 'LEFT') {
        this.setState('RECONNECTING');
      }
    });

    this.bindSocket(socket, 'newProducer', (data: SfuProducerInfo) => {
      console.log('[SFU] Remote producer announced:', data?.producerId, data?.kind);
      if (!data?.producerId) return;
      // Fire and forget. This can legitimately arrive before `device` /
      // `recvTransport` exist; the dropped announcement is recovered by the poll.
      void this.consumeRemoteTrack(
        data.producerId,
        data.peerId,
        coerceUserName(data.userName),
        data.kind,
        data.appData,
      );
    });

    this.bindSocket(socket, 'producerClosed', (data: { producerId: string; peerId?: string }) => {
      console.log('[SFU] Remote producer closed:', data?.producerId);
      this.handleProducerClosed(data?.producerId);
    });

    this.bindSocket(socket, 'peerClosed', (data: { peerId: string }) => {
      console.log('[SFU] Peer disconnected:', data?.peerId);
      this.handlePeerClosed(data?.peerId);
    });

    this.bindSocket(socket, 'consumerClosed', (data: { consumerId: string }) => {
      console.log('[SFU] Consumer closed by server:', data?.consumerId);
      this.handleConsumerClosed(data?.consumerId);
    });

    // Manager-level, not Socket-level: survives `socket.removeAllListeners()`.
    const reconnectHandler = (): void => {
      console.log('[MEETING] SFU socket reconnected — rebuilding the whole session');
      void this.performFullRejoin();
    };
    this.managerReconnectHandler = reconnectHandler;
    socket.io.on('reconnect', reconnectHandler);
  }

  private handleConnectError(candidate: SfuCandidate, err: Error): void {
    console.warn(`[MEETING] SFU connect error for ${candidate.url}${candidate.path}:`, err?.message);

    const next = this.candidateIndex + 1;
    if (next < this.candidates.length) {
      this.candidateIndex = next;
      this.connectSocketAtCandidate(next);
      return;
    }

    // socket.io keeps retrying the final candidate, re-firing connect_error each
    // time. The web version calls setState('FAILED') + emitError on every one of
    // those, spamming the UI; emit once per join attempt instead.
    if (this.sfuConnectFailedEmitted) return;
    this.sfuConnectFailedEmitted = true;
    this.setState('FAILED');
    this.emitError(
      'SFU_CONNECT_FAILED',
      `Failed to connect to the Mediasoup SFU server at ${candidate.url}: ${err?.message || 'unknown error'}`,
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Lifecycle
  // ─────────────────────────────────────────────────────────────────────────

  public async join(roomId: string, userName?: string): Promise<void> {
    // Silent no-op, never a throw — matches the web guard exactly.
    if (this.state !== 'IDLE' && this.state !== 'FAILED' && this.state !== 'LEFT') {
      console.log(`[MEETING] Already joining/joined room: ${this.roomId}`);
      return;
    }

    // The web version resets only roomId/userName here, so after a FAILED session a
    // re-join keeps stale consumers, transports and producers: the dedupe checks
    // then suppress re-consuming and `replaceTrack` is called on a closed producer.
    this.resetMediaState();

    this.roomId = roomId || DEFAULT_ROOM_ID;
    this.userName = coerceUserName(userName);

    this.setState('CONNECTING');
    console.log(`[MEETING] Connecting to SFU room: ${this.roomId} as ${this.userName}`);

    try {
      this.setState('AUTHENTICATING');
      this.joinToken = await getStoredToken();

      // Pre-flight before any getUserMedia. react-native-webrtc requests these
      // itself, but doing it here lets the UI show a rationale instead of failing
      // mid-connect with a bare SecurityError.
      await this.requestCapturePermissions();

      this.activateAudioSession();
      this.subscribeAppState();

      void this.enumerateDevices();

      this.candidates = this.buildCandidates();
      this.candidateIndex = 0;
      this.sfuConnectFailedEmitted = false;

      if (this.candidates.length === 0) {
        throw new Error('No SFU server address is configured');
      }

      // Resolves as soon as the socket is constructed — long before the meeting
      // exists. Callers observe progress through onStateChange, never by awaiting.
      this.connectSocketAtCandidate(0);
    } catch (err) {
      this.setState('FAILED');
      this.emitError('JOIN_FAILED', errorMessage(err) || 'Failed to join meeting session');
    }
  }

  /**
   * Wrapper around the media pipeline for the initial connect. The pipeline itself
   * throws; the two entry points differ only in which error type they surface.
   */
  private async onSocketConnected(): Promise<void> {
    try {
      await this.runMediaPipeline();
    } catch (err) {
      console.error('[MEETING] Connection pipeline failed:', err);
      this.setState('FAILED');
      this.emitError('PIPELINE_ERROR', errorMessage(err) || 'Error establishing WebRTC transports');
    }
  }

  /**
   * A socket.io reconnect is unrecoverable in place: the server's `disconnect`
   * handler closed this peer's transports, deleted the peer and possibly destroyed
   * the router, and the reconnect yields a NEW `socket.id`. Any retained
   * transport id is therefore unknown server-side, so the web client's
   * "re-joinRoom and resync" cannot work. Rebuild everything instead.
   */
  private async performFullRejoin(): Promise<void> {
    try {
      // Local MediaStreamTracks are deliberately kept (they are still live and can
      // be reused); the producers that carried them are gone and must be recreated.
      this.resetPeerConnectionState();
      this.device = null;

      this.joinToken = await getStoredToken();
      await this.runMediaPipeline();
    } catch (err) {
      console.error('[MEETING] Reconnect rebuild failed:', err);
      this.setState('FAILED');
      this.emitError('RECONNECT_FAILED', errorMessage(err) || 'Failed to restore the meeting session');
    }
  }

  /** Steps 1-6 of the join sequence. Throws; callers classify the failure. */
  private async runMediaPipeline(): Promise<void> {
    const roomId = this.roomId;
    if (!roomId) throw new Error('No room id — join() was never called');

    // ── Step 1: joinRoom -> routerRtpCapabilities
    console.log('[SFU] Requesting router RTP capabilities...');
    const joinResponse = await this.request<SfuJoinRoomResponse>('joinRoom', {
      roomId,
      userName: this.userName,
    });
    if (!joinResponse?.routerRtpCapabilities) {
      throw new Error('SFU did not return router RTP capabilities');
    }

    // ── Step 2: load the device (no wire traffic)
    ensureWebRTCGlobals();
    this.device = new Device();
    await this.device.load({ routerRtpCapabilities: joinResponse.routerRtpCapabilities });
    console.log(
      `[SFU] Mediasoup device loaded (handler: ${this.device.handlerName}); negotiable codecs:`,
      this.device.rtpCapabilities.codecs?.map(c => c.mimeType).join(', '),
    );

    this.setState('CONNECTING_MEDIA');

    // ── Step 3: SEND transport, created FIRST
    const sendTransport = await this.createTransport('send');
    this.sendTransport = sendTransport;

    sendTransport.on('connectionstatechange', (connectionState: MediasoupTypes.ConnectionState) => {
      console.log(`[SFU] Send transport connection state: ${connectionState}`);
      this.handleTransportConnectionState('Send', connectionState);
    });

    sendTransport.on('connect', ({ dtlsParameters }, callback, errback) => {
      // Lazily triggered by the first produce() — not at creation time.
      this.request('connectWebRtcTransport', {
        roomId,
        transportId: sendTransport.id,
        dtlsParameters,
      })
        .then(() => callback())
        .catch(err => {
          console.error('[SFU] Send transport connect error:', err);
          errback(toError(err));
        });
    });

    sendTransport.on('produce', (parameters, callback, errback) => {
      this.request<SfuProduceResponse>('produce', {
        roomId,
        transportId: sendTransport.id,
        kind: parameters.kind,
        rtpParameters: parameters.rtpParameters,
        appData: parameters.appData,
      })
        .then(res => {
          // The ack is a BARE `{ id }` — it is NOT wrapped in `params`.
          if (!res || typeof res.id !== 'string') {
            throw new Error('SFU produce ack did not contain a producer id');
          }
          callback({ id: res.id });
        })
        .catch(err => {
          console.error('[SFU] Produce error:', err);
          errback(toError(err));
        });
    });

    // ── Step 4: RECV transport, created SECOND with the identical payload.
    // No 'produce' handler here — a recv transport never produces.
    const recvTransport = await this.createTransport('recv');
    this.recvTransport = recvTransport;

    recvTransport.on('connectionstatechange', (connectionState: MediasoupTypes.ConnectionState) => {
      console.log(`[SFU] Receive transport connection state: ${connectionState}`);
      this.handleTransportConnectionState('Receive', connectionState);
    });

    recvTransport.on('connect', ({ dtlsParameters }, callback, errback) => {
      this.request('connectWebRtcTransport', {
        roomId,
        transportId: recvTransport.id,
        dtlsParameters,
      })
        .then(() => callback())
        .catch(err => {
          console.error('[SFU] Receive transport connect error:', err);
          errback(toError(err));
        });
    });

    this.setState('MEDIA_CONNECTED');

    // ── Step 5: local media. The first sendTransport.produce() below is what
    // lazily triggers the send transport's DTLS 'connect'; if both mic and camera
    // fail, the send transport is never connected at all.
    await this.initInitialMedia();

    // ── Step 6: discovery + the self-healing poll
    await this.resyncRemoteProducers();
    if (this.resyncInterval) clearInterval(this.resyncInterval);
    this.resyncInterval = setInterval(() => {
      void this.resyncRemoteProducers();
    }, RESYNC_INTERVAL_MS);

    this.setState('IN_MEETING');
    console.log('[MEETING] Meeting session fully established and active');
  }

  private async createTransport(direction: 'send' | 'recv'): Promise<MediasoupTypes.Transport> {
    const device = this.device;
    const roomId = this.roomId;
    if (!device || !roomId) throw new Error('Device not ready for transport creation');

    // No direction flag on the wire — the same event is simply called twice.
    const response = await this.request<SfuCreateTransportResponse>('createWebRtcTransport', { roomId });
    const params = response?.params;
    if (!params?.id) throw new Error(`SFU did not return ${direction} transport parameters`);

    // iceServers must be forwarded explicitly: the server always puts three Google
    // STUN URLs inside `params`, but mediasoup-client does not read them out of it.
    const options = {
      ...params,
      iceServers: (params.iceServers && params.iceServers.length > 0
        ? params.iceServers
        : DEFAULT_ICE_SERVERS) as MediasoupTypes.TransportOptions['iceServers'],
    };

    const transport =
      direction === 'send' ? device.createSendTransport(options) : device.createRecvTransport(options);
    console.log(`[SFU] ${direction === 'send' ? 'Send' : 'Receive'} transport created: ${transport.id}`);
    return transport;
  }

  /**
   * The web version only logs here, which on mobile means a permanently black,
   * silent call with no user-visible explanation. There is no TURN server in this
   * deployment, so 'failed' is a realistic outcome on a restrictive network.
   */
  private handleTransportConnectionState(
    label: string,
    connectionState: MediasoupTypes.ConnectionState,
  ): void {
    if (connectionState !== 'failed') return;
    if (this.state === 'LEAVING' || this.state === 'LEFT') return;

    this.emitError(
      'ICE_FAILED',
      `${label} media connection failed. The meeting server may be unreachable on this network.`,
    );
    this.setState('RECONNECTING');
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Initial media
  // ─────────────────────────────────────────────────────────────────────────

  private async initInitialMedia(): Promise<void> {
    // Microphone is always attempted first.
    if (this.deviceState.micEnabled) {
      try {
        await this.acquireMicrophone(this.deviceState.selectedMicId, false, false);
      } catch (err) {
        console.warn('[MEDIA] Microphone setup warning:', errorMessage(err));
      }
    }

    if (this.deviceState.camEnabled) {
      try {
        // `rethrow` so the camera-in-use case can be classified here rather than
        // being swallowed into a generic CAMERA_ERROR.
        await this.acquireCamera(this.deviceState.selectedCamId, false, true);
      } catch (err) {
        const name = (err as { name?: string } | null)?.name;
        const isInUse =
          name === 'NotReadableError' ||
          name === 'TrackStartError' ||
          /in use/i.test(errorMessage(err));

        this.updateDeviceState({ camEnabled: false });
        if (isInUse) {
          console.warn('[MEDIA] Camera is in use by another application — starting in audio-only mode');
          this.emitError(
            'CAMERA_IN_USE',
            'Camera is being used by another application. Running in audio-only mode.',
          );
        } else {
          this.handleMediaError('Camera', err);
        }
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Microphone
  // ─────────────────────────────────────────────────────────────────────────

  public enableMicrophone(deviceId?: string): Promise<void> {
    return this.acquireMicrophone(deviceId, false, false);
  }

  public changeMicrophone(deviceId: string): Promise<void> {
    console.log(`[MEDIA] Changing microphone device to: ${deviceId}`);
    return this.acquireMicrophone(deviceId, true, false);
  }

  private async acquireMicrophone(
    deviceId: string | undefined,
    forceReacquire: boolean,
    rethrow: boolean,
  ): Promise<void> {
    try {
      const requestedId = deviceId && deviceId !== 'default' ? deviceId : undefined;
      const deviceChanged = requestedId !== undefined && requestedId !== this.deviceState.selectedMicId;

      // The web version re-runs getUserMedia on every unmute, which on a phone is
      // an audible re-acquisition glitch each time. Reuse a live track instead
      // whenever no device change was asked for.
      const canReuse =
        !forceReacquire &&
        !deviceChanged &&
        this.localAudioTrack !== null &&
        this.localAudioTrack.readyState === 'live';

      if (!canReuse) {
        let stream: MediaStream;
        try {
          stream = await mediaDevices.getUserMedia({
            audio: requestedId ? { deviceId: requestedId } : true,
          });
        } catch (err) {
          console.warn('[MEDIA] Primary microphone constraints failed, retrying with basic audio...', err);
          stream = await mediaDevices.getUserMedia({ audio: true });
        }

        const audioTrack = stream.getAudioTracks()[0];
        if (!audioTrack) throw new Error('No audio track returned by the device');

        if (this.localAudioTrack && this.localAudioTrack !== audioTrack) {
          this.localAudioTrack.stop();
        }
        this.localAudioTrack = audioTrack;
      }

      const track = this.localAudioTrack;
      if (!track) throw new Error('No audio track available');
      track.enabled = true;
      this.updateCombinedLocalStream();

      if (this.sendTransport && !this.sendTransport.closed) {
        if (this.audioProducer && !this.audioProducer.closed) {
          await this.audioProducer.replaceTrack({ track: toMediasoupTrack(track) });
          try {
            this.audioProducer.resume();
          } catch (err) {
            console.warn('[MEDIA] Audio producer resume warning:', err);
          }
        } else {
          this.audioProducer = await this.sendTransport.produce({
            track: toMediasoupTrack(track),
            appData: { source: 'microphone' },
          });
        }
      }

      this.updateDeviceState({
        micEnabled: true,
        selectedMicId: deviceId || this.deviceState.selectedMicId,
      });
      await this.updateAvailableDevices();
    } catch (err) {
      if (rethrow) {
        this.updateDeviceState({ micEnabled: false });
        throw err;
      }
      this.handleMediaError('Microphone', err);
      this.updateDeviceState({ micEnabled: false });
    }
  }

  /**
   * Local mute only — the producer is paused, never closed, and NO server event is
   * emitted. Remote peers keep a live consumer receiving silence, which is exactly
   * what the web client does; closing the producer would break interop.
   */
  public disableMicrophone(): void {
    console.log('[MEDIA] Disabling microphone...');
    if (this.localAudioTrack) {
      this.localAudioTrack.enabled = false;
    }
    if (this.audioProducer && !this.audioProducer.closed) {
      try {
        this.audioProducer.pause();
      } catch (err) {
        console.warn('[MEDIA] Audio producer pause warning:', err);
      }
    }
    // The web version omits this, so its local preview never learns the track
    // went dark.
    this.updateCombinedLocalStream();
    this.updateDeviceState({ micEnabled: false });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Camera
  // ─────────────────────────────────────────────────────────────────────────

  public enableCamera(deviceId?: string): Promise<void> {
    return this.acquireCamera(deviceId, false, false);
  }

  public changeCamera(deviceId: string): Promise<void> {
    console.log(`[MEDIA] Changing camera device to: ${deviceId}`);
    return this.acquireCamera(deviceId, true, false);
  }

  private async acquireCamera(
    deviceId: string | undefined,
    forceReacquire: boolean,
    rethrow: boolean,
  ): Promise<void> {
    try {
      const requestedId = deviceId && deviceId !== 'default' ? deviceId : undefined;
      const deviceChanged = requestedId !== undefined && requestedId !== this.deviceState.selectedCamId;

      const canReuse =
        !forceReacquire &&
        !deviceChanged &&
        this.localVideoTrack !== null &&
        this.localVideoTrack.readyState === 'live';

      if (!canReuse) {
        // 640x480@24 rather than the web's 720p ideal: this is a phone tile in a
        // grid, and the lower profile keeps encode cost and uplink sane.
        //
        // `deviceId` on Android is the raw camera index string ("0", "1") from
        // enumerateDevices, not an opaque browser id, and it takes precedence over
        // facingMode — prefer facingMode and use switchCamera() to flip.
        let stream: MediaStream;
        try {
          stream = await mediaDevices.getUserMedia({
            video: {
              width: { ideal: 640 },
              height: { ideal: 480 },
              frameRate: { ideal: 24 },
              facingMode: toFacingModeConstraint(this.deviceState.cameraFacing),
              ...(requestedId ? { deviceId: requestedId } : {}),
            },
          });
        } catch (err) {
          console.warn('[MEDIA] Primary camera constraints failed, retrying with basic video...', err);
          stream = await mediaDevices.getUserMedia({ video: true });
        }

        const videoTrack = stream.getVideoTracks()[0];
        if (!videoTrack) throw new Error('No video track returned by the device');

        if (this.localVideoTrack && this.localVideoTrack !== videoTrack) {
          this.localVideoTrack.stop();
        }
        this.localVideoTrack = videoTrack;
      }

      const track = this.localVideoTrack;
      if (!track) throw new Error('No video track available');
      track.enabled = true;
      this.updateCombinedLocalStream();

      if (this.sendTransport && !this.sendTransport.closed) {
        if (this.videoProducer && !this.videoProducer.closed) {
          await this.videoProducer.replaceTrack({ track: toMediasoupTrack(track) });
          try {
            this.videoProducer.resume();
          } catch (err) {
            console.warn('[MEDIA] Video producer resume warning:', err);
          }
        } else {
          this.videoProducer = await this.sendTransport.produce({
            track: toMediasoupTrack(track),
            appData: { source: 'camera' },
          });
        }
      }

      this.updateDeviceState({
        camEnabled: true,
        selectedCamId: deviceId || this.deviceState.selectedCamId,
      });
      await this.updateAvailableDevices();
    } catch (err) {
      if (rethrow) {
        this.updateDeviceState({ camEnabled: false });
        throw err;
      }
      this.handleMediaError('Camera', err);
      this.updateDeviceState({ camEnabled: false });
    }
  }

  /** Local only: pause the producer, never close it. See disableMicrophone(). */
  public disableCamera(): void {
    console.log('[MEDIA] Disabling camera...');
    if (this.localVideoTrack) {
      this.localVideoTrack.enabled = false;
    }
    if (this.videoProducer && !this.videoProducer.closed) {
      try {
        this.videoProducer.pause();
      } catch (err) {
        console.warn('[MEDIA] Video producer pause warning:', err);
      }
    }
    this.updateCombinedLocalStream();
    this.updateDeviceState({ camEnabled: false });
  }

  /**
   * Mobile-only. Flips the capture device in place — no track swap, no producer
   * replacement and no SDP renegotiation, so remote peers see nothing but a
   * changed picture. This is why mobile has no camera-device dropdown.
   */
  public async switchCamera(): Promise<void> {
    const track = this.localVideoTrack;
    if (!track || track.readyState !== 'live') {
      console.warn('[MEDIA] switchCamera() ignored — no live camera track');
      return;
    }
    try {
      track._switchCamera();
      this.updateDeviceState({
        cameraFacing: this.deviceState.cameraFacing === 'front' ? 'environment' : 'front',
      });
    } catch (err) {
      this.handleMediaError('Camera', err);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Audio output
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Store-only, exactly like the web manager — which never calls `setSinkId`
   * anywhere either. Kept for API parity; `setAudioRoute()` is the real control.
   */
  public async changeSpeaker(deviceId: string): Promise<void> {
    console.log(`[MEDIA] Changing speaker device to: ${deviceId}`);
    this.updateDeviceState({ selectedSpeakerId: deviceId });
  }

  /**
   * Mobile replacement for the web's (non-functional) speaker picker.
   *
   * LIMITATION: react-native-webrtc exposes no audio-routing API at all
   * (`RTCAudioSession` only has the CallKit activate/deactivate hooks), and this
   * app does not bundle `react-native-incall-manager`. The route is therefore
   * tracked in state so the UI stays coherent, but the OS route is unchanged until
   * a routing module lands. Audio will follow the platform default (earpiece on
   * Android for a voice-call stream).
   */
  public async setAudioRoute(route: AudioRoute): Promise<void> {
    this.updateDeviceState({ audioRoute: route });
    if (!this.audioRouteWarningLogged) {
      this.audioRouteWarningLogged = true;
      console.warn(
        '[MEDIA] setAudioRoute() is state-only: no native audio-routing module is installed. ' +
          'The OS output route is unchanged.',
      );
    }
  }

  /**
   * RN has no autoplay gate and no `<audio>` elements — remote audio plays as soon
   * as it is consumed, provided the audio session is active. Kept as a no-op so
   * shared call-UI code that invokes it does not have to branch on platform.
   */
  public unlockAudioAutoplay(): void {
    // Intentionally empty.
  }

  /** Placeholder for VoIP audio-session activation. See setAudioRoute(). */
  private activateAudioSession(): void {
    // Deliberately does NOT call RTCAudioSession.audioSessionDidActivate(): that
    // hook exists for CallKit to signal an already-activated session, and calling
    // it without CallKit desynchronises WebRTC's internal session bookkeeping.
  }

  private deactivateAudioSession(): void {
    // Symmetric no-op — see activateAudioSession().
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Screen share
  // ─────────────────────────────────────────────────────────────────────────

  public async startScreenShare(): Promise<void> {
    console.log('[MEDIA] Initiating screen share...');
    try {
      if (Platform.OS !== 'android') {
        // iOS needs a Broadcast Upload Extension, an App Group and a
        // ScreenCapturePickerView, none of which this build ships. The message is
        // byte-identical to the web manager's so shared error handling matches.
        throw new Error('Screen sharing is not supported in this browser environment');
      }

      // RN's getDisplayMedia takes only Android display options — there is no
      // {video, audio} form, and it returns video only (which matches the web
      // behaviour of discarding the audio track anyway).
      const stream = await mediaDevices.getDisplayMedia({});

      const screenTrack = stream.getVideoTracks()[0];
      if (!screenTrack) throw new Error('No screen video track acquired');
      screenTrack.enabled = true;

      this.localScreenTrack = screenTrack;
      this.updateCombinedLocalStream();

      if (this.sendTransport && !this.sendTransport.closed) {
        this.screenProducer = await this.sendTransport.produce({
          track: toMediasoupTrack(screenTrack),
          appData: { source: 'screen' },
        });
      }

      this.watchScreenTrackForEnd(screenTrack);
      this.updateDeviceState({ screenSharing: true });
      console.log('[MEDIA] Screen sharing active');
    } catch (err) {
      // 'Screen Share'.toUpperCase() === 'SCREEN SHARE' — the literal space in the
      // error type is intentional and matches the web taxonomy exactly.
      this.handleMediaError('Screen Share', err);
      this.updateDeviceState({ screenSharing: false });
    }
  }

  public async stopScreenShare(): Promise<void> {
    console.log('[MEDIA] Stopping screen share...');
    this.clearScreenShareWatchdog();

    if (this.localScreenTrack) {
      try {
        this.localScreenTrack.stop();
      } catch (err) {
        console.warn('[MEDIA] Screen track stop warning:', err);
      }
      this.localScreenTrack = null;
      this.updateCombinedLocalStream();
    }

    // `closeProducer` is emitted from exactly this one place, matching the web.
    if (this.screenProducer && this.roomId) {
      const producerId = this.screenProducer.id;
      try {
        this.screenProducer.close();
      } catch (err) {
        console.warn('[MEDIA] Screen producer close warning:', err);
      }
      this.screenProducer = null;
      try {
        await this.request('closeProducer', { roomId: this.roomId, producerId });
      } catch (err) {
        console.warn('[SFU] closeProducer warning:', errorMessage(err));
      }
    } else {
      this.screenProducer = null;
    }

    this.updateDeviceState({ screenSharing: false });
  }

  /**
   * Android's MediaProjection "Stop sharing" affordance lives in the system UI and
   * does not reliably surface as a track event, so the readyState is polled as
   * well as (optimistically) listening for 'ended'.
   */
  private watchScreenTrackForEnd(track: MediaStreamTrack): void {
    this.clearScreenShareWatchdog();

    const onEnded = (): void => {
      console.log('[MEDIA] Screen share ended by the operating system');
      void this.stopScreenShare();
    };

    (track as unknown as TrackEndedTarget).addEventListener?.('ended', onEnded);

    this.screenShareWatchdog = setInterval(() => {
      if (this.localScreenTrack !== track || track.readyState === 'ended') {
        this.clearScreenShareWatchdog();
        if (this.localScreenTrack === track) onEnded();
      }
    }, SCREEN_SHARE_WATCHDOG_MS);
  }

  private clearScreenShareWatchdog(): void {
    if (this.screenShareWatchdog) {
      clearInterval(this.screenShareWatchdog);
      this.screenShareWatchdog = null;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Remote producers
  // ─────────────────────────────────────────────────────────────────────────

  private async consumeRemoteTrack(
    producerId: string,
    peerId: string,
    peerUserName: string,
    kind: 'audio' | 'video',
    appData?: SfuProducerAppData,
  ): Promise<void> {
    const device = this.device;
    const recvTransport = this.recvTransport;
    const roomId = this.roomId;

    // A newProducer can legitimately arrive before either exists; drop it and let
    // the 2.5 s poll pick it up once the pipeline is ready.
    if (!device || !recvTransport || !roomId) return;
    if (this.remoteStreamsMap.has(producerId)) return;
    // Claimed BEFORE any await: newProducer and the poll race for the same
    // producer constantly, and a post-await check loses that race.
    if (this.pendingConsumes.has(producerId)) return;
    this.pendingConsumes.add(producerId);

    try {
      const { rtpCapabilities } = device;

      const data = await this.request<SfuConsumeResponse>('consume', {
        roomId,
        transportId: recvTransport.id,
        producerId,
        rtpCapabilities,
      });
      if (!data?.params?.id) throw new Error('SFU consume ack did not contain consumer parameters');

      // Lazily triggers the recv transport's DTLS 'connect'.
      const consumer = await recvTransport.consume({
        id: data.params.id,
        producerId: data.params.producerId,
        kind: data.params.kind,
        rtpParameters: data.params.rtpParameters,
      });

      this.consumers.set(consumer.id, consumer);
      this.consumerIdByProducerId.set(producerId, consumer.id);

      // The server already creates consumers unpaused and already schedules a
      // keyframe 100 ms after `consume`, so these are belt-and-braces rather than
      // load-bearing — kept because the web does the same and ordering surprises
      // are cheap to defend against.
      await this.request('resumeConsumer', { roomId, consumerId: consumer.id });
      try {
        consumer.resume();
      } catch (err) {
        console.warn('[SFU] Consumer local resume warning:', err);
      }

      if (kind === 'video') {
        try {
          await this.request('requestKeyFrame', { roomId, consumerId: consumer.id });
        } catch (err) {
          console.warn('[SFU] requestKeyFrame warning:', errorMessage(err));
        }
      }

      const track = toNativeTrack(consumer.track);
      track.enabled = true;

      // Exactly one track per stream, always — the UI groups them by participantId.
      const stream = new MediaStream([track]);
      const source: RemoteParticipantStream['source'] =
        appData?.source || (kind === 'video' ? 'camera' : 'microphone');

      this.remoteStreamsMap.set(producerId, {
        producerId,
        participantId: peerId,
        userName: peerUserName,
        kind,
        source,
        stream,
      });
      this.notifyRemoteStreams();
      console.log(`[SFU] Consuming ${kind}/${source} from ${peerUserName}`);
    } catch (err) {
      console.error('[SFU] Failed to consume remote track:', err);
    } finally {
      this.pendingConsumes.delete(producerId);
    }
  }

  /**
   * The self-healing poll. Also usable as a manual "Re-Sync" action.
   *
   * The guard is deliberately narrow (matching the web): it is a silent no-op
   * while RECONNECTING, because a resync against a socket whose server-side peer
   * was already destroyed cannot succeed.
   */
  public async resyncRemoteProducers(): Promise<void> {
    if (this.state !== 'IN_MEETING' && this.state !== 'MEDIA_CONNECTED') return;

    try {
      if (!this.socket?.connected || !this.recvTransport || !this.roomId) return;

      // getProducers acks with a BARE ARRAY, not an object.
      const list = await this.request<SfuProducerInfo[]>('getProducers', { roomId: this.roomId });
      if (!Array.isArray(list)) return;

      for (const producer of list) {
        if (!producer?.producerId) continue;
        if (this.remoteStreamsMap.has(producer.producerId)) continue;
        if (this.pendingConsumes.has(producer.producerId)) continue;

        await this.consumeRemoteTrack(
          producer.producerId,
          producer.peerId,
          coerceUserName(producer.userName),
          producer.kind,
          producer.appData,
        );
      }
    } catch {
      // Quiet background polling — failures here are recovered on the next tick.
    }
  }

  private handleProducerClosed(producerId?: string): void {
    if (!producerId) return;
    this.remoteStreamsMap.delete(producerId);
    this.releaseConsumerForProducer(producerId);
    this.pendingConsumes.delete(producerId);
    this.notifyRemoteStreams();
  }

  private handlePeerClosed(peerId?: string): void {
    if (!peerId) return;
    let changed = false;

    for (const [producerId, info] of Array.from(this.remoteStreamsMap.entries())) {
      if (info.participantId !== peerId) continue;
      this.remoteStreamsMap.delete(producerId);
      // The server sends peerClosed + consumerClosed on a disconnect but never
      // producerClosed, so these consumers would otherwise be orphaned.
      this.releaseConsumerForProducer(producerId);
      this.pendingConsumes.delete(producerId);
      changed = true;
    }

    if (changed) this.notifyRemoteStreams();
  }

  private handleConsumerClosed(consumerId?: string): void {
    if (!consumerId) return;
    // The Consumer itself knows its producerId, which saves scanning the reverse
    // index; the index still exists for the producerId-keyed events above.
    const producerId = this.closeConsumerById(consumerId);
    if (!producerId) return;

    this.consumerIdByProducerId.delete(producerId);
    this.pendingConsumes.delete(producerId);
    // The web version stops at closing the consumer, so a dead tile keeps
    // rendering until some later producerClosed/peerClosed arrives.
    if (this.remoteStreamsMap.delete(producerId)) {
      this.notifyRemoteStreams();
    }
  }

  private releaseConsumerForProducer(producerId: string): void {
    const consumerId = this.consumerIdByProducerId.get(producerId);
    if (!consumerId) return;
    this.closeConsumerById(consumerId);
    this.consumerIdByProducerId.delete(producerId);
  }

  /** Closes and forgets a consumer; returns the producerId it was consuming. */
  private closeConsumerById(consumerId: string): string | null {
    const consumer = this.consumers.get(consumerId);
    if (!consumer) return null;
    const producerId = consumer.producerId;
    try {
      consumer.close();
    } catch (err) {
      console.warn('[SFU] Consumer close warning:', err);
    }
    this.consumers.delete(consumerId);
    return producerId;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Devices & permissions
  // ─────────────────────────────────────────────────────────────────────────

  public async enumerateDevices(): Promise<void> {
    try {
      const raw = (await mediaDevices.enumerateDevices()) as MediaDeviceInfo[] | null;
      const devices = Array.isArray(raw) ? raw : [];

      const availableMics = devices.filter(d => d.kind === 'audioinput');
      const availableCams = devices.filter(d => d.kind === 'videoinput');
      // Always empty on Android — there is no audiooutput enumeration at all.
      const availableSpeakers = devices.filter(d => d.kind === 'audiooutput');

      this.updateDeviceState({ availableMics, availableCams, availableSpeakers });
      console.log(
        `[MEDIA] Enumerated devices: ${availableMics.length} mics, ${availableCams.length} cams, ${availableSpeakers.length} speakers`,
      );
    } catch (err) {
      console.warn('[MEDIA] Device enumeration warning:', err);
    }
  }

  public updateAvailableDevices(): Promise<void> {
    return this.enumerateDevices();
  }

  /**
   * Best-effort pre-flight. react-native-webrtc's getUserMedia requests these
   * itself and rejects with `{ name: 'SecurityError' }` when both are refused;
   * asking here just moves the prompt to a point where the UI can explain it.
   * Never throws — a refusal is surfaced later through handleMediaError.
   */
  private async requestCapturePermissions(): Promise<void> {
    if (Platform.OS !== 'android') return;
    try {
      const result = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.CAMERA,
        PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
      ]);
      console.log('[MEDIA] Capture permission result:', result);
    } catch (err) {
      console.warn('[MEDIA] Permission pre-flight warning:', err);
    }
  }

  /**
   * Maps to the web taxonomy, minus its first branch
   * (CAMERA_MIC_REQUIRES_HTTPS_OR_LOCALHOST), which is a browser secure-context
   * concern with no meaning on RN, plus the RN-specific SecurityError that
   * react-native-webrtc raises when Android permissions are refused.
   */
  private handleMediaError(source: string, err: unknown): void {
    const name = (err as { name?: string } | null)?.name;
    let message = errorMessage(err) || 'Unknown media error';

    if (name === 'SecurityError') {
      message = `${source} permission was denied. Enable it in Settings.`;
    } else if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
      message = `${source} permission denied. Please allow access in app settings.`;
    } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
      message = `No ${source.toLowerCase()} hardware device found.`;
    } else if (name === 'NotReadableError' || name === 'TrackStartError') {
      message = `${source} hardware device is already in use by another application.`;
    } else if (name === 'OverconstrainedError') {
      message = `Requested ${source.toLowerCase()} settings are not supported by hardware.`;
    }

    this.emitError(`${source.toUpperCase()}_ERROR`, message, err);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // App lifecycle
  // ─────────────────────────────────────────────────────────────────────────

  private subscribeAppState(): void {
    this.unsubscribeAppState();
    this.appStateSub = AppState.addEventListener('change', this.handleAppStateChange);
  }

  private unsubscribeAppState(): void {
    if (!this.appStateSub) return;
    try {
      this.appStateSub.remove();
    } catch (err) {
      console.warn('[MEETING] AppState unsubscribe warning:', err);
    }
    this.appStateSub = null;
  }

  /**
   * Backgrounding drops the WebSocket and frequently the ICE connection, and
   * Android suspends camera capture. Without this the app silently stops receiving
   * remote media after every task switch and never recovers, because the socket's
   * own reconnect may have already fired while the JS thread was throttled.
   */
  private handleAppStateChange = (nextState: AppStateStatus): void => {
    if (nextState !== 'active') return;
    if (this.state !== 'RECONNECTING') return;

    const socket = this.socket;
    if (!socket) return;

    if (socket.connected) {
      console.log('[MEETING] Returned to foreground with a live socket — rebuilding the session');
      void this.performFullRejoin();
    } else {
      console.log('[MEETING] Returned to foreground with a dead socket — reconnecting');
      try {
        socket.connect();
      } catch (err) {
        console.warn('[MEETING] Foreground reconnect warning:', err);
      }
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Getters
  // ─────────────────────────────────────────────────────────────────────────

  public getState(): MeetingState {
    return this.state;
  }

  public getDeviceState(): LocalDeviceState {
    return this.deviceState;
  }

  /** Never null — starts as an empty MediaStream and is replaced, not cleared. */
  public getLocalStream(): MediaStream {
    return this.combinedLocalStream;
  }

  public getRemoteStreams(): RemoteParticipantStream[] {
    return Array.from(this.remoteStreamsMap.values());
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Teardown
  // ─────────────────────────────────────────────────────────────────────────

  public async leave(): Promise<void> {
    if (this.state === 'LEFT' || this.state === 'IDLE') return;

    console.log('[MEETING] Leaving meeting session and performing full cleanup...');
    this.setState('LEAVING');

    this.resetMediaState();

    this.deactivateAudioSession();
    this.unsubscribeAppState();

    // The web version forgets this, so `isScreenSharing` stays true after leaving
    // mid-share and the next meeting starts with the share button lit.
    this.updateDeviceState({ screenSharing: false });

    this.setState('LEFT');
    console.log('[MEETING] Full cleanup completed. State: LEFT');
  }

  /**
   * Steps 3-10 of the teardown, in exactly this order. Shared by `leave()` and by
   * `join()` — a re-join after FAILED must not inherit stale consumers,
   * transports or producers.
   *
   * Deliberately NOT reset (matching the web): `userName` and
   * `deviceState.micEnabled` / `camEnabled` / `selected*`. A user who muted stays
   * muted next call — which also means a device that failed to acquire starts the
   * next meeting switched off.
   */
  private resetMediaState(): void {
    // 3 — stop the discovery poll
    if (this.resyncInterval) {
      clearInterval(this.resyncInterval);
      this.resyncInterval = null;
    }
    this.clearScreenShareWatchdog();

    // 4 — stop local capture
    if (this.localAudioTrack) {
      try {
        this.localAudioTrack.stop();
      } catch (err) {
        console.warn('[MEDIA] Audio track stop warning:', err);
      }
      this.localAudioTrack = null;
    }
    if (this.localVideoTrack) {
      try {
        this.localVideoTrack.stop();
      } catch (err) {
        console.warn('[MEDIA] Video track stop warning:', err);
      }
      this.localVideoTrack = null;
    }
    if (this.localScreenTrack) {
      try {
        this.localScreenTrack.stop();
      } catch (err) {
        console.warn('[MEDIA] Screen track stop warning:', err);
      }
      this.localScreenTrack = null;
    }

    // 5 — notify the local-stream listeners directly rather than through
    // updateCombinedLocalStream(), whose track filtering is meaningless here.
    this.combinedLocalStream = new MediaStream();
    this.localStreamListeners.forEach(fn => fn(this.combinedLocalStream));

    // 6, 7, 8 — producers, consumers, transports
    this.resetPeerConnectionState();

    // 9 — detach every recorded handler (Socket-level AND Manager-level), then
    // disconnect
    this.detachSocket();

    // 10
    this.device = null;
    this.roomId = null;
  }

  /**
   * Producers, consumers and transports only. Used by `resetMediaState()` and, on
   * its own, by the reconnect path — where the local tracks are still live and are
   * reused, but every server-side object belonged to a socket.id that no longer
   * exists.
   */
  private resetPeerConnectionState(): void {
    // 6 — producers
    for (const producer of [this.audioProducer, this.videoProducer, this.screenProducer]) {
      if (!producer) continue;
      try {
        producer.close();
      } catch (err) {
        console.warn('[SFU] Producer close warning:', err);
      }
    }
    this.audioProducer = null;
    this.videoProducer = null;
    this.screenProducer = null;

    // 7 — consumers and every remote-stream index
    this.consumers.forEach(consumer => {
      try {
        consumer.close();
      } catch (err) {
        console.warn('[SFU] Consumer close warning:', err);
      }
    });
    this.consumers.clear();
    this.consumerIdByProducerId.clear();
    this.pendingConsumes.clear();
    this.remoteStreamsMap.clear();
    this.notifyRemoteStreams();

    // 8 — transports, send before recv
    if (this.sendTransport) {
      try {
        this.sendTransport.close();
      } catch (err) {
        console.warn('[SFU] Send transport close warning:', err);
      }
      this.sendTransport = null;
    }
    if (this.recvTransport) {
      try {
        this.recvTransport.close();
      } catch (err) {
        console.warn('[SFU] Receive transport close warning:', err);
      }
      this.recvTransport = null;
    }
  }
}

/**
 * react-native-webrtc's camera constraint vocabulary is the W3C one — 'user' for
 * the front camera — while its `enumerateDevices()` reports 'front'. The device
 * state uses the enumeration vocabulary, so it has to be translated here: Android
 * treats any facingMode that is not exactly 'user' as the BACK camera, so passing
 * 'front' straight through would silently select the wrong lens.
 */
function toFacingModeConstraint(facing: CameraFacing): 'user' | 'environment' {
  return facing === 'front' ? 'user' : 'environment';
}

/** Singleton: the session must survive screen unmount, exactly as on web. */
export const meetingWebRTCManager = new MeetingWebRTCManager();

export type { MeetingWebRTCManager };
