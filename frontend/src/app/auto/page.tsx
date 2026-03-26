"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { teamsAPI } from "@/lib/api";
import type { Team } from "@/lib/types";
import { PromptInput } from "@/components/auto/PromptInput";
import { ExecutionLogPanel } from "@/components/auto/ExecutionLog";

const SESSION_KEY = "clawteam_auto_session";

interface AutoSession {
  currentTeamId: string;
  isExecuting: boolean;
}

export default function AutoModePage() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [currentTeamId, setCurrentTeamId] = useState<string | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);

  // 恢复会话状态
  useEffect(() => {
    const saved = sessionStorage.getItem(SESSION_KEY);
    if (saved) {
      try {
        const session: AutoSession = JSON.parse(saved);
        setCurrentTeamId(session.currentTeamId);
        setIsExecuting(session.isExecuting);
      } catch {
        sessionStorage.removeItem(SESSION_KEY);
      }
    }
    loadTeams();
  }, []);

  // 保存会话状态
  useEffect(() => {
    if (currentTeamId || isExecuting) {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({
        currentTeamId,
        isExecuting,
      }));
    }
  }, [currentTeamId, isExecuting]);

  async function loadTeams() {
    try {
      const res = await teamsAPI.list();
      setTeams(res.teams);
    } catch (e) {
      console.error("Failed to load teams:", e);
    }
  }

  const handleStart = (teamId: string) => {
    setCurrentTeamId(teamId);
    setIsExecuting(true);
    loadTeams();
  };

  const handleComplete = () => {
    setIsExecuting(false);
    sessionStorage.removeItem(SESSION_KEY);
    loadTeams();
  };

  const hasRightPanel = currentTeamId && isExecuting;

  return (
    <div className="min-h-screen p-8">
      {/* Header */}
      <header className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <Link href="/" className="text-blue-500 hover:text-blue-600 text-sm flex items-center gap-1">
            ← 返回首页
          </Link>
        </div>
      </header>

      {hasRightPanel ? (
        // 左右布局
        <div className="flex gap-8 max-w-7xl mx-auto">
          {/* 左侧 - 输入表单 */}
          <div className="flex-1">
            <div className="text-center mb-8">
              <span className="text-6xl mb-4 block">🤖</span>
              <h1 className="text-3xl font-bold mb-2">自动模式</h1>
              <p className="text-gray-600">
                输入你的需求，AI 自动拆解任务、创建团队、执行开发
              </p>
            </div>

            {/* Input form */}
            <div className="bg-white border border-gray-200 rounded-xl p-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-green-600 flex items-center gap-2 font-medium">
                    <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                    执行中
                  </span>
                  <Link
                    href={`/teams/${currentTeamId}`}
                    className="text-blue-500 hover:text-blue-600 text-sm"
                  >
                    查看团队 →
                  </Link>
                </div>

                <div className="h-px bg-gray-200" />

                <div>
                  <label className="block text-sm text-gray-500 mb-2">
                    执行团队
                  </label>
                  <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg font-mono text-sm">
                    {currentTeamId}
                  </div>
                </div>
              </div>
            </div>

            {/* Existing Teams */}
            {teams.length > 0 && (
              <div className="mt-8">
                <h2 className="text-lg font-semibold mb-4">已有团队</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {teams.map((team) => (
                    <Link
                      key={team.id}
                      href={`/teams/${team.id}`}
                      className="block p-4 bg-white border border-gray-200 rounded-xl hover:border-gray-300 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="font-medium">{team.name}</h3>
                          <p className="text-sm text-gray-500">
                            {team.stats.tasks_total} 个任务 · {team.stats.workers} 个 Worker
                          </p>
                        </div>
                        <span className="text-gray-400">→</span>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* 右侧 - 执行日志 */}
          <div className="w-[480px] flex-shrink-0">
            <div className="bg-white border border-gray-200 rounded-xl p-6 sticky top-8">
              <h2 className="text-lg font-semibold mb-4">执行日志</h2>
              <ExecutionLogPanel
                identifier={currentTeamId}
                onComplete={handleComplete}
              />
            </div>
          </div>
        </div>
      ) : (
        // 单列布局 - 没有执行时
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-8">
            <span className="text-6xl mb-4 block">🤖</span>
            <h1 className="text-3xl font-bold mb-2">自动模式</h1>
            <p className="text-gray-600">
              输入你的需求，AI 自动拆解任务、创建团队、执行开发
            </p>
          </div>

          {/* Input form */}
          <div className="bg-white border border-gray-200 rounded-xl p-6 mb-8">
            <PromptInput onStart={handleStart} />
          </div>

          {/* Existing Teams */}
          {teams.length > 0 && (
            <div className="mt-8">
              <h2 className="text-lg font-semibold mb-4">已有团队</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {teams.map((team) => (
                  <Link
                    key={team.id}
                    href={`/teams/${team.id}`}
                    className="block p-4 bg-white border border-gray-200 rounded-xl hover:border-gray-300 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-medium">{team.name}</h3>
                        <p className="text-sm text-gray-500">
                          {team.stats.tasks_total} 个任务 · {team.stats.workers} 个 Worker
                        </p>
                      </div>
                      <span className="text-gray-400">→</span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
