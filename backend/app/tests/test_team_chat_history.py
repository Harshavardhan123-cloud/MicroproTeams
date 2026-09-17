import pytest
from httpx import AsyncClient

@pytest.mark.asyncio
async def test_team_chat_history_sharing_lifecycle(async_client: AsyncClient):
    # 1. Register Owner
    owner_reg = await async_client.post(
        "/api/v1/auth/register",
        json={
            "email": "history_owner@acme.com",
            "username": "history_owner",
            "password": "password123",
            "first_name": "History",
            "last_name": "Owner",
            "organization_name": "Acme History Org"
        }
    )
    assert owner_reg.status_code == 200
    owner_token = owner_reg.json()["data"]["access_token"]
    owner_headers = {"Authorization": f"Bearer {owner_token}"}

    # 2. Register Member 1 (Will receive NO past history)
    mem1_reg = await async_client.post(
        "/api/v1/auth/register",
        json={
            "email": "mem1_nohistory@acme.com",
            "username": "mem1_nohistory",
            "password": "password123",
            "first_name": "Member",
            "last_name": "One",
            "organization_name": "Acme History Org"
        }
    )
    assert mem1_reg.status_code == 200
    mem1_token = mem1_reg.json()["data"]["access_token"]
    mem1_headers = {"Authorization": f"Bearer {mem1_token}"}
    mem1_id = mem1_reg.json()["data"]["user"]["id"]

    # 3. Register Member 2 (Will receive ALL past history)
    mem2_reg = await async_client.post(
        "/api/v1/auth/register",
        json={
            "email": "mem2_allhistory@acme.com",
            "username": "mem2_allhistory",
            "password": "password123",
            "first_name": "Member",
            "last_name": "Two",
            "organization_name": "Acme History Org"
        }
    )
    assert mem2_reg.status_code == 200
    mem2_token = mem2_reg.json()["data"]["access_token"]
    mem2_headers = {"Authorization": f"Bearer {mem2_token}"}
    mem2_id = mem2_reg.json()["data"]["user"]["id"]

    # 4. Owner creates Team
    create_team_res = await async_client.post(
        "/api/v1/teams",
        headers=owner_headers,
        json={
            "name": "Project Alpha",
            "description": "Confidential R&D Workspace",
            "privacy": "private"
        }
    )
    assert create_team_res.status_code == 201
    team_data = create_team_res.json()["data"]
    team_id = team_data["id"]
    general_channel_id = team_data["channels"][0]["id"]

    # 5. Owner posts message 1 before anyone else is added
    msg1_res = await async_client.post(
        f"/api/v1/channels/{general_channel_id}/messages",
        headers=owner_headers,
        json={"content": "Historical message 1: Project kickoff secret"}
    )
    assert msg1_res.status_code == 201

    # 6. Add Member 1 with history_sharing_option="NONE"
    add_mem1 = await async_client.post(
        f"/api/v1/teams/{team_id}/members",
        headers=owner_headers,
        json={
            "user_id": mem1_id,
            "role": "member",
            "history_sharing_option": "NONE"
        }
    )
    assert add_mem1.status_code == 201
    assert add_mem1.json()["data"]["visible_history_from"] is not None

    # Member 1 fetches messages: Historical message 1 should NOT be visible!
    mem1_msgs_res = await async_client.get(
        f"/api/v1/channels/{general_channel_id}/messages",
        headers=mem1_headers
    )
    assert mem1_msgs_res.status_code == 200
    mem1_contents = [m["content"] for m in mem1_msgs_res.json()["data"]]
    assert "Historical message 1: Project kickoff secret" not in mem1_contents

    # 7. Owner posts message 2 after Member 1 is added
    msg2_res = await async_client.post(
        f"/api/v1/channels/{general_channel_id}/messages",
        headers=owner_headers,
        json={"content": "Current message 2: Active sprint discussion"}
    )
    assert msg2_res.status_code == 201

    # Member 1 fetches messages again: Now Member 1 sees message 2, but still not message 1
    mem1_msgs_res2 = await async_client.get(
        f"/api/v1/channels/{general_channel_id}/messages",
        headers=mem1_headers
    )
    assert mem1_msgs_res2.status_code == 200
    mem1_contents2 = [m["content"] for m in mem1_msgs_res2.json()["data"]]
    assert "Current message 2: Active sprint discussion" in mem1_contents2
    assert "Historical message 1: Project kickoff secret" not in mem1_contents2

    # 8. Add Member 2 with history_sharing_option="ALL"
    add_mem2 = await async_client.post(
        f"/api/v1/teams/{team_id}/members",
        headers=owner_headers,
        json={
            "user_id": mem2_id,
            "role": "member",
            "history_sharing_option": "ALL"
        }
    )
    assert add_mem2.status_code == 201
    assert add_mem2.json()["data"]["visible_history_from"] is None

    # Member 2 fetches messages: Member 2 sees BOTH messages!
    mem2_msgs_res = await async_client.get(
        f"/api/v1/channels/{general_channel_id}/messages",
        headers=mem2_headers
    )
    assert mem2_msgs_res.status_code == 200
    mem2_contents = [m["content"] for m in mem2_msgs_res.json()["data"]]
    assert "Historical message 1: Project kickoff secret" in mem2_contents
    assert "Current message 2: Active sprint discussion" in mem2_contents

    # 9. Verify get_team_members returns visible_history_from metadata
    members_list_res = await async_client.get(
        f"/api/v1/teams/{team_id}/members",
        headers=owner_headers
    )
    assert members_list_res.status_code == 200
    members = members_list_res.json()["data"]
    m1_item = next(m for m in members if m["user_id"] == mem1_id)
    m2_item = next(m for m in members if m["user_id"] == mem2_id)
    assert m1_item["visible_history_from"] is not None
    assert m2_item["visible_history_from"] is None

