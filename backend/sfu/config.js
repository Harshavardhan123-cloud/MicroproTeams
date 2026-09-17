const path = require('path');
const os = require('os');

// Load the project-root .env explicitly
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

function getListenIps() {
  const ips = [];
  const added = new Set();

  function addIp(ip) {
    if (ip && !added.has(ip)) {
      added.add(ip);
      ips.push({
        ip: process.env.SFU_LISTEN_IP || '0.0.0.0',
        announcedIp: ip
      });
    }
  }

  // 1. Explicit environment variable announced IP if set
  if (process.env.SFU_ANNOUNCED_IP) {
    addIp(process.env.SFU_ANNOUNCED_IP);
  }

  // 2. Local network interfaces (LAN IP e.g. 192.168.1.147)
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        addIp(iface.address);
      }
    }
  }

  // 3. Localhost loopback (critical for same-machine browsers and local testing)
  addIp('127.0.0.1');

  // 4. Public IP for WAN/Internet WebRTC traversal if provided
  if (process.env.SFU_PUBLIC_IP) {
    addIp(process.env.SFU_PUBLIC_IP);
  }

  return ips;
}

const listenIps = getListenIps();
console.log(`[SFU CONFIG] Configured WebRTC Announced IPs:`, listenIps.map(l => l.announcedIp).join(', '));

// STUN only tells a client its own public address; it cannot help when the
// client sits behind a NAT that refuses unsolicited inbound packets. Kept
// overridable, but the default is byte-for-byte the list the SFU has always
// returned, so nothing changes for a deployment that sets no TURN vars.
const DEFAULT_STUN_URLS = [
  'stun:stun.l.google.com:19302',
  'stun:stun1.l.google.com:19302',
  'stun:stun2.l.google.com:19302'
];

function csv(value) {
  return String(value || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
}

const stunUrls = process.env.STUN_URLS ? csv(process.env.STUN_URLS) : DEFAULT_STUN_URLS;

/**
 * TURN relay (coturn) — see infrastructure/coturn/turnserver.conf.
 *
 * Mobile clients on a mobile network usually sit behind carrier-grade NAT,
 * where STUN-discovered candidates are unusable and the only way media
 * flows is through a relay. This block describes *where* that relay is;
 * the per-client credential is minted in server.js at transport-creation
 * time, so the shared secret itself never leaves this process.
 *
 * Degradation is deliberate and total: with no TURN_SECRET set, `enabled`
 * is false and the SFU returns exactly the STUN-only list it always has.
 */
function getTurnConfig() {
  const secret = (process.env.TURN_SECRET || '').trim();

  // The address a *client* dials, which is not necessarily any address this
  // process listens on. SFU_ANNOUNCED_IP is the last resort because compose
  // defaults it to 127.0.0.1, which no remote client can use.
  const rawHost = (
    process.env.TURN_HOST ||
    process.env.SFU_PUBLIC_IP ||
    process.env.SFU_ANNOUNCED_IP ||
    ''
  ).trim();
  const host = ['127.0.0.1', 'localhost', '0.0.0.0', '::1'].includes(rawHost) ? '' : rawHost;

  const port = parseInt(process.env.TURN_PORT || '3478', 10);
  const tlsPort = parseInt(process.env.TURN_TLS_PORT || '5349', 10);
  const tlsEnabled = String(process.env.TURN_TLS_ENABLED || '').toLowerCase() === 'true';

  // 4 hours: long enough that a credential handed out at the start of a long
  // meeting is still valid for an ICE restart near the end, short enough that
  // one scraped out of a client is worthless by the next day.
  const parsedTtl = parseInt(process.env.TURN_CREDENTIAL_TTL || '14400', 10);
  const credentialTtl = Number.isFinite(parsedTtl) && parsedTtl > 0 ? parsedTtl : 14400;

  let urls = [];
  if (process.env.TURN_URLS) {
    // Escape hatch for a managed/third-party TURN service whose URLs don't
    // follow the host:port shape built below.
    urls = csv(process.env.TURN_URLS);
  } else if (host) {
    // UDP first (lowest latency), TCP as the fallback that survives firewalls
    // which only allow outbound TCP.
    urls = [
      `turn:${host}:${port}?transport=udp`,
      `turn:${host}:${port}?transport=tcp`
    ];
    if (tlsEnabled) {
      urls.push(`turns:${host}:${tlsPort}?transport=tcp`);
    }
  }

  const enabled = Boolean(secret) && urls.length > 0;

  if (secret && !enabled) {
    console.warn(
      '[SFU CONFIG] TURN_SECRET is set but no usable TURN address could be resolved ' +
      '(set TURN_HOST to the public hostname/IP of the coturn server, or TURN_URLS ' +
      'explicitly). Falling back to STUN-only ICE.'
    );
  }

  return { enabled, secret, urls, credentialTtl };
}

const turn = getTurnConfig();
console.log(
  turn.enabled
    ? `[SFU CONFIG] TURN relay enabled: ${turn.urls.join(', ')} (credential TTL ${turn.credentialTtl}s)`
    : '[SFU CONFIG] TURN relay disabled — ICE will be STUN-only (set TURN_SECRET and TURN_HOST to enable)'
);

module.exports = {
  listenIp: process.env.SFU_LISTEN_IP || '0.0.0.0',
  listenPort: parseInt(process.env.SFU_LISTEN_PORT || '3010', 10),
  jwtSecret: process.env.JWT_SECRET || null,
  corsOrigin: process.env.SFU_CORS_ORIGIN || '*',
  stunServers: stunUrls.map(urls => ({ urls })),
  turn,
  mediasoup: {
    numWorkers: Object.keys(os.cpus()).length,
    worker: {
      rtcMinPort: 40000,
      rtcMaxPort: 49999,
      logLevel: 'warn',
      logTags: ['info', 'ice', 'dtls', 'rtp', 'srtp', 'rtcp']
    },
    router: {
      mediaCodecs: [
        {
          kind: 'audio',
          mimeType: 'audio/opus',
          clockRate: 48000,
          channels: 2
        },
        {
          kind: 'video',
          mimeType: 'video/VP8',
          clockRate: 90000,
          parameters: {
            'x-google-start-bitrate': 1000
          }
        },
        {
          kind: 'video',
          mimeType: 'video/VP9',
          clockRate: 90000,
          parameters: {
            'profile-id': 2,
            'x-google-start-bitrate': 1000
          }
        },
        {
          kind: 'video',
          mimeType: 'video/h264',
          clockRate: 90000,
          parameters: {
            'packetization-mode': 1,
            'profile-level-id': '4d0032',
            'level-asymmetry-allowed': 1,
            'x-google-start-bitrate': 1000
          }
        }
      ]
    },
    webRtcTransport: {
      listenIps: listenIps,
      maxIncomingBitrate: 1500000,
      initialAvailableOutgoingBitrate: 1000000
    }
  }
};
