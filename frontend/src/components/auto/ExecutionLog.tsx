"use client";

import { useEffect, useRef, useState } from "react";
import type { ExecutionLog as ExecutionLogType, LogType } from "@/lib/types";
import { autoAPI } from "@/lib/api";

interface ExecutionLogPanelProps {
  identifier: string;  // execution_id or team_id
  onComplete?: () => void;
}

const LOG_ICONS: Record<string, string> = {
  thinking: "🤔",
  step: "📝",
  team_creating: "👥",
  team_created: "✅",
  team_failed: "❌",
  worker_spawning: "🤖",
  worker_spawned: "✅",
  worker_failed: "❌",
  task_creating: "📋",
  task_created: "✅",
  task_failed: "❌",
  task_assigning: "📋",
  task_assigned: "✅",
  task_running: "⚡",
  task_completed: "✅",
  task_failed_step: "❌",
  execution_started: "🚀",
  execution_completed: "🎉",
  execution_failed: "💥",
  execution_stopped: "🛑",
  user_feedback: "💬",
};

const LOG_COLORS: Record<string, string> = {
  thinking: "text-gray-400",
  step: "text-gray-300",
  team_creating: "text-blue-400",
  team_created: "text-green-400",
  team_failed: "text-red-400",
  worker_spawning: "text-blue-400",
  worker_spawned: "text-green-400",
  worker_failed: "text-red-400",
  task_creating: "text-yellow-400",
  task_created: "text-green-400",
  task_failed: "text-red-400",
  task_assigning: "text-yellow-400",
  task_assigned: "text-green-400",
  task_running: "text-blue-400",
  task_completed: "text-green-400",
  task_failed_step: "text-red-400",
  execution_started: "text-blue-400",
  execution_completed: "text-green-400",
  execution_failed: "text-red-400",
  execution_stopped: "text-yellow-400",
  user_feedback: "text-purple-400",
};

function formatTime(timestamp: string): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function ExecutionLogPanel({ identifier, onComplete }: ExecutionLogPanelProps) {
  const [logs, setLogs] = useState<ExecutionLogType[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const logContainerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs]);

  // SSE connection
  useEffect(() => {
    const es = autoAPI.createEventSource(identifier);

    es.onopen = () => {
      setConnected(true);
      setError(null);
    };

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        // 跳过初始连接消息
        if (data.type === "connected" && data.status === "initializing") {
          return;
        }

        // 添加日志
        if (data.id && data.content) {
          setLogs((prev) => [...prev, data as ExecutionLogType]);
        }

        // 检查是否完成
        if (data.type === "execution_completed" || data.type === "execution_failed" || data.type === "execution_stopped") {
          onComplete?.();
        }
      } catch (e) {
        console.error("Failed to parse SSE data:", e);
      }
    };

    es.onerror = () => {
      setConnected(false);
      setError("连接断开");
    };

    return () => {
      es.close();
    };
  }, [identifier, onComplete]);

  return (
    <div className="flex flex-col h-full bg-[#0a0a0a] border border-[#222] rounded-lg">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#222]">
        <div className="flex items-center gap-2">
          <span className="text-lg">📜</span>
          <span className="font-medium">执行日志</span>
        </div>
        <div className="flex items-center gap-2">
          {connected ? (
            <span className="flex items-center gap-1 text-xs text-green-400">
              <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
              已连接
            </span>
          ) : (
            <span className="flex items-center gap-1 text-xs text-gray-500">
              <span className="w-2 h-2 bg-gray-500 rounded-full" />
              连接中...
            </span>
          )}
        </div>
      </div>

      {/* Error message */}
      {error && (
        <div className="px-4 py-2 bg-red-900/20 text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Logs */}
      <div
        ref={logContainerRef}
        className="flex-1 overflow-y-auto p-4 font-mono text-sm"
      >
        {logs.length === 0 ? (
          <div className="text-gray-500 text-center py-8">
            等待执行开始...
          </div>
        ) : (
          logs.map((log, index) => (
            <div
              key={log.id || index}
              className={`flex gap-3 py-1 ${LOG_COLORS[log.type] || "text-gray-300"}`}
            >
              <span className="flex-shrink-0 w-6 text-center">
                {LOG_ICONS[log.type] || "📝"}
              </span>
              <span className="flex-1 whitespace-pre-wrap break-words">
                {log.content}
              </span>
              <span className="flex-shrink-0 text-gray-500 text-xs">
                {formatTime(log.timestamp)}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// Compact version for dashboard
interface ExecutionLogItemProps {
  log: ExecutionLogType;
}

export function ExecutionLogItem({ log }: ExecutionLogItemProps) {
  return (
    <div className={`flex items-center gap-2 py-1 ${LOG_COLORS[log.type] || "text-gray-300"}`}>
      <span>{LOG_ICONS[log.type] || "📝"}</span>
      <span className="flex-1 truncate">{log.content}</span>
      <span className="text-xs text-gray-500">{formatTime(log.timestamp)}</span>
    </div>
  );
}
