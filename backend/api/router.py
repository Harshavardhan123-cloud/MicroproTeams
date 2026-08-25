"""
API Router — aggregates all route modules.
"""
from fastapi import APIRouter

from api.auth import router as auth_router
from api.users import router as users_router
from api.workspaces import router as workspaces_router
from api.channels import router as channels_router
from api.messages import router as messages_router
from api.meetings import router as meetings_router
from api.files import router as files_router

api_router = APIRouter()

api_router.include_router(auth_router, prefix="/auth", tags=["Authentication"])
api_router.include_router(users_router, prefix="/users", tags=["Users"])
api_router.include_router(workspaces_router, prefix="/workspaces", tags=["Workspaces"])
api_router.include_router(channels_router, prefix="/channels", tags=["Channels"])
api_router.include_router(messages_router, prefix="/messages", tags=["Messages"])
api_router.include_router(meetings_router, prefix="/meetings", tags=["Meetings"])
api_router.include_router(files_router, prefix="/files", tags=["Files"])
