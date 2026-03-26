"use client";

import { useState } from "react";
import { autoAPI } from "@/lib/api";

interface PromptInputProps {
  onStart: (teamId: string, executionId: string, prompt: string) => void;
  disabled?: boolean;
}

export function AdvancedPromptInput({ onStart, disabled }: PromptInputProps) {
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
      const response = await autoAPI.executeAdvanced({
        prompt: prompt.trim(),
        team_name: teamName.trim() || undefined,
        workdir: workdir.trim() || undefined,
      });
      onStart(response.team_id, response.execution_id, prompt.trim());
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
          进阶需求描述 (ReAct)
        </label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="描述你想要实现的功能，Agent将在这个工作区不断使用工具（执行Shell、读写文件）来自我完善代码，直到任务完成。"
          disabled={disabled || loading}
          className="w-full h-32 p-3 bg-white border border-yellow-300 rounded-lg text-sm resize-none focus:outline-none focus:border-yellow-500 focus:ring-1 focus:ring-yellow-500 disabled:opacity-50"
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
          className="w-full p-3 bg-white border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-yellow-500 focus:ring-1 focus:ring-yellow-500 disabled:opacity-50"
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
          placeholder="进阶模式需要指定工作目录，如 /Users/likang/geminicode/Agent/team_test"
          disabled={disabled || loading}
          className="w-full p-3 bg-white border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-yellow-500 focus:ring-1 focus:ring-yellow-500 disabled:opacity-50"
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
        className="w-full py-3 bg-gradient-to-r from-yellow-500 to-orange-500 rounded-lg font-medium hover:from-yellow-600 hover:to-orange-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-white shadow-md shadow-orange-200"
      >
        {loading ? (
          <>
            <span className="animate-spin">⏳</span>
            Agent 推理中...
          </>
        ) : (
          <>
            <span>⚡</span>
            启动 ReAct 执行循环
          </>
        )}
      </button>

      {/* Tips */}
      <div className="text-xs text-yellow-800 space-y-1 bg-yellow-50 border border-yellow-200 p-3 rounded-lg">
        <p>💡 进阶模式提示：</p>
        <ul className="list-disc list-inside space-y-0.5 pl-2">
          <li>不再提前拆解任务，而是交给 Agent 自己边思考边做</li>
          <li>Agent 原生内置了 Shell 执行、文件读写功能</li>
          <li>工作录必须填写，以免误修改其他文件</li>
        </ul>
      </div>
    </div>
  );
}
