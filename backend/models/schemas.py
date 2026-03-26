"""Pydantic schemas for API request/response models."""

from datetime import datetime
from enum import Enum
from typing import Optional, Literal
from pydantic import BaseModel, Field


# ============ Enums ============


class TaskStatus(str, Enum):
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    BLOCKED = "blocked"
    FAILED = "failed"


class TaskPriority(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


class AgentStatus(str, Enum):
    READY = "ready"        # Idle, waiting for tasks
    BUSY = "busy"          # Working on a task
    IDLE = "idle"         # No task assigned
    TERMINATED = "terminated"




class CLIVendor(str, Enum):
    CLAUDE = "claude"
    CODEX = "codex"
    CODEFLICKER = "codeflicker"
    NANOBOT = "nanobot"
    GEMINI = "gemini"


class SpawnBackend(str, Enum):
    TMUX = "tmux"
    SUBPROCESS = "subprocess"


class ExecutionMode(str, Enum):
    AUTO = "auto"        # Agent automatically picks up tasks
    MANUAL = "manual"    # User manually triggers execution


# ============ Agent Models ============


class AgentCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    cli: CLIVendor = CLIVendor.CLAUDE
    backend: Optional[SpawnBackend] = SpawnBackend.TMUX
    role: str = "worker"


class AgentResponse(BaseModel):
    id: str
    name: str
    cli: CLIVendor
    backend: Optional[SpawnBackend] = None
    role: str = "worker"
    status: AgentStatus
    team: str = ""
    spawned_at: datetime


class AgentListResponse(BaseModel):
    agents: list[AgentResponse]
    total: int


class AgentMessage(BaseModel):
    content: str


# ============ Team Models ============


class TeamMember(BaseModel):
    id: str
    name: str
    type: str  # "leader" | "worker"
    role: str = "member"  # "leader", "worker", "reviewer"
    joined_at: datetime
    inbox_count: int = 0


class TeamStats(BaseModel):
    members: int = 0
    workers: int = 0
    tasks_total: int = 0
    tasks_completed: int = 0
    tasks_pending: int = 0
    tasks_in_progress: int = 0
    tasks_blocked: int = 0
    tasks_failed: int = 0


class TeamResponse(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    status: str  # "active" | "inactive"
    created_at: datetime
    leader: TeamMember
    stats: TeamStats
    members: list[TeamMember] = []
    workdir: Optional[str] = None  # Team's base working directory


class TeamCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = None
    workdir: Optional[str] = None  # Base working directory for all agents


class TeamUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    workdir: Optional[str] = None


class TeamListResponse(BaseModel):
    teams: list[TeamResponse]
    total: int


# ============ Task Models ============


class TaskAssignee(BaseModel):
    id: str
    name: str


class TaskExecution(BaseModel):
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    progress: int = 0  # 0-100
    output: Optional[str] = None  # Last output/log
    error: Optional[str] = None


class TaskResponse(BaseModel):
    id: str
    team_id: str
    subject: str
    description: Optional[str] = None
    status: TaskStatus
    priority: TaskPriority
    assignee: Optional[TaskAssignee] = None
    created_at: datetime
    updated_at: datetime
    blocked_by: list[str] = []
    blocks: list[str] = []
    execution: Optional[TaskExecution] = None
    workdir: Optional[str] = None  # Task-specific working directory


class TaskCreate(BaseModel):
    subject: str = Field(..., min_length=1, max_length=500)
    description: Optional[str] = None
    priority: TaskPriority = TaskPriority.MEDIUM
    assignee_id: Optional[str] = None
    blocked_by: list[str] = []
    workdir: Optional[str] = None  # Override team workdir


class TaskUpdate(BaseModel):
    subject: Optional[str] = None
    description: Optional[str] = None
    status: Optional[TaskStatus] = None
    priority: Optional[TaskPriority] = None
    assignee_id: Optional[str] = None
    workdir: Optional[str] = None


class TaskMove(BaseModel):
    status: TaskStatus


class TaskExecute(BaseModel):
    """Trigger task execution on an agent"""
    pass


class TaskListResponse(BaseModel):
    tasks: list[TaskResponse]
    total: int


# ============ Worker/Agent Models ============


class WorkerConfig(BaseModel):
    cli: CLIVendor = CLIVendor.CLAUDE
    backend: SpawnBackend = SpawnBackend.TMUX
    workdir: Optional[str] = None  # Agent's working directory
    execution_mode: ExecutionMode = ExecutionMode.AUTO
    auto_assign: bool = True  # Automatically assign pending tasks


class WorkerResponse(BaseModel):
    id: str
    team_id: str
    name: str
    role: str = "worker"  # "worker", "reviewer", "tester"
    status: AgentStatus
    config: WorkerConfig
    current_task: Optional[TaskResponse] = None
    completed_tasks: int = 0
    failed_tasks: int = 0
    spawned_at: datetime
    last_activity: Optional[datetime] = None
    tmux_session: Optional[str] = None  # tmux session name for monitoring


class WorkerCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    role: str = "worker"
    config: WorkerConfig = Field(default_factory=WorkerConfig)


class WorkerUpdate(BaseModel):
    name: Optional[str] = None
    role: Optional[str] = None
    config: Optional[WorkerConfig] = None


class WorkerAssignTask(BaseModel):
    """Assign a task to a worker"""
    task_id: str


class WorkerListResponse(BaseModel):
    workers: list[WorkerResponse]
    total: int


# ============ Message Models ============


class MessageResponse(BaseModel):
    id: str
    team_id: str
    from_agent: str
    to_agent: str
    content: str
    created_at: datetime
    read: bool = False


class MessageCreate(BaseModel):
    to_agent: str
    content: str


class MessageBroadcast(BaseModel):
    content: str


class MessageListResponse(BaseModel):
    messages: list[MessageResponse]
    total: int


# ============ SSE Event Models ============


class SSEEventType(str, Enum):
    # Team events
    TEAM_UPDATED = "team_updated"
    TEAM_DELETED = "team_deleted"

    # Task events
    TASK_CREATED = "task_created"
    TASK_UPDATED = "task_updated"
    TASK_MOVED = "task_moved"
    TASK_DELETED = "task_deleted"
    TASK_STARTED = "task_started"
    TASK_PROGRESS = "task_progress"
    TASK_COMPLETED = "task_completed"
    TASK_FAILED = "task_failed"

    # Worker events
    WORKER_SPAWNED = "worker_spawned"
    WORKER_STATUS_CHANGED = "worker_status_changed"
    WORKER_ASSIGNED = "worker_assigned"
    WORKER_TERMINATED = "worker_terminated"
    WORKER_MESSAGE = "worker_message"

    # General
    MEMBER_JOINED = "member_joined"

    # Execution events (auto mode)
    EXECUTION_STARTED = "execution_started"
    EXECUTION_COMPLETED = "execution_completed"
    EXECUTION_FAILED = "execution_failed"
    EXECUTION_STOPPED = "execution_stopped"
    EXECUTION_THINKING = "thinking"
    EXECUTION_STEP = "step"
    TEAM_CREATING = "team_creating"
    TEAM_CREATED = "team_created"
    TEAM_FAILED = "team_failed"
    WORKER_SPAWNING = "worker_spawning"
    WORKER_FAILED = "worker_failed"
    TASK_CREATING = "task_creating"
    TASK_ASSIGNING = "task_assigning"
    TASK_ASSIGNED = "task_assigned"
    TASK_RUNNING = "task_running"
    TASK_COMPLETED_STEP = "task_completed_step"
    TASK_FAILED_STEP = "task_failed_step"
    USER_FEEDBACK = "user_feedback"


class SSEEvent(BaseModel):
    type: SSEEventType
    data: dict
    timestamp: datetime = Field(default_factory=datetime.now)


# ============ CLI Detection ============


class CLIInfo(BaseModel):
    command: str
    name: str
    vendor: str
    installed: bool
    version: Optional[str] = None
    emoji: str = "🤖"


class CLIListResponse(BaseModel):
    clis: list[CLIInfo]


# ============ Dashboard Summary ============


class DashboardSummary(BaseModel):
    total_teams: int
    total_workers: int
    total_tasks: int
    tasks_in_progress: int
    tasks_completed_today: int
    recent_activity: list[SSEEvent] = []
