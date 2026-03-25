"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { teamsAPI } from "@/lib/api";

export default function CreateTeamPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [workdir, setWorkdir] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!name.trim()) {
      setError("请输入团队名称");
      return;
    }

    try {
      setSubmitting(true);
      setError(null);
      await teamsAPI.create({
        name: name.trim(),
        description: description.trim() || undefined,
        workdir: workdir.trim() || undefined,
      });
      router.push("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "创建失败");
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen p-8 max-w-xl mx-auto">
      <Link href="/" className="text-blue-400 hover:underline text-sm mb-4 inline-block">
        ← 返回
      </Link>

      <h1 className="text-2xl font-bold mb-6">创建新团队</h1>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm text-gray-600 mb-1">团队名称 *</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例如: 电商网站开发"
            className="w-full p-3 bg-white border border-gray-300 rounded-lg"
            autoFocus
          />
        </div>

        <div>
          <label className="block text-sm text-gray-600 mb-1">描述 (可选)</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="描述这个团队要完成什么..."
            rows={3}
            className="w-full p-3 bg-white border border-gray-300 rounded-lg"
          />
        </div>

        <div>
          <label className="block text-sm text-gray-600 mb-1">工作目录 (可选)</label>
          <input
            type="text"
            value={workdir}
            onChange={(e) => setWorkdir(e.target.value)}
            placeholder="所有 Worker 的默认工作目录"
            className="w-full p-3 bg-white border border-gray-300 rounded-lg"
          />
          <p className="text-xs text-gray-500 mt-1">
            指定团队的基础工作目录。留空则使用 ~/.clawteam/workspaces/
          </p>
        </div>

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-600">
            {error}
          </div>
        )}

        <div className="flex gap-3 pt-4">
          <Link href="/" className="px-6 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400">
            取消
          </Link>
          <button
            type="submit"
            disabled={submitting}
            className="px-6 py-2 bg-blue-400 text-white rounded-lg hover:bg-blue-500 disabled:opacity-50"
          >
            {submitting ? "创建中..." : "创建团队"}
          </button>
        </div>
      </form>
    </div>
  );
}
