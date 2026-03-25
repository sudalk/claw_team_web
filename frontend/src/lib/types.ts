// Types for ClawTeam Web API

export type TaskStatus = "pending" | "in_progress" | "completed" | "blocked" | "failed";
export type TaskPriority = "low" | "medium" | "high";
export type WorkerStatus = "ready" | "busy" | "idle" | "terminated";
export type SpawnBackend = "tmux" | "subprocess";
export type CLIVendor = "claude" | "codex" | "codeflicker" | "nanobot" | "gemini";
export type ExecutionMode = "auto" | "manual";

export interface TeamMember {
  id: string;
  name: string;
  type: string;
  role?: string;
  joined_at: string;
  inbox_count: number;
}

export interface TeamStats {
  members: number;
  workers: number;
  tasks_total: number;
  tasks_completed: number;
  tasks_pending: number;
  tasks_in_progress: number;
  tasks_blocked: number;
  tasks_failed: number;
}

export interface Team {
  id: string;
  name: string;
  description?: string;
  status: string;
  created_at: string;
  leader: TeamMember;
  stats: TeamStats;
  members: TeamMember[];
  workdir?: string;
}

export interface TaskExecution {
  started_at?: string;
  completed_at?: string;
  progress: number;
  output?: string;
  error?: string;
}

export interface Task {
  id: string;
  team_id: string;
  subject: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  assignee?: { id: string; name: string };
  created_at: string;
  updated_at: string;
  blocked_by: string[];
  blocks: string[];
  execution?: TaskExecution;
  workdir?: string;
}

export interface WorkerConfig {
  cli: CLIVendor;
  backend: SpawnBackend;
  workdir?: string;
  execution_mode: ExecutionMode;
  auto_assign: boolean;
}

export interface Worker {
  id: string;
  team_id: string;
  name: string;
  role: string;
  status: WorkerStatus;
  config: WorkerConfig;
  current_task?: Task;
  completed_tasks: number;
  failed_tasks: number;
  spawned_at: string;
  last_activity?: string;
  tmux_session?: string;
}

export interface Message {
  id: string;
  team_id: string;
  from_agent: string;
  to_agent: string;
  content: string;
  created_at: string;
  read: boolean;
}

export interface CLIInfo {
  command: string;
  name: string;
  vendor: string;
  installed: boolean;
  version?: string;
  emoji: string;
}

// SSE Event types
export type SSEEventType =
  | "team_updated"
  | "team_deleted"
  | "task_created"
  | "task_updated"
  | "task_moved"
  | "task_deleted"
  | "task_started"
  | "task_progress"
  | "task_completed"
  | "task_failed"
  | "worker_spawned"
  | "worker_status_changed"
  | "worker_assigned"
  | "worker_terminated"
  | "worker_message";

export interface SSEEvent {
  type: SSEEventType;
  data: Record<string, unknown>;
  timestamp: string;
}
