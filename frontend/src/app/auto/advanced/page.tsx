"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { autoAPI } from "@/lib/api";
import type { ExecutionRecord } from "@/lib/types";
import { AdvancedPromptInput } from "@/components/auto/AdvancedPromptInput";
import { ExecutionLogPanel } from "@/components/auto/ExecutionLog";

const SESSIONS_KEY = "clawteam_adv_sessions";
const SELECTED_SESSION_KEY = "clawteam_adv_selected";

interface Session {
  id: string;
  prompt: string;
  team_id: string;
  workdir?: string | null;
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

export default function AdvancedAutoModePage() {
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
      // Only keep advanced executions (team_id starts with auto-adv-)
      const list: Session[] = res.executions
        .filter((e: ExecutionRecord) => e.team_id?.startsWith("auto-adv-"))
        .map((e: ExecutionRecord) => ({
          id: e.id,
          prompt: e.prompt,
          team_id: e.team_id || "",
          workdir: e.workdir,
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
      {/* 左侧边栏 - 会话列表 */}
      <aside className="flex-[2] bg-white border-r border-gray-200 flex flex-col">
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-lg font-bold text-gray-900">进阶自动模式</h1>
            <Link href="/" className="text-xs text-gray-500 hover:text-gray-700">返回</Link>
          </div>
          <button
            onClick={() => { setSelectedId(null); localStorage.removeItem(SELECTED_SESSION_KEY); }}
            className="w-full px-3 py-2 bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-600 hover:to-orange-600 text-white text-sm font-medium rounded-lg transition-colors"
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
                <div
                  key={session.id}
                  className={`group border-b border-gray-100 transition-colors ${
                    selectedId === session.id
                      ? "bg-yellow-50 border-l-4 border-l-yellow-500"
                      : "hover:bg-gray-50 border-l-4 border-l-transparent"
                  }`}
                >
                  <button
                    onClick={() => selectSession(session.id)}
                    className="w-full px-4 py-3 text-left"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <StatusBadge status={session.status} />
                      <span className="text-xs text-gray-400">{formatDate(session.created_at)}</span>
                    </div>
                    <p className="text-sm text-gray-700 line-clamp-2 leading-snug">
                      {session.prompt}
                    </p>
                  </button>
                  <button
                    onClick={async (e) => {
                      e.stopPropagation();
                      if (!confirm("确定要删除这条执行记录吗？")) return;
                      try {
                        await autoAPI.delete(session.id);
                        if (selectedId === session.id) {
                          setSelectedId(null);
                          localStorage.removeItem(SELECTED_SESSION_KEY);
                        }
                        loadSessions();
                      } catch {
                        alert("删除失败");
                      }
                    }}
                    className="w-full px-4 py-1.5 text-xs text-red-500 hover:bg-red-50 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity text-left"
                  >
                    🗑️ 删除
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </aside>

      {/* 选中会话时：任务详情 + 执行日志 */}
      {selectedSession ? (
        <>
          <div className="flex-[4] overflow-hidden">
            <SessionView session={selectedSession} onComplete={handleComplete} />
          </div>
          <aside className="flex-[4] bg-gray-50 border-l border-gray-200 flex flex-col">
            <div className="p-4 border-b border-gray-200 bg-white">
              <h2 className="font-semibold text-gray-900">Agent 内心活动与执行日志</h2>
              <p className="text-xs text-gray-500 mt-0.5">实时 ReAct 推理日志</p>
            </div>
            <div className="flex-1 overflow-hidden p-4">
              {/* 复用现有的日志板 */}
              <div className="h-full bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <ExecutionLogPanel
                  identifier={selectedSession.team_id || selectedSession.id}
                  initialStatus={selectedSession.status}
                  onComplete={handleComplete}
                />
              </div>
            </div>
          </aside>
        </>
      ) : (
        /* 未选中时：新建任务占满剩余空间 */
        <div className="flex-[8] overflow-hidden">
          <NewTaskView onStart={handleStart} />
        </div>
      )}
    </div>
  );
}

// 新建任务视图
function NewTaskView({ onStart }: { onStart: (teamId: string, executionId: string, prompt: string) => void }) {
  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-2xl mx-auto mt-10">
        <div className="text-center mb-8">
          <span className="text-6xl mb-4 block">⚡</span>
          <h2 className="text-3xl font-bold text-gray-900 mb-2">进阶自动模式 (ReAct)</h2>
          <p className="text-gray-500">Agent 直接进入思考和执行循环，使用原生底层工具流自主开发代码</p>
        </div>
        <div className="bg-white rounded-xl border border-yellow-200 p-6 shadow-lg shadow-yellow-100/50">
          <AdvancedPromptInput onStart={onStart} />
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
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">推导详情</h2>
            <div className="flex items-center gap-3 mt-2">
              <StatusBadge status={session.status} />
              <span className="text-sm text-gray-400">始于 {formatDate(session.created_at)}</span>
            </div>
          </div>
          <div className="flex gap-2">
            {session.status === "running" && (
              <button
                onClick={async () => {
                  if (!confirm("确定要停止运行吗？")) return;
                  try {
                    await autoAPI.stop(session.id);
                    onComplete();
                  } catch {
                    alert("停止失败");
                  }
                }}
                className="px-4 py-2 text-sm bg-red-100 hover:bg-red-200 text-red-700 rounded-lg transition-colors font-medium"
              >
                ■ 强制停止
              </button>
            )}
            <Link
              href={`/workspace?path=${encodeURIComponent(session.workdir || (session.team_id ? `workspaces/${session.team_id}` : ""))}`}
              className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors text-sm font-medium flex items-center gap-2 shadow-sm"
            >
              <span>📂</span> 查看工作空间
            </Link>
          </div>
        </div>

        {/* Prompt */}
        <div className="bg-gradient-to-br from-yellow-50 to-orange-50 rounded-xl border border-yellow-200 p-6 shadow-sm text-yellow-900">
          <h3 className="text-xs font-bold uppercase tracking-wider text-yellow-600 mb-3">目标需求</h3>
          <p className="text-base leading-relaxed whitespace-pre-wrap">{session.prompt}</p>
        </div>

        {/* Stats */}
        {!loading && record && (
          <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-4">执行链路统计</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {/* Since we don't decompose into tasks, we just show macro stats */}
              <StatCard label="总动作数" value={record.logs.filter(l => l.type === 'step').length} color="blue" />
              <StatCard label="工具调用" value={record.logs.filter(l => l.step === 'tool_result').length} color="green" />
              <StatCard label="推理轮次" value={record.logs.filter(l => l.step === 'thinking').length} color="gray" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  const colors: Record<string, string> = {
    gray: "bg-gray-100 text-gray-700 border-gray-200",
    green: "bg-green-50 text-green-700 border-green-200",
    red: "bg-red-50 text-red-700 border-red-200",
    blue: "bg-blue-50 text-blue-700 border-blue-200",
  };
  return (
    <div className={`rounded-xl px-4 py-3 border ${colors[color]}`}>
      <div className="text-2xl font-bold mb-1">{value}</div>
      <div className="text-xs font-medium opacity-80 uppercase tracking-widest">{label}</div>
    </div>
  );
}
