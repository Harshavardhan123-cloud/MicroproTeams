import pytest
from httpx import AsyncClient

@pytest.mark.asyncio
async def test_health_check(async_client: AsyncClient):
    res = await async_client.get("/api/v1/health")
    assert res.status_code == 200
    assert res.json()["status"] == "healthy"

@pytest.mark.asyncio
async def test_register_and_login(async_client: AsyncClient):
    # Register user
    reg_payload = {
        "email": "testuser@example.com",
        "password": "Password123!",
        "first_name": "Test",
        "last_name": "User",
        "organization_name": "Test Corp",
        "username": "testuser"
    }
    res = await async_client.post("/api/v1/auth/register", json=reg_payload)
    assert res.status_code == 200
    token_data = res.json()["data"]
    assert "access_token" in token_data
    assert "refresh_token" in token_data

    # Login user
    login_payload = {
        "email": "testuser@example.com",
        "password": "Password123!"
    }
    res = await async_client.post("/api/v1/auth/login", json=login_payload)
    assert res.status_code == 200
    token_data = res.json()["data"]
    assert "access_token" in token_data

    # Get current user me
    headers = {"Authorization": f"Bearer {token_data['access_token']}"}
    me_res = await async_client.get("/api/v1/auth/me", headers=headers)
    assert me_res.status_code == 200
    assert me_res.json()["data"]["email"] == "testuser@example.com"

    # Refresh Token
    ref_res = await async_client.post("/api/v1/auth/refresh", json={"refresh_token": token_data["refresh_token"]})
    assert ref_res.status_code == 200
    assert "access_token" in ref_res.json()["data"]

    # Logout
    logout_res = await async_client.post("/api/v1/auth/logout", headers=headers)
    assert logout_res.status_code == 200
