"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ExecutionLog as ExecutionLogType } from "@/lib/types";
import { autoAPI } from "@/lib/api";

interface ExecutionLogPanelProps {
  identifier: string;
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
  thinking: "text-gray-500",
  step: "text-gray-700",
  team_creating: "text-blue-600",
  team_created: "text-green-600",
  team_failed: "text-red-600",
  worker_spawning: "text-blue-600",
  worker_spawned: "text-green-600",
  worker_failed: "text-red-600",
  task_creating: "text-yellow-600",
  task_created: "text-green-600",
  task_failed: "text-red-600",
  task_assigning: "text-yellow-600",
  task_assigned: "text-green-600",
  task_running: "text-blue-600",
  task_completed: "text-green-600",
  task_failed_step: "text-red-600",
  execution_started: "text-blue-600",
  execution_completed: "text-green-600",
  execution_failed: "text-red-600",
  execution_stopped: "text-yellow-600",
  user_feedback: "text-purple-600",
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
  // Use ref to avoid re-creating EventSource when onComplete changes
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs]);

  useEffect(() => {
    const es = autoAPI.createEventSource(identifier);

    es.onopen = () => {
      setConnected(true);
      setError(null);
    };

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === "connected" && data.status === "initializing") {
          return;
        }

        if (data.id && data.content) {
          setLogs((prev) => [...prev, data as ExecutionLogType]);
        }

        if (data.type === "execution_completed" || data.type === "execution_failed" || data.type === "execution_stopped") {
          onCompleteRef.current?.();
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
  }, [identifier]);

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Error message */}
      {error && (
        <div className="px-4 py-2 bg-red-50 text-red-600 text-sm border-b border-red-100 flex-shrink-0">
          {error}
        </div>
      )}

      {/* Logs */}
      <div
        ref={logContainerRef}
        className="flex-1 overflow-y-auto p-4 text-sm"
      >
        {logs.length === 0 ? (
          <div className="text-gray-400 text-center py-8">
            等待执行开始...
          </div>
        ) : (
          logs.map((log, index) => (
            <div
              key={log.id || index}
              className={`flex gap-3 py-1.5 hover:bg-gray-100 rounded px-1 ${LOG_COLORS[log.type] || "text-gray-700"}`}
            >
              <span className="flex-shrink-0 w-6 text-center">
                {LOG_ICONS[log.type] || "📝"}
              </span>
              <span className="flex-1 whitespace-pre-wrap break-words leading-relaxed">
                {log.content}
              </span>
              <span className="flex-shrink-0 text-gray-400 text-xs">
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
    <div className={`flex items-center gap-2 py-1 ${LOG_COLORS[log.type] || "text-gray-700"}`}>
      <span>{LOG_ICONS[log.type] || "📝"}</span>
      <span className="flex-1 truncate">{log.content}</span>
      <span className="text-xs text-gray-400">{formatTime(log.timestamp)}</span>
    </div>
  );
}
