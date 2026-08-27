import io
import pytest
from httpx import AsyncClient

@pytest.mark.asyncio
async def test_messages_crud_threads_and_reactions(async_client: AsyncClient):
    # 1. Register User
    reg_res = await async_client.post(
        "/api/v1/auth/register",
        json={
            "email": "msguser@example.com",
            "username": "msguser",
            "password": "password123",
            "first_name": "Msg",
            "last_name": "User",
            "organization_name": "Msg Org"
        }
    )
    assert reg_res.status_code == 200
    token = reg_res.json()["data"]["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # 2. Create Team & Get Channel
    team_res = await async_client.post(
        "/api/v1/teams",
        headers=headers,
        json={"name": "Chat Engineering", "privacy": "public"}
    )
    assert team_res.status_code == 201
    team_data = team_res.json()["data"]
    channel_id = team_data["channels"][0]["id"]

    # 3. Post Message
    msg_res = await async_client.post(
        f"/api/v1/channels/{channel_id}/messages",
        headers=headers,
        json={"content": "Hello Team!"}
    )
    assert msg_res.status_code == 201
    msg_data = msg_res.json()["data"]
    msg_id = msg_data["id"]
    assert msg_data["content"] == "Hello Team!"

    # 4. Get Channel Messages
    get_res = await async_client.get(f"/api/v1/channels/{channel_id}/messages", headers=headers)
    assert get_res.status_code == 200
    assert len(get_res.json()["data"]) >= 1

    # 5. Post Thread Reply
    reply_res = await async_client.post(
        f"/api/v1/channels/{channel_id}/messages",
        headers=headers,
        json={"content": "Replying to thread", "parent_message_id": msg_id}
    )
    assert reply_res.status_code == 201
    assert reply_res.json()["data"]["parent_message_id"] == msg_id

    # 6. Fetch Thread Replies
    replies_res = await async_client.get(f"/api/v1/messages/{msg_id}/replies", headers=headers)
    assert replies_res.status_code == 200
    assert len(replies_res.json()["data"]) == 1

    # 7. Toggle Emoji Reaction
    react_res = await async_client.post(
        f"/api/v1/messages/{msg_id}/reactions",
        headers=headers,
        json={"emoji": "👍"}
    )
    assert react_res.status_code == 200
    assert len(react_res.json()["data"]["reactions"]) == 1

    # 8. Edit Message
    edit_res = await async_client.patch(
        f"/api/v1/messages/{msg_id}",
        headers=headers,
        json={"content": "Hello Team! (Updated)"}
    )
    assert edit_res.status_code == 200
    assert edit_res.json()["data"]["content"] == "Hello Team! (Updated)"

    # 9. Test File Upload
    file_payload = {"file": ("test.txt", io.BytesIO(b"Hello file upload"), "text/plain")}
    upload_res = await async_client.post("/api/v1/files/upload", headers=headers, files=file_payload)
    assert upload_res.status_code == 200
    assert "file_url" in upload_res.json()["data"]

    # 10. Delete Message
    del_res = await async_client.delete(f"/api/v1/messages/{msg_id}", headers=headers)
    assert del_res.status_code == 200
