import json
import asyncio
from typing import Dict, List, Set, Any
from fastapi import WebSocket

class ConnectionManager:
    def __init__(self):
        # Map channel_id -> set of WebSocket connections
        self.active_channels: Dict[str, Set[WebSocket]] = {}
        # Map user_id -> set of WebSocket connections
        self.user_connections: Dict[str, Set[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, user_id: str, channel_id: str = None):
        await websocket.accept()
        if user_id not in self.user_connections:
            self.user_connections[user_id] = set()
        self.user_connections[user_id].add(websocket)

        if channel_id:
            if channel_id not in self.active_channels:
                self.active_channels[channel_id] = set()
            self.active_channels[channel_id].add(websocket)

    def join_channel(self, websocket: WebSocket, channel_id: str):
        if channel_id not in self.active_channels:
            self.active_channels[channel_id] = set()
        self.active_channels[channel_id].add(websocket)

    def leave_channel(self, websocket: WebSocket, channel_id: str):
        if channel_id in self.active_channels:
            self.active_channels[channel_id].discard(websocket)
            if not self.active_channels[channel_id]:
                del self.active_channels[channel_id]

    def disconnect(self, websocket: WebSocket, user_id: str, channel_id: str = None):
        if user_id in self.user_connections:
            self.user_connections[user_id].discard(websocket)
            if not self.user_connections[user_id]:
                del self.user_connections[user_id]

        if channel_id and channel_id in self.active_channels:
            self.active_channels[channel_id].discard(websocket)
            if not self.active_channels[channel_id]:
                del self.active_channels[channel_id]

        # Also remove websocket from all active channels
        for chan_id, sockets in list(self.active_channels.items()):
            sockets.discard(websocket)

    async def broadcast_to_channel(self, channel_id: str, message_data: dict):
        if channel_id in self.active_channels:
            dead_connections = set()
            for connection in list(self.active_channels[channel_id]):
                try:
                    await connection.send_json(message_data)
                except Exception:
                    dead_connections.add(connection)
            for dead in dead_connections:
                self.active_channels[channel_id].discard(dead)

    async def send_personal_message(self, user_id: str, message_data: dict):
        if user_id in self.user_connections:
            dead_connections = set()
            for connection in list(self.user_connections[user_id]):
                try:
                    await connection.send_json(message_data)
                except Exception:
                    dead_connections.add(connection)
            for dead in dead_connections:
                self.user_connections[user_id].discard(dead)

ws_manager = ConnectionManager()
