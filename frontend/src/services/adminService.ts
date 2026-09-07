import { apiClient } from '../api/client';
import { AuditLogItem, OrganizationPolicy } from '../types/meetingAI';

export const adminService = {
  getUsers: async () => {
    const res = await apiClient.get('/admin/users');
    return res.data;
  },

  disableUser: async (userId: string) => {
    const res = await apiClient.post(`/admin/users/${userId}/disable`);
    return res.data;
  },

  getAuditLogs: async (filters?: { actor?: string; action?: string; resource?: string }): Promise<AuditLogItem[]> => {
    const res = await apiClient.get('/admin/audit-logs', { params: filters });
    return res.data;
  },

  getPolicies: async (): Promise<OrganizationPolicy> => {
    const res = await apiClient.get('/admin/policies');
    return res.data;
  },

  updatePolicies: async (policies: Partial<OrganizationPolicy>) => {
    const res = await apiClient.patch('/admin/policies', policies);
    return res.data;
  },

  getAnalyticsOverview: async () => {
    const res = await apiClient.get('/admin/analytics/overview');
    return res.data;
  },

  getMeetingAnalytics: async () => {
    const res = await apiClient.get('/admin/analytics/meetings');
    return res.data;
  },

  getStorageAnalytics: async () => {
    const res = await apiClient.get('/admin/storage');
    return res.data;
  },

  getRetentionPolicies: async () => {
    const res = await apiClient.get('/admin/retention-policies');
    return res.data;
  },

  createRetentionPolicy: async (policy: any) => {
    const res = await apiClient.post('/admin/retention-policies', policy);
    return res.data;
  },

  getLegalHolds: async () => {
    const res = await apiClient.get('/admin/legal-holds');
    return res.data;
  },

  createLegalHold: async (hold: any) => {
    const res = await apiClient.post('/admin/legal-holds', hold);
    return res.data;
  },

  createExport: async (resourceType = 'ALL') => {
    const res = await apiClient.post('/admin/exports', null, { params: { resource_type: resourceType } });
    return res.data;
  },

  getExports: async () => {
    const res = await apiClient.get('/admin/exports');
    return res.data;
  }
};
