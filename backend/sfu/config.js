const path = require('path');
const os = require('os');

// Load the project-root .env explicitly
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

function getAnnouncedIp() {
  if (process.env.SFU_ANNOUNCED_IP) {
    return process.env.SFU_ANNOUNCED_IP;
  }
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return '127.0.0.1';
}

const announcedIp = getAnnouncedIp();
console.log(`[SFU CONFIG] Auto-detected WebRTC Announced IP: ${announcedIp}`);

module.exports = {
  listenIp: process.env.SFU_LISTEN_IP || '0.0.0.0',
  listenPort: parseInt(process.env.SFU_LISTEN_PORT || '3010', 10),
  jwtSecret: process.env.JWT_SECRET || null,
  corsOrigin: process.env.SFU_CORS_ORIGIN || '*',
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
      listenIps: [
        {
          ip: process.env.SFU_LISTEN_IP || '0.0.0.0',
          announcedIp: announcedIp
        }
      ],
      maxIncomingBitrate: 1500000,
      initialAvailableOutgoingBitrate: 1000000
    }
  }
};
