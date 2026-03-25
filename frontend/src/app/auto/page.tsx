"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { teamsAPI, autoAPI } from "@/lib/api";
import type { Team } from "@/lib/types";
import { PromptInput } from "@/components/auto/PromptInput";
import { ExecutionLogPanel } from "@/components/auto/ExecutionLog";

export default function AutoModePage() {
  const router = useRouter();
  const [teams, setTeams] = useState<Team[]>([]);
  const [currentTeamId, setCurrentTeamId] = useState<string | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);

  // Load existing teams
  useEffect(() => {
    loadTeams();
  }, []);

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
    loadTeams(); // Refresh teams list
  };

  const handleComplete = () => {
    setIsExecuting(false);
    loadTeams(); // Refresh teams list
  };

  return (
    <div className="min-h-screen flex">
      {/* Left side - Input or Team View */}
      <div className="flex-1 p-8 border-r border-[#222]">
        <Link href="/" className="text-blue-400 hover:underline text-sm mb-4 inline-block">
          ← 返回首页
        </Link>

        <div className="max-w-xl mx-auto mt-8">
          <div className="text-center mb-8">
            <span className="text-6xl mb-4 block">🤖</span>
            <h1 className="text-2xl font-bold mb-2">自动模式</h1>
            <p className="text-gray-400">
              输入你的需求，AI 自动拆解任务、创建团队、执行开发
            </p>
          </div>

          {/* Input form */}
          <div className="bg-[#111] border border-[#222] rounded-xl p-6">
            {!isExecuting ? (
              <PromptInput onStart={handleStart} />
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-green-400 flex items-center gap-2">
                    <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                    执行中
                  </span>
                  <Link
                    href={`/teams/${currentTeamId}`}
                    className="text-blue-400 hover:underline text-sm"
                  >
                    查看团队 →
                  </Link>
                </div>

                <div className="h-px bg-[#333]" />

                <div>
                  <label className="block text-sm text-gray-400 mb-2">
                    执行团队
                  </label>
                  <div className="p-3 bg-[#1a1a1a] rounded-lg font-mono text-sm">
                    {currentTeamId}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Existing Teams */}
          {teams.length > 0 && (
            <div className="mt-8">
              <h2 className="text-lg font-semibold mb-4">已有团队</h2>
              <div className="space-y-2">
                {teams.map((team) => (
                  <Link
                    key={team.id}
                    href={`/teams/${team.id}`}
                    className="block p-4 bg-[#111] border border-[#222] rounded-lg hover:border-[#333] transition-colors"
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
      </div>

      {/* Right side - Execution Log */}
      <div className="w-1/2 p-8 bg-[#0a0a0a]">
        {currentTeamId ? (
          <ExecutionLogPanel
            identifier={currentTeamId}
            onComplete={handleComplete}
          />
        ) : (
          <div className="h-full flex items-center justify-center text-gray-500">
            <div className="text-center">
              <span className="text-4xl mb-4 block">📜</span>
              <p>开始执行后，日志将显示在这里</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
