"""
Pydantic schemas for Auth, User requests/responses.
"""
from pydantic import BaseModel, EmailStr, Field
from typing import Optional
from datetime import datetime


class RegisterRequest(BaseModel):
    email: EmailStr
    display_name: str = Field(..., min_length=2, max_length=100)
    username: Optional[str] = Field(None, min_length=3, max_length=50)
    password: str = Field(..., min_length=8)


class LoginResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: "UserPublicResponse"


class RefreshRequest(BaseModel):
    refresh_token: str


class UserPublicResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: str
    email: str
    display_name: str
    username: str
    avatar_url: Optional[str] = None
    role: str
    presence_status: str
    custom_status: Optional[str] = None
    custom_status_emoji: Optional[str] = None
    public_key: Optional[str] = None
    created_at: datetime


class UserUpdateRequest(BaseModel):
    display_name: Optional[str] = Field(None, min_length=2, max_length=100)
    avatar_url: Optional[str] = None
    custom_status: Optional[str] = Field(None, max_length=150)
    custom_status_emoji: Optional[str] = None
    presence_status: Optional[str] = None
