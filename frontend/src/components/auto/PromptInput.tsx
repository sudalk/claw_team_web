"use client";

import { useState } from "react";
import { autoAPI } from "@/lib/api";

interface PromptInputProps {
  onStart: (teamId: string, executionId: string, prompt: string) => void;
  disabled?: boolean;
}

export function PromptInput({ onStart, disabled }: PromptInputProps) {
  const [prompt, setPrompt] = useState("");
  const [teamName, setTeamName] = useState("");
  const [workdir, setWorkdir] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"standard" | "advanced">("standard");

  const handleStart = async () => {
    if (!prompt.trim()) {
      setError("请输入需求描述");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const apiCall = mode === "advanced" ? autoAPI.executeAdvanced : autoAPI.execute;
      const response = await apiCall({
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

  const isAdvanced = mode === "advanced";

  return (
    <div className={`space-y-4 transition-colors duration-300 p-1 rounded-xl`}>
      {/* Mode Toggle */}
      <div className="flex bg-gray-100 p-1 rounded-lg w-fit mb-2">
        <button
          onClick={() => setMode("standard")}
          className={`px-4 py-1.5 text-xs font-semibold rounded-md transition-all ${
            !isAdvanced ? "bg-white text-blue-600 shadow-sm" : "text-gray-500 hover:text-gray-700"
          }`}
        >
          🤖 标准模式
        </button>
        <button
          onClick={() => setMode("advanced")}
          className={`px-4 py-1.5 text-xs font-semibold rounded-md transition-all ${
            isAdvanced ? "bg-white text-yellow-600 shadow-sm" : "text-gray-500 hover:text-gray-700"
          }`}
        >
          ⚡ 进阶模式 (ReAct)
        </button>
      </div>

      {/* Prompt input */}
      <div>
        <label className="block text-sm text-gray-600 mb-2 font-medium">
          {isAdvanced ? "进阶需求描述 (ReAct)" : "需求描述"}
        </label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={isAdvanced 
            ? "描述你想要实现的功能，Agent将作为超级项目经理，自主招聘Worker并指派任务，直到目标达成。"
            : "描述你想要实现的功能，例如：帮我做一个待办应用，包含用户登录和任务管理功能"
          }
          disabled={disabled || loading}
          className={`w-full h-32 p-3 bg-white border rounded-lg text-sm resize-none focus:outline-none transition-colors ${
            isAdvanced 
              ? "border-yellow-300 focus:border-yellow-500 focus:ring-1 focus:ring-yellow-500" 
              : "border-gray-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          } disabled:opacity-50`}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
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
            className={`w-full p-3 bg-white border rounded-lg text-sm focus:outline-none transition-colors ${
              isAdvanced ? "focus:border-yellow-500 focus:ring-yellow-500" : "focus:border-blue-500 focus:ring-blue-500"
            } border-gray-300 disabled:opacity-50`}
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
            placeholder="如 /Users/.../workspace"
            disabled={disabled || loading}
            className={`w-full p-3 bg-white border rounded-lg text-sm focus:outline-none transition-colors ${
              isAdvanced ? "focus:border-yellow-500 focus:ring-yellow-500" : "focus:border-blue-500 focus:ring-blue-500"
            } border-gray-300 disabled:opacity-50`}
          />
        </div>
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
        className={`w-full py-3 rounded-lg font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-white shadow-sm ${
          isAdvanced 
            ? "bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-600 hover:to-orange-600 shadow-orange-100" 
            : "bg-blue-500 hover:bg-blue-600"
        }`}
      >
        {loading ? (
          <>
            <span className="animate-spin">⏳</span>
            {isAdvanced ? "Agent 正在思考决策..." : "正在分析需求..."}
          </>
        ) : (
          <>
            <span>{isAdvanced ? "⚡" : "🚀"}</span>
            {isAdvanced ? "启动 ReAct 执行循环" : "开始执行"}
          </>
        )}
      </button>

      {/* Tips */}
      <div className={`text-xs space-y-1 p-3 rounded-lg border transition-colors ${
        isAdvanced ? "text-yellow-800 bg-yellow-50 border-yellow-200" : "text-gray-500 bg-gray-50 border-gray-200"
      }`}>
        <p>💡 {isAdvanced ? "进阶模式 (ReAct)" : "标准模式"}提示：</p>
        <ul className="list-disc list-inside space-y-0.5 pl-2">
          {isAdvanced ? (
            <>
              <li>Agent 会自主进行多轮推理和工具调用</li>
              <li>它能根据子任务进度动态调整计划</li>
              <li>适合复杂、需要多步决策的任务</li>
            </>
          ) : (
            <>
              <li>更快的启动速度，一次性拆解所有任务</li>
              <li>任务会自动分配给 Worker 并行执行</li>
              <li>适合目标明确、流程固定的简单任务</li>
            </>
          )}
        </ul>
      </div>
    </div>
  );
}
