"use client";

import { useState, useEffect, useRef } from "react";
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

function getStatusBadge(status: string) {
  switch (status) {
    case "running":
      return <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />;
    case "completed":
      return <span className="w-2 h-2 bg-blue-500 rounded-full" />;
    case "failed":
      return <span className="w-2 h-2 bg-red-500 rounded-full" />;
    case "stopped":
      return <span className="w-2 h-2 bg-yellow-500 rounded-full" />;
    default:
      return <span className="w-2 h-2 bg-gray-400 rounded-full" />;
  }
}

export default function AutoModePage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // 加载会话
  useEffect(() => {
    loadSessions();
  }, []);

  // 加载选中状态
  useEffect(() => {
    const saved = localStorage.getItem(SELECTED_SESSION_KEY);
    if (saved) {
      setSelectedId(saved);
    }
  }, []);

  async function loadSessions() {
    try {
      const res = await autoAPI.list();
      const sessionList: Session[] = res.executions.map((e: ExecutionRecord) => ({
        id: e.id,
        prompt: e.prompt,
        team_id: e.team_id || "",
        status: e.status,
        created_at: e.created_at,
      }));
      // 按时间倒序
      sessionList.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setSessions(sessionList);
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
    setSessions((prev) => [newSession, ...prev]);
    selectSession(executionId);
    loadSessions();
  }

  function handleComplete() {
    loadSessions();
  }

  const selectedSession = sessions.find((s) => s.id === selectedId);

  return (
    <div className="min-h-screen flex bg-gray-50">
      {/* 左侧边栏 - 会话列表 */}
      <div className="w-80 border-r border-gray-200 bg-white flex flex-col h-screen sticky top-0">
        {/* Header */}
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-lg font-bold">自动模式</h1>
            <Link href="/" className="text-sm text-gray-500 hover:text-gray-700">
              ← 返回
            </Link>
          </div>
          <button
            onClick={() => {
              setSelectedId(null);
              localStorage.removeItem(SELECTED_SESSION_KEY);
            }}
            className="w-full px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors flex items-center justify-center gap-2"
          >
            <span>+</span>
            <span>新建会话</span>
          </button>
        </div>

        {/* Sessions List */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-4 text-center text-gray-500">加载中...</div>
          ) : sessions.length === 0 ? (
            <div className="p-4 text-center text-gray-500">暂无会话记录</div>
          ) : (
            <div className="py-2">
              {sessions.map((session) => (
                <button
                  key={session.id}
                  onClick={() => selectSession(session.id)}
                  className={`w-full px-4 py-3 text-left hover:bg-gray-50 border-b border-gray-100 transition-colors ${
                    selectedId === session.id ? "bg-blue-50 border-l-4 border-l-blue-500" : ""
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    {getStatusBadge(session.status)}
                    <span className={`text-sm font-medium ${
                      session.status === "running" ? "text-green-600" :
                      session.status === "failed" ? "text-red-600" :
                      "text-gray-700"
                    }`}>
                      {session.status === "running" ? "执行中" :
                       session.status === "completed" ? "已完成" :
                       session.status === "failed" ? "失败" :
                       session.status === "stopped" ? "已停止" : "待处理"}
                    </span>
                    <span className="text-xs text-gray-400 ml-auto">
                      {formatDate(session.created_at)}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 truncate">
                    {session.prompt.slice(0, 50)}{session.prompt.length > 50 ? "..." : ""}
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 主内容区 */}
      <div className="flex-1 flex">
        {/* 左侧 - 新建或详情 */}
        <div className="flex-1 p-8 max-w-2xl">
          {selectedSession ? (
            <SessionDetail session={selectedSession} onComplete={handleComplete} />
          ) : (
            <NewSession onStart={handleStart} />
          )}
        </div>

        {/* 右侧 - 执行日志 */}
        {selectedSession && (
          <div className="w-[500px] border-l border-gray-200 bg-white p-6 h-screen sticky top-0 overflow-hidden">
            <h2 className="text-lg font-semibold mb-4">执行日志</h2>
            <ExecutionLogPanel
              identifier={selectedSession.team_id || selectedSession.id}
              onComplete={handleComplete}
            />
          </div>
        )}
      </div>
    </div>
  );
}

// 新建会话组件
function NewSession({ onStart }: { onStart: (teamId: string, executionId: string, prompt: string) => void }) {
  return (
    <div className="max-w-2xl mx-auto">
      <div className="text-center mb-8">
        <span className="text-6xl mb-4 block">🤖</span>
        <h2 className="text-2xl font-bold mb-2">新建自动任务</h2>
        <p className="text-gray-600">
          描述你想要实现的功能，AI 将自动拆解任务、创建团队并执行开发
        </p>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
        <PromptInput
          onStart={(teamId, executionId, prompt) => onStart(teamId, executionId, prompt)}
        />
      </div>
    </div>
  );
}

// 会话详情组件
function SessionDetail({ session, onComplete }: { session: Session; onComplete: () => void }) {
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
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <h2 className="text-xl font-bold mb-2">任务详情</h2>
        <div className="flex items-center gap-3">
          {getStatusBadge(session.status)}
          <span className={`font-medium ${
            session.status === "running" ? "text-green-600" :
            session.status === "failed" ? "text-red-600" :
            "text-gray-700"
          }`}>
            {session.status === "running" ? "执行中" :
             session.status === "completed" ? "已完成" :
             session.status === "failed" ? "失败" :
             session.status === "stopped" ? "已停止" : "待处理"}
          </span>
        </div>
      </div>

      {/* Prompt */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 mb-6">
        <h3 className="text-sm font-medium text-gray-500 mb-2">需求描述</h3>
        <p className="text-gray-900 whitespace-pre-wrap">{session.prompt}</p>
      </div>

      {/* Stats */}
      {record && (
        <div className="bg-white border border-gray-200 rounded-xl p-6 mb-6">
          <h3 className="text-sm font-medium text-gray-500 mb-4">执行统计</h3>
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center p-3 bg-gray-50 rounded-lg">
              <div className="text-2xl font-bold text-blue-600">{record.total_tasks}</div>
              <div className="text-sm text-gray-500">总任务</div>
            </div>
            <div className="text-center p-3 bg-gray-50 rounded-lg">
              <div className="text-2xl font-bold text-green-600">{record.completed_tasks}</div>
              <div className="text-sm text-gray-500">已完成</div>
            </div>
            <div className="text-center p-3 bg-gray-50 rounded-lg">
              <div className="text-2xl font-bold text-red-600">{record.failed_tasks}</div>
              <div className="text-sm text-gray-500">失败</div>
            </div>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3">
        {session.team_id && (
          <Link
            href={`/teams/${session.team_id}`}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
          >
            查看团队 →
          </Link>
        )}
        {session.status === "running" && (
          <button
            onClick={async () => {
              if (!confirm("确定要停止执行吗？")) return;
              try {
                await autoAPI.stop(session.id);
                onComplete();
              } catch (e) {
                alert("停止失败");
              }
            }}
            className="px-4 py-2 bg-red-100 text-red-700 border border-red-300 rounded-lg hover:bg-red-200 transition-colors"
          >
            停止执行
          </button>
        )}
      </div>
    </div>
  );
}
