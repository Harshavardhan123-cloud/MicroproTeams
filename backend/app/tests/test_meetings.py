import pytest
from httpx import AsyncClient

@pytest.mark.asyncio
async def test_meetings_lifecycle(async_client: AsyncClient):
    # 1. Register Host User
    reg_res = await async_client.post(
        "/api/v1/auth/register",
        json={
            "email": "meetuser@example.com",
            "username": "meetuser",
            "password": "password123",
            "first_name": "Meet",
            "last_name": "User",
            "organization_name": "Meeting Org"
        }
    )
    assert reg_res.status_code == 200
    token = reg_res.json()["data"]["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # 2. Create Meeting
    create_res = await async_client.post(
        "/api/v1/meetings",
        headers=headers,
        json={"title": "Sprint Planning Meeting"}
    )
    assert create_res.status_code == 201
    meeting_id = create_res.json()["data"]["id"]
    assert create_res.json()["data"]["title"] == "Sprint Planning Meeting"

    # 3. Get Meeting Details
    get_res = await async_client.get(f"/api/v1/meetings/{meeting_id}", headers=headers)
    assert get_res.status_code == 200
    assert get_res.json()["data"]["status"] == "active"
    assert len(get_res.json()["data"]["participants"]) >= 1

    # 4. Join Meeting
    join_res = await async_client.post(f"/api/v1/meetings/{meeting_id}/join", headers=headers)
    assert join_res.status_code == 200

    # 5. Leave Meeting
    leave_res = await async_client.post(f"/api/v1/meetings/{meeting_id}/leave", headers=headers)
    assert leave_res.status_code == 200

    # 6. End Meeting
    end_res = await async_client.post(f"/api/v1/meetings/{meeting_id}/end", headers=headers)
    assert end_res.status_code == 200
