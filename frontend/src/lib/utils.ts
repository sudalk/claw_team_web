// Utility functions

export function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleString("zh-CN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "刚刚";
  if (diffMins < 60) return `${diffMins}分钟前`;
  if (diffHours < 24) return `${diffHours}小时前`;
  if (diffDays < 7) return `${diffDays}天前`;
  return formatDate(dateStr);
}

export function getProgressPercent(completed: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((completed / total) * 100);
}

export function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    pending: "bg-yellow-100 text-yellow-800",
    in_progress: "bg-blue-100 text-blue-800",
    completed: "bg-green-100 text-green-800",
    blocked: "bg-red-100 text-red-800",
    failed: "bg-red-200 text-red-900",
    active: "bg-green-100 text-green-800",
    idle: "bg-gray-100 text-gray-800",
    ready: "bg-blue-100 text-blue-800",
    busy: "bg-orange-100 text-orange-800",
    terminated: "bg-gray-200 text-gray-600",
  };
  return colors[status] || "bg-gray-100 text-gray-800";
}

export function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    pending: "待办",
    in_progress: "进行中",
    completed: "已完成",
    blocked: "阻塞",
    failed: "失败",
    active: "运行中",
    idle: "空闲",
    ready: "就绪",
    busy: "工作中",
    terminated: "已终止",
  };
  return labels[status] || status;
}

export function getPriorityColor(priority: string): string {
  const colors: Record<string, string> = {
    low: "text-gray-500",
    medium: "text-yellow-600",
    high: "text-red-600",
  };
  return colors[priority] || "text-gray-500";
}

export function getPriorityLabel(priority: string): string {
  const labels: Record<string, string> = {
    low: "低",
    medium: "中",
    high: "高",
  };
  return labels[priority] || priority;
}

export const CLI_EMOJI: Record<string, string> = {
  claude: "🧠",
  codex: "🤖",
  codeflicker: "⚡",
  nanobot: "🔬",
  gemini: "✨",
  f: "⚡",
};

export function getCLImoji(cli?: string): string {
  if (!cli) return "🤖";
  return (cli && CLI_EMOJI[cli]) || "🤖";
}

export function getCLIName(cli?: string): string {
  const names: Record<string, string> = {
    claude: "Claude",
    codex: "Codex",
    codeflicker: "Codeflicker",
    nanobot: "Nanobot",
    gemini: "Gemini",
    f: "Codeflicker",
  };
  return (cli && names[cli]) || cli || "Unknown";
}

export function formatBytes(bytes: number, decimals: number = 2): string {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
}
