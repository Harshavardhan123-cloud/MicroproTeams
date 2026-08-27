import pytest
from httpx import AsyncClient

@pytest.mark.asyncio
async def test_calendar_and_scheduling(async_client: AsyncClient):
    # 1. Register User
    reg_res = await async_client.post(
        "/api/v1/auth/register",
        json={
            "email": "caluser@example.com",
            "username": "caluser",
            "password": "password123",
            "first_name": "Cal",
            "last_name": "User",
            "organization_name": "Calendar Org"
        }
    )
    assert reg_res.status_code == 200
    token = reg_res.json()["data"]["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # 2. Schedule Event
    sched_res = await async_client.post(
        "/api/v1/calendar/events",
        headers=headers,
        json={
            "title": "Quarterly Planning Sync",
            "description": "Review roadmap objectives and Q3 targets.",
            "scheduled_start": "2026-09-01T10:00:00Z",
            "scheduled_end": "2026-09-01T11:00:00Z"
        }
    )
    assert sched_res.status_code == 201
    event_id = sched_res.json()["data"]["id"]

    # 3. List Scheduled Events
    get_events_res = await async_client.get("/api/v1/calendar/events", headers=headers)
    assert get_events_res.status_code == 200
    assert len(get_events_res.json()["data"]) >= 1

    # 4. Fetch Call History Log
    history_res = await async_client.get("/api/v1/calendar/history", headers=headers)
    assert history_res.status_code == 200

    # 5. Cancel Scheduled Event
    cancel_res = await async_client.delete(f"/api/v1/calendar/events/{event_id}", headers=headers)
    assert cancel_res.status_code == 200
