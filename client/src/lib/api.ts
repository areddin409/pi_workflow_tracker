import type {
  Case, CaseDetail, Task, TaskTemplate, Contact, ContactSchedule,
  ContactActionItem, PhaseSettings, DashboardStats
} from '../types';

const BASE = '/api';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  cases: {
    list: (params?: { include_closed?: boolean }) =>
      request<Case[]>(`/cases${params?.include_closed ? '?include_closed=true' : ''}`),
    get: (id: number) => request<CaseDetail>(`/cases/${id}`),
    create: (body: { client_name: string; attorney: string; date_assigned: string }) =>
      request<Case>('/cases', { method: 'POST', body: JSON.stringify(body) }),
    advance: (id: number) =>
      request<{ newPhase: string; incompleteTasks: number }>(`/cases/${id}/advance`, { method: 'POST' }),
    delete: (id: number) =>
      request<void>(`/cases/${id}`, { method: 'DELETE' }),
  },
  tasks: {
    list: (params?: Record<string, string | boolean | number>) =>
      request<Task[]>(`/tasks?${new URLSearchParams(Object.entries(params ?? {}).map(([k, v]) => [k, String(v)])).toString()}`),
    create: (body: Partial<Task>) =>
      request<Task>('/tasks', { method: 'POST', body: JSON.stringify(body) }),
    update: (id: number, body: Partial<Task>) =>
      request<Task>(`/tasks/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  },
  templates: {
    list: () => request<Record<string, TaskTemplate[]>>('/templates'),
    create: (body: Partial<TaskTemplate>) =>
      request<{ template: TaskTemplate; affectedCases: number }>('/templates', { method: 'POST', body: JSON.stringify(body) }),
    update: (id: number, body: Partial<TaskTemplate>) =>
      request<{ template: TaskTemplate; affectedTasks: number }>(`/templates/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
    delete: (id: number) =>
      request<{ deletedPendingTasks: number }>(`/templates/${id}`, { method: 'DELETE' }),
  },
  contacts: {
    list: (params?: Record<string, string | boolean>) =>
      request<Contact[]>(`/contacts${params ? '?' + new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString() : ''}`),
    create: (body: Partial<Contact>) =>
      request<Contact>('/contacts', { method: 'POST', body: JSON.stringify(body) }),
    addActionItem: (contactId: number, body: { description: string; assigned_to: string; due_date?: string }) =>
      request<ContactActionItem>(`/contacts/${contactId}/action-items`, { method: 'POST', body: JSON.stringify(body) }),
  },
  contactActionItems: {
    update: (id: number, body: { completed: boolean }) =>
      request<ContactActionItem>(`/contact-action-items/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  },
  contactSchedule: {
    list: (params?: { overdue?: boolean; due_today?: boolean; due_this_week?: boolean; due_this_month?: boolean }) =>
      request<ContactSchedule[]>(`/contact-schedule${params ? '?' + new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString() : ''}`),
  },
  dashboard: {
    get: () => request<DashboardStats>('/dashboard'),
  },
  settings: {
    list: () => request<PhaseSettings[]>('/settings'),
    update: (phase: string, body: Partial<PhaseSettings>) =>
      request<PhaseSettings>(`/settings/${phase}`, { method: 'PUT', body: JSON.stringify(body) }),
  },
};
