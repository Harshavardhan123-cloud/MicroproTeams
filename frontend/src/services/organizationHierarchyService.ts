import { apiClient } from '../api/client';
import { OrganizationUnit, HierarchyNode } from '../types';

export interface CreateUnitPayload {
  name: string;
  code?: string;
  unit_type: string;
  parent_id?: string | null;
  manager_id?: string | null;
  description?: string;
  status?: string;
  order_index?: number;
}

export interface UpdateUnitPayload {
  name?: string;
  code?: string;
  unit_type?: string;
  parent_id?: string | null;
  clear_parent?: boolean;
  manager_id?: string | null;
  clear_manager?: boolean;
  description?: string;
  status?: string;
  order_index?: number;
}

export interface BulkAssignItem {
  user_id?: string;
  email?: string;
  unit_id?: string;
  unit_code?: string;
}

export const organizationHierarchyService = {
  async getHierarchy(status?: string, includeEmployees: boolean = true): Promise<HierarchyNode[]> {
    const params: any = { include_employees: includeEmployees };
    if (status) params.status = status;
    const res = await apiClient.get('/organization-units/hierarchy', { params });
    const data = res.data;
    return Array.isArray(data) ? data : data?.data || [];
  },

  async getUnits(params?: { parent_id?: string; unit_type?: string; status?: string; search?: string }): Promise<OrganizationUnit[]> {
    const res = await apiClient.get('/organization-units', { params });
    const data = res.data;
    return Array.isArray(data) ? data : data?.data || [];
  },

  async getUnit(id: string): Promise<OrganizationUnit> {
    const res = await apiClient.get(`/organization-units/${id}`);
    const data = res.data;
    return data?.data || data;
  },

  async createUnit(payload: CreateUnitPayload): Promise<OrganizationUnit> {
    const res = await apiClient.post('/organization-units', payload);
    const data = res.data;
    return data?.data || data;
  },

  async updateUnit(id: string, payload: UpdateUnitPayload): Promise<OrganizationUnit> {
    const res = await apiClient.patch(`/organization-units/${id}`, payload);
    const data = res.data;
    return data?.data || data;
  },

  async deleteUnit(id: string): Promise<{ status: string; message: string }> {
    const res = await apiClient.delete(`/organization-units/${id}`);
    const data = res.data;
    return data?.data || data;
  },

  async assignEmployee(unitId: string, userId: string): Promise<any> {
    const res = await apiClient.post(`/organization-units/${unitId}/assign-employee`, { user_id: userId });
    return res.data?.data || res.data;
  },

  async removeEmployee(unitId: string, userId: string): Promise<any> {
    const res = await apiClient.post(`/organization-units/${unitId}/remove-employee`, { user_id: userId });
    return res.data?.data || res.data;
  },

  async bulkAssign(assignments: BulkAssignItem[]): Promise<any> {
    const res = await apiClient.post('/organization-units/bulk-assign', { assignments });
    return res.data?.data || res.data;
  }
};
