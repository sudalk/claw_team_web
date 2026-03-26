// API client for ClawTeam Web API

import type { Team, Task, Worker, Message, CLIInfo, SSEEvent, ExecutionRecord, ExecutionLog } from "@/lib/types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

async function fetchAPI<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: "Request failed" }));
    throw new Error(error.detail || `API Error: ${res.status}`);
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

// ============ Teams ============
export const teamsAPI = {
  list: () => fetchAPI<{ teams: Team[]; total: number }>("/teams"),
  get: (teamName: string) => fetchAPI<Team>(`/teams/${teamName}`),
  create: (data: { name: string; description?: string; workdir?: string }) =>
    fetchAPI<Team>("/teams", { method: "POST", body: JSON.stringify(data) }),
  update: (teamName: string, data: Partial<{ name: string; description: string; workdir: string }>) =>
    fetchAPI<Team>(`/teams/${teamName}`, { method: "PATCH", body: JSON.stringify(data) }),
  delete: (teamName: string) =>
    fetchAPI<void>(`/teams/${teamName}`, { method: "DELETE" }),
};

// ============ Tasks ============
export const tasksAPI = {
  list: (teamName: string, status?: string) =>
    fetchAPI<{ tasks: Task[]; total: number }>(`/teams/${teamName}/tasks${status ? `?status=${status}` : ""}`),
  get: (teamName: string, taskId: string) =>
    fetchAPI<Task>(`/teams/${teamName}/tasks/${taskId}`),
  create: (teamName: string, data: {
    subject: string;
    description?: string;
    priority?: string;
    assignee_id?: string;
    blocked_by?: string[];
    workdir?: string;
  }) => fetchAPI<Task>(`/teams/${teamName}/tasks`, { method: "POST", body: JSON.stringify(data) }),
  update: (teamName: string, taskId: string, data: Record<string, unknown>) =>
    fetchAPI<Task>(`/teams/${teamName}/tasks/${taskId}`, { method: "PATCH", body: JSON.stringify(data) }),
  move: (teamName: string, taskId: string, status: string) =>
    fetchAPI<Task>(`/teams/${teamName}/tasks/${taskId}/move`, {
      method: "POST",
      body: JSON.stringify({ status }),
    }),
  delete: (teamName: string, taskId: string) =>
    fetchAPI<void>(`/teams/${teamName}/tasks/${taskId}`, { method: "DELETE" }),
};

// ============ Workers ============
export const workersAPI = {
  list: (teamName: string) =>
    fetchAPI<{ workers: Worker[]; total: number }>(`/teams/${teamName}/workers`),
  get: (teamName: string, workerId: string) =>
    fetchAPI<Worker>(`/teams/${teamName}/workers/${workerId}`),
  create: (teamName: string, data: {
    name: string;
    role?: string;
    config: {
      cli?: string;
      backend?: string;
      workdir?: string;
      execution_mode?: string;
      auto_assign?: boolean;
    };
  }) => fetchAPI<Worker>(`/teams/${teamName}/workers`, { method: "POST", body: JSON.stringify(data) }),
  update: (teamName: string, workerId: string, data: Record<string, unknown>) =>
    fetchAPI<Worker>(`/teams/${teamName}/workers/${workerId}`, { method: "PATCH", body: JSON.stringify(data) }),
  delete: (teamName: string, workerId: string) =>
    fetchAPI<void>(`/teams/${teamName}/workers/${workerId}`, { method: "DELETE" }),
  assign: (teamName: string, workerId: string, taskId: string) =>
    fetchAPI<Worker>(`/teams/${teamName}/workers/${workerId}/assign`, {
      method: "POST",
      body: JSON.stringify({ task_id: taskId }),
    }),
  execute: (teamName: string, workerId: string) =>
    fetchAPI<Task>(`/teams/${teamName}/workers/${workerId}/execute`, { method: "POST" }),
  complete: (teamName: string, workerId: string) =>
    fetchAPI<Task>(`/teams/${teamName}/workers/${workerId}/complete`, { method: "POST" }),
  fail: (teamName: string, workerId: string) =>
    fetchAPI<Task>(`/teams/${teamName}/workers/${workerId}/fail`, { method: "POST" }),
};

// ============ Messages ============
export const messagesAPI = {
  list: (teamName: string, params?: { agent?: string; unread_only?: boolean }) => {
    const searchParams = new URLSearchParams();
    if (params?.agent) searchParams.set("agent", params.agent);
    if (params?.unread_only) searchParams.set("unread_only", "true");
    const query = searchParams.toString();
    return fetchAPI<{ messages: Message[]; total: number }>(`/teams/${teamName}/messages${query ? `?${query}` : ""}`);
  },
  send: (teamName: string, toAgent: string, content: string) =>
    fetchAPI<Message>(`/teams/${teamName}/messages`, {
      method: "POST",
      body: JSON.stringify({ to_agent: toAgent, content }),
    }),
  broadcast: (teamName: string, content: string) =>
    fetchAPI<void>(`/teams/${teamName}/messages/broadcast`, {
      method: "POST",
      body: JSON.stringify({ content }),
    }),
};

// ============ CLI Detection ============
export const clisAPI = {
  list: () => fetchAPI<{ clis: CLIInfo[] }>("/clis"),
};

// ============ SSE Events ============
export function createEventSource(teamName: string): EventSource {
  return new EventSource(`${API_BASE}/teams/${teamName}/events`);
}

// Re-export types for convenience
export type { Team, Task, Worker, Message, CLIInfo, SSEEvent, ExecutionRecord, ExecutionLog };

// ============ Auto Mode API ============
export const autoAPI = {
  execute: (data: { prompt: string; team_name?: string; workdir?: string; model?: string }) =>
    fetchAPI<{ execution_id: string; team_id: string; status: string; stream_url: string }>(
      "/auto/execute",
      { method: "POST", body: JSON.stringify(data) }
    ),

  executeAdvanced: (data: { prompt: string; team_name?: string; workdir?: string; model?: string }) =>
    fetchAPI<{ execution_id: string; team_id: string; status: string; stream_url: string }>(
      "/auto/execute-advanced",
      { method: "POST", body: JSON.stringify(data) }
    ),

  getStatus: (executionId: string) =>
    fetchAPI<ExecutionRecord>(`/auto/execute/${executionId}`),

  list: () =>
    fetchAPI<{ executions: ExecutionRecord[]; total: number }>("/auto/executions"),

  stop: (executionId: string) =>
    fetchAPI<{ execution_id: string; status: string; message: string }>(
      `/auto/execute/${executionId}/stop`,
      { method: "POST" }
    ),

  createEventSource: (identifier: string): EventSource => {
    return new EventSource(`${API_BASE}/auto/execute/${identifier}/stream`);
  },
};

// Alias for backwards compatibility
export const agentsAPI = {
  spawn: async (teamId: string, data: {
    name: string;
    task?: string;
    cli?: string;
    backend?: string;
    workspace_enabled?: boolean;
    skip_permissions?: boolean;
  }) => {
    return workersAPI.create(teamId, {
      name: data.name,
      role: "worker",
      config: {
        cli: data.cli || "claude",
        backend: data.backend || "tmux",
        execution_mode: "auto",
        auto_assign: true,
      },
    });
  },
  list: (teamId: string) => workersAPI.list(teamId),
  get: (teamId: string, agentId: string) => workersAPI.get(teamId, agentId),
  sendMessage: async (teamId: string, agentId: string, content: string) => {
    const res = await fetch(`${API_BASE}/teams/${teamId}/agents/${agentId}/message`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
    if (!res.ok) throw new Error(`API Error: ${res.status}`);
    return res.json();
  },
  terminate: async (teamId: string, agentId: string) => {
    const res = await fetch(`${API_BASE}/teams/${teamId}/agents/${agentId}/terminate`, {
      method: "POST",
    });
    if (!res.ok) throw new Error(`API Error: ${res.status}`);
    return res.json();
  },
};
