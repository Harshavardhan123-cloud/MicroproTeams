import { Device } from 'mediasoup-client';
import { io, Socket } from 'socket.io-client';
import { getToken } from '../utils/token';
import { getTargetHostUrl } from '../api/client';

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

export interface RemoteParticipantStream {
  producerId: string;
  participantId: string;
  userName: string;
  kind: 'audio' | 'video';
  source: 'microphone' | 'camera' | 'screen';
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
}

export type StateChangeListener = (state: MeetingState) => void;
export type RemoteStreamsListener = (streams: RemoteParticipantStream[]) => void;
export type LocalStreamListener = (stream: MediaStream | null) => void;
export type LocalDeviceStateListener = (deviceState: LocalDeviceState) => void;
export type ErrorListener = (error: { type: string; message: string; details?: any }) => void;

class MeetingWebRTCManager {
  private state: MeetingState = 'IDLE';
  private roomId: string | null = null;
  private userName: string = 'User';

  private socket: Socket | null = null;
  private device: Device | null = null;

  private sendTransport: any = null;
  private recvTransport: any = null;

  private audioProducer: any = null;
  private videoProducer: any = null;
  private screenProducer: any = null;

  private consumers: Map<string, any> = new Map();
  private remoteStreamsMap: Map<string, RemoteParticipantStream> = new Map();

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
    availableSpeakers: []
  };

  private stateListeners: Set<StateChangeListener> = new Set();
  private remoteStreamsListeners: Set<RemoteStreamsListener> = new Set();
  private localStreamListeners: Set<LocalStreamListener> = new Set();
  private deviceStateListeners: Set<LocalDeviceStateListener> = new Set();
  private errorListeners: Set<ErrorListener> = new Set();

  private resyncInterval: any = null;

  constructor() {
    this.enumerateDevices();
    if (typeof navigator !== 'undefined' && navigator.mediaDevices) {
      navigator.mediaDevices.ondevicechange = () => this.enumerateDevices();
    }
  }

  // --- Listener Subscriptions ---
  public onStateChange(fn: StateChangeListener) {
    this.stateListeners.add(fn);
    fn(this.state);
    return () => { this.stateListeners.delete(fn); };
  }

  public onRemoteStreamsChange(fn: RemoteStreamsListener) {
    this.remoteStreamsListeners.add(fn);
    fn(Array.from(this.remoteStreamsMap.values()));
    return () => { this.remoteStreamsListeners.delete(fn); };
  }

  public onLocalStreamChange(fn: LocalStreamListener) {
    this.localStreamListeners.add(fn);
    fn(this.combinedLocalStream);
    return () => { this.localStreamListeners.delete(fn); };
  }

  public onDeviceStateChange(fn: LocalDeviceStateListener) {
    this.deviceStateListeners.add(fn);
    fn(this.deviceState);
    return () => { this.deviceStateListeners.delete(fn); };
  }

  public onError(fn: ErrorListener) {
    this.errorListeners.add(fn);
    return () => { this.errorListeners.delete(fn); };
  }

  // --- State Transitions & Emission ---
  private setState(newState: MeetingState) {
    console.log(`[MEETING] State transition: ${this.state} -> ${newState}`);
    this.state = newState;
    this.stateListeners.forEach(fn => fn(this.state));
  }

  private emitError(type: string, message: string, details?: any) {
    console.error(`[MEETING ERROR] ${type}: ${message}`, details || '');
    this.errorListeners.forEach(fn => fn({ type, message, details }));
  }

  private notifyRemoteStreams() {
    const list = Array.from(this.remoteStreamsMap.values());
    this.remoteStreamsListeners.forEach(fn => fn(list));
  }

  private updateCombinedLocalStream() {
    const tracks: MediaStreamTrack[] = [];
    if (this.localAudioTrack && this.localAudioTrack.enabled) tracks.push(this.localAudioTrack);
    if (this.localVideoTrack && this.localVideoTrack.enabled) tracks.push(this.localVideoTrack);
    if (this.localScreenTrack) tracks.push(this.localScreenTrack);

    this.combinedLocalStream = new MediaStream(tracks);
    this.localStreamListeners.forEach(fn => fn(this.combinedLocalStream));
  }

  private updateDeviceState(partial: Partial<LocalDeviceState>) {
    this.deviceState = { ...this.deviceState, ...partial };
    this.deviceStateListeners.forEach(fn => fn(this.deviceState));
  }

  // --- Hardware Device Enumeration ---
  public async enumerateDevices() {
    try {
      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) return;
      const devices = await navigator.mediaDevices.enumerateDevices();
      const availableMics = devices.filter(d => d.kind === 'audioinput');
      const availableCams = devices.filter(d => d.kind === 'videoinput');
      const availableSpeakers = devices.filter(d => d.kind === 'audiooutput');

      this.updateDeviceState({ availableMics, availableCams, availableSpeakers });
      console.log(`[MEDIA] Enumerated devices: ${availableMics.length} mics, ${availableCams.length} cams, ${availableSpeakers.length} speakers`);
    } catch (err) {
      console.warn('[MEDIA] Device enumeration warning:', err);
    }
  }

  // --- Unlock Autoplay Restrictions ---
  public unlockAudioAutoplay() {
    if (typeof document === 'undefined') return;
    const audioElements = document.querySelectorAll('audio');
    audioElements.forEach(el => {
      el.play().catch(() => {});
    });
  }

  // --- Request Helper for Socket.io ---
  private request(type: string, data: any = {}): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.socket) return reject(new Error('No socket connection'));
      this.socket.emit(type, data, (res: any) => {
        if (res?.error) reject(new Error(res.error));
        else resolve(res);
      });
    });
  }

  // --- Core SFU Meeting Lifecycle: Join ---
  public async join(roomId: string, userName?: string): Promise<void> {
    if (this.state !== 'IDLE' && this.state !== 'FAILED' && this.state !== 'LEFT') {
      console.log(`[MEETING] Already joining/joined room: ${this.roomId}`);
      return;
    }

    this.roomId = roomId || 'direct-call-room';
    this.userName = (userName && userName !== 'Participant' && userName !== 'Teammate') ? userName : 'User';

    this.setState('CONNECTING');
    console.log(`[MEETING] Connecting to SFU room: ${this.roomId} as ${this.userName}`);

    try {
      this.setState('AUTHENTICATING');
      const token = getToken();

      const baseBackend = getTargetHostUrl();
      let primaryUrl = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
      let primaryPath = '/sfu/socket.io';

      let directSfuUrl = 'http://localhost:3010';
      try {
        const u = new URL(baseBackend);
        directSfuUrl = `${u.protocol}//${u.hostname}:3010`;
      } catch (e) {}

      // If running inside Electron, file:// protocol or desktop build
      if (!primaryUrl || primaryUrl.startsWith('file:') || primaryUrl === 'null' || (typeof window !== 'undefined' && window.navigator.userAgent.includes('Electron'))) {
        primaryUrl = directSfuUrl;
        primaryPath = '/socket.io';
      }

      const connectSocket = (targetUrl: string, pathName: string) => {
        if (this.socket) {
          this.socket.disconnect();
          this.socket.removeAllListeners();
        }

        console.log(`[MEETING] Attempting SFU connection to ${targetUrl} with path ${pathName}`);

        this.socket = io(targetUrl, {
          path: pathName,
          transports: ['websocket', 'polling'],
          autoConnect: true,
          auth: { token },
          timeout: 5000,
        });

        this.socket.on('connect', async () => {
          console.log(`[MEETING] WebSocket connected successfully to ${targetUrl}`);
          this.setState('JOINING');
          await this.onSocketConnected();
        });

        this.socket.on('connect_error', (err) => {
          console.warn(`[MEETING] SFU socket connect error for ${targetUrl}:`, err.message);
          if (targetUrl !== directSfuUrl) {
            console.log(`[MEETING] Retrying with direct SFU server: ${directSfuUrl}`);
            connectSocket(directSfuUrl, '/socket.io');
          } else {
            this.setState('FAILED');
            this.emitError('SFU_CONNECT_FAILED', `Failed to connect to Mediasoup SFU server at ${targetUrl}: ${err.message}`);
          }
        });

        this.socket.on('disconnect', (reason) => {
          console.warn('[MEETING] SFU Socket disconnected:', reason);
          if (this.state !== 'LEAVING' && this.state !== 'LEFT') {
            this.setState('RECONNECTING');
          }
        });

        this.socket.io.on('reconnect', async () => {
          console.log('[MEETING] SFU Socket reconnected! Resynchronizing session...');
          this.setState('JOINING');
          try {
            await this.request('joinRoom', { roomId: this.roomId, userName: this.userName });
            await this.resyncRemoteProducers();
            this.setState('IN_MEETING');
          } catch (err: any) {
            console.error('[MEETING] Reconnect resync failed:', err);
          }
        });

        this.socket.on('newProducer', (data) => {
          console.log('[SFU] Remote producer discovered:', data);
          this.consumeRemoteTrack(data.producerId, data.peerId, (data.userName && data.userName !== 'Participant' && data.userName !== 'Teammate') ? data.userName : 'User', data.kind, data.appData);
        });

        this.socket.on('producerClosed', ({ producerId }) => {
          console.log('[SFU] Remote producer closed:', producerId);
          this.remoteStreamsMap.delete(producerId);
          this.notifyRemoteStreams();
        });

        this.socket.on('peerClosed', ({ peerId }) => {
          console.log('[SFU] Peer disconnected:', peerId);
          let changed = false;
          for (const [prodId, streamInfo] of this.remoteStreamsMap.entries()) {
            if (streamInfo.participantId === peerId) {
              this.remoteStreamsMap.delete(prodId);
              changed = true;
            }
          }
          if (changed) this.notifyRemoteStreams();
        });

        this.socket.on('consumerClosed', ({ consumerId }) => {
          const consumer = this.consumers.get(consumerId);
          if (consumer) {
            consumer.close();
            this.consumers.delete(consumerId);
          }
        });
      };

      connectSocket(primaryUrl, primaryPath);

    } catch (err: any) {
      this.setState('FAILED');
      this.emitError('JOIN_FAILED', err.message || 'Failed to join meeting session');
    }
  }

  private async onSocketConnected() {
    try {
      // 1. Join Room & Fetch Router RTP Capabilities
      console.log('[SFU] Requesting router RTP capabilities...');
      const { routerRtpCapabilities } = await this.request('joinRoom', {
        roomId: this.roomId,
        userName: this.userName
      });
      console.log('[SFU] Router RTP capabilities received');

      // 2. Initialize Mediasoup Device
      console.log('[SFU] Loading Mediasoup Device...');
      this.device = new Device();
      await this.device.load({ routerRtpCapabilities });
      console.log('[SFU] Mediasoup Device loaded successfully');

      this.setState('CONNECTING_MEDIA');

      // 3. Create Send Transport
      console.log('[SFU] Creating Send Transport...');
      const sendTransportInfo = await this.request('createWebRtcTransport', { roomId: this.roomId });
      const defaultIceServers = [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' }
      ];
      const sendParams = {
        ...sendTransportInfo.params,
        iceServers: sendTransportInfo.params?.iceServers || defaultIceServers
      };
      this.sendTransport = this.device.createSendTransport(sendParams);
      console.log('[SFU] Send transport created:', this.sendTransport.id);

      this.sendTransport.on('connectionstatechange', (state: string) => {
        console.log(`[SFU] Send transport connection state: ${state}`);
      });

      this.sendTransport.on('connect', async ({ dtlsParameters }: any, callback: any, errback: any) => {
        try {
          console.log('[SFU] Connecting send transport DTLS...');
          await this.request('connectWebRtcTransport', {
            roomId: this.roomId,
            transportId: this.sendTransport.id,
            dtlsParameters
          });
          console.log('[SFU] Send transport connected');
          callback();
        } catch (error: any) {
          console.error('[SFU] Send transport connect error:', error);
          errback(error);
        }
      });

      this.sendTransport.on('produce', async (parameters: any, callback: any, errback: any) => {
        try {
          console.log(`[SFU] Producing track (${parameters.kind}, source: ${parameters.appData?.source})...`);
          const { id } = await this.request('produce', {
            roomId: this.roomId,
            transportId: this.sendTransport.id,
            kind: parameters.kind,
            rtpParameters: parameters.rtpParameters,
            appData: parameters.appData
          });
          console.log('[SFU] Producer created with ID:', id);
          callback({ id });
        } catch (error: any) {
          console.error('[SFU] Produce error:', error);
          errback(error);
        }
      });

      // 4. Create Receive Transport
      console.log('[SFU] Creating Receive Transport...');
      const recvTransportInfo = await this.request('createWebRtcTransport', { roomId: this.roomId });
      const recvParams = {
        ...recvTransportInfo.params,
        iceServers: recvTransportInfo.params?.iceServers || defaultIceServers
      };
      this.recvTransport = this.device.createRecvTransport(recvParams);
      console.log('[SFU] Receive transport created:', this.recvTransport.id);

      this.recvTransport.on('connectionstatechange', (state: string) => {
        console.log(`[SFU] Receive transport connection state: ${state}`);
      });

      this.recvTransport.on('connect', async ({ dtlsParameters }: any, callback: any, errback: any) => {
        try {
          console.log('[SFU] Connecting receive transport DTLS...');
          await this.request('connectWebRtcTransport', {
            roomId: this.roomId,
            transportId: this.recvTransport.id,
            dtlsParameters
          });
          console.log('[SFU] Receive transport connected');
          callback();
        } catch (error: any) {
          console.error('[SFU] Receive transport connect error:', error);
          errback(error);
        }
      });

      this.setState('MEDIA_CONNECTED');

      // 5. Initialize Initial Microphone and Camera
      await this.initInitialMedia();

      // 6. Discover & Consume Remote Producers
      await this.resyncRemoteProducers();

      // Periodic resync loop (every 2.5s) to guarantee no missed tracks
      if (this.resyncInterval) clearInterval(this.resyncInterval);
      this.resyncInterval = setInterval(() => this.resyncRemoteProducers(), 2500);

      this.setState('IN_MEETING');
      console.log('[MEETING] Meeting session fully established and active!');

    } catch (err: any) {
      console.error('[MEETING] Connection pipeline failed:', err);
      this.setState('FAILED');
      this.emitError('PIPELINE_ERROR', err.message || 'Error establishing WebRTC transports');
    }
  }

  // --- Initial Media Setup ---
  private async initInitialMedia() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      console.warn('[MEDIA] Browser context does not support mediaDevices (e.g. non-localhost HTTP origin). Disabling auto-media.');
      this.updateDeviceState({ micEnabled: false, camEnabled: false });
      return;
    }

    // Always try microphone first
    try {
      if (this.deviceState.micEnabled) {
        await this.enableMicrophone(this.deviceState.selectedMicId);
      }
    } catch (err: any) {
      console.warn('[MEDIA] Microphone setup warning:', err.message);
    }

    // Try camera, but gracefully fall back to audio-only if it's in use
    if (this.deviceState.camEnabled) {
      try {
        await this.enableCamera(this.deviceState.selectedCamId);
      } catch (err: any) {
        const isInUse = err?.name === 'NotReadableError' || err?.name === 'TrackStartError' || (err?.message || '').toLowerCase().includes('in use');
        if (isInUse) {
          console.warn('[MEDIA] Camera is in use by another application — starting in audio-only mode');
          this.updateDeviceState({ camEnabled: false });
          this.emitError('CAMERA_IN_USE', 'Camera is being used by another application. Running in audio-only mode.');
        } else {
          console.warn('[MEDIA] Camera setup warning:', err.message);
          this.updateDeviceState({ camEnabled: false });
        }
      }
    }
  }

  // --- Seamless Microphone Controls & Device Switching ---
  public async enableMicrophone(deviceId?: string): Promise<void> {
    console.log('[MEDIA] Requesting microphone access...');
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('CAMERA_MIC_REQUIRES_HTTPS_OR_LOCALHOST');
      }

      let stream: MediaStream;
      try {
        const constraints: MediaStreamConstraints = {
          audio: deviceId && deviceId !== 'default'
            ? { deviceId: { ideal: deviceId }, echoCancellation: true, noiseSuppression: true, autoGainControl: true }
            : { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
        };
        stream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch (e) {
        console.warn('[MEDIA] Primary microphone constraints failed, retrying with basic audio stream...', e);
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      }

      const audioTrack = stream.getAudioTracks()[0];
      if (!audioTrack) throw new Error('No audio track returned by browser');
      audioTrack.enabled = true;

      if (this.localAudioTrack) {
        this.localAudioTrack.stop();
      }
      this.localAudioTrack = audioTrack;
      this.updateCombinedLocalStream();

      if (this.sendTransport) {
        if (this.audioProducer) {
          console.log('[MEDIA] Replacing audio producer track with new microphone track...');
          await this.audioProducer.replaceTrack({ track: audioTrack });
          try { await this.audioProducer.resume(); } catch (e) {}
        } else {
          console.log('[MEDIA] Creating audio producer...');
          this.audioProducer = await this.sendTransport.produce({
            track: audioTrack,
            appData: { source: 'microphone' }
          });
        }
      }

      this.updateDeviceState({ micEnabled: true, selectedMicId: deviceId || this.deviceState.selectedMicId });
      console.log('[MEDIA] Microphone successfully enabled and producing audio');
      await this.updateAvailableDevices();

    } catch (err: any) {
      this.handleMediaError('Microphone', err);
      this.updateDeviceState({ micEnabled: false });
    }
  }

  public disableMicrophone() {
    console.log('[MEDIA] Disabling microphone...');
    if (this.localAudioTrack) {
      this.localAudioTrack.enabled = false;
    }
    if (this.audioProducer) {
      try { this.audioProducer.pause(); } catch (e) {}
    }
    this.updateDeviceState({ micEnabled: false });
  }

  public async changeMicrophone(deviceId: string): Promise<void> {
    console.log(`[MEDIA] Changing microphone device to: ${deviceId}`);
    await this.enableMicrophone(deviceId);
  }

  // --- Seamless Camera Controls & Device Switching ---
  public async enableCamera(deviceId?: string): Promise<void> {
    console.log('[MEDIA] Requesting camera access...');
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('CAMERA_MIC_REQUIRES_HTTPS_OR_LOCALHOST');
      }

      let stream: MediaStream;
      try {
        const constraints: MediaStreamConstraints = {
          video: deviceId && deviceId !== 'default'
            ? { deviceId: { ideal: deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } }
            : { width: { ideal: 1280 }, height: { ideal: 720 } }
        };
        stream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch (e) {
        console.warn('[MEDIA] Primary camera constraints failed, retrying with fallback video stream...', e);
        stream = await navigator.mediaDevices.getUserMedia({ video: true });
      }

      const videoTrack = stream.getVideoTracks()[0];
      if (!videoTrack) throw new Error('No video track returned by browser');
      videoTrack.enabled = true;

      if (this.localVideoTrack) {
        this.localVideoTrack.stop();
      }
      this.localVideoTrack = videoTrack;
      this.updateCombinedLocalStream();

      if (this.sendTransport) {
        if (this.videoProducer) {
          console.log('[MEDIA] Replacing video producer track with new camera track...');
          await this.videoProducer.replaceTrack({ track: videoTrack });
          try { await this.videoProducer.resume(); } catch (e) {}
        } else {
          console.log('[MEDIA] Creating video producer...');
          this.videoProducer = await this.sendTransport.produce({
            track: videoTrack,
            appData: { source: 'camera' }
          });
        }
      }

      this.updateDeviceState({ camEnabled: true, selectedCamId: deviceId || this.deviceState.selectedCamId });
      console.log('[MEDIA] Camera successfully enabled');
      await this.updateAvailableDevices();

    } catch (err: any) {
      this.handleMediaError('Camera', err);
      this.updateDeviceState({ camEnabled: false });
    }
  }

  public disableCamera() {
    console.log('[MEDIA] Disabling camera...');
    if (this.localVideoTrack) {
      this.localVideoTrack.enabled = false;
    }
    if (this.videoProducer) {
      try { this.videoProducer.pause(); } catch (e) {}
    }
    this.updateDeviceState({ camEnabled: false });
  }

  public async changeCamera(deviceId: string): Promise<void> {
    console.log(`[MEDIA] Changing camera device to: ${deviceId}`);
    await this.enableCamera(deviceId);
  }

  // --- Speaker Selection ---
  public async changeSpeaker(deviceId: string): Promise<void> {
    console.log(`[MEDIA] Changing speaker device to: ${deviceId}`);
    this.updateDeviceState({ selectedSpeakerId: deviceId });
  }

  // --- Screen Sharing ---
  public async startScreenShare(): Promise<void> {
    console.log('[MEDIA] Initiating screen share...');
    try {
      if (!navigator.mediaDevices?.getDisplayMedia) {
        throw new Error('Screen sharing is not supported in this browser environment');
      }

      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true
      });

      const screenTrack = stream.getVideoTracks()[0];
      if (!screenTrack) throw new Error('No screen video track acquired');
      screenTrack.enabled = true;

      this.localScreenTrack = screenTrack;
      this.updateCombinedLocalStream();

      if (this.sendTransport) {
        console.log('[MEDIA] Creating screen producer...');
        this.screenProducer = await this.sendTransport.produce({
          track: screenTrack,
          appData: { source: 'screen' }
        });
      }

      screenTrack.onended = () => {
        console.log('[MEDIA] Native browser screen share stopped');
        this.stopScreenShare();
      };

      this.updateDeviceState({ screenSharing: true });
      console.log('[MEDIA] Screen sharing active');

    } catch (err: any) {
      this.handleMediaError('Screen Share', err);
      this.updateDeviceState({ screenSharing: false });
    }
  }

  public async stopScreenShare(): Promise<void> {
    console.log('[MEDIA] Stopping screen share...');
    if (this.localScreenTrack) {
      this.localScreenTrack.stop();
      this.localScreenTrack = null;
      this.updateCombinedLocalStream();
    }

    if (this.screenProducer && this.roomId) {
      const prodId = this.screenProducer.id;
      this.screenProducer.close();
      this.screenProducer = null;
      try {
        await this.request('closeProducer', { roomId: this.roomId, producerId: prodId });
      } catch (e) {}
    }

    this.updateDeviceState({ screenSharing: false });
    console.log('[MEDIA] Screen share stopped successfully');
  }

  // --- Remote Producer Discovery & Consumer Creation ---
  private async consumeRemoteTrack(
    producerId: string,
    peerId: string,
    peerUserName: string,
    kind: 'audio' | 'video',
    appData?: any
  ): Promise<void> {
    try {
      if (!this.device || !this.recvTransport) {
        console.warn('[SFU] Device or Receive Transport not ready for remote producer:', producerId);
        return;
      }
      if (this.remoteStreamsMap.has(producerId)) return;

      console.log(`[SFU] Creating consumer for remote producer ${producerId} (${kind}, source: ${appData?.source})...`);
      const { rtpCapabilities } = this.device;

      const data = await this.request('consume', {
        roomId: this.roomId,
        transportId: this.recvTransport.id,
        producerId,
        rtpCapabilities
      });

      const consumer = await this.recvTransport.consume({
        id: data.params.id,
        producerId: data.params.producerId,
        kind: data.params.kind,
        rtpParameters: data.params.rtpParameters
      });

      this.consumers.set(consumer.id, consumer);

      // CRITICAL STEP: Resume consumer on SFU server AND request video KeyFrame (PLI/FIR)
      console.log(`[SFU] Resuming consumer on SFU server and requesting keyframe for ${peerUserName} (${kind})...`);
      await this.request('resumeConsumer', { roomId: this.roomId, consumerId: consumer.id });
      try {
        await consumer.resume();
      } catch (e) {
        console.warn('[SFU] Consumer local resume warning:', e);
      }

      if (kind === 'video') {
        try {
          await this.request('requestKeyFrame', { roomId: this.roomId, consumerId: consumer.id });
        } catch (e) {}
      }

      consumer.track.enabled = true;
      const stream = new MediaStream([consumer.track]);
      const source = appData?.source || (kind === 'video' ? 'camera' : 'microphone');

      this.remoteStreamsMap.set(producerId, {
        producerId,
        participantId: peerId,
        userName: peerUserName,
        kind,
        source,
        stream
      });

      this.notifyRemoteStreams();
      console.log(`[SFU] Consumer active and stream attached for ${peerUserName} (${kind})`);

    } catch (err: any) {
      console.error('[SFU] Failed to consume remote track:', err);
    }
  }

  public async resyncRemoteProducers(): Promise<void> {
    if (this.state !== 'IN_MEETING' && this.state !== 'MEDIA_CONNECTED') return;
    try {
      if (this.socket?.connected && this.recvTransport) {
        const existingProducers = await this.request('getProducers', { roomId: this.roomId });
        for (const p of existingProducers) {
          if (!this.remoteStreamsMap.has(p.producerId)) {
            await this.consumeRemoteTrack(p.producerId, p.peerId, (p.userName && p.userName !== 'Participant' && p.userName !== 'Teammate') ? p.userName : 'User', p.kind, p.appData);
          }
        }
      }
    } catch (err) {
      // Quiet background polling
    }
  }

  // --- Media Device Enumeration ---
  public async updateAvailableDevices(): Promise<void> {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const mics = devices.filter(d => d.kind === 'audioinput');
      const cams = devices.filter(d => d.kind === 'videoinput');
      const speakers = devices.filter(d => d.kind === 'audiooutput');

      this.updateDeviceState({
        availableMics: mics,
        availableCams: cams,
        availableSpeakers: speakers
      });
    } catch (err) {
      console.warn('[MEDIA] Error enumerating media devices:', err);
    }
  }

  // --- Helper Error Handler for Permission/Device Errors ---
  private handleMediaError(source: string, err: any) {
    let message = err.message || 'Unknown media error';
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || err.message === 'CAMERA_MIC_REQUIRES_HTTPS_OR_LOCALHOST') {
      message = `${source} access blocked. WebRTC requires an HTTPS connection or localhost for camera/microphone hardware access.`;
    } else if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
      message = `${source} permission denied. Please allow access in browser settings.`;
    } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
      message = `No ${source.toLowerCase()} hardware device found on system.`;
    } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
      message = `${source} hardware device is already in use by another application.`;
    } else if (err.name === 'OverconstrainedError') {
      message = `Requested ${source.toLowerCase()} settings are not supported by hardware.`;
    }

    this.emitError(`${source.toUpperCase()}_ERROR`, message, err);
  }

  // --- Public State Getters ---
  public getState(): MeetingState { return this.state; }
  public getDeviceState(): LocalDeviceState { return this.deviceState; }
  public getLocalStream(): MediaStream { return this.combinedLocalStream; }
  public getRemoteStreams(): RemoteParticipantStream[] { return Array.from(this.remoteStreamsMap.values()); }

  // --- Session Teardown & Cleanup ---
  public async leave(): Promise<void> {
    if (this.state === 'LEFT' || this.state === 'IDLE') {
      return;
    }
    console.log('[MEETING] Leaving meeting session and performing full cleanup...');
    this.setState('LEAVING');

    if (this.resyncInterval) {
      clearInterval(this.resyncInterval);
      this.resyncInterval = null;
    }

    // Stop local media tracks
    if (this.localAudioTrack) { this.localAudioTrack.stop(); this.localAudioTrack = null; }
    if (this.localVideoTrack) { this.localVideoTrack.stop(); this.localVideoTrack = null; }
    if (this.localScreenTrack) { this.localScreenTrack.stop(); this.localScreenTrack = null; }
    this.combinedLocalStream = new MediaStream();
    this.localStreamListeners.forEach(fn => fn(this.combinedLocalStream));

    // Close producers
    if (this.audioProducer) { try { this.audioProducer.close(); } catch (e) {} this.audioProducer = null; }
    if (this.videoProducer) { try { this.videoProducer.close(); } catch (e) {} this.videoProducer = null; }
    if (this.screenProducer) { try { this.screenProducer.close(); } catch (e) {} this.screenProducer = null; }

    // Close consumers
    this.consumers.forEach(c => { try { c.close(); } catch (e) {} });
    this.consumers.clear();
    this.remoteStreamsMap.clear();
    this.notifyRemoteStreams();

    // Close transports
    if (this.sendTransport) { try { this.sendTransport.close(); } catch (e) {} this.sendTransport = null; }
    if (this.recvTransport) { try { this.recvTransport.close(); } catch (e) {} this.recvTransport = null; }

    // Disconnect socket
    if (this.socket) {
      try { this.socket.disconnect(); } catch (e) {}
      this.socket = null;
    }

    this.device = null;
    this.roomId = null;

    this.setState('LEFT');
    console.log('[MEETING] Full cleanup completed. State: LEFT');
  }
}

export const meetingWebRTCManager = new MeetingWebRTCManager();
