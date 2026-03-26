"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { teamsAPI, tasksAPI, workersAPI, messagesAPI, createEventSource } from "@/lib/api";
import type { Team, Task, Worker, Message } from "@/lib/types";
import {
  formatRelativeTime,
  getStatusColor,
  getStatusLabel,
  getPriorityColor,
  getPriorityLabel,
  getCLImoji,
  getCLIName,
} from "@/lib/utils";

type Tab = "tasks" | "workers" | "messages" | "settings";

export default function TeamPage() {
  const params = useParams();
  const router = useRouter();
  const teamId = params.id as string;

  const [team, setTeam] = useState<Team | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [activeTab, setActiveTab] = useState<Tab>("tasks");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [teamRes, tasksRes, workersRes] = await Promise.all([
        teamsAPI.get(teamId),
        tasksAPI.list(teamId),
        workersAPI.list(teamId),
      ]);
      setTeam(teamRes);
      setTasks((tasksRes as { tasks: Task[] }).tasks);
      setWorkers((workersRes as { workers: Worker[] }).workers);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [teamId]);

  useEffect(() => {
    loadData();
    // SSE real-time updates
    const es = createEventSource(teamId);
    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        // Refresh data on any meaningful event
        if (data.type && !["heartbeat", "ping"].includes(data.type)) {
          loadData();
        }
      } catch {
        // ignore parse errors
      }
    };
    es.onerror = () => {
      es.close();
    };
    return () => {
      es.close();
    };
  }, [loadData, teamId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-xl text-gray-600">加载中...</div>
      </div>
    );
  }

  if (error || !team) {
    return (
      <div className="p-8">
        <Link href="/" className="text-blue-400 hover:underline text-sm mb-4 inline-block">
          ← 返回
        </Link>
        <div className="text-red-400">错误: {error || "团队不存在"}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="border-b border-gray-200 p-6">
        <Link href="/" className="text-blue-400 hover:underline text-sm mb-4 inline-block">
          ← 返回
        </Link>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">{team.name}</h1>
            {team.description && (
              <p className="text-gray-600 mt-1">{team.description}</p>
            )}
            {team.workdir && (
              <p className="text-gray-500 text-sm mt-1">📁 {team.workdir}</p>
            )}
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => router.push(`/teams/${teamId}/tasks/new`)}
              className="px-4 py-2 bg-blue-400 text-white rounded-lg hover:bg-blue-500 transition-colors"
            >
              + 新任务
            </button>
            <button
              onClick={() => router.push(`/teams/${teamId}/workers/new`)}
              className="px-4 py-2 bg-green-400 text-white rounded-lg hover:bg-green-500 transition-colors"
            >
              + 添加 Worker
            </button>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-1 px-6">
          {(["tasks", "workers", "messages", "settings"] as Tab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-3 border-b-2 transition-colors ${
                activeTab === tab
                  ? "border-blue-500 text-blue-400"
                  : "border-transparent text-gray-600 hover:text-gray-900"
              }`}
            >
              {tab === "tasks" && `任务 (${tasks.length})`}
              {tab === "workers" && `Worker (${workers.length})`}
              {tab === "messages" && "消息"}
              {tab === "settings" && "设置"}
            </button>
          ))}
        </nav>
      </div>

      {/* Content */}
      <div className="p-6">
        {activeTab === "tasks" && (
          <TasksPanel tasks={tasks} teamId={teamId} onUpdate={loadData} workers={workers} />
        )}
        {activeTab === "workers" && (
          <WorkersPanel workers={workers} teamId={teamId} onUpdate={loadData} tasks={tasks} />
        )}
        {activeTab === "messages" && (
          <MessagesPanel messages={messages} teamId={teamId} onUpdate={loadData} />
        )}
        {activeTab === "settings" && (
          <SettingsPanel team={team} onUpdate={loadData} />
        )}
      </div>
    </div>
  );
}

// ============ Tasks Panel ============
function TasksPanel({ tasks, teamId, onUpdate, workers }: { tasks: Task[]; teamId: string; onUpdate: () => void; workers: Worker[] }) {
  const [showNew, setShowNew] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [newTask, setNewTask] = useState({ subject: "", description: "", priority: "medium", assignee_id: "" });
  const [editForm, setEditForm] = useState({ subject: "", description: "", priority: "medium", assignee_id: "" });

  const columns: { status: string; label: string; color: string }[] = [
    { status: "pending", label: "待办", color: "border-yellow-500" },
    { status: "in_progress", label: "进行中", color: "border-blue-500" },
    { status: "completed", label: "已完成", color: "border-green-500" },
    { status: "blocked", label: "阻塞", color: "border-red-500" },
  ];

  async function createTask() {
    try {
      await tasksAPI.create(teamId, {
        subject: newTask.subject,
        description: newTask.description,
        priority: newTask.priority,
        assignee_id: newTask.assignee_id || undefined,
      });
      setShowNew(false);
      setNewTask({ subject: "", description: "", priority: "medium", assignee_id: "" });
      onUpdate();
    } catch (err) {
      alert(err instanceof Error ? err.message : "创建失败");
    }
  }

  async function moveTask(taskId: string, status: string) {
    try {
      await tasksAPI.move(teamId, taskId, status);
      onUpdate();
    } catch (err) {
      alert(err instanceof Error ? err.message : "移动失败");
    }
  }

  async function deleteTask(taskId: string) {
    if (!confirm("确定要删除这个任务吗？")) return;
    try {
      await tasksAPI.delete(teamId, taskId);
      onUpdate();
    } catch (err) {
      alert(err instanceof Error ? err.message : "删除失败");
    }
  }

  function openEdit(task: Task) {
    setEditingTask(task);
    setEditForm({
      subject: task.subject,
      description: task.description || "",
      priority: task.priority,
      assignee_id: task.assignee?.id || "",
    });
  }

  async function saveEdit() {
    if (!editingTask || !editForm.subject.trim()) return;
    try {
      await tasksAPI.update(teamId, editingTask.id, {
        subject: editForm.subject.trim(),
        description: editForm.description.trim() || undefined,
        priority: editForm.priority,
        assignee_id: editForm.assignee_id || undefined,
      });
      setEditingTask(null);
      onUpdate();
    } catch (err) {
      alert(err instanceof Error ? err.message : "保存失败");
    }
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold">任务看板</h2>
        <button onClick={() => setShowNew(true)} className="px-3 py-1.5 bg-blue-400 text-white rounded hover:bg-blue-500 text-sm">
          + 新任务
        </button>
      </div>

      {/* New Task Form */}
      {showNew && (
        <div className="mb-4 p-4 bg-white border border-gray-200 rounded-lg">
          <input
            type="text"
            placeholder="任务标题 *"
            value={newTask.subject}
            onChange={(e) => setNewTask({ ...newTask, subject: e.target.value })}
            className="w-full p-2 bg-gray-100 border border-gray-300 rounded mb-2"
          />
          <textarea
            placeholder="任务描述"
            value={newTask.description}
            onChange={(e) => setNewTask({ ...newTask, description: e.target.value })}
            className="w-full p-2 bg-gray-100 border border-gray-300 rounded mb-2"
          />
          <div className="flex gap-2 mb-2">
            <select
              value={newTask.priority}
              onChange={(e) => setNewTask({ ...newTask, priority: e.target.value })}
              className="p-2 bg-gray-100 border border-gray-300 rounded"
            >
              <option value="low">低优先级</option>
              <option value="medium">中优先级</option>
              <option value="high">高优先级</option>
            </select>
            <select
              value={newTask.assignee_id}
              onChange={(e) => setNewTask({ ...newTask, assignee_id: e.target.value })}
              className="p-2 bg-gray-100 border border-gray-300 rounded flex-1"
            >
              <option value="">不分配</option>
              {workers.map((w) => (
                <option key={w.id} value={w.name}>{w.name} ({getCLIName(w.config.cli)})</option>
              ))}
            </select>
          </div>
          <div className="flex gap-2">
            <button onClick={createTask} className="px-4 py-2 bg-green-400 text-white rounded hover:bg-green-500 text-sm">
              创建
            </button>
            <button onClick={() => setShowNew(false)} className="px-4 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400 text-sm">
              取消
            </button>
          </div>
        </div>
      )}

      {/* Kanban Board */}
      <div className="grid grid-cols-4 gap-4">
        {columns.map(({ status, label, color }) => {
          const columnTasks = tasks.filter((t) => t.status === status);
          return (
            <div key={status} className="bg-gray-50 rounded-lg">
              <div className={`p-3 border-b-2 ${color}`}>
                <div className="flex justify-between items-center">
                  <span className="font-medium">{label}</span>
                  <span className="text-gray-500 text-sm">{columnTasks.length}</span>
                </div>
              </div>
              <div className="p-2 space-y-2 min-h-[300px]">
                {columnTasks.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    workers={workers}
                    onMove={(newStatus) => moveTask(task.id, newStatus)}
                    onDelete={() => deleteTask(task.id)}
                    teamId={teamId}
                    onUpdate={onUpdate}
                    onEdit={openEdit}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Edit Task Modal */}
      {editingTask && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white border border-gray-300 rounded-lg p-6 w-full max-w-md">
            <h3 className="text-xl font-semibold mb-4">编辑任务</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-600 mb-1">任务标题</label>
                <input
                  type="text"
                  value={editForm.subject}
                  onChange={(e) => setEditForm({ ...editForm, subject: e.target.value })}
                  className="w-full p-2 bg-gray-100 border border-gray-300 rounded"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">描述</label>
                <textarea
                  value={editForm.description}
                  onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                  rows={3}
                  className="w-full p-2 bg-gray-100 border border-gray-300 rounded"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">优先级</label>
                <select
                  value={editForm.priority}
                  onChange={(e) => setEditForm({ ...editForm, priority: e.target.value })}
                  className="w-full p-2 bg-gray-100 border border-gray-300 rounded"
                >
                  <option value="low">低</option>
                  <option value="medium">中</option>
                  <option value="high">高</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">分配给</label>
                <select
                  value={editForm.assignee_id}
                  onChange={(e) => setEditForm({ ...editForm, assignee_id: e.target.value })}
                  className="w-full p-2 bg-gray-100 border border-gray-300 rounded"
                >
                  <option value="">不分配</option>
                  {workers.map((w) => (
                    <option key={w.id} value={w.name}>{w.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setEditingTask(null)}
                className="px-4 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400"
              >
                取消
              </button>
              <button
                onClick={saveEdit}
                className="px-4 py-2 bg-blue-400 text-white rounded hover:bg-blue-500"
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TaskCard({
  task,
  workers,
  onMove,
  onDelete,
  teamId,
  onUpdate,
  onEdit,
}: {
  task: Task;
  workers: Worker[];
  onMove: (status: string) => void;
  onDelete: () => void;
  teamId: string;
  onUpdate: () => void;
  onEdit: (task: Task) => void;
}) {
  const [showMenu, setShowMenu] = useState(false);
  const [showAssign, setShowAssign] = useState(false);

  const availableStatuses = ["pending", "in_progress", "completed", "blocked"].filter((s) => s !== task.status);

  async function assignToWorker(workerName: string) {
    const worker = workers.find((w) => w.name === workerName);
    if (!worker) return;
    try {
      await workersAPI.assign(teamId, worker.id, task.id);
      setShowAssign(false);
      onUpdate();
    } catch (err) {
      alert(err instanceof Error ? err.message : "分配失败");
    }
  }

  return (
    <div className="p-3 bg-white border border-gray-200 rounded-lg hover:border-gray-300">
      <p className="text-sm mb-2 line-clamp-2">{task.subject}</p>

      {/* Progress bar for in_progress tasks */}
      {task.status === "in_progress" && task.execution?.progress !== undefined && (
        <div className="mb-2">
          <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-400 rounded-full"
              style={{ width: `${task.execution.progress}%` }}
            />
          </div>
          <div className="text-xs text-gray-500 mt-1">{task.execution.progress}%</div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <span className={`text-xs ${getPriorityColor(task.priority)}`}>
          {getPriorityLabel(task.priority)}
        </span>
        <div className="flex items-center gap-1">
          {task.assignee && (
            <span className="text-xs text-gray-600">{getCLImoji()}</span>
          )}
          <div className="relative">
            <button onClick={() => setShowMenu(!showMenu)} className="text-gray-600 hover:text-gray-900 text-xs p-1">
              ⋮
            </button>
            {showMenu && (
              <div className="absolute right-0 top-full mt-1 bg-gray-200 border border-gray-300 rounded shadow-lg z-10 min-w-[120px]">
                <button
                  onClick={() => { onEdit(task); setShowMenu(false); }}
                  className="block w-full text-left px-3 py-1.5 text-sm hover:bg-gray-200"
                >
                  编辑
                </button>
                <button
                  onClick={() => { setShowAssign(true); setShowMenu(false); }}
                  className="block w-full text-left px-3 py-1.5 text-sm hover:bg-gray-200"
                >
                  分配 Worker
                </button>
                {availableStatuses.map((s) => (
                  <button
                    key={s}
                    onClick={() => { onMove(s); setShowMenu(false); }}
                    className="block w-full text-left px-3 py-1.5 text-sm hover:bg-gray-200"
                  >
                    移动到{getStatusLabel(s)}
                  </button>
                ))}
                <button
                  onClick={() => { onDelete(); setShowMenu(false); }}
                  className="block w-full text-left px-3 py-1.5 text-sm hover:bg-gray-200 text-red-400"
                >
                  删除
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Assign dropdown */}
      {showAssign && (
        <div className="mt-2 p-2 bg-gray-100 rounded border border-gray-300">
          <p className="text-xs text-gray-600 mb-1">分配给:</p>
          {workers.filter((w) => w.status !== "terminated").map((w) => (
            <button
              key={w.id}
              onClick={() => assignToWorker(w.name)}
              className="block w-full text-left px-2 py-1 text-sm hover:bg-gray-200 rounded"
            >
              {getCLImoji(w.config.cli)} {w.name}
            </button>
          ))}
          <button onClick={() => setShowAssign(false)} className="mt-1 text-xs text-gray-500">
            取消
          </button>
        </div>
      )}
    </div>
  );
}

// ============ Workers Panel ============
function WorkersPanel({ workers, teamId, onUpdate, tasks }: { workers: Worker[]; teamId: string; onUpdate: () => void; tasks: Task[] }) {
  const [showAssignMenu, setShowAssignMenu] = useState<{[workerId: string]: boolean}>({});

  async function terminateWorker(workerId: string) {
    if (!confirm("确定要终止这个 Worker 吗？")) return;
    try {
      await workersAPI.delete(teamId, workerId);
      onUpdate();
    } catch (err) {
      alert(err instanceof Error ? err.message : "终止失败");
    }
  }

  async function executeTask(workerId: string) {
    try {
      await workersAPI.execute(teamId, workerId);
      onUpdate();
    } catch (err) {
      alert(err instanceof Error ? err.message : "执行失败");
    }
  }

  async function completeTask(workerId: string) {
    try {
      await workersAPI.complete(teamId, workerId);
      onUpdate();
    } catch (err) {
      alert(err instanceof Error ? err.message : "操作失败");
    }
  }

  async function assignTaskToWorker(workerId: string, taskId: string) {
    try {
      await workersAPI.assign(teamId, workerId, taskId);
      setShowAssignMenu({});
      onUpdate();
    } catch (err) {
      alert(err instanceof Error ? err.message : "分配失败");
    }
  }

  // Get pending/in_progress tasks that can be assigned
  const availableTasks = tasks.filter(t => !t.assignee && (t.status === "pending" || t.status === "in_progress"));

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold">Worker 管理</h2>
        <button
          onClick={() => (window.location.href = `/teams/${teamId}/workers/new`)}
          className="px-3 py-1.5 bg-green-400 text-white rounded hover:bg-green-500 text-sm"
        >
          + 添加 Worker
        </button>
      </div>

      {workers.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <p>还没有 Worker</p>
          <button
            onClick={() => (window.location.href = `/teams/${teamId}/workers/new`)}
            className="mt-4 px-4 py-2 bg-green-400 text-white rounded hover:bg-green-500"
          >
            添加第一个 Worker
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {workers.map((worker) => (
            <div key={worker.id} className="p-4 bg-white border border-gray-200 rounded-lg">
              <div className="flex items-start gap-4">
                <span className="text-3xl">{getCLImoji(worker.config.cli)}</span>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold">{worker.name}</h3>
                    <span className={`px-2 py-0.5 text-xs rounded ${getStatusColor(worker.status)}`}>
                      {getStatusLabel(worker.status)}
                    </span>
                    <span className="text-xs text-gray-500">({worker.role})</span>
                  </div>
                  <p className="text-sm text-gray-600 mt-1">
                    {getCLIName(worker.config.cli)} · {worker.config.backend} · {worker.config.execution_mode}
                  </p>
                  {worker.config.workdir && (
                    <p className="text-xs text-gray-500 mt-1">📁 {worker.config.workdir}</p>
                  )}

                  {/* Current Task */}
                  {worker.current_task && (
                    <div className="mt-3 p-2 bg-gray-100 rounded">
                      <p className="text-sm font-medium">当前任务: {worker.current_task.subject}</p>
                      {worker.current_task.execution?.progress !== undefined && (
                        <div className="mt-1">
                          <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-blue-400"
                              style={{ width: `${worker.current_task.execution.progress}%` }}
                            />
                          </div>
                          <p className="text-xs text-gray-500 mt-1">{worker.current_task.execution.progress}%</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Stats */}
                  <div className="flex gap-4 mt-3 text-sm">
                    <span className="text-green-400">✅ {worker.completed_tasks} 完成</span>
                    {worker.failed_tasks > 0 && (
                      <span className="text-red-400">❌ {worker.failed_tasks} 失败</span>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 mt-3 flex-wrap">
                    {/* Assign button - shown when worker has no current task */}
                    {!worker.current_task && availableTasks.length > 0 && (
                      <div className="relative">
                        <button
                          onClick={() => setShowAssignMenu({...showAssignMenu, [worker.id]: !showAssignMenu[worker.id]})}
                          className="px-3 py-1 bg-purple-600 rounded hover:bg-purple-700 text-sm"
                        >
                          📋 分配任务
                        </button>
                        {showAssignMenu[worker.id] && (
                          <div className="absolute left-0 top-full mt-1 bg-gray-200 border border-gray-300 rounded shadow-lg z-10 min-w-[200px]">
                            <div className="px-3 py-2 text-xs text-gray-600 border-b border-gray-300">选择任务:</div>
                            {availableTasks.map((task) => (
                              <button
                                key={task.id}
                                onClick={() => assignTaskToWorker(worker.id, task.id)}
                                className="block w-full text-left px-3 py-2 text-sm hover:bg-gray-200 border-b border-gray-300 last:border-b-0"
                              >
                                <span className={`inline-block w-2 h-2 rounded-full mr-2 ${
                                  task.status === "in_progress" ? "bg-blue-400" : "bg-yellow-500"
                                }`} />
                                {task.subject}
                              </button>
                            ))}
                            <button
                              onClick={() => setShowAssignMenu({...showAssignMenu, [worker.id]: false})}
                              className="block w-full text-left px-3 py-2 text-sm text-gray-500 hover:bg-gray-200 border-t border-gray-300"
                            >
                              取消
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    {worker.current_task && worker.status === "busy" && (
                      <>
                        <button
                          onClick={() => executeTask(worker.id)}
                          className="px-3 py-1 bg-blue-400 text-white rounded hover:bg-blue-500 text-sm"
                        >
                          ▶️ 执行
                        </button>
                        <button
                          onClick={() => completeTask(worker.id)}
                          className="px-3 py-1 bg-green-400 text-white rounded hover:bg-green-500 text-sm"
                        >
                          ✅ 完成
                        </button>
                      </>
                    )}
                    <button
                      onClick={() => terminateWorker(worker.id)}
                      className="px-3 py-1 bg-red-100 text-red-700 rounded hover:bg-red-200 text-sm"
                    >
                      终止
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============ Messages Panel ============
function MessagesPanel({ messages: initialMessages, teamId, onUpdate }: { messages: Message[]; teamId: string; onUpdate: () => void }) {
  const [messages, setMessages] = useState<Message[]>(initialMessages || []);
  const [loading, setLoading] = useState(false);
  const [sendTo, setSendTo] = useState("");
  const [content, setContent] = useState("");

  useEffect(() => {
    loadMessages();
  }, [teamId]);

  async function loadMessages() {
    try {
      const res = await messagesAPI.list(teamId);
      setMessages((res as { messages: Message[] }).messages);
    } catch (err) {
      console.error("Failed to load messages:", err);
    }
  }

  async function sendMessage() {
    if (!sendTo || !content) return;
    setLoading(true);
    try {
      await messagesAPI.send(teamId, sendTo, content);
      setContent("");
      loadMessages();
    } catch (err) {
      alert(err instanceof Error ? err.message : "发送失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <h2 className="text-xl font-semibold mb-4">消息中心</h2>

      {/* Send Message Form */}
      <div className="mb-6 p-4 bg-white border border-gray-200 rounded-lg">
        <div className="flex gap-2 mb-2">
          <input
            type="text"
            placeholder="发送给 (Worker 名称)"
            value={sendTo}
            onChange={(e) => setSendTo(e.target.value)}
            className="flex-1 p-2 bg-gray-100 border border-gray-300 rounded"
          />
        </div>
        <textarea
          placeholder="消息内容..."
          value={content}
          onChange={(e) => setContent(e.target.value)}
          className="w-full p-2 bg-gray-100 border border-gray-300 rounded mb-2"
          rows={3}
        />
        <button
          onClick={sendMessage}
          disabled={loading || !sendTo || !content}
          className="px-4 py-2 bg-blue-400 text-white rounded hover:bg-blue-500 disabled:opacity-50"
        >
          {loading ? "发送中..." : "发送"}
        </button>
      </div>

      {/* Messages List */}
      <div className="space-y-2">
        {messages.length === 0 ? (
          <div className="text-center py-8 text-gray-500">暂无消息</div>
        ) : (
          messages.map((msg) => (
            <div key={msg.id} className="p-3 bg-white border border-gray-200 rounded">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm">
                  <span className="text-gray-600">{msg.from_agent}</span>
                  <span className="text-gray-500"> → </span>
                  <span className="text-gray-600">{msg.to_agent}</span>
                </span>
                <span className="text-xs text-gray-500">{formatRelativeTime(msg.created_at)}</span>
              </div>
              <p className="text-sm">{msg.content}</p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ============ Settings Panel ============
function SettingsPanel({ team, onUpdate }: { team: Team; onUpdate: () => void }) {
  const router = useRouter();
  const [name, setName] = useState(team.name);
  const [description, setDescription] = useState(team.description || "");
  const [workdir, setWorkdir] = useState(team.workdir || "");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await teamsAPI.update(team.id, {
        name: name !== team.name ? name : undefined,
        description: description !== (team.description || "") ? description : undefined,
        workdir: workdir !== (team.workdir || "") ? workdir : undefined,
      });
      onUpdate();
    } catch (err) {
      alert(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  async function deleteTeam() {
    if (!confirm(`确定要删除团队 "${team.name}" 吗？此操作不可恢复！`)) return;
    setDeleting(true);
    try {
      await teamsAPI.delete(team.id);
      router.push("/");
    } catch (err) {
      alert(err instanceof Error ? err.message : "删除失败");
      setDeleting(false);
    }
  }

  return (
    <div>
      <h2 className="text-xl font-semibold mb-4">团队设置</h2>

      <div className="max-w-xl space-y-4">
        <div>
          <label className="block text-sm text-gray-600 mb-1">团队名称</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full p-2 bg-white border border-gray-300 rounded"
          />
        </div>

        <div>
          <label className="block text-sm text-gray-600 mb-1">描述</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full p-2 bg-white border border-gray-300 rounded"
            rows={3}
          />
        </div>

        <div>
          <label className="block text-sm text-gray-600 mb-1">工作目录</label>
          <input
            type="text"
            value={workdir}
            onChange={(e) => setWorkdir(e.target.value)}
            placeholder="所有 Worker 的默认工作目录"
            className="w-full p-2 bg-white border border-gray-300 rounded"
          />
          <p className="text-xs text-gray-500 mt-1">如果不指定，Worker 会在 ~/.clawteam/workspaces/ 下创建独立目录</p>
        </div>

        <button
          onClick={save}
          disabled={saving}
          className="px-4 py-2 bg-blue-400 text-white rounded hover:bg-blue-500 disabled:opacity-50"
        >
          {saving ? "保存中..." : "保存"}
        </button>
      </div>

      {/* Danger Zone */}
      <div className="max-w-xl mt-8 pt-6 border-t border-gray-200">
        <h3 className="text-lg font-semibold text-red-600 mb-2">危险区域</h3>
        <p className="text-sm text-gray-600 mb-4">
          删除团队将永久删除团队及其所有任务、Worker 和消息。此操作不可恢复。
        </p>
        <button
          onClick={deleteTeam}
          disabled={deleting}
          className="px-4 py-2 bg-red-100 text-red-700 border border-red-300 rounded hover:bg-red-200 disabled:opacity-50"
        >
          {deleting ? "删除中..." : "删除团队"}
        </button>
      </div>
    </div>
  );
}
