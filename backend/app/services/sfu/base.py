from abc import ABC, abstractmethod
from typing import Dict, Any, Optional, List

class BaseSFUService(ABC):
    @abstractmethod
    async def create_room(self, room_id: str) -> Dict[str, Any]:
        """Create a new media room/router on the SFU."""
        pass

    @abstractmethod
    async def close_room(self, room_id: str) -> bool:
        """Close a media room and dispose all transports."""
        pass

    @abstractmethod
    async def join_room(self, room_id: str, participant_id: str) -> Dict[str, Any]:
        """Register a participant in the SFU room."""
        pass

    @abstractmethod
    async def leave_room(self, room_id: str, participant_id: str) -> bool:
        """Remove a participant from the SFU room and clean up their producers/consumers."""
        pass

    @abstractmethod
    async def create_transport(self, room_id: str, participant_id: str, direction: str) -> Dict[str, Any]:
        """Create a WebRTC send/receive transport for a participant."""
        pass

    @abstractmethod
    async def connect_transport(self, room_id: str, participant_id: str, transport_id: str, dtls_parameters: Dict[str, Any]) -> bool:
        """Connect WebRTC DTLS transport parameters."""
        pass

    @abstractmethod
    async def produce(self, room_id: str, participant_id: str, transport_id: str, kind: str, rtp_parameters: Dict[str, Any], app_data: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """Publish a media stream producer (mic, camera, screen)."""
        pass

    @abstractmethod
    async def consume(self, room_id: str, participant_id: str, producer_id: str, rtp_capabilities: Dict[str, Any]) -> Dict[str, Any]:
        """Subscribe to a remote media stream consumer."""
        pass

    @abstractmethod
    async def pause_producer(self, room_id: str, producer_id: str) -> bool:
        """Pause audio/video producer."""
        pass

    @abstractmethod
    async def resume_producer(self, room_id: str, producer_id: str) -> bool:
        """Resume audio/video producer."""
        pass

    @abstractmethod
    async def close_producer(self, room_id: str, producer_id: str) -> bool:
        """Close audio/video producer."""
        pass
