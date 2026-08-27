import pytest
from httpx import AsyncClient

@pytest.mark.asyncio
async def test_phase4_file_sharing_and_versioning(async_client: AsyncClient):
    # 1. Register User & Org
    user_reg = await async_client.post(
        "/api/v1/auth/register",
        json={
            "email": "files_p4@acme.com",
            "username": "files_p4",
            "password": "password123",
            "first_name": "Files",
            "last_name": "P4",
            "organization_name": "Acme Phase4 Files"
        }
    )
    assert user_reg.status_code == 200
    token = user_reg.json()["data"]["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # 2. Upload File (Version 1)
    files = {"file": ("contract.pdf", b"PDF Version 1 Content", "application/pdf")}
    upload_res = await async_client.post("/api/v1/files/upload", headers=headers, files=files)
    assert upload_res.status_code == 200
    file_data = upload_res.json()["data"]
    file_id = file_data["id"]
    assert file_data["name"] == "contract.pdf"
    assert file_data["version_count"] == 1

    # 3. Rename File
    rename_res = await async_client.patch(f"/api/v1/files/{file_id}", headers=headers, json={"name": "contract_final.pdf"})
    assert rename_res.status_code == 200
    assert rename_res.json()["data"]["name"] == "contract_final.pdf"

    # 4. Upload Version 2
    files_v2 = {"file": ("contract_v2.pdf", b"PDF Version 2 Content", "application/pdf")}
    v2_res = await async_client.post(f"/api/v1/files/{file_id}/versions", headers=headers, files=files_v2)
    assert v2_res.status_code == 200
    assert v2_res.json()["data"]["version_count"] == 2

    # 5. List Versions & Restore Version 1 (creates Version 3)
    versions_res = await async_client.get(f"/api/v1/files/{file_id}/versions", headers=headers)
    assert versions_res.status_code == 200
    versions_list = versions_res.json()["data"]
    assert len(versions_list) == 2
    v1_id = versions_list[1]["id"] # Older version (V1)

    restore_v1_res = await async_client.post(f"/api/v1/files/{file_id}/versions/{v1_id}/restore", headers=headers)
    assert restore_v1_res.status_code == 200
    assert restore_v1_res.json()["data"]["version_count"] == 3

    # 6. Generate Signed Download URL & Preview URL
    dl_url_res = await async_client.get(f"/api/v1/files/{file_id}/download-url", headers=headers)
    assert dl_url_res.status_code == 200
    assert "download_url" in dl_url_res.json()["data"]

    pv_url_res = await async_client.get(f"/api/v1/files/{file_id}/preview-url", headers=headers)
    assert pv_url_res.status_code == 200
    assert "preview_url" in pv_url_res.json()["data"]

    # 7. Test Soft Delete & Trash Listing
    del_res = await async_client.delete(f"/api/v1/files/{file_id}", headers=headers)
    assert del_res.status_code == 200

    trash_res = await async_client.get("/api/v1/files/trash", headers=headers)
    assert trash_res.status_code == 200
    trash_items = trash_res.json()["data"]
    assert any(f["id"] == file_id for f in trash_items)

    # 8. Restore File from Trash
    restore_file_res = await async_client.post(f"/api/v1/files/{file_id}/restore", headers=headers)
    assert restore_file_res.status_code == 200

    # 9. Verify Activity Audit Trail
    act_res = await async_client.get(f"/api/v1/files/{file_id}/activity", headers=headers)
    assert act_res.status_code == 200
    actions = [a["action"] for a in act_res.json()["data"]]
    assert "UPLOADED" in actions
    assert "VERSION_UPLOADED" in actions
    assert "VERSION_RESTORED" in actions
    assert "DELETED" in actions
    assert "RESTORED" in actions
