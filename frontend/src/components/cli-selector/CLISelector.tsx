"use client";

import { useEffect, useState } from "react";
import { clisAPI } from "@/lib/api";
import type { CLIInfo } from "@/lib/types";
import { getCLImoji } from "@/lib/utils";

interface CLISelectorProps {
  value?: string;
  onChange: (command: string) => void;
}

export default function CLISelector({ value, onChange }: CLISelectorProps) {
  const [clis, setClis] = useState<CLIInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadCLIs();
  }, []);

  async function loadCLIs() {
    try {
      const res = await clisAPI.list();
      setClis((res as { clis: CLIInfo[] }).clis);
    } catch (err) {
      console.error("Failed to load CLIs:", err);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return <div className="text-gray-400">检测可用 CLI...</div>;
  }

  const installed = clis.filter((c) => c.installed);
  const notInstalled = clis.filter((c) => !c.installed);

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
      {installed.map((cli) => (
        <CLICard
          key={cli.command}
          cli={cli}
          selected={value === cli.command}
          onSelect={() => onChange(cli.command)}
        />
      ))}
      {notInstalled.map((cli) => (
        <CLICard
          key={cli.command}
          cli={cli}
          selected={value === cli.command}
          onSelect={() => onChange(cli.command)}
          disabled
        />
      ))}
    </div>
  );
}

function CLICard({
  cli,
  selected,
  onSelect,
  disabled,
}: {
  cli: CLIInfo;
  selected: boolean;
  onSelect: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onSelect}
      disabled={disabled}
      className={`p-4 rounded-xl border-2 transition-all text-left ${
        disabled
          ? "opacity-50 cursor-not-allowed border-[#222] bg-[#0a0a0a]"
          : selected
          ? "border-blue-500 bg-blue-900/20"
          : "border-[#222] bg-[#111] hover:border-[#333]"
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-3xl">{getCLImoji(cli.command)}</span>
        {selected && <span className="text-blue-400">✓</span>}
      </div>
      <h3 className="font-semibold text-sm">{cli.name}</h3>
      <p className="text-xs text-gray-400 mb-2">{cli.vendor}</p>
      <div className="flex items-center gap-1">
        {cli.installed ? (
          <>
            <span className="w-2 h-2 bg-green-500 rounded-full"></span>
            <span className="text-xs text-green-400">已安装</span>
            {cli.version && <span className="text-xs text-gray-500 ml-1">v{cli.version}</span>}
          </>
        ) : (
          <>
            <span className="w-2 h-2 bg-red-500 rounded-full"></span>
            <span className="text-xs text-red-400">未安装</span>
          </>
        )}
      </div>
    </button>
  );
}
