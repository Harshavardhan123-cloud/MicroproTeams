import pytest
from httpx import AsyncClient

@pytest.mark.asyncio
async def test_organization_hierarchy_full_lifecycle(async_client: AsyncClient):
    # 1. Register Admin User for Organization 1
    reg_res = await async_client.post(
        "/api/v1/auth/register",
        json={
            "email": "orgadmin@example.com",
            "username": "orgadmin",
            "password": "password123",
            "first_name": "Org",
            "last_name": "Admin",
            "organization_name": "Micropro Global"
        }
    )
    assert reg_res.status_code == 200
    admin_token = reg_res.json()["data"]["access_token"]
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    # Get admin user details
    admin_me = (await async_client.get("/api/v1/users/me", headers=admin_headers)).json()["data"]
    admin_id = admin_me["id"]
    org_id = admin_me["organization_id"]

    # 2. Register Regular User for Organization 1
    # We can register another user via a different endpoint or register another user
    # Note: registering another org creates a different org. Let's register user in Org 2 to test isolation:
    reg2_res = await async_client.post(
        "/api/v1/auth/register",
        json={
            "email": "foreignadmin@example.com",
            "username": "foreignadmin",
            "password": "password123",
            "first_name": "Foreign",
            "last_name": "Admin",
            "organization_name": "Competitor Inc"
        }
    )
    assert reg2_res.status_code == 200
    foreign_token = reg2_res.json()["data"]["access_token"]
    foreign_headers = {"Authorization": f"Bearer {foreign_token}"}
    foreign_me = (await async_client.get("/api/v1/users/me", headers=foreign_headers)).json()["data"]
    foreign_id = foreign_me["id"]

    # 3. Create Root Unit: Engineering (Code: ENG, Type: BUSINESS_UNIT)
    eng_res = await async_client.post(
        "/api/v1/organization-units",
        headers=admin_headers,
        json={
            "name": "Engineering",
            "code": "ENG",
            "unit_type": "BUSINESS_UNIT",
            "description": "Global Engineering Organization",
            "manager_id": admin_id
        }
    )
    assert eng_res.status_code == 201
    eng_unit = eng_res.json()["data"]
    eng_id = eng_unit["id"]
    assert eng_unit["name"] == "Engineering"
    assert eng_unit["code"] == "ENG"
    assert eng_unit["parent_id"] is None
    assert eng_unit["manager"]["id"] == admin_id

    # 4. Rule 4: Duplicate Code check (same org)
    dup_res = await async_client.post(
        "/api/v1/organization-units",
        headers=admin_headers,
        json={
            "name": "Engineering Copy",
            "code": "eng",  # Case-insensitive duplicate
            "unit_type": "DEPARTMENT"
        }
    )
    assert dup_res.status_code == 400
    assert "DUPLICATE_CODE" in dup_res.json()["detail"]

    # 5. Rule 2: Cross-organization isolation check
    # Try to set parent_id to eng_id from foreign organization
    cross_org_res = await async_client.post(
        "/api/v1/organization-units",
        headers=foreign_headers,
        json={
            "name": "Foreign Dept",
            "parent_id": eng_id
        }
    )
    assert cross_org_res.status_code == 400
    assert "INVALID_PARENT" in cross_org_res.json()["detail"]

    # Try to set manager_id to foreign user in Org 1
    cross_mgr_res = await async_client.post(
        "/api/v1/organization-units",
        headers=admin_headers,
        json={
            "name": "Invalid Mgr Unit",
            "manager_id": foreign_id
        }
    )
    assert cross_mgr_res.status_code == 400
    assert "INVALID_MANAGER" in cross_mgr_res.json()["detail"]

    # 6. Create Child Unit: Backend Team under Engineering
    backend_res = await async_client.post(
        "/api/v1/organization-units",
        headers=admin_headers,
        json={
            "name": "Backend Team",
            "code": "BACKEND",
            "unit_type": "TEAM",
            "parent_id": eng_id,
            "description": "Backend services and APIs"
        }
    )
    assert backend_res.status_code == 201
    backend_id = backend_res.json()["data"]["id"]

    # 7. Create Grandchild Unit: Platform Services under Backend Team
    platform_res = await async_client.post(
        "/api/v1/organization-units",
        headers=admin_headers,
        json={
            "name": "Platform Services",
            "code": "PLATFORM",
            "unit_type": "UNIT",
            "parent_id": backend_id
        }
    )
    assert platform_res.status_code == 201
    platform_id = platform_res.json()["data"]["id"]

    # 8. Rule 3: Self-parent check
    self_parent_res = await async_client.patch(
        f"/api/v1/organization-units/{backend_id}",
        headers=admin_headers,
        json={"parent_id": backend_id}
    )
    assert self_parent_res.status_code == 400
    assert "INVALID_PARENT" in self_parent_res.json()["detail"]

    # 9. Rule 1: Circular Hierarchy Check (Engineering -> Backend -> Platform -> Engineering)
    # Attempt to move Engineering under Platform Services
    cycle_res = await async_client.patch(
        f"/api/v1/organization-units/{eng_id}",
        headers=admin_headers,
        json={"parent_id": platform_id}
    )
    assert cycle_res.status_code == 400
    assert "INVALID_PARENT" in cycle_res.json()["detail"]
    assert "circular" in cycle_res.json()["detail"].lower()

    # 10. Employee Assignment
    assign_res = await async_client.post(
        f"/api/v1/organization-units/{platform_id}/assign-employee",
        headers=admin_headers,
        json={"user_id": admin_id}
    )
    assert assign_res.status_code == 200
    assert assign_res.json()["data"]["organization_unit_id"] == platform_id
    assert assign_res.json()["data"]["organization_unit_name"] == "Platform Services"

    # Verify user profile reflects the assignment
    me_updated = (await async_client.get("/api/v1/users/me", headers=admin_headers)).json()["data"]
    assert me_updated["organization_unit_id"] == platform_id
    assert me_updated["organization_unit_name"] == "Platform Services"
    assert me_updated["department"] == "Platform Services"

    # 11. Test Hierarchy Tree endpoint with counts
    tree_res = await async_client.get("/api/v1/organization-units/hierarchy", headers=admin_headers)
    assert tree_res.status_code == 200
    tree = tree_res.json()["data"]
    assert len(tree) == 1  # 1 root (Engineering)
    root_node = tree[0]
    assert root_node["name"] == "Engineering"
    assert root_node["direct_employee_count"] == 0
    # Engineering subtree count includes platform employee: total should be 1
    assert root_node["total_employee_count"] == 1
    assert len(root_node["children"]) == 1

    backend_node = root_node["children"][0]
    assert backend_node["name"] == "Backend Team"
    assert backend_node["total_employee_count"] == 1
    assert len(backend_node["children"]) == 1

    platform_node = backend_node["children"][0]
    assert platform_node["name"] == "Platform Services"
    assert platform_node["direct_employee_count"] == 1
    assert platform_node["total_employee_count"] == 1
    assert len(platform_node["employees"]) == 1
    assert platform_node["employees"][0]["id"] == admin_id

    # Test alias endpoint /api/v1/organization/hierarchy
    alias_res = await async_client.get("/api/v1/organization/hierarchy", headers=admin_headers)
    assert alias_res.status_code == 200
    assert len(alias_res.json()["data"]) == 1

    # 12. Rule 5: Safe Deletion checks
    # Cannot delete Engineering because it has child units
    del_eng_fail = await async_client.delete(f"/api/v1/organization-units/{eng_id}", headers=admin_headers)
    assert del_eng_fail.status_code == 400
    assert "SAFE_DELETION_FAILED" in del_eng_fail.json()["detail"]
    assert "child unit" in del_eng_fail.json()["detail"]

    # Cannot delete Platform Services because it has assigned employees
    del_plat_fail = await async_client.delete(f"/api/v1/organization-units/{platform_id}", headers=admin_headers)
    assert del_plat_fail.status_code == 400
    assert "SAFE_DELETION_FAILED" in del_plat_fail.json()["detail"]
    assert "assigned employee" in del_plat_fail.json()["detail"]

    # 13. Unassign employee, then safe deletion should succeed
    remove_res = await async_client.post(
        f"/api/v1/organization-units/{platform_id}/remove-employee",
        headers=admin_headers,
        json={"user_id": admin_id}
    )
    assert remove_res.status_code == 200
    assert remove_res.json()["data"]["organization_unit_id"] is None

    # Now delete leaf unit (Platform Services)
    del_plat_success = await async_client.delete(f"/api/v1/organization-units/{platform_id}", headers=admin_headers)
    assert del_plat_success.status_code == 200

    # Verify unit is no longer returned in active list
    list_units = (await async_client.get("/api/v1/organization-units", headers=admin_headers)).json()["data"]
    unit_ids = [u["id"] for u in list_units]
    assert platform_id not in unit_ids

    # 14. Move Unit: Create another root unit and move Backend Team under it
    hr_res = await async_client.post(
        "/api/v1/organization-units",
        headers=admin_headers,
        json={"name": "Operations", "code": "OPS", "unit_type": "DEPARTMENT"}
    )
    assert hr_res.status_code == 201
    ops_id = hr_res.json()["data"]["id"]

    move_res = await async_client.patch(
        f"/api/v1/organization-units/{backend_id}",
        headers=admin_headers,
        json={"parent_id": ops_id}
    )
    assert move_res.status_code == 200
    assert move_res.json()["data"]["parent_id"] == ops_id

    # 15. Check Audit Logs: Verify actions were tracked
    audit_res = await async_client.get("/api/v1/admin/audit", headers=admin_headers)
    assert audit_res.status_code == 200
    logs = audit_res.json()
    action_types = [l["action"] for l in logs]
    assert "ORG_UNIT_CREATED" in action_types
    assert "ORG_UNIT_DELETED" in action_types
    assert "EMPLOYEE_ASSIGNED_UNIT" in action_types
    assert "EMPLOYEE_REMOVED_UNIT" in action_types

@pytest.mark.asyncio
async def test_organization_units_rbac_and_bulk(async_client: AsyncClient):
    # 1. Register Admin
    admin_reg = await async_client.post(
        "/api/v1/auth/register",
        json={
            "email": "rbadmin@example.com",
            "username": "rbadmin",
            "password": "password123",
            "first_name": "RB",
            "last_name": "Admin",
            "organization_name": "RBAC Corp"
        }
    )
    admin_token = admin_reg.json()["data"]["access_token"]
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    # 2. Create Units
    u1 = (await async_client.post(
        "/api/v1/organization-units",
        headers=admin_headers,
        json={"name": "Sales", "code": "SALES", "unit_type": "DEPARTMENT"}
    )).json()["data"]

    u2 = (await async_client.post(
        "/api/v1/organization-units",
        headers=admin_headers,
        json={"name": "Marketing", "code": "MKT", "unit_type": "DEPARTMENT"}
    )).json()["data"]

    # 3. Filter by search & unit_type
    filter_res = await async_client.get("/api/v1/organization-units?search=sale", headers=admin_headers)
    assert filter_res.status_code == 200
    items = filter_res.json()["data"]
    assert len(items) == 1
    assert items[0]["name"] == "Sales"

    # 4. Bulk assign test
    me = (await async_client.get("/api/v1/users/me", headers=admin_headers)).json()["data"]
    bulk_res = await async_client.post(
        "/api/v1/organization-units/bulk-assign",
        headers=admin_headers,
        json={
            "assignments": [
                {"user_id": me["id"], "unit_code": "SALES"}
            ]
        }
    )
    assert bulk_res.status_code == 200
    assert bulk_res.json()["data"]["assigned_count"] == 1

    # Verify user is in Sales
    user_after = (await async_client.get("/api/v1/users/me", headers=admin_headers)).json()["data"]
    assert user_after["organization_unit_name"] == "Sales"
