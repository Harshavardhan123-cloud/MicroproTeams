/**
 * Room — manages a single meeting room with mediasoup Router.
 */
class Room {
  constructor(id, router) {
    this.id = id;
    this.router = router;
    this._peers = new Map(); // peerId → Peer
  }

  addPeer(peerId, socket, displayName) {
    const { Peer } = require("./Peer");
    this._peers.set(peerId, new Peer(peerId, socket, displayName));
  }

  getPeer(peerId) {
    return this._peers.get(peerId);
  }

  getPeers() {
    return Array.from(this._peers.values());
  }

  removePeer(peerId) {
    const peer = this._peers.get(peerId);
    if (peer) {
      peer.close();
      this._peers.delete(peerId);
    }
  }

  close() {
    this._peers.forEach((peer) => peer.close());
    this._peers.clear();
    this.router.close();
  }
}

module.exports = Room;
