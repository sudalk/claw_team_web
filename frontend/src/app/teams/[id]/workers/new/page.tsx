"use client";

import { use, useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { workersAPI, clisAPI } from "@/lib/api";
import type { CLIInfo } from "@/lib/types";
import { getCLImoji } from "@/lib/utils";

export default function CreateWorkerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: teamId } = use(params);
  const router = useRouter();
  const [clis, setClis] = useState<CLIInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    name: "",
    role: "worker",
    cli: "claude",
    backend: "tmux",
    workdir: "",
    execution_mode: "auto",
    auto_assign: true,
  });
  const [error, setError] = useState<string | null>(null);

  // Load CLIs on mount
  useEffect(() => {
    clisAPI.list().then((res) => {
      setClis((res as { clis: CLIInfo[] }).clis.filter((c: CLIInfo) => c.installed));
    }).catch(console.error);
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      setError("请输入 Worker 名称");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await workersAPI.create(teamId, {
        name: form.name.trim(),
        role: form.role,
        config: {
          cli: form.cli,
          backend: form.backend,
          workdir: form.workdir || undefined,
          execution_mode: form.execution_mode,
          auto_assign: form.auto_assign,
        },
      });
      // Use window.location for reliable navigation
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

      <h1 className="text-2xl font-bold mb-6">添加 Worker</h1>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic Info */}
        <div className="p-4 bg-white border border-gray-200 rounded-lg">
          <h2 className="font-semibold mb-4">基本信息</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-gray-600 mb-1">Worker 名称 *</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="例如: coder, tester, reviewer"
                className="w-full p-3 bg-gray-100 border border-gray-300 rounded-lg"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-600 mb-1">角色</label>
              <select
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value })}
                className="w-full p-3 bg-gray-100 border border-gray-300 rounded-lg"
              >
                <option value="worker">通用 Worker</option>
                <option value="coder">编码助手</option>
                <option value="tester">测试助手</option>
                <option value="reviewer">代码审查</option>
              </select>
            </div>
          </div>
        </div>

        {/* CLI Selection */}
        <div className="p-4 bg-white border border-gray-200 rounded-lg">
          <h2 className="font-semibold mb-4">AI 引擎</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {[
              { cli: "claude", name: "Claude" },
              { cli: "codeflicker", name: "Codeflicker" },
              { cli: "codex", name: "Codex" },
              { cli: "gemini", name: "Gemini" },
              { cli: "nanobot", name: "Nanobot" },
            ].map(({ cli, name }) => (
              <button
                key={cli}
                type="button"
                onClick={() => setForm({ ...form, cli })}
                className={`p-3 rounded-lg border-2 transition-all text-left ${
                  form.cli === cli
                    ? "border-blue-500 bg-blue-50"
                    : "border-gray-300 bg-gray-50 hover:border-[#444]"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-2xl">{getCLImoji(cli)}</span>
                  <span className="font-medium">{name}</span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Backend */}
        <div className="p-4 bg-white border border-gray-200 rounded-lg">
          <h2 className="font-semibold mb-4">运行方式</h2>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setForm({ ...form, backend: "tmux" })}
              className={`p-4 rounded-lg border-2 transition-all ${
                form.backend === "tmux"
                  ? "border-blue-500 bg-blue-50"
                  : "border-gray-300 bg-gray-50 hover:border-[#444]"
              }`}
            >
              <div className="text-2xl mb-1">🪟</div>
              <div className="font-medium">Tmux</div>
              <div className="text-xs text-gray-600">可视化监控</div>
            </button>
            <button
              type="button"
              onClick={() => setForm({ ...form, backend: "subprocess" })}
              className={`p-4 rounded-lg border-2 transition-all ${
                form.backend === "subprocess"
                  ? "border-blue-500 bg-blue-50"
                  : "border-gray-300 bg-gray-50 hover:border-[#444]"
              }`}
            >
              <div className="text-2xl mb-1">⚡</div>
              <div className="font-medium">后台运行</div>
              <div className="text-xs text-gray-600">无界面</div>
            </button>
          </div>
        </div>

        {/* Workdir */}
        <div className="p-4 bg-white border border-gray-200 rounded-lg">
          <h2 className="font-semibold mb-4">工作目录</h2>
          <input
            type="text"
            value={form.workdir}
            onChange={(e) => setForm({ ...form, workdir: e.target.value })}
            placeholder="留空则自动分配"
            className="w-full p-3 bg-gray-100 border border-gray-300 rounded-lg"
          />
          <p className="text-xs text-gray-500 mt-2">
            Worker 将在此目录下工作。如果留空，系统会在 ~/.clawteam/workspaces/ 下创建独立目录。
          </p>
        </div>

        {/* Execution Mode */}
        <div className="p-4 bg-white border border-gray-200 rounded-lg">
          <h2 className="font-semibold mb-4">执行模式</h2>
          <div className="space-y-2">
            <label className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100">
              <input
                type="radio"
                name="execution_mode"
                checked={form.execution_mode === "auto"}
                onChange={() => setForm({ ...form, execution_mode: "auto" })}
                className="w-4 h-4"
              />
              <div>
                <div className="font-medium">自动模式</div>
                <div className="text-xs text-gray-600">Worker 自动接收并执行分配的任务</div>
              </div>
            </label>
            <label className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100">
              <input
                type="radio"
                name="execution_mode"
                checked={form.execution_mode === "manual"}
                onChange={() => setForm({ ...form, execution_mode: "manual" })}
                className="w-4 h-4"
              />
              <div>
                <div className="font-medium">手动模式</div>
                <div className="text-xs text-gray-600">需要手动点击执行按钮触发任务</div>
              </div>
            </label>
          </div>
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
            className="px-6 py-3 bg-green-400 text-white rounded-lg hover:bg-green-500 disabled:opacity-50"
          >
            {loading ? "创建中..." : "创建 Worker"}
          </button>
        </div>
      </form>
    </div>
  );
}
