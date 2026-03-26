"use client";

import { useEffect, useState, useCallback } from "react";
import { workspaceAPI } from "@/lib/api";
import type { FileInfo, FileContent, DirectoryListing } from "@/lib/types";
import { formatBytes } from "@/lib/utils";

export function FileExplorer({ rootPath }: { rootPath?: string }) {
  const [currentPath, setCurrentPath] = useState(rootPath || "");
  const [listing, setListing] = useState<DirectoryListing | null>(null);
  const [selectedFile, setSelectedFile] = useState<FileContent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadDirectory = useCallback(async (path: string) => {
    try {
      setLoading(true);
      setError(null);
      const res = await workspaceAPI.list(path);
      setListing(res);
      setCurrentPath(res.path);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load directory");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadFile = async (path: string) => {
    try {
      setLoading(true);
      setError(null);
      const res = await workspaceAPI.getFile(path);
      setSelectedFile(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load file");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDirectory(rootPath || "");
  }, [rootPath, loadDirectory]);

  const handleBack = () => {
    if (!currentPath || currentPath === "/") return;
    const parent = currentPath.split("/").slice(0, -1).join("/") || "/";
    loadDirectory(parent);
  };

  return (
    <div className="flex h-full bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
      {/* Sidebar: File Tree */}
      <div className="w-1/3 border-r border-gray-200 flex flex-col">
        <div className="p-4 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
          <h3 className="font-semibold text-gray-700 truncate">文件浏览器</h3>
          <button 
            onClick={() => loadDirectory(currentPath)}
            className="p-1 hover:bg-gray-200 rounded transition-colors"
            title="刷新"
          >
            🔄
          </button>
        </div>
        
        {/* Breadcrumbs */}
        <div className="px-4 py-2 bg-white border-b border-gray-50 text-xs text-gray-500 flex items-center gap-1 overflow-x-auto whitespace-nowrap scrollbar-hide">
          <button onClick={() => loadDirectory("/")} className="hover:text-blue-500">root</button>
          {currentPath.split("/").filter(Boolean).map((part, i, arr) => (
            <span key={i} className="flex items-center gap-1">
              <span>/</span>
              <button 
                onClick={() => loadDirectory("/" + arr.slice(0, i + 1).join("/"))}
                className="hover:text-blue-500"
              >
                {part}
              </button>
            </span>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {loading && !listing && <div className="text-sm text-gray-400 p-4">加载中...</div>}
          {error && <div className="text-sm text-red-500 p-4">{error}</div>}
          
          <div className="space-y-0.5">
            {currentPath !== "/" && (
              <div 
                onClick={handleBack}
                className="flex items-center gap-2 p-2 rounded hover:bg-gray-100 cursor-pointer text-sm text-gray-600"
              >
                <span>📁</span>
                <span>..</span>
              </div>
            )}
            
            {listing?.items.map((item) => (
              <div 
                key={item.path}
                onClick={() => item.type === "directory" ? loadDirectory(item.path) : loadFile(item.path)}
                className={`flex items-center gap-2 p-2 rounded cursor-pointer text-sm transition-colors ${
                  selectedFile?.path === item.path ? "bg-blue-50 text-blue-700" : "hover:bg-gray-100 text-gray-700"
                }`}
              >
                <span>{item.type === "directory" ? "📁" : "📄"}</span>
                <span className="flex-1 truncate">{item.name}</span>
                {item.type === "file" && (
                  <span className="text-[10px] text-gray-400">{formatBytes(item.size)}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Main Panel: Content Preview */}
      <div className="flex-1 flex flex-col bg-gray-50 overflow-hidden">
        {selectedFile ? (
          <>
            <div className="p-4 bg-white border-b border-gray-200 flex items-center justify-between">
              <div className="flex flex-col">
                <h4 className="font-medium text-gray-800 flex items-center gap-2">
                  <span>📄</span> {selectedFile.name}
                </h4>
                <span className="text-xs text-gray-400">{selectedFile.path}</span>
              </div>
              <div className="flex items-center gap-4">
                 <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">
                   {formatBytes(selectedFile.size)}
                 </span>
                 <button 
                   onClick={() => setSelectedFile(null)}
                   className="text-gray-400 hover:text-gray-600 text-xl"
                 >
                   ×
                 </button>
              </div>
            </div>
            <div className="flex-1 overflow-auto p-4">
              <pre className="bg-white p-6 rounded-lg border border-gray-200 text-xs font-mono leading-relaxed whitespace-pre-wrap shadow-inner min-h-full">
                {selectedFile.content}
              </pre>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-400 gap-4">
            <div className="text-6xl text-gray-200">📂</div>
            <p>从左侧选择一个文件进行预览</p>
          </div>
        )}
      </div>
    </div>
  );
}
