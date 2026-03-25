"use client";

interface ModeSelectorProps {
  mode: "manual" | "auto";
  onModeChange: (mode: "manual" | "auto") => void;
}

export function ModeSelector({ mode, onModeChange }: ModeSelectorProps) {
  return (
    <div className="flex items-center gap-2 p-1 bg-[#1a1a1a] rounded-lg">
      <button
        onClick={() => onModeChange("manual")}
        className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
          mode === "manual"
            ? "bg-blue-600 text-white"
            : "text-gray-400 hover:text-white"
        }`}
      >
        <span className="mr-2">👤</span>
        手动模式
      </button>
      <button
        onClick={() => onModeChange("auto")}
        className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
          mode === "auto"
            ? "bg-green-600 text-white"
            : "text-gray-400 hover:text-white"
        }`}
      >
        <span className="mr-2">🤖</span>
        自动模式
      </button>
    </div>
  );
}
