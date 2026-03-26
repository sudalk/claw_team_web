"use client";

import { useSearchParams } from "next/navigation";
import { FileExplorer } from "@/components/workspace/FileExplorer";
import Link from "next/link";
import { Suspense } from "react";

function WorkspaceContent() {
  const searchParams = useSearchParams();
  const path = searchParams.get("path") || undefined;

  return (
    <div className="flex flex-col h-screen p-8 bg-gray-50">
      <header className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link href="/" className="p-2 hover:bg-white rounded-full transition-colors">
            ⬅️
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-800">工作空间预览</h1>
            <p className="text-sm text-gray-500">查看 Agent 生成的代码和产物</p>
          </div>
        </div>
      </header>

      <main className="flex-1 min-h-0">
        <FileExplorer rootPath={path} />
      </main>
    </div>
  );
}

export default function WorkspacePage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin text-4xl">⏳</div>
      </div>
    }>
      <WorkspaceContent />
    </Suspense>
  );
}
