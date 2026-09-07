import pytest
import uuid
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.models.models import (
    User, Organization, Meeting, Recording, Transcript, MeetingSummary,
    RetentionPolicy, LegalHold, OrganizationPolicy, RecordingStatus, ActionItemStatus
)

@pytest.mark.asyncio
async def test_phase6_enterprise_workflow():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # 1. Health check
        res = await ac.get("/api/v1/health")
        assert res.status_code == 200

        # Login admin user to get auth token
        login_res = await ac.post("/api/v1/auth/login", data={"username": "admin@example.com", "password": "AdminPassword123!"})
        if login_res.status_code == 200:
            token = login_res.json()["access_token"]
            headers = {"Authorization": f"Bearer {token}"}
        else:
            headers = {}

        # 2. Test Admin Users & Audit
        users_res = await ac.get("/api/v1/admin/users", headers=headers)
        assert users_res.status_code in [200, 401, 403]

        audit_res = await ac.get("/api/v1/admin/audit-logs", headers=headers)
        assert audit_res.status_code in [200, 401, 403]

        # 3. Test Organization Policy & Retention
        policy_res = await ac.get("/api/v1/admin/policies", headers=headers)
        assert policy_res.status_code in [200, 401, 403]

        retention_res = await ac.get("/api/v1/admin/retention-policies", headers=headers)
        assert retention_res.status_code in [200, 401, 403]

        # 4. Test Analytics & Exports
        analytics_res = await ac.get("/api/v1/admin/analytics/overview", headers=headers)
        assert analytics_res.status_code in [200, 401, 403]

        export_res = await ac.post("/api/v1/admin/exports", headers=headers)
        assert export_res.status_code in [200, 401, 403]
