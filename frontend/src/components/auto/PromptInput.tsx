"use client";

import { useState } from "react";
import { autoAPI } from "@/lib/api";

interface PromptInputProps {
  onStart: (teamId: string) => void;
  disabled?: boolean;
}

export function PromptInput({ onStart, disabled }: PromptInputProps) {
  const [prompt, setPrompt] = useState("");
  const [teamName, setTeamName] = useState("");
  const [workdir, setWorkdir] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleStart = async () => {
    if (!prompt.trim()) {
      setError("请输入需求描述");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await autoAPI.execute({
        prompt: prompt.trim(),
        team_name: teamName.trim() || undefined,
        workdir: workdir.trim() || undefined,
      });
      onStart(response.team_id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "启动失败");
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Prompt input */}
      <div>
        <label className="block text-sm text-gray-600 mb-2 font-medium">
          需求描述
        </label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="描述你想要实现的功能，例如：帮我做一个待办应用，包含用户登录和任务管理功能"
          disabled={disabled || loading}
          className="w-full h-32 p-3 bg-white border border-gray-300 rounded-lg text-sm resize-none focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
        />
      </div>

      {/* Optional team name */}
      <div>
        <label className="block text-sm text-gray-600 mb-2 font-medium">
          团队名称（可选）
        </label>
        <input
          type="text"
          value={teamName}
          onChange={(e) => setTeamName(e.target.value)}
          placeholder="留空则自动生成"
          disabled={disabled || loading}
          className="w-full p-3 bg-white border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
        />
      </div>

      {/* Optional workdir */}
      <div>
        <label className="block text-sm text-gray-600 mb-2 font-medium">
          工作目录（可选）
        </label>
        <input
          type="text"
          value={workdir}
          onChange={(e) => setWorkdir(e.target.value)}
          placeholder="如 /Users/likang/geminicode/Agent/team_test"
          disabled={disabled || loading}
          className="w-full p-3 bg-white border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
        />
      </div>

      {/* Error message */}
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
          {error}
        </div>
      )}

      {/* Start button */}
      <button
        onClick={handleStart}
        disabled={disabled || loading || !prompt.trim()}
        className="w-full py-3 bg-blue-500 rounded-lg font-medium hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-white"
      >
        {loading ? (
          <>
            <span className="animate-spin">⏳</span>
            正在分析需求...
          </>
        ) : (
          <>
            <span>🚀</span>
            开始执行
          </>
        )}
      </button>

      {/* Tips */}
      <div className="text-xs text-gray-500 space-y-1 bg-gray-50 p-3 rounded-lg">
        <p>💡 提示：</p>
        <ul className="list-disc list-inside space-y-0.5 pl-2">
          <li>描述越详细，拆解越准确</li>
          <li>建议包含技术栈偏好（如使用 React、FastAPI）</li>
          <li>任务会自动分配给 Worker 执行</li>
          <li>指定工作目录后，代码将创建在该目录下</li>
        </ul>
      </div>
    </div>
  );
}
