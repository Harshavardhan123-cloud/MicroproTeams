import json
import asyncio
from typing import Dict, List, Set, Any
from fastapi import WebSocket

import uuid

class ConnectionManager:
    def __init__(self):
        # Map channel_id -> set of WebSocket connections
        self.active_channels: Dict[str, Set[WebSocket]] = {}
        # Map user_id -> set of WebSocket connections
        self.user_connections: Dict[str, Set[WebSocket]] = {}
        # Map websocket -> session_id
        self.socket_sessions: Dict[WebSocket, str] = {}
        # Map user_id -> dict of session_id -> WebSocket
        self.user_sessions: Dict[str, Dict[str, WebSocket]] = {}

    async def connect(self, websocket: WebSocket, user_id: str, channel_id: str = None, session_id: str = None) -> str:
        await websocket.accept()
        if not session_id:
            session_id = f"sess_{uuid.uuid4().hex[:12]}"
        
        self.socket_sessions[websocket] = session_id

        if user_id not in self.user_connections:
            self.user_connections[user_id] = set()
            self.user_sessions[user_id] = {}
        self.user_connections[user_id].add(websocket)
        self.user_sessions[user_id][session_id] = websocket

        if channel_id:
            if channel_id not in self.active_channels:
                self.active_channels[channel_id] = set()
            self.active_channels[channel_id].add(websocket)

        # Send welcome payload with assigned session_id
        try:
            await websocket.send_json({
                "type": "connection_established",
                "session_id": session_id,
                "user_id": user_id
            })
        except Exception:
            pass

        return session_id

    def get_session_id(self, websocket: WebSocket) -> str:
        return self.socket_sessions.get(websocket, "")

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
        session_id = self.socket_sessions.pop(websocket, None)
        
        if user_id in self.user_connections:
            self.user_connections[user_id].discard(websocket)
            if not self.user_connections[user_id]:
                del self.user_connections[user_id]

        if user_id in self.user_sessions and session_id:
            self.user_sessions[user_id].pop(session_id, None)
            if not self.user_sessions[user_id]:
                del self.user_sessions[user_id]

        if channel_id and channel_id in self.active_channels:
            self.active_channels[channel_id].discard(websocket)
            if not self.active_channels[channel_id]:
                del self.active_channels[channel_id]

        # Also remove websocket from all active channels
        for chan_id, sockets in list(self.active_channels.items()):
            sockets.discard(websocket)

    async def broadcast_to_channel(self, channel_id: str, message_data: dict, exclude_socket: WebSocket = None):
        if channel_id in self.active_channels:
            dead_connections = set()
            for connection in list(self.active_channels[channel_id]):
                if exclude_socket and connection == exclude_socket:
                    continue
                try:
                    await connection.send_json(message_data)
                except Exception:
                    dead_connections.add(connection)
            for dead in dead_connections:
                self.active_channels[channel_id].discard(dead)

    async def send_personal_message(self, user_id: str, message_data: dict, exclude_session_id: str = None):
        if user_id in self.user_connections:
            dead_connections = set()
            for connection in list(self.user_connections[user_id]):
                sess_id = self.socket_sessions.get(connection)
                if exclude_session_id and sess_id == exclude_session_id:
                    continue
                try:
                    await connection.send_json(message_data)
                except Exception:
                    dead_connections.add(connection)
            for dead in dead_connections:
                self.user_connections[user_id].discard(dead)

    async def broadcast_to_all(self, message_data: dict):
        for user_id, connections in list(self.user_connections.items()):
            dead_connections = set()
            for connection in list(connections):
                try:
                    await connection.send_json(message_data)
                except Exception:
                    dead_connections.add(connection)
            for dead in dead_connections:
                connections.discard(dead)

ws_manager = ConnectionManager()
