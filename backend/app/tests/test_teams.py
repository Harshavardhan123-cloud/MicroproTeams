import pytest
from httpx import AsyncClient

@pytest.mark.asyncio
async def test_teams_crud_and_permissions(async_client: AsyncClient):
    # 1. Register Admin User
    reg_res = await async_client.post(
        "/api/v1/auth/register",
        json={
            "email": "testadmin@example.com",
            "username": "testadmin",
            "password": "password123",
            "first_name": "Test",
            "last_name": "Admin",
            "organization_name": "Test Org"
        }
    )
    assert reg_res.status_code == 200
    token = reg_res.json()["data"]["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # 2. Get Current User Me
    me_res = await async_client.get("/api/v1/auth/me", headers=headers)
    assert me_res.status_code == 200
    assert me_res.json()["data"]["email"] == "testadmin@example.com"

    # 3. Create Team
    create_res = await async_client.post(
        "/api/v1/teams",
        headers=headers,
        json={
            "name": "QA Engineering",
            "description": "Quality Assurance Team",
            "privacy": "public"
        }
    )
    assert create_res.status_code == 201
    team_data = create_res.json()["data"]
    team_id = team_data["id"]
    assert team_data["name"] == "QA Engineering"

    # 4. Get Teams List
    list_res = await async_client.get("/api/v1/teams", headers=headers)
    assert list_res.status_code == 200
    assert len(list_res.json()["data"]) >= 1

    # 5. Update Team
    update_res = await async_client.patch(
        f"/api/v1/teams/{team_id}",
        headers=headers,
        json={"name": "QA & Automation Engineering"}
    )
    assert update_res.status_code == 200
    assert update_res.json()["data"]["name"] == "QA & Automation Engineering"

    # 6. Delete Team
    del_res = await async_client.delete(f"/api/v1/teams/{team_id}", headers=headers)
    assert del_res.status_code == 200

    # 7. Authorization Failure Test (No token provided)
    unauth_res = await async_client.get("/api/v1/teams")
    assert unauth_res.status_code == 401
