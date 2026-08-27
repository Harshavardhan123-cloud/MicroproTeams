import pytest
from httpx import AsyncClient

@pytest.mark.asyncio
async def test_direct_messages_search_and_audit_logs(async_client: AsyncClient):
    # 1. Register User 1
    u1_res = await async_client.post(
        "/api/v1/auth/register",
        json={
            "email": "dm1@example.com",
            "username": "dmuser1",
            "password": "password123",
            "first_name": "DM",
            "last_name": "One",
            "organization_name": "DM Org"
        }
    )
    assert u1_res.status_code == 200
    token1 = u1_res.json()["data"]["access_token"]
    headers1 = {"Authorization": f"Bearer {token1}"}

    # 2. Register User 2
    u2_res = await async_client.post(
        "/api/v1/auth/register",
        json={
            "email": "dm2@example.com",
            "username": "dmuser2",
            "password": "password123",
            "first_name": "DM",
            "last_name": "Two",
            "organization_name": "DM Org"
        }
    )
    assert u2_res.status_code == 200
    u2_id = u2_res.json()["data"]["user"]["id"]

    # 3. Create Direct Conversation between User 1 and User 2
    create_conv_res = await async_client.post(
        "/api/v1/direct-conversations",
        headers=headers1,
        json={"target_user_ids": [u2_id]}
    )
    assert create_conv_res.status_code == 201
    conv_id = create_conv_res.json()["data"]["id"]

    # 4. List DM Conversations for User 1
    list_conv_res = await async_client.get("/api/v1/direct-conversations", headers=headers1)
    assert list_conv_res.status_code == 200
    assert len(list_conv_res.json()["data"]) >= 1

    # 5. Send Direct Message
    send_msg_res = await async_client.post(
        f"/api/v1/direct-conversations/{conv_id}/messages",
        headers=headers1,
        json={"content": "Confidential direct message!"}
    )
    assert send_msg_res.status_code == 201
    assert send_msg_res.json()["data"]["content"] == "Confidential direct message!"

    # 6. Fetch Direct Messages History
    get_msgs_res = await async_client.get(
        f"/api/v1/direct-conversations/{conv_id}/messages",
        headers=headers1
    )
    assert get_msgs_res.status_code == 200
    assert len(get_msgs_res.json()["data"]) >= 1

    # 7. Global Search Query
    search_res = await async_client.get(
        "/api/v1/search?q=Confidential",
        headers=headers1
    )
    assert search_res.status_code == 200
    search_data = search_res.json()["data"]
    assert len(search_data["messages"]) >= 1
    assert "Confidential" in search_data["messages"][0]["content"]

    # 8. Fetch Audit Logs
    audit_res = await async_client.get("/api/v1/audit-logs", headers=headers1)
    assert audit_res.status_code == 200
