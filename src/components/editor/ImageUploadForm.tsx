'use client';

import React, { useState } from 'react';
import { Upload, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';

interface ImportResult {
  success: boolean;
  sourceId: string;
  filename: string;
  provider: string;
  wallCount: number;
  roomCount: number;
  openingCount: number;
  error?: string;
}

export function ImageUploadForm({ onImportComplete }: { onImportComplete?: (result: ImportResult) => void }) {
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [provider, setProvider] = useState<'agent-router' | 'rodium'>('agent-router');

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      processFile(files[0]);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) {
      processFile(e.target.files[0]);
    }
  };

  const processFile = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file');
      return;
    }

    setIsLoading(true);
    setError(null);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('provider', provider);

      const response = await fetch('/api/import', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Upload failed');
        return;
      }

      setResult(data);
      onImportComplete?.(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full space-y-4">
      {/* Provider selector */}
      <div className="flex gap-2">
        <label className="text-xs font-medium text-slate-400">Provider:</label>
        <select
          value={provider}
          onChange={(e) => setProvider(e.target.value as 'agent-router' | 'rodium')}
          disabled={isLoading}
          className="px-3 py-1 text-xs bg-slate-700 border border-slate-600 rounded text-slate-200 disabled:opacity-50"
        >
          <option value="agent-router">AgentRouter (Multi-provider routing)</option>
          <option value="rodium">Rodium AI (GPT-5.6-Luna)</option>
        </select>
      </div>

      {/* Upload area */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`relative border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
          isDragging
            ? 'border-blue-500 bg-blue-50/10'
            : 'border-slate-600 bg-slate-800/50 hover:border-slate-500'
        } ${isLoading ? 'opacity-50' : ''}`}
      >
        <input
          type="file"
          accept="image/*"
          onChange={handleFileSelect}
          disabled={isLoading}
          className="absolute inset-0 opacity-0 cursor-pointer disabled:cursor-not-allowed"
        />

        <div className="flex flex-col items-center gap-2">
          {isLoading ? (
            <>
              <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
              <p className="text-sm text-slate-300">Processing floor plan...</p>
            </>
          ) : (
            <>
              <Upload className="w-8 h-8 text-slate-400" />
              <p className="text-sm font-medium text-slate-200">Drop floor plan image here</p>
              <p className="text-xs text-slate-500">or click to select PNG/JPG</p>
            </>
          )}
        </div>
      </div>

      {/* Error display */}
      {error && (
        <div className="flex gap-2 p-3 rounded-lg bg-red-50/10 border border-red-200/20">
          <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-red-300">{error}</div>
        </div>
      )}

      {/* Result display */}
      {result && (
        <div className="space-y-3 p-4 rounded-lg bg-green-50/10 border border-green-200/20">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-green-400" />
            <span className="text-sm font-medium text-green-300">Import successful</span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <span className="text-slate-400">File:</span>
              <p className="text-slate-200 font-mono text-xs truncate">{result.filename}</p>
            </div>
            <div>
              <span className="text-slate-400">Provider:</span>
              <p className="text-slate-200 font-mono text-xs">{result.provider}</p>
            </div>
            <div>
              <span className="text-slate-400">Walls:</span>
              <p className="text-slate-200 font-mono">{result.wallCount}</p>
            </div>
            <div>
              <span className="text-slate-400">Rooms:</span>
              <p className="text-slate-200 font-mono">{result.roomCount}</p>
            </div>
            <div>
              <span className="text-slate-400">Openings:</span>
              <p className="text-slate-200 font-mono">{result.openingCount}</p>
            </div>
            <div>
              <span className="text-slate-400">ID:</span>
              <p className="text-slate-200 font-mono text-xs truncate">{result.sourceId}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
