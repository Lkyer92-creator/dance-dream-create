'use client';

import { useEffect, useState } from 'react';
import { Video, RefreshCw, AlertCircle } from 'lucide-react';
import { useVideoGeneration } from '../hooks/useVideoGeneration';

// Real clip generation panel for one scene card.
// Props: prompt (approved, edited), characterImageUrl (locked char), cameraDirection,
// intervalLabel (e.g. "00:15 – 00:30"), disabledReason (string shown when Generate is blocked),
// onGenState(status, videoUrl) -> 'generating' | 'rendered' | 'failed' | 'cancelled'
export default function SceneGeneratePanel({
  prompt,
  characterImageUrl,
  cameraDirection,
  intervalLabel,
  disabledReason,
  onGenState,
}) {
  const [duration, setDuration] = useState('10');
  const { generateVideo, cancel, isGenerating, videoUrl, error } = useVideoGeneration();

  useEffect(() => {
    if (isGenerating) onGenState?.('generating');
  }, [isGenerating, onGenState]);
  useEffect(() => {
    if (videoUrl) onGenState?.('rendered', videoUrl);
  }, [videoUrl, onGenState]);
  useEffect(() => {
    if (error) onGenState?.('failed');
  }, [error, onGenState]);

  const handleGenerateClick = () => {
    generateVideo({
      prompt: (prompt || '').trim(),
      characterImageUrl,
      duration,
      cameraDirection,
    });
  };

  const blocked = !!disabledReason;
  const canGenerate = !isGenerating && !blocked;

  return (
    <div className="mt-3 pt-3 border-t border-slate-800/80">
      <div className="flex flex-col sm:flex-row sm:items-end gap-3">
        <div className="sm:w-40">
          <label className="text-[11px] font-bold text-slate-400 block mb-1">
            Clip length
          </label>
          <select
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-cyan-500"
          >
            <option value="5">5 seconds</option>
            <option value="10">10 seconds</option>
          </select>
        </div>

        <div className="flex-1">
          {isGenerating ? (
            <button
              type="button"
              onClick={() => {
                cancel();
                onGenState?.('cancelled');
              }}
              className="w-full bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 px-4 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center space-x-2 transition"
            >
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span>Cancel render</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={handleGenerateClick}
              disabled={!canGenerate}
              title={blocked ? disabledReason : `Generate a ${duration}s clip for ${intervalLabel}`}
              className={`w-full px-4 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center space-x-2 transition shadow-lg ${
                canGenerate
                  ? 'bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 text-white shadow-cyan-500/25 active:scale-95'
                  : 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed shadow-none'
              }`}
            >
              <Video className="w-4 h-4" />
              <span>Approve &amp; Generate Clip</span>
            </button>
          )}
        </div>
      </div>

      {blocked && !isGenerating && (
        <p className="text-[11px] text-amber-400/90 mt-2 flex items-start space-x-1.5">
          <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
          <span>{disabledReason}</span>
        </p>
      )}
      {isGenerating && (
        <p className="text-[11px] text-slate-400 mt-2">
          Rendering via fal.ai Kling… usually takes 1–2 minutes. You can cancel anytime.
        </p>
      )}
      {error && (
        <p className="text-[11px] text-red-400 mt-2 flex items-start space-x-1.5">
          <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </p>
      )}
      <p className="text-[10px] text-slate-500 mt-2">
        Kling renders 5s or 10s per clip — chain multiple clips for longer scenes. Usage
        bills to your fal.ai account.
      </p>
    </div>
  );
}
