import pytest
from httpx import AsyncClient

@pytest.mark.asyncio
async def test_phase3_messaging_features(async_client: AsyncClient):
    # 1. Register User in Org
    user_reg = await async_client.post(
        "/api/v1/auth/register",
        json={
            "email": "msg_p3@acme.com",
            "username": "msg_p3",
            "password": "password123",
            "first_name": "Message",
            "last_name": "P3",
            "organization_name": "Acme Phase3"
        }
    )
    assert user_reg.status_code == 200
    token = user_reg.json()["data"]["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # 2. Create Team and Channel
    team_res = await async_client.post(
        "/api/v1/teams",
        headers=headers,
        json={"name": "P3 Test Team", "description": "Phase 3 testing"}
    )
    assert team_res.status_code == 201
    team_id = team_res.json()["data"]["id"]
    channel_id = team_res.json()["data"]["channels"][0]["id"]

    # 3. Test Message Creation with Idempotency
    client_msg_id = "unique-client-id-12345"
    send_msg1 = await async_client.post(
        f"/api/v1/channels/{channel_id}/messages",
        headers=headers,
        json={
            "content": "Phase 3 Idempotency Test",
            "client_message_id": client_msg_id
        }
    )
    assert send_msg1.status_code == 201
    msg1_id = send_msg1.json()["data"]["id"]

    # Retry sending same client_message_id -> should return existing message
    send_msg2 = await async_client.post(
        f"/api/v1/channels/{channel_id}/messages",
        headers=headers,
        json={
            "content": "Phase 3 Idempotency Test Duplicate",
            "client_message_id": client_msg_id
        }
    )
    assert send_msg2.status_code == 201
    assert send_msg2.json()["data"]["id"] == msg1_id

    # 4. Test Message Pinning and Unpinning
    pin_res = await async_client.post(f"/api/v1/messages/{msg1_id}/pin", headers=headers)
    assert pin_res.status_code == 200
    assert pin_res.json()["data"]["is_pinned"] is True

    unpin_res = await async_client.delete(f"/api/v1/messages/{msg1_id}/pin", headers=headers)
    assert unpin_res.status_code == 200
    assert unpin_res.json()["data"]["is_pinned"] is False

    # 5. Test Notifications API
    notif_res = await async_client.get("/api/v1/notifications", headers=headers)
    assert notif_res.status_code == 200
    notif_data = notif_res.json()["data"]
    assert "unread_count" in notif_data
    assert "notifications" in notif_data

    # If notifications exist, verify id, is_read, status fields
    if notif_data["notifications"]:
        first_n = notif_data["notifications"][0]
        assert "id" in first_n
        assert "notificationId" in first_n
        assert "is_read" in first_n
        assert "status" in first_n
        # Test delete single notification
        del_single = await async_client.delete(f"/api/v1/notifications/{first_n['id']}", headers=headers)
        assert del_single.status_code == 200

    mark_read = await async_client.post("/api/v1/notifications/read", headers=headers, json={"mark_all": True})
    assert mark_read.status_code == 200

    # Test clear all notifications
    clear_all = await async_client.delete("/api/v1/notifications", headers=headers)
    assert clear_all.status_code == 200
