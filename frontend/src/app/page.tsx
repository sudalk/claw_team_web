"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { teamsAPI, autoAPI } from "@/lib/api";
import type { Team, ExecutionRecord } from "@/lib/types";
import { formatRelativeTime, getProgressPercent, getStatusLabel } from "@/lib/utils";

export default function Dashboard() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadTeams();
  }, []);

  async function loadTeams() {
    try {
      setLoading(true);
      setError(null);
      const res = await teamsAPI.list();
      setTeams(res.teams);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load teams");
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-xl text-gray-600">加载中...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-4">
        <div className="text-red-400">错误: {error}</div>
        <button onClick={loadTeams} className="px-4 py-2 bg-blue-400 text-white rounded hover:bg-blue-500">
          重试
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-8">
      {/* Header */}
      <header className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <span className="text-4xl">🦞</span>
          <h1 className="text-3xl font-bold">Agent Team</h1>
        </div>
        <div className="flex gap-3">
          <Link
            href="/auto"
            className="px-4 py-2 bg-green-600 rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2"
          >
            <span>🤖</span>
            自动模式
          </Link>
          <Link
            href="/auto/advanced"
            className="px-4 py-2 bg-gradient-to-r from-yellow-500 to-orange-500 rounded-lg hover:from-yellow-600 hover:to-orange-600 transition-colors flex items-center gap-2 text-white font-medium shadow-sm"
          >
            <span>⚡</span>
            进阶自动模式 (ReAct)
          </Link>
          <Link href="/teams/new" className="px-4 py-2 bg-blue-400 rounded-lg hover:bg-blue-500 transition-colors">
            + 创建团队
          </Link>
        </div>
      </header>

      {/* Stats Overview */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <StatCard label="团队总数" value={teams.length} icon="👥" />
        <StatCard
          label="进行中的任务"
          value={teams.reduce((acc, t) => acc + t.stats.tasks_in_progress, 0)}
          icon="⚡"
        />
        <StatCard
          label="已完成任务"
          value={teams.reduce((acc, t) => acc + t.stats.tasks_completed, 0)}
          icon="✅"
        />
        <StatCard
          label="Worker 总数"
          value={teams.reduce((acc, t) => acc + t.stats.workers, 0)}
          icon="🤖"
        />
      </div>

      {/* Teams Grid */}
      {teams.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-gray-500 mb-4">还没有团队</p>
          <Link href="/teams/new" className="px-6 py-3 bg-blue-400 rounded-lg hover:bg-blue-500">
            创建第一个团队
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {teams.map((team) => (
            <TeamCard key={team.id} team={team} onDelete={loadTeams} />
          ))}
        </div>
      )}

      {/* Advanced Mode Sessions - Recent Activity */}
      <RecentAdvancedSessions />
    </div>
  );
}

function RecentAdvancedSessions() {
  const [recent, setRecent] = useState<ExecutionRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadRecent();
  }, []);

  async function loadRecent() {
    try {
      const res = await autoAPI.list();
      const advanced = res.executions
        .filter((e: ExecutionRecord) => e.team_id?.startsWith("auto-adv-"))
        .slice(0, 3);
      setRecent(advanced);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  if (loading || recent.length === 0) return null;

  return (
    <section className="mt-12">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-bold flex items-center gap-2 text-gray-800">
          <span>⚡</span> 最近进阶任务 (ReAct)
        </h2>
        <Link href="/auto/advanced" className="text-sm text-yellow-600 hover:text-yellow-700 font-medium font-bold underline underline-offset-4">
          进入进阶模式中心 →
        </Link>
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {recent.map(session => (
          <div key={session.id} className="bg-white border border-yellow-100 rounded-xl overflow-hidden shadow-sm flex h-80">
            <div className="flex-[3] p-5 border-r border-gray-100 flex flex-col">
              <div className="flex items-center justify-between mb-3">
                <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                  session.status === 'running' ? 'bg-yellow-100 text-yellow-700' : 
                  session.status === 'completed' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                }`}>
                  {session.status === 'running' ? '执行中...' : session.status}
                </span>
                <span className="text-xs text-gray-400">
                  {new Date(session.created_at).toLocaleString()}
                </span>
              </div>
              <p className="text-sm font-medium text-gray-800 line-clamp-3 mb-4 flex-grow italic">
                "{session.prompt}"
              </p>
              <div className="flex gap-2">
                <Link 
                  href={`/auto/advanced`} 
                  onClick={() => localStorage.setItem('clawteam_adv_selected', session.id)}
                  className="flex-1 text-xs bg-yellow-500 hover:bg-yellow-600 text-white p-2 rounded text-center transition-colors font-medium"
                >
                  查看详情
                </Link>
                <Link 
                  href={`/workspace?path=${encodeURIComponent(session.team_id ? `workspaces/${session.team_id}` : "")}`}
                  className="flex-1 text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 p-2 rounded text-center transition-colors font-medium border border-gray-200"
                >
                  📂 文件
                </Link>
              </div>
            </div>
            <div className="flex-[5] bg-gray-50 p-3 overflow-hidden">
               <div className="h-full bg-white rounded border border-gray-200 overflow-y-auto p-2 font-mono text-[10px] leading-relaxed">
                  <div className="text-gray-400 mb-2 border-b border-gray-100 pb-1 uppercase tracking-tighter">最新日志</div>
                  {/* Reuse log panel logic or simple list */}
                  {session.logs && session.logs.slice(-10).map((l: any, idx: number) => (
                    <div key={idx} className="mb-1">
                      <span className="text-blue-500">[{new Date(l.timestamp).toLocaleTimeString()}]</span>{" "}
                      {l.content}
                    </div>
                  ))}
                  {(!session.logs || session.logs.length === 0) && <div className="text-gray-400 italic">等待执行开始...</div>}
               </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function StatCard({ label, value, icon }: { label: string; value: number; icon: string }) {
  return (
    <div className="p-4 bg-white border border-gray-200 rounded-xl">
      <div className="flex items-center gap-2 text-gray-600 text-sm mb-1">
        <span>{icon}</span>
        {label}
      </div>
      <div className="text-3xl font-bold">{value}</div>
    </div>
  );
}

function TeamCard({ team, onDelete }: { team: Team; onDelete: () => void }) {
  const progress = getProgressPercent(team.stats.tasks_completed, team.stats.tasks_total);

  async function handleDelete() {
    if (!confirm(`确定要删除团队 "${team.name}" 吗？`)) return;
    try {
      await teamsAPI.delete(team.id);
      onDelete();
    } catch (err) {
      alert(err instanceof Error ? err.message : "删除失败");
    }
  }

  return (
    <div className="p-6 bg-white border border-gray-200 rounded-xl hover:border-gray-300 transition-colors">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xl font-semibold truncate">{team.name}</h3>
        <span className="px-2 py-1 text-xs bg-green-100 text-green-700 rounded">
          {getStatusLabel(team.status)}
        </span>
      </div>

      {team.description && (
        <p className="text-gray-600 text-sm mb-4 line-clamp-2">{team.description}</p>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2 mb-4 text-center">
        <div className="p-2 bg-gray-100 rounded">
          <div className="text-lg font-bold">{team.stats.members}</div>
          <div className="text-xs text-gray-500">成员</div>
        </div>
        <div className="p-2 bg-gray-100 rounded">
          <div className="text-lg font-bold">{team.stats.workers}</div>
          <div className="text-xs text-gray-500">Worker</div>
        </div>
        <div className="p-2 bg-gray-100 rounded">
          <div className="text-lg font-bold">{team.stats.tasks_total}</div>
          <div className="text-xs text-gray-500">任务</div>
        </div>
      </div>

      {/* Progress */}
      {team.stats.tasks_total > 0 && (
        <div className="mb-4">
          <div className="flex justify-between text-sm mb-1">
            <span className="text-gray-600">进度</span>
            <span>{progress}%</span>
          </div>
          <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-400 rounded-full transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 mt-4">
        <Link
          href={`/teams/${team.id}`}
          className="flex-1 px-3 py-2 bg-blue-400 rounded text-center hover:bg-blue-500 text-sm"
        >
          管理
        </Link>
        <button
          onClick={handleDelete}
          className="px-3 py-2 bg-red-100 text-red-700 rounded hover:bg-red-200 text-sm"
        >
          删除
        </button>
      </div>

      <div className="mt-3 text-xs text-gray-500">
        {formatRelativeTime(team.created_at)}
      </div>
    </div>
  );
}
