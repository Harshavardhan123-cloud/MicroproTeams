/**
 * Peer — represents one participant in a Room.
 */
class Peer {
  constructor(id, socket, displayName) {
    this.id = id;
    this.socket = socket;
    this.displayName = displayName;
    this._transports = new Map();
    this._producers = new Map();
    this._consumers = new Map();
  }

  addTransport(transport) {
    this._transports.set(transport.id, transport);
  }

  getTransport(transportId) {
    return this._transports.get(transportId);
  }

  addProducer(producer) {
    this._producers.set(producer.id, producer);
  }

  getProducer(producerId) {
    return this._producers.get(producerId);
  }

  getProducers() {
    return Array.from(this._producers.values());
  }

  addConsumer(consumer) {
    this._consumers.set(consumer.id, consumer);
  }

  getConsumer(consumerId) {
    return this._consumers.get(consumerId);
  }

  close() {
    this._producers.forEach((p) => p.close());
    this._consumers.forEach((c) => c.close());
    this._transports.forEach((t) => t.close());
  }
}

module.exports = { Peer };
