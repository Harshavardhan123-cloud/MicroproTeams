import pytest
from httpx import AsyncClient

@pytest.mark.asyncio
async def test_phase5_meetings_and_calling_system(async_client: AsyncClient):
    # 1. Register Host User & Org
    host_reg = await async_client.post(
        "/api/v1/auth/register",
        json={
            "email": "meeting_host@acme.com",
            "username": "meeting_host",
            "password": "password123",
            "first_name": "Meeting",
            "last_name": "Host",
            "organization_name": "Acme Phase5 Meetings"
        }
    )
    assert host_reg.status_code == 200
    host_token = host_reg.json()["data"]["access_token"]
    host_headers = {"Authorization": f"Bearer {host_token}"}
    host_id = host_reg.json()["data"]["user"]["id"]

    # 2. Register Second User (Attendee)
    attendee_reg = await async_client.post(
        "/api/v1/auth/register",
        json={
            "email": "meeting_attendee@acme.com",
            "username": "meeting_attendee",
            "password": "password123",
            "first_name": "Meeting",
            "last_name": "Attendee",
            "organization_name": "Acme Phase5 Meetings"
        }
    )
    assert attendee_reg.status_code == 200
    attendee_token = attendee_reg.json()["data"]["access_token"]
    attendee_headers = {"Authorization": f"Bearer {attendee_token}"}
    attendee_id = attendee_reg.json()["data"]["user"]["id"]

    # 3. Create Instant Meeting with Lobby Enabled
    create_m_res = await async_client.post(
        "/api/v1/meetings",
        headers=host_headers,
        json={
            "title": "Architecture Deep Dive",
            "description": "Discussing SFU and WebRTC",
            "lobby_enabled": True
        }
    )
    assert create_m_res.status_code == 201
    m_data = create_m_res.json()["data"]
    meeting_id = m_data["id"]
    code = m_data["meeting_code"]
    assert code.startswith("meet-")

    # 4. Lookup Meeting by Code
    lookup_res = await async_client.get(f"/api/v1/meetings/code/{code}", headers=attendee_headers)
    assert lookup_res.status_code == 200
    assert lookup_res.json()["data"]["id"] == meeting_id

    # 5. Attendee Joins Meeting (Lobby check -> WAITING)
    join_res = await async_client.post(f"/api/v1/meetings/{meeting_id}/join", headers=attendee_headers)
    assert join_res.status_code == 200
    assert join_res.json()["data"]["is_in_lobby"] is True

    # 6. Host Admits Attendee
    admit_res = await async_client.post(f"/api/v1/meetings/{meeting_id}/participants/{attendee_id}/admit", headers=host_headers)
    assert admit_res.status_code == 200

    # 7. Host Mutes Attendee
    mute_res = await async_client.post(f"/api/v1/meetings/{meeting_id}/participants/{attendee_id}/mute", headers=host_headers)
    assert mute_res.status_code == 200

    # 8. Update Meeting Policy
    pol_res = await async_client.patch(
        f"/api/v1/meetings/{meeting_id}/policy",
        headers=host_headers,
        json={"allow_screen_share": True, "max_participants": 50}
    )
    assert pol_res.status_code == 200

    # 9. Initiate 1:1 Video Call
    call_res = await async_client.post(
        "/api/v1/calls",
        headers=host_headers,
        json={"callee_id": attendee_id, "call_type": "VIDEO"}
    )
    assert call_res.status_code == 200
    assert call_res.json()["data"]["caller_id"] == host_id

    # 10. Get Call History
    history_res = await async_client.get("/api/v1/calls/history", headers=host_headers)
    assert history_res.status_code == 200
    assert len(history_res.json()["data"]) >= 1

    # 11. End Meeting
    end_res = await async_client.post(f"/api/v1/meetings/{meeting_id}/end", headers=host_headers)
    assert end_res.status_code == 200
