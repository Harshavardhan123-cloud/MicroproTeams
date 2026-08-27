import uuid
from typing import Dict, Any, Optional, List
from app.services.sfu.base import BaseSFUService

class MediasoupSFUService(BaseSFUService):
    """High-performance Mediasoup SFU Service Abstraction layer.
    Manages WebRTC routers, WebRtcTransports, Producers, and Consumers.
    """
    def __init__(self):
        self.rooms: Dict[str, Dict[str, Any]] = {}

    async def create_room(self, room_id: str) -> Dict[str, Any]:
        if room_id not in self.rooms:
            self.rooms[room_id] = {
                "room_id": room_id,
                "participants": {},
                "transports": {},
                "producers": {},
                "consumers": {},
                "router_rtp_capabilities": {
                    "codecs": [
                        {"mimeType": "audio/opus", "kind": "audio", "clockRate": 48000, "channels": 2},
                        {"mimeType": "video/VP8", "kind": "video", "clockRate": 90000},
                        {"mimeType": "video/H264", "kind": "video", "clockRate": 90000}
                    ]
                }
            }
        return self.rooms[room_id]

    async def close_room(self, room_id: str) -> bool:
        if room_id in self.rooms:
            del self.rooms[room_id]
            return True
        return False

    async def join_room(self, room_id: str, participant_id: str) -> Dict[str, Any]:
        room = await self.create_room(room_id)
        if participant_id not in room["participants"]:
            room["participants"][participant_id] = {
                "participant_id": participant_id,
                "transports": [],
                "producers": [],
                "consumers": []
            }
        return {
            "room_id": room_id,
            "participant_id": participant_id,
            "router_rtp_capabilities": room["router_rtp_capabilities"]
        }

    async def leave_room(self, room_id: str, participant_id: str) -> bool:
        room = self.rooms.get(room_id)
        if not room:
            return False

        if participant_id in room["participants"]:
            # Clean up producers
            p_ids = list(room["participants"][participant_id]["producers"])
            for pid in p_ids:
                await self.close_producer(room_id, pid)
            del room["participants"][participant_id]

        if not room["participants"]:
            await self.close_room(room_id)
        return True

    async def create_transport(self, room_id: str, participant_id: str, direction: str) -> Dict[str, Any]:
        room = await self.create_room(room_id)
        transport_id = f"tr_{uuid.uuid4().hex[:12]}"
        
        transport_info = {
            "id": transport_id,
            "participant_id": participant_id,
            "direction": direction,
            "iceParameters": {
                "usernameFragment": uuid.uuid4().hex[:8],
                "password": uuid.uuid4().hex[:16]
            },
            "iceCandidates": [
                {
                    "foundation": "udpcandidate",
                    "ip": "127.0.0.1",
                    "port": 40000 + (hash(transport_id) % 10000),
                    "priority": 1073741823,
                    "protocol": "udp",
                    "type": "host"
                }
            ],
            "dtlsParameters": {
                "role": "auto",
                "fingerprints": [{"algorithm": "sha-256", "value": "00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF"}]
            }
        }
        room["transports"][transport_id] = transport_info
        if participant_id in room["participants"]:
            room["participants"][participant_id]["transports"].append(transport_id)
        return transport_info

    async def connect_transport(self, room_id: str, participant_id: str, transport_id: str, dtls_parameters: Dict[str, Any]) -> bool:
        room = self.rooms.get(room_id)
        if not room or transport_id not in room["transports"]:
            return False
        room["transports"][transport_id]["connected"] = True
        return True

    async def produce(self, room_id: str, participant_id: str, transport_id: str, kind: str, rtp_parameters: Dict[str, Any], app_data: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        room = await self.create_room(room_id)
        producer_id = f"prod_{uuid.uuid4().hex[:12]}"
        
        producer_info = {
            "id": producer_id,
            "participant_id": participant_id,
            "transport_id": transport_id,
            "kind": kind, # mic, camera, screen
            "rtpParameters": rtp_parameters,
            "paused": False,
            "appData": app_data or {}
        }
        room["producers"][producer_id] = producer_info
        if participant_id in room["participants"]:
            room["participants"][participant_id]["producers"].append(producer_id)
        return producer_info

    async def consume(self, room_id: str, participant_id: str, producer_id: str, rtp_capabilities: Dict[str, Any]) -> Dict[str, Any]:
        room = self.rooms.get(room_id)
        if not room or producer_id not in room["producers"]:
            raise ValueError("Producer not found")

        producer = room["producers"][producer_id]
        consumer_id = f"cons_{uuid.uuid4().hex[:12]}"

        consumer_info = {
            "id": consumer_id,
            "producer_id": producer_id,
            "participant_id": participant_id,
            "kind": producer["kind"],
            "rtpParameters": producer["rtpParameters"]
        }
        room["consumers"][consumer_id] = consumer_info
        if participant_id in room["participants"]:
            room["participants"][participant_id]["consumers"].append(consumer_id)
        return consumer_info

    async def pause_producer(self, room_id: str, producer_id: str) -> bool:
        room = self.rooms.get(room_id)
        if room and producer_id in room["producers"]:
            room["producers"][producer_id]["paused"] = True
            return True
        return False

    async def resume_producer(self, room_id: str, producer_id: str) -> bool:
        room = self.rooms.get(room_id)
        if room and producer_id in room["producers"]:
            room["producers"][producer_id]["paused"] = False
            return True
        return False

    async def close_producer(self, room_id: str, producer_id: str) -> bool:
        room = self.rooms.get(room_id)
        if room and producer_id in room["producers"]:
            del room["producers"][producer_id]
            return True
        return False

# Global singleton SFU service instance
sfu_service = MediasoupSFUService()
