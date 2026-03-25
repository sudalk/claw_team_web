"use client";

import { use, useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { tasksAPI, workersAPI } from "@/lib/api";
import type { Task, Worker } from "@/lib/types";
import { getCLImoji, getCLIName } from "@/lib/utils";

export default function CreateTaskPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: teamId } = use(params);
  const router = useRouter();
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [existingTasks, setExistingTasks] = useState<Task[]>([]);
  const [showBlockSelect, setShowBlockSelect] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    subject: "",
    description: "",
    priority: "medium",
    assignee_id: "",
    workdir: "",
    blocked_by: [] as string[],
  });
  const [error, setError] = useState<string | null>(null);

  // Load workers and existing tasks on mount
  useEffect(() => {
    workersAPI.list(teamId).then((res) => {
      setWorkers(((res as unknown) as { workers: Worker[] }).workers.filter((w: Worker) => w.status !== "terminated"));
    }).catch(console.error);
    tasksAPI.list(teamId).then((res) => {
      setExistingTasks(((res as unknown) as { tasks: Task[] }).tasks.filter((t: Task) => t.status !== "completed" && t.status !== "failed"));
    }).catch(console.error);
  }, [teamId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.subject.trim()) {
      setError("请输入任务标题");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await tasksAPI.create(teamId, {
        subject: form.subject.trim(),
        description: form.description.trim() || undefined,
        priority: form.priority,
        assignee_id: form.assignee_id || undefined,
        workdir: form.workdir || undefined,
        blocked_by: form.blocked_by.length > 0 ? form.blocked_by : undefined,
      });
      window.location.href = `/teams/${teamId}`;
    } catch (err) {
      setError(err instanceof Error ? err.message : "创建失败");
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen p-8 max-w-2xl mx-auto">
      <Link href={`/teams/${teamId}`} className="text-blue-400 hover:underline text-sm mb-4 inline-block">
        ← 返回
      </Link>

      <h1 className="text-2xl font-bold mb-6">创建新任务</h1>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Task Info */}
        <div className="p-4 bg-white border border-gray-200 rounded-lg">
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-gray-600 mb-1">任务标题 *</label>
              <input
                type="text"
                value={form.subject}
                onChange={(e) => setForm({ ...form, subject: e.target.value })}
                placeholder="例如: 实现用户登录功能"
                className="w-full p-3 bg-gray-100 border border-gray-300 rounded-lg"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-600 mb-1">详细描述</label>
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="描述任务的具体要求、实现细节..."
                className="w-full p-3 bg-gray-100 border border-gray-300 rounded-lg"
                rows={6}
              />
            </div>
          </div>
        </div>

        {/* Priority */}
        <div className="p-4 bg-white border border-gray-200 rounded-lg">
          <h2 className="font-semibold mb-4">优先级</h2>
          <div className="grid grid-cols-3 gap-3">
            {[
              { value: "low", label: "低", color: "text-gray-600" },
              { value: "medium", label: "中", color: "text-yellow-400" },
              { value: "high", label: "高", color: "text-red-400" },
            ].map(({ value, label, color }) => (
              <button
                key={value}
                type="button"
                onClick={() => setForm({ ...form, priority: value })}
                className={`p-3 rounded-lg border-2 transition-all ${
                  form.priority === value
                    ? `border-blue-500 bg-blue-50 ${color}`
                    : "border-gray-300 bg-gray-50 hover:border-[#444]"
                }`}
              >
                <div className="font-medium">{label}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Assignment */}
        <div className="p-4 bg-white border border-gray-200 rounded-lg">
          <h2 className="font-semibold mb-4">分配给</h2>
          {workers.length === 0 ? (
            <div className="text-center py-4 text-gray-500">
              <p>还没有可用的 Worker</p>
              <Link href={`/teams/${teamId}/workers/new`} className="text-blue-400 hover:underline text-sm">
                添加 Worker →
              </Link>
            </div>
          ) : (
            <div className="space-y-2">
              <label className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100">
                <input
                  type="radio"
                  name="assignee"
                  checked={form.assignee_id === ""}
                  onChange={() => setForm({ ...form, assignee_id: "" })}
                  className="w-4 h-4"
                />
                <div>
                  <div className="font-medium">不分配</div>
                  <div className="text-xs text-gray-600">稍后手动分配</div>
                </div>
              </label>
              {workers.map((worker) => (
                <label
                  key={worker.id}
                  className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100"
                >
                  <input
                    type="radio"
                    name="assignee"
                    checked={form.assignee_id === worker.id}
                    onChange={() => setForm({ ...form, assignee_id: worker.id })}
                    className="w-4 h-4"
                  />
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{getCLImoji(worker.config.cli)}</span>
                    <div>
                      <div className="font-medium">{worker.name}</div>
                      <div className="text-xs text-gray-600">
                        {getCLIName(worker.config.cli)} · {worker.role}
                      </div>
                    </div>
                  </div>
                </label>
              ))}
            </div>
          )}
        </div>

        {/* Workdir */}
        <div className="p-4 bg-white border border-gray-200 rounded-lg">
          <h2 className="font-semibold mb-4">工作目录 (可选)</h2>
          <input
            type="text"
            value={form.workdir}
            onChange={(e) => setForm({ ...form, workdir: e.target.value })}
            placeholder="任务特定的工作目录"
            className="w-full p-3 bg-gray-100 border border-gray-300 rounded-lg"
          />
          <p className="text-xs text-gray-500 mt-2">
            如果不指定，Worker 将使用其默认工作目录。
          </p>
        </div>

        {/* Dependencies */}
        <div className="p-4 bg-white border border-gray-200 rounded-lg">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">任务依赖 (可选)</h2>
            <button
              type="button"
              onClick={() => setShowBlockSelect(!showBlockSelect)}
              className="text-sm text-blue-400 hover:underline"
            >
              {showBlockSelect ? "收起" : "添加依赖"}
            </button>
          </div>
          {form.blocked_by.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-3">
              {form.blocked_by.map((id) => {
                const task = existingTasks.find((t) => t.id === id);
                return (
                  <span key={id} className="px-2 py-1 bg-blue-50 border border-blue-200 rounded text-sm flex items-center gap-1">
                    {task?.subject?.slice(0, 20) || id}
                    <button
                      onClick={() => setForm({ ...form, blocked_by: form.blocked_by.filter((b) => b !== id) })}
                      className="text-gray-600 hover:text-gray-900 ml-1"
                    >
                      ×
                    </button>
                  </span>
                );
              })}
            </div>
          )}
          {showBlockSelect && (
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {existingTasks.length === 0 ? (
                <p className="text-gray-500 text-sm">暂无可依赖的任务</p>
              ) : (
                existingTasks
                  .filter((t) => !form.blocked_by.includes(t.id))
                  .map((task) => (
                    <label
                      key={task.id}
                      className="flex items-center gap-3 p-2 bg-gray-50 rounded cursor-pointer hover:bg-gray-100"
                    >
                      <input
                        type="checkbox"
                        checked={form.blocked_by.includes(task.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setForm({ ...form, blocked_by: [...form.blocked_by, task.id] });
                          } else {
                            setForm({ ...form, blocked_by: form.blocked_by.filter((b) => b !== task.id) });
                          }
                        }}
                        className="w-4 h-4"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{task.subject}</div>
                        <div className="text-xs text-gray-500">
                          <span className={`inline-block w-2 h-2 rounded-full mr-1 ${
                            task.status === "in_progress" ? "bg-blue-400" :
                            task.status === "pending" ? "bg-yellow-500" :
                            task.status === "blocked" ? "bg-red-500" : "bg-gray-500"
                          }`} />
                          {task.status === "in_progress" ? "进行中" :
                           task.status === "pending" ? "待办" :
                           task.status === "blocked" ? "阻塞" : task.status}
                        </div>
                      </div>
                    </label>
                  ))
              )}
            </div>
          )}
          <p className="text-xs text-gray-500 mt-2">
            此任务将在所选依赖任务全部完成后才能开始执行。
          </p>
        </div>

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-600">
            {error}
          </div>
        )}

        <div className="flex gap-3">
          <Link href={`/teams/${teamId}`} className="px-6 py-3 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400">
            取消
          </Link>
          <button
            type="submit"
            disabled={loading}
            className="px-6 py-3 bg-blue-400 text-white rounded-lg hover:bg-blue-500 disabled:opacity-50"
          >
            {loading ? "创建中..." : "创建任务"}
          </button>
        </div>
      </form>
    </div>
  );
}
