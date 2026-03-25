# ClawTeam Web 自动模式技术方案

> 创建时间：2026-03-24
> 状态：草稿

## 一、产品定位

**一句话**：用户输入需求描述，AI 自动拆解任务、创建团队、执行开发、返回结果。

**MVP 范围**：
- ✅ 一句话 → 需求理解 → 任务拆解
- ✅ 自动创建团队、Worker、任务
- ✅ 代码生成
- ✅ 本地部署
- ✅ 执行日志实时展示
- ❌ 自动测试
- ❌ CI/CD 部署
- ❌ 迭代修改（手动触发）

---

## 二、系统架构

```
┌─────────────────────────────────────────────────────────────────┐
│                         用户交互层                               │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │  前端 Next.js                                             │  │
│  │  ├── 提示词输入框                                         │  │
│  │  ├── 团队视图 (任务看板 / Worker / 消息)                   │  │
│  │  └── 执行记录面板 (实时日志流)                              │  │
│  └─────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                         API 网关层                               │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │  FastAPI Backend                                         │  │
│  │  ├── REST API (现有)                                      │  │
│  │  └── SSE Events (实时日志)                                 │  │
│  └─────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
         ┌────────────────────┼────────────────────┐
         ▼                    ▼                    ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│  Orchestrator   │  │   Team Service   │  │   Worker Service │
│    Agent        │  │   (已有)          │  │    (已有)        │
└─────────────────┘  └─────────────────┘  └─────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Clawteam CLI                               │
│  ├── team spawn-team / cleanup                                  │
│  ├── task create / update                                      │
│  └── spawn                                                     │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      数据存储层 (~/.clawteam/)                    │
│  ├── teams/{team_name}/config.json                              │
│  ├── tasks/{team_name}/task-*.json                             │
│  └── executions/{execution_id}/logs.json                         │
└─────────────────────────────────────────────────────────────────┘
```

---

## 三、功能模块设计

### 3.1 Orchestrator Agent（核心新增模块）

**职责**：接收提示词，调用 LLM 拆解任务，协调整个流程。

**文件位置**：`backend/services/orchestrator.py`

```python
class OrchestratorAgent:
    """AI Orchestrator for automatic task execution."""

    async def process(self, prompt: str, team_id: str) -> ExecutionResult:
        """
        处理用户需求

        流程:
        1. 需求分析 - 调用 LLM 理解需求
        2. 任务拆解 - 生成任务列表
        3. 团队创建 - 创建/复用团队
        4. Worker 启动 - 根据任务类型分配
        5. 任务分配 - 分配给对应 Worker
        6. 执行监控 - 监控任务执行状态
        """
        pass
```

**Prompt 模板**：

```python
TASK_DECOMPOSE_PROMPT = """
你是一个项目经理，需要将用户需求拆解成具体的开发任务。

用户需求：
{prompt}

请按照以下格式输出任务列表（JSON）：
{{
    "summary": "需求摘要",
    "workers": [
        {{
            "name": "worker名称",
            "role": "frontend/backend/fullstack",
            "description": "职责描述"
        }}
    ],
    "tasks": [
        {{
            "subject": "任务标题",
            "description": "详细描述",
            "priority": "high/medium/low",
            "assignee": "worker名称",
            "blocked_by": [],
            "type": "backend/frontend/infra"
        }}
    ],
    "execution_order": ["task_id_1", "task_id_2"]
}}

规则：
1. 任务需要按照依赖关系排序
2. 每个任务必须有明确的 assignee
3. 前端和后端任务分开
4. 考虑任务的合理拆分（单个任务不超过 2 小时）
"""

TASK_DECOMPOSE_EXAMPLES = """
示例输入：帮我做一个待办应用，包含用户登录和任务管理

示例输出：
{{
    "summary": "待办应用，包含用户认证和任务管理功能",
    "workers": [
        {{"name": "backend-dev", "role": "backend", "description": "后端开发"}},
        {{"name": "frontend-dev", "role": "frontend", "description": "前端开发"}}
    ],
    "tasks": [
        {{"subject": "初始化后端项目结构", "description": "使用 FastAPI 创建项目，安装依赖", "priority": "high", "assignee": "backend-dev", "blocked_by": [], "type": "backend"}},
        {{"subject": "设计数据库模型", "description": "设计 User 和 Task 表结构", "priority": "high", "assignee": "backend-dev", "blocked_by": ["task-1"], "type": "backend"}},
        {{"subject": "实现用户认证 API", "description": "实现登录、注册、JWT token", "priority": "high", "assignee": "backend-dev", "blocked_by": ["task-2"], "type": "backend"}},
        {{"subject": "初始化前端项目", "description": "使用 Next.js 创建项目", "priority": "high", "assignee": "frontend-dev", "blocked_by": [], "type": "frontend"}},
        {{"subject": "实现登录页面", "description": "实现登录/注册表单", "priority": "medium", "assignee": "frontend-dev", "blocked_by": ["task-3", "task-4"], "type": "frontend"}},
        {{"subject": "实现任务 CRUD 页面", "description": "实现任务列表、新增、编辑、删除", "priority": "medium", "assignee": "frontend-dev", "blocked_by": ["task-3"], "type": "frontend"}}
    ],
    "execution_order": ["task-1", "task-4", "task-2", "task-3", "task-5", "task-6"]
}}
"""
```

### 3.2 执行记录服务

**职责**：记录每一步操作，支持实时 SSE 推送。

**文件位置**：`backend/services/execution_service.py`

```python
class ExecutionLog(BaseModel):
    """执行日志条目"""
    id: str
    execution_id: str
    step: str           # "analyzing" / "creating_team" / "generating" / etc.
    status: str         # "running" / "success" / "failed" / "thinking"
    content: str        # 日志内容
    detail: Optional[dict] = None  # 额外数据
    timestamp: datetime
    duration: Optional[float] = None

class ExecutionRecord(BaseModel):
    """一次完整的执行记录"""
    id: str
    team_id: str
    prompt: str
    status: str          # "running" / "completed" / "failed"
    logs: list[ExecutionLog]
    created_at: datetime
    completed_at: Optional[datetime] = None
```

**日志类型**：

```python
class LogType(str, Enum):
    # 思考过程
    THINKING = "thinking"           # AI 正在分析

    # 执行步骤
    TEAM_CREATING = "team_creating"
    TEAM_CREATED = "team_created"
    WORKER_SPAWNING = "worker_spawning"
    WORKER_SPAWNED = "worker_spawned"
    TASK_CREATING = "task_creating"
    TASK_CREATED = "task_created"
    TASK_ASSIGNING = "task_assigning"
    TASK_ASSIGNED = "task_assigned"

    # 执行状态
    TASK_RUNNING = "task_running"
    TASK_COMPLETED = "task_completed"
    TASK_FAILED = "task_failed"

    # 最终结果
    EXECUTION_STARTED = "execution_started"
    EXECUTION_COMPLETED = "execution_completed"
    EXECUTION_FAILED = "execution_failed"

    # 用户交互
    USER_FEEDBACK = "user_feedback"
```

### 3.3 Worker 任务执行

**职责**：Worker 接收任务，执行代码生成。

**复用现有 Worker Service**，新增执行 prompt 生成：

```python
WORKER_EXECUTE_PROMPT = """
你是一个 {role} 开发者，正在完成团队开发任务。

当前任务：
{subject}
{description}

工作目录：{workdir}

请完成以下工作：
1. 进入工作目录
2. 分析任务需求
3. 编写/修改代码
4. 确保代码可运行

完成后，使用 clawteam 命令更新任务状态。
"""
```

---

## 四、API 设计

### 4.1 新增 API 端点

#### POST `/auto/execute` - 启动自动执行

**请求**：
```json
{
    "prompt": "帮我做一个待办应用，包含用户登录和任务管理",
    "team_name": "todo-app-dev",
    "model": "claude-sonnet-4-20250514"  // 可选，使用哪个 LLM 模型
}
```

**响应**：
```json
{
    "execution_id": "exec-xxx-xxx",
    "team_id": "todo-app-dev",
    "status": "running",
    "stream_url": "/api/v1/auto/execute/{execution_id}/stream"
}
```

#### GET `/auto/execute/{execution_id}/stream` - SSE 日志流

**响应**：
```
Content-Type: text/event-stream

data: {"type": "thinking", "content": "分析需求：这是一个待办应用...", "timestamp": "2026-03-24T10:00:00Z"}
data: {"type": "team_created", "content": "✓ 创建团队: todo-app-dev", "timestamp": "2026-03-24T10:00:01Z"}
data: {"type": "worker_spawned", "content": "✓ 启动 Worker: backend-dev", "timestamp": "2026-03-24T10:00:05Z"}
data: {"type": "task_created", "content": "✓ 创建任务: 初始化后端项目", "timestamp": "2026-03-24T10:00:10Z"}
...
```

#### GET `/auto/execute/{execution_id}` - 获取执行状态

**响应**：
```json
{
    "id": "exec-xxx-xxx",
    "prompt": "帮我做一个待办应用",
    "status": "running",
    "logs": [
        {"type": "thinking", "content": "...", "timestamp": "..."},
        {"type": "team_created", "content": "...", "timestamp": "..."}
    ],
    "progress": {
        "total_tasks": 6,
        "completed_tasks": 2,
        "current_task": "实现用户认证 API"
    },
    "team_id": "todo-app-dev"
}
```

#### POST `/auto/execute/{execution_id}/stop` - 停止执行

**响应**：
```json
{
    "status": "stopped",
    "logs": "..."
}
```

### 4.2 复用现有 API

| API | 用途 | 复用方式 |
|-----|------|----------|
| `GET /teams/{team_name}` | 显示团队视图 | 前端直接调用 |
| `GET /teams/{team_name}/tasks` | 任务看板 | 前端直接调用 |
| `GET /teams/{team_name}/workers` | Worker 列表 | 前端直接调用 |
| `GET /teams/{team_name}/events` | SSE 实时更新 | 复用 |

---

## 五、前端设计

### 5.1 页面结构

```tsx
// 自动模式组件
<AutoMode>
    <PromptInput />
    <StartButton onClick={handleStart} />

    <SplitPane>
        <LeftPane>
            {/* 现有团队视图 */}
            <TeamView teamId={teamId} />
        </LeftPane>

        <RightPane>
            {/* 执行记录 */}
            <ExecutionLogPanel executionId={executionId} />
        </RightPane>
    </SplitPane>
</AutoMode>
```

### 5.2 执行记录组件

```tsx
// components/ExecutionLogPanel.tsx
export function ExecutionLogPanel({ executionId }: { executionId: string }) {
    const [logs, setLogs] = useState<ExecutionLog[]>([]);

    // SSE 连接
    useEffect(() => {
        const es = new EventSource(`/api/v1/auto/execute/${executionId}/stream`);
        es.onmessage = (event) => {
            const log = JSON.parse(event.data);
            setLogs(prev => [...prev, log]);
        };
        return () => es.close();
    }, [executionId]);

    return (
        <div className="execution-log">
            {logs.map((log, i) => (
                <LogItem key={i} log={log} />
            ))}
        </div>
    );
}

function LogItem({ log }: { log: ExecutionLog }) {
    const icons = {
        thinking: "🤔",
        team_created: "👥",
        worker_spawned: "🤖",
        task_created: "📋",
        task_completed: "✅",
        task_failed: "❌",
        // ...
    };

    return (
        <div className={`log-item log-${log.type}`}>
            <span className="icon">{icons[log.type] || "📝"}</span>
            <span className="content">{log.content}</span>
            <span className="time">{formatTime(log.timestamp)}</span>
        </div>
    );
}
```

### 5.3 样式设计

```css
/* 执行记录样式 */
.execution-log {
    background: #0a0a0a;
    border: 1px solid #222;
    border-radius: 8px;
    height: 100%;
    overflow-y: auto;
    padding: 16px;
    font-family: "SF Mono", monospace;
    font-size: 13px;
}

.log-item {
    display: flex;
    gap: 12px;
    padding: 8px 0;
    border-bottom: 1px solid #1a1a1a;
}

.log-item:last-child {
    border-bottom: none;
}

.log-thinking {
    color: #9ca3af;
    font-style: italic;
}

.log-team_created, .log-worker_spawned {
    color: #10b981;
}

.log-task_completed {
    color: #22c55e;
}

.log-task_failed {
    color: #ef4444;
}

.icon {
    width: 20px;
    flex-shrink: 0;
}

.content {
    flex: 1;
    word-break: break-word;
}

.time {
    color: #6b7280;
    font-size: 11px;
    flex-shrink: 0;
}
```

---

## 六、数据模型

### 6.1 新增数据表/文件

```python
# backend/models/execution.py

from pydantic import BaseModel
from datetime import datetime
from typing import Optional
from enum import Enum

class ExecutionStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    STOPPED = "stopped"

class LogType(str, Enum):
    THINKING = "thinking"
    STEP = "step"
    SUCCESS = "success"
    ERROR = "error"

class ExecutionLog(BaseModel):
    id: str
    execution_id: str
    log_type: LogType
    step: str           # 步骤名称
    content: str         # 日志内容
    detail: Optional[dict] = None
    timestamp: datetime = Field(default_factory=datetime.now)

class ExecutionRecord(BaseModel):
    id: str
    prompt: str
    team_id: Optional[str] = None
    status: ExecutionStatus = ExecutionStatus.PENDING
    logs: list[ExecutionLog] = []
    created_at: datetime = Field(default_factory=datetime.now)
    completed_at: Optional[datetime] = None

    # 任务统计
    total_tasks: int = 0
    completed_tasks: int = 0
    failed_tasks: int = 0
```

### 6.2 数据存储

```
~/.clawteam/
├── teams/
│   └── {team_name}/
│       └── config.json
├── tasks/
│   └── {team_name}/
│       └── task-{id}.json
└── executions/                    # 新增
    └── {execution_id}/
        ├── meta.json             # ExecutionRecord
        └── logs.json             # ExecutionLog[]
```

---

## 七、执行流程

### 7.1 完整流程时序图

```
用户                    前端                    后端                    LLM/CLI
 │                      │                       │                       │
 │  输入提示词           │                       │                       │
 │──────────────────────>│                       │                       │
 │                      │                       │                       │
 │                      │                       │                       │
 │                      │ POST /auto/execute    │                       │
 │                      │──────────────────────>│                       │
 │                      │                       │                       │
 │                      │                       │ 1. 创建执行记录        │
 │                      │                       │                       │
 │                      │                       │ 2. 调用 LLM 拆解任务   │
 │                      │                       │──────────────────────>│
 │                      │                       │                       │
 │<──────────────────────│ SSE Stream Connected  │                       │
 │                      │                       │                       │
 │                      │                       │ 3. 返回任务列表        │
 │                      │                       │                       │
 │                      │                       │ 4. 创建团队            │
 │                      │                       │────> clawteam CLI      │
 │                      │                       │                       │
 │<──────────────────────│ data: team_created   │                       │
 │                      │                       │                       │
 │                      │                       │ 5. 启动 Workers        │
 │                      │                       │────> clawteam spawn    │
 │                      │                       │                       │
 │<──────────────────────│ data: worker_spawned  │                       │
 │                      │                       │                       │
 │                      │                       │ 6. 创建任务            │
 │                      │                       │────> clawteam task     │
 │                      │                       │                       │
 │<──────────────────────│ data: task_created   │                       │
 │                      │                       │                       │
 │                      │                       │ 7. 分配任务给 Worker   │
 │                      │                       │                       │
 │<──────────────────────│ data: task_assigned   │                       │
 │                      │                       │                       │
 │                      │                       │ 8. Worker 执行代码     │
 │                      │                       │<──── tmux session      │
 │                      │                       │                       │
 │<──────────────────────│ data: task_running    │                       │
 │                      │                       │                       │
 │                      │                       │ 9. 监控任务状态        │
 │                      │                       │<──── polling           │
 │                      │                       │                       │
 │<──────────────────────│ data: task_completed  │                       │
 │                      │                       │                       │
 │                      │                       │ 10. 循环执行下一任务    │
 │                      │                       │───────────────────────>│
 │                      │                       │                       │
 │<──────────────────────│ data: execution_completed                  │
 │                      │                       │                       │
```

### 7.2 异常处理

```python
async def process(self, prompt: str, team_id: str):
    try:
        # 1. 需求分析
        emit("thinking", "分析需求...")
        plan = await self.analyze_and_decompose(prompt)

        # 2. 创建团队
        emit("step", f"创建团队: {team_id}")
        team_service.create_team(team_id)
        emit("success", f"✓ 团队 {team_id} 已创建")

        # 3. 启动 Workers
        for worker_config in plan.workers:
            emit("step", f"启动 Worker: {worker_config.name}")
            worker_service.create_worker(team_id, worker_config)
            emit("success", f"✓ Worker {worker_config.name} 已启动")

        # 4. 创建并执行任务
        for task in plan.tasks:
            emit("step", f"创建任务: {task.subject}")
            task = task_service.create_task(team_id, task)

            # 分配给 Worker
            emit("step", f"分配任务给 {task.assignee}")
            worker_service.assign_task(team_id, worker_id, task.id)

            # 触发执行
            emit("step", f"开始执行: {task.subject}")
            worker_service.execute_task(team_id, worker_id)

            # 等待完成（轮询）
            await self.wait_for_task_completion(task.id)

            emit("success", f"✓ 任务完成: {task.subject}")

        emit("success", "🎉 所有任务执行完成！")

    except Exception as e:
        emit("error", f"执行失败: {str(e)}")
        self.mark_failed()
```

---

## 八、依赖和技术选型

### 8.1 新增依赖

```toml
# pyproject.toml

[project]
dependencies = [
    "fastapi>=0.109.0",
    "uvicorn[standard]>=0.27.0",
    "pydantic>=2.5.0",
    "pydantic-settings>=2.1.0",
    "anthropic>=0.18.0",        # 新增：Claude API 客户端
]
```

### 8.2 前端依赖

```json
// frontend/package.json
{
    "dependencies": {
        "next": "^14.0.0",
        "react": "^18.2.0",
        "lucide-react": "^0.400.0"  // 图标库
    }
}
```

### 8.3 LLM 服务配置

支持两种模式：Anthropic 原生 API 或 MiniMax API（兼容 Anthropic 格式）。

**MiniMax 配置（推荐，国内可用）**：

```bash
# .env
# LLM 服务配置
LLM_PROVIDER=minimax                    # 或 "anthropic"
LLM_BASE_URL=https://api.minimaxi.com/anthropic/v1
LLM_API_KEY=your_minimax_api_key
LLM_MODEL=application-3.5-sonnet-20250514  # MiniMax 模型

# 如果用 Anthropic 原生 API
# LLM_PROVIDER=anthropic
# LLM_API_KEY=sk-ant-xxx
# LLM_MODEL=claude-sonnet-4-20250514
```

**LLM Client 封装**：

```python
# backend/core/llm_client.py
from anthropic import Anthropic
from anthropic.types import NOT_GIVEN
from typing import Optional

class LLMClient:
    """统一的 LLM 客户端，支持 Anthropic 和 MiniMax"""

    def __init__(self):
        from backend.core.config import settings
        self.provider = settings.llm_provider  # "anthropic" | "minimax"
        self.base_url = settings.llm_base_url

        if self.provider == "minimax":
            # MiniMax 兼容 Anthropic 格式
            self.client = Anthropic(
                base_url=self.base_url,
                api_key=settings.llm_api_key,
            )
        else:
            # Anthropic 原生
            self.client = Anthropic(
                api_key=settings.llm_api_key,
            )

    def chat(
        self,
        messages: list,
        model: Optional[str] = None,
        max_tokens: int = 4096,
        **kwargs
    ):
        """发送对话请求"""
        from backend.core.config import settings

        return self.client.messages.create(
            model=model or settings.llm_model,
            max_tokens=max_tokens,
            messages=messages,
            **kwargs
        )

    def simple_chat(self, prompt: str, model: Optional[str] = None) -> str:
        """简单的单轮对话"""
        response = self.chat([
            {"role": "user", "content": prompt}
        ], model=model)
        return response.content[0].text
```

**Config 更新**：

```python
# backend/core/config.py

class Settings(BaseSettings):
    # ... 现有配置 ...

    # LLM 配置
    llm_provider: str = "minimax"           # "anthropic" | "minimax"
    llm_base_url: str = "https://api.minimaxi.com/anthropic/v1"
    llm_api_key: str = ""
    llm_model: str = "application-3.5-sonnet-20250514"
    llm_max_tokens: int = 8192
    llm_temperature: float = 0.7

    class Config:
        env_prefix = "CLAWTEAM_WEB_"
```

**使用示例**：

```python
from backend.core.llm_client import llm_client

# 任务拆解
response = llm_client.simple_chat(f"""
分析以下需求并拆解成 JSON 任务列表：

需求：{prompt}

{TASK_DECOMPOSE_PROMPT}
""")

# 解析 JSON
import json
plan = json.loads(response)
```

---

## 九、项目结构

```
clawteam-web/
├── backend/
│   ├── __init__.py
│   ├── main.py
│   ├── core/
│   │   ├── config.py
│   │   └── llm_client.py          # 新增：LLM 调用封装
│   ├── models/
│   │   ├── schemas.py
│   │   └── execution.py            # 新增：执行记录模型
│   ├── api/
│   │   ├── teams.py
│   │   ├── tasks.py
│   │   ├── workers.py
│   │   ├── messages.py
│   │   ├── events.py
│   │   ├── clis.py
│   │   └── auto.py                 # 新增：自动执行 API
│   └── services/
│       ├── team_service.py
│       ├── task_service.py
│       ├── worker_service.py
│       ├── event_service.py
│       ├── cli_service.py
│       └── orchestrator.py          # 新增：Orchestrator Agent
│
├── frontend/
│   └── src/
│       ├── app/
│       │   ├── teams/[id]/
│       │   │   ├── page.tsx         # 修改：添加模式切换
│       │   │   └── auto/
│       │   │       └── page.tsx    # 新增：自动模式页面
│       │   └── ...
│       ├── components/
│       │   ├── ModeSelector.tsx    # 新增：模式切换
│       │   ├── PromptInput.tsx     # 新增：提示词输入
│       │   └── ExecutionLog.tsx    # 新增：执行日志
│       └── lib/
│           ├── api.ts              # 修改：添加 auto API
│           └── types.ts            # 修改：添加 Execution 类型
│
└── docs/
    └── TECHNICAL_DESIGN_AUTO_MODE.md
```

---

## 十、测试计划

### 10.1 单元测试

```python
# tests/test_orchestrator.py

def test_task_decomposition():
    """测试任务拆解"""
    orchestrator = OrchestratorAgent()
    result = orchestrator.analyze_and_decompose(
        "帮我做一个待办应用，包含登录和任务管理"
    )

    assert result.summary is not None
    assert len(result.tasks) > 0
    assert len(result.workers) > 0

def test_worker_assignment():
    """测试 Worker 分配"""
    # ...
```

### 10.2 集成测试

```bash
# 测试完整流程
$ curl -X POST http://localhost:8000/api/v1/auto/execute \
  -H "Content-Type: application/json" \
  -d '{"prompt": "帮我做一个简单的计算器"}'

# 验证
1. 团队是否创建
2. Workers 是否启动
3. 任务是否创建
4. 代码是否生成
```

---

## 十一、风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| LLM 输出不稳定 | 任务拆解失败 | Few-shot + JSON Schema 约束 |
| Worker 执行超时 | 任务卡住 | 添加超时机制 + 人工介入按钮 |
| 代码生成质量差 | 产出不可用 | 限制 MVP 只生成简单应用 |
| API Key 泄露 | 安全风险 | 环境变量管理 |
| 并发执行冲突 | 数据竞争 | 单次只允许一个执行 |

---

## 十二、开发计划

### Phase 1: 基础框架（1-2 天）
- [ ] LLM Client 封装
- [ ] Orchestrator 基础结构
- [ ] 执行记录数据模型
- [ ] 自动执行 API

### Phase 2: 前端集成（1 天）
- [ ] 模式切换组件
- [ ] 提示词输入组件
- [ ] 执行日志面板
- [ ] SSE 连接处理

### Phase 3: 联调测试（1-2 天）
- [ ] 端到端测试
- [ ] 异常场景测试
- [ ] 性能优化

### Phase 4: 文档与部署（0.5 天）
- [ ] 使用文档
- [ ] 部署配置

---

## 十三、总结

**MVP 目标**：用户输入一句话，自动拆解任务并生成可运行代码。

**关键约束**：
1. 简单需求（不超过 5 个任务）
2. 本地文件夹部署
3. 需要人工审核代码
4. 单次只允许一个执行

**成功标准**：
- 用户输入 → 10 分钟内生成可运行代码
- 代码能跑起来（可能有 bug）
- 用户能看到完整的执行过程
