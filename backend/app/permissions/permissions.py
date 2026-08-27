from typing import List, Optional
from fastapi import Depends, HTTPException, status
from app.api.deps import get_current_user
from app.models.models import User

# Standard System Permission Constants
class SystemPermissions:
    ORG_READ = "organization.read"
    ORG_UPDATE = "organization.update"
    ORG_DELETE = "organization.delete"

    USER_READ = "user.read"
    USER_CREATE = "user.create"
    USER_UPDATE = "user.update"
    USER_DELETE = "user.delete"

    TEAM_CREATE = "team.create"
    TEAM_READ = "team.read"
    TEAM_UPDATE = "team.update"
    TEAM_DELETE = "team.delete"

    CHANNEL_CREATE = "channel.create"
    CHANNEL_READ = "channel.read"
    CHANNEL_UPDATE = "channel.update"
    CHANNEL_DELETE = "channel.delete"

class PermissionChecker:
    """FastAPI Dependency for RBAC enforcement."""
    def __init__(self, required_permission: str):
        self.required_permission = required_permission

    def __call__(self, current_user: User = Depends(get_current_user)) -> User:
        if current_user.is_superuser:
            return current_user

        # User role evaluation
        try:
            user_role = current_user.role.name.upper() if current_user.role else "USER"
        except Exception:
            user_role = "USER"
        
        # Org Admins and Super Admins have full permissions
        if user_role in ["SUPER_ADMIN", "ORG_ADMIN"]:
            return current_user

        # Standard Users have team and channel management permissions for their workspace
        allowed_user_permissions = [
            SystemPermissions.ORG_READ,
            SystemPermissions.USER_READ,
            SystemPermissions.TEAM_READ,
            SystemPermissions.TEAM_CREATE,
            SystemPermissions.TEAM_UPDATE,
            SystemPermissions.TEAM_DELETE,
            SystemPermissions.CHANNEL_READ,
            SystemPermissions.CHANNEL_CREATE,
            SystemPermissions.CHANNEL_UPDATE,
            SystemPermissions.CHANNEL_DELETE
        ]

        if self.required_permission in allowed_user_permissions:
            return current_user

        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Permission '{self.required_permission}' denied for user role '{user_role}'."
        )
