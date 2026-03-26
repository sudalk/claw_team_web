"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { autoAPI } from "@/lib/api";
import type { ExecutionRecord } from "@/lib/types";
import { PromptInput } from "@/components/auto/PromptInput";
import { ExecutionLogPanel } from "@/components/auto/ExecutionLog";

const SESSIONS_KEY = "clawteam_auto_sessions";
const SELECTED_SESSION_KEY = "clawteam_auto_selected";

interface Session {
  id: string;
  prompt: string;
  team_id: string;
  status: string;
  created_at: string;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟前`;
  if (hours < 24) return `${hours} 小时前`;
  if (days < 7) return `${days} 天前`;
  return date.toLocaleDateString("zh-CN");
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { color: string; bg: string; label: string }> = {
    running: { color: "text-green-600", bg: "bg-green-500", label: "执行中" },
    completed: { color: "text-blue-600", bg: "bg-blue-500", label: "已完成" },
    failed: { color: "text-red-600", bg: "bg-red-500", label: "失败" },
    stopped: { color: "text-yellow-600", bg: "bg-yellow-500", label: "已停止" },
    pending: { color: "text-gray-600", bg: "bg-gray-500", label: "待处理" },
  };
  const c = config[status] || config.pending;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${c.color}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.bg} ${status === "running" ? "animate-pulse" : ""}`} />
      {c.label}
    </span>
  );
}

export default function AutoModePage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSessions();
    const saved = localStorage.getItem(SELECTED_SESSION_KEY);
    if (saved) setSelectedId(saved);
  }, []);

  async function loadSessions() {
    try {
      const res = await autoAPI.list();
      const list: Session[] = res.executions.map((e: ExecutionRecord) => ({
        id: e.id,
        prompt: e.prompt,
        team_id: e.team_id || "",
        status: e.status,
        created_at: e.created_at,
      }));
      list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setSessions(list);
    } catch (e) {
      console.error("Failed to load sessions:", e);
    } finally {
      setLoading(false);
    }
  }

  function selectSession(id: string) {
    setSelectedId(id);
    localStorage.setItem(SELECTED_SESSION_KEY, id);
  }

  function handleStart(teamId: string, executionId: string, prompt: string) {
    const newSession: Session = {
      id: executionId,
      prompt,
      team_id: teamId,
      status: "running",
      created_at: new Date().toISOString(),
    };
    setSessions(prev => [newSession, ...prev]);
    selectSession(executionId);
    loadSessions();
  }

  function handleComplete() {
    loadSessions();
  }

  const selectedSession = sessions.find(s => s.id === selectedId);

  return (
    <div className="h-screen flex overflow-hidden bg-gray-100">
      {/* 左侧边栏 */}
      <aside className="w-64 flex-shrink-0 bg-white border-r border-gray-200 flex flex-col">
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-lg font-bold text-gray-900">自动模式</h1>
            <Link href="/" className="text-xs text-gray-500 hover:text-gray-700">返回</Link>
          </div>
          <button
            onClick={() => { setSelectedId(null); localStorage.removeItem(SELECTED_SESSION_KEY); }}
            className="w-full px-3 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium rounded-lg transition-colors"
          >
            + 新建任务
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-4 text-center text-gray-500 text-sm">加载中...</div>
          ) : sessions.length === 0 ? (
            <div className="p-4 text-center text-gray-400 text-sm">暂无任务记录</div>
          ) : (
            <div className="py-2">
              {sessions.map(session => (
                <button
                  key={session.id}
                  onClick={() => selectSession(session.id)}
                  className={`w-full px-4 py-3 text-left border-b border-gray-100 transition-colors ${
                    selectedId === session.id
                      ? "bg-blue-50 border-l-4 border-l-blue-500"
                      : "hover:bg-gray-50 border-l-4 border-l-transparent"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <StatusBadge status={session.status} />
                    <span className="text-xs text-gray-400">{formatDate(session.created_at)}</span>
                  </div>
                  <p className="text-sm text-gray-700 line-clamp-2 leading-snug">
                    {session.prompt}
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>
      </aside>

      {/* 主内容区 */}
      <main className="flex-1 flex overflow-hidden">
        {selectedSession ? (
          <SessionView session={selectedSession} onComplete={handleComplete} />
        ) : (
          <NewTaskView onStart={handleStart} />
        )}

        {/* 右侧 - 执行日志 */}
        {selectedSession && (
          <aside className="w-[500px] flex-shrink-0 bg-white border-l border-gray-200 flex flex-col">
            <div className="p-4 border-b border-gray-200">
              <h2 className="font-semibold text-gray-900">执行日志</h2>
              <p className="text-xs text-gray-500 mt-0.5">实时任务执行状态</p>
            </div>
            <div className="flex-1 overflow-hidden">
              <ExecutionLogPanel
                identifier={selectedSession.team_id || selectedSession.id}
                onComplete={handleComplete}
              />
            </div>
          </aside>
        )}
      </main>
    </div>
  );
}

// 新建任务视图
function NewTaskView({ onStart }: { onStart: (teamId: string, executionId: string, prompt: string) => void }) {
  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-2xl">
        <div className="mb-6">
          <h2 className="text-xl font-bold text-gray-900 mb-1">创建新任务</h2>
          <p className="text-sm text-gray-500">描述你的需求，AI 将自动规划和执行</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
          <PromptInput onStart={onStart} />
        </div>
      </div>
    </div>
  );
}

// 会话详情视图
function SessionView({ session, onComplete }: { session: Session; onComplete: () => void }) {
  const [record, setRecord] = useState<ExecutionRecord | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadRecord();
  }, [session.id]);

  async function loadRecord() {
    try {
      const res = await autoAPI.getStatus(session.id);
      setRecord(res);
    } catch (e) {
      console.error("Failed to load record:", e);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900">任务详情</h2>
            <div className="flex items-center gap-3 mt-2">
              <StatusBadge status={session.status} />
              <span className="text-sm text-gray-400">{formatDate(session.created_at)}</span>
            </div>
          </div>
          <div className="flex gap-2">
            {session.team_id && (
              <Link
                href={`/teams/${session.team_id}`}
                className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors"
              >
                查看团队
              </Link>
            )}
            {session.status === "running" && (
              <button
                onClick={async () => {
                  if (!confirm("确定要停止执行吗？")) return;
                  try {
                    await autoAPI.stop(session.id);
                    onComplete();
                  } catch {
                    alert("停止失败");
                  }
                }}
                className="px-3 py-1.5 text-sm bg-red-100 hover:bg-red-200 text-red-700 rounded-lg transition-colors"
              >
                停止
              </button>
            )}
          </div>
        </div>

        {/* Prompt */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <h3 className="text-sm font-medium text-gray-500 mb-3">需求描述</h3>
          <p className="text-gray-900 leading-relaxed">{session.prompt}</p>
        </div>

        {/* Stats */}
        {!loading && record && (
          <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
            <h3 className="text-sm font-medium text-gray-500 mb-3">执行统计</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatCard label="总任务" value={record.total_tasks} color="gray" />
              <StatCard label="已完成" value={record.completed_tasks} color="green" />
              <StatCard label="失败" value={record.failed_tasks} color="red" />
              <StatCard label="进行中" value={record.total_tasks - record.completed_tasks - record.failed_tasks} color="blue" />
            </div>
          </div>
        )}

        {/* Progress */}
        {!loading && record && record.total_tasks > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700">执行进度</span>
              <span className="text-sm text-gray-500">{record.progress_percent}%</span>
            </div>
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 rounded-full transition-all"
                style={{ width: `${record.progress_percent}%` }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  const colors: Record<string, string> = {
    gray: "bg-gray-100 text-gray-700",
    green: "bg-green-100 text-green-700",
    red: "bg-red-100 text-red-700",
    blue: "bg-blue-100 text-blue-700",
  };
  return (
    <div className={`rounded-lg p-3 ${colors[color]}`}>
      <div className="text-xl font-bold">{value}</div>
      <div className="text-xs opacity-75">{label}</div>
    </div>
  );
}
