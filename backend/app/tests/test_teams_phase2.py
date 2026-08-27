import pytest
from httpx import AsyncClient

@pytest.mark.asyncio
async def test_teams_phase2_full_lifecycle(async_client: AsyncClient):
    # 1. Register Owner User in Org A
    owner_reg = await async_client.post(
        "/api/v1/auth/register",
        json={
            "email": "owner_p2@acme.com",
            "username": "owner_p2",
            "password": "password123",
            "first_name": "Owner",
            "last_name": "P2",
            "organization_name": "Acme Phase2"
        }
    )
    assert owner_reg.status_code == 200
    owner_token = owner_reg.json()["data"]["access_token"]
    owner_headers = {"Authorization": f"Bearer {owner_token}"}
    owner_id = owner_reg.json()["data"]["user"]["id"]

    # 2. Register Member User in Org A
    mem_reg = await async_client.post(
        "/api/v1/auth/register",
        json={
            "email": "member_p2@acme.com",
            "username": "member_p2",
            "password": "password123",
            "first_name": "Member",
            "last_name": "P2",
            "organization_name": "Acme Phase2"
        }
    )
    assert mem_reg.status_code == 200
    mem_token = mem_reg.json()["data"]["access_token"]
    mem_headers = {"Authorization": f"Bearer {mem_token}"}
    member_id = mem_reg.json()["data"]["user"]["id"]

    # 3. Create Team
    create_team_res = await async_client.post(
        "/api/v1/teams",
        headers=owner_headers,
        json={
            "name": "DevOps Engineering",
            "description": "Infrastructure and Deployment Pipeline",
            "privacy": "private"
        }
    )
    assert create_team_res.status_code == 201
    team_id = create_team_res.json()["data"]["id"]
    assert len(create_team_res.json()["data"]["channels"]) >= 1
    assert create_team_res.json()["data"]["channels"][0]["name"] == "General"

    # 4. Add Member to Team
    add_mem_res = await async_client.post(
        f"/api/v1/teams/{team_id}/members",
        headers=owner_headers,
        json={"user_id": member_id, "role": "member"}
    )
    assert add_mem_res.status_code == 201

    # 5. Create Private Channel in Team
    create_priv_ch = await async_client.post(
        f"/api/v1/teams/{team_id}/channels",
        headers=owner_headers,
        json={
            "name": "Architecture",
            "description": "Core architecture discussions",
            "channel_type": "private"
        }
    )
    assert create_priv_ch.status_code == 201
    priv_ch_id = create_priv_ch.json()["data"]["id"]

    # Member cannot view private channel before being added
    mem_channels_res = await async_client.get(f"/api/v1/teams/{team_id}/channels", headers=mem_headers)
    assert mem_channels_res.status_code == 200
    ch_names = [c["name"] for c in mem_channels_res.json()["data"]]
    assert "Architecture" not in ch_names

    # 6. Add Member to Private Channel
    add_priv_mem = await async_client.post(
        f"/api/v1/channels/{priv_ch_id}/members",
        headers=owner_headers,
        json={"user_id": member_id}
    )
    assert add_priv_mem.status_code == 201

    # Member can now access private channel
    mem_channels_res2 = await async_client.get(f"/api/v1/teams/{team_id}/channels", headers=mem_headers)
    assert mem_channels_res2.status_code == 200
    ch_names2 = [c["name"] for c in mem_channels_res2.json()["data"]]
    assert "Architecture" in ch_names2

    # 7. Transfer Team Ownership
    transfer_res = await async_client.post(
        f"/api/v1/teams/{team_id}/transfer-ownership",
        headers=owner_headers,
        json={"new_owner_id": member_id}
    )
    assert transfer_res.status_code == 200

    # 8. Soft Delete Channel
    del_ch_res = await async_client.delete(f"/api/v1/channels/{priv_ch_id}", headers=mem_headers)
    assert del_ch_res.status_code == 200

    # 9. Soft Delete Team
    del_team_res = await async_client.delete(f"/api/v1/teams/{team_id}", headers=mem_headers)
    assert del_team_res.status_code == 200
