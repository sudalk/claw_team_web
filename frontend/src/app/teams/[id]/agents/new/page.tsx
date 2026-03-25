"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { agentsAPI } from "@/lib/api";
import CLISelector from "@/components/cli-selector/CLISelector";

export default function SpawnAgentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: teamId } = use(params);
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    name: "",
    task: "",
    cli: "claude",
    backend: "tmux",
    workspace: true,
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (!form.name || !form.task) {
      setError("请填写名称和任务");
      return;
    }

    try {
      setSubmitting(true);
      setError(null);
      await agentsAPI.spawn(teamId, {
        name: form.name,
        task: form.task,
        cli: form.cli,
        backend: form.backend,
        workspace_enabled: form.workspace,
        skip_permissions: true,
      });
      router.push(`/teams/${teamId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "召唤失败");
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen p-8 max-w-3xl mx-auto">
      <Link href={`/teams/${teamId}`} className="text-blue-400 hover:underline text-sm mb-4 inline-block">
        ← 返回团队
      </Link>

      <h1 className="text-2xl font-bold mb-6">召唤新助手</h1>

      {/* Progress Steps */}
      <div className="flex items-center gap-2 mb-8">
        {[1, 2, 3].map((s) => (
          <div key={s} className="flex items-center">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center font-semibold ${
                step >= s ? "bg-blue-400" : "bg-gray-200"
              }`}
            >
              {s}
            </div>
            {s < 3 && (
              <div className={`w-16 h-0.5 ${step > s ? "bg-blue-400" : "bg-gray-200"}`} />
            )}
          </div>
        ))}
      </div>

      {/* Step 1: Choose CLI */}
      {step === 1 && (
        <div>
          <h2 className="text-xl font-semibold mb-4">选择 AI 助手</h2>
          <p className="text-gray-600 mb-6">选择你想要使用的 AI 编程助手</p>
          <CLISelector
            value={form.cli}
            onChange={(cli) => setForm({ ...form, cli })}
          />
          <div className="mt-6 flex justify-end">
            <button
              onClick={() => setStep(2)}
              className="px-6 py-2 bg-blue-400 text-white rounded-lg hover:bg-blue-500"
            >
              下一步 →
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Configure Agent */}
      {step === 2 && (
        <div>
          <h2 className="text-xl font-semibold mb-4">配置助手</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-gray-600 mb-1">助手名称</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="例如: coder, tester, reviewer"
                className="w-full p-3 bg-white border border-gray-300 rounded-lg"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-600 mb-1">运行方式</label>
              <div className="flex gap-4">
                {[
                  { value: "tmux", label: "🪟 Tmux (可视化监控)" },
                  { value: "subprocess", label: "⚡ 后台运行" },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setForm({ ...form, backend: opt.value })}
                    className={`px-4 py-2 rounded-lg border ${
                      form.backend === opt.value
                        ? "border-blue-500 bg-blue-50"
                        : "border-gray-300 bg-white"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.workspace}
                  onChange={(e) => setForm({ ...form, workspace: e.target.checked })}
                  className="w-5 h-5 rounded"
                />
                <span>使用隔离工作环境 (推荐)</span>
              </label>
              <p className="text-xs text-gray-500 mt-1">
                助手会在独立的工作目录中工作，不会影响你的主项目
              </p>
            </div>
          </div>

          <div className="mt-6 flex gap-3">
            <button
              onClick={() => setStep(1)}
              className="px-6 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400"
            >
              ← 上一步
            </button>
            <button
              onClick={() => setStep(3)}
              disabled={!form.name}
              className="px-6 py-2 bg-blue-400 text-white rounded-lg hover:bg-blue-500 disabled:opacity-50"
            >
              下一步 →
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Task Description */}
      {step === 3 && (
        <div>
          <h2 className="text-xl font-semibold mb-4">描述任务</h2>
          <div>
            <label className="block text-sm text-gray-600 mb-1">让助手做什么?</label>
            <textarea
              value={form.task}
              onChange={(e) => setForm({ ...form, task: e.target.value })}
              placeholder="用自然语言描述你想要完成的任务..."
              rows={6}
              className="w-full p-3 bg-white border border-gray-300 rounded-lg"
            />
          </div>

          {error && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600">
              {error}
            </div>
          )}

          <div className="mt-6 flex gap-3">
            <button
              onClick={() => setStep(2)}
              className="px-6 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400"
            >
              ← 上一步
            </button>
            <button
              onClick={handleSubmit}
              disabled={!form.task || submitting}
              className="px-6 py-2 bg-green-400 text-white rounded-lg hover:bg-green-500 disabled:opacity-50"
            >
              {submitting ? "召唤中..." : "✨ 召唤助手"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
