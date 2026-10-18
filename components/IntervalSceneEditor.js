'use client';

import { useEffect, useState } from 'react';
import { useVideoGeneration } from '../hooks/useVideoGeneration';

const CAMERA_DIRECTIONS = [
  'Static',
  'Pan Left',
  'Pan Right',
  'Push In',
  'Pull Out',
  'Tilt Up',
  'Tilt Down',
  'Orbit',
];

// One interval's generation panel. Props:
// intervalId, startTime (s), endTime (s), characterImageUrl, lyrics (string),
// initialVideoUrl (persisted render, shown on reload), onGenState(status, videoUrl)
export default function IntervalSceneEditor({
  intervalId,
  startTime,
  endTime,
  characterImageUrl,
  lyrics,
  initialVideoUrl,
  onGenState,
}) {
  const [promptInput, setPromptInput] = useState('');
  const [cameraDir, setCameraDir] = useState('Static');
  const [duration, setDuration] = useState('5');
  const { generateVideo, cancel, isGenerating, videoUrl, error } = useVideoGeneration();
  const [shownUrl, setShownUrl] = useState(initialVideoUrl || null);

  // Keep the persisted render visible across reloads; prefer a fresh render once one exists.
  useEffect(() => {
    if (!videoUrl && initialVideoUrl) setShownUrl(initialVideoUrl);
  }, [initialVideoUrl, videoUrl]);
  useEffect(() => {
    if (videoUrl) setShownUrl(videoUrl);
  }, [videoUrl]);

  // Report lifecycle up to the parent so it can persist per-scene status.
  useEffect(() => {
    if (isGenerating) onGenState?.('generating');
  }, [isGenerating, onGenState]);
  useEffect(() => {
    if (videoUrl) onGenState?.('rendered', videoUrl);
  }, [videoUrl, onGenState]);
  useEffect(() => {
    if (error) onGenState?.('failed');
  }, [error, onGenState]);

  const handleCancel = () => {
    cancel();
    onGenState?.('cancelled');
  };

  const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  const intervalLabel = `${fmt(startTime)} – ${fmt(endTime)}`;

  const handleGenerateClick = () => {
    const finalPrompt = promptInput.trim()
      ? promptInput.trim()
      : `Cinematic shot for interval ${intervalLabel}${lyrics ? `, matching the mood of these lyrics: "${lyrics}"` : ''}`;
    generateVideo({
      prompt: finalPrompt,
      characterImageUrl,
      duration,
      cameraDirection: cameraDir,
    });
  };

  const canGenerate = !isGenerating && !!(characterImageUrl && String(characterImageUrl).trim());

  return (
    <div className="card">
      <h4 className="card-title">
        Generate clip <span className="muted">({intervalLabel})</span>
      </h4>

      {!characterImageUrl && (
        <p className="warn">
          Add a reference image to your locked character in the Assets tab — Kling needs a
          starting image to generate from.
        </p>
      )}

      <label className="field">
        <span className="label">Scene prompt</span>
        <textarea
          className="input"
          rows={3}
          placeholder="Describe this shot… (leave blank to auto-build from the lyrics)"
          value={promptInput}
          onChange={(e) => setPromptInput(e.target.value)}
        />
      </label>

      <div className="row">
        <label className="field half">
          <span className="label">Camera direction</span>
          <select className="input" value={cameraDir} onChange={(e) => setCameraDir(e.target.value)}>
            {CAMERA_DIRECTIONS.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </label>
        <label className="field half">
          <span className="label">Clip length</span>
          <select className="input" value={duration} onChange={(e) => setDuration(e.target.value)}>
            <option value="5">5 seconds</option>
            <option value="10">10 seconds</option>
          </select>
        </label>
      </div>
      <p className="hint">Kling renders 5s or 10s per clip — chain multiple clips for longer scenes.</p>

      {isGenerating ? (
        <button className="btn btn-danger" onClick={handleCancel}>
          Cancel render
        </button>
      ) : (
        <button className="btn btn-primary" onClick={handleGenerateClick} disabled={!canGenerate}>
          Generate clip
        </button>
      )}
      {isGenerating && <p className="hint">Rendering… this usually takes 1–2 minutes.</p>}

      {error && <p className="error">{error}</p>}

      {shownUrl && (
        <div className="preview">
          <p className="label">Generated preview</p>
          <video src={shownUrl} controls playsInline preload="metadata" className="preview-video" />
          <a className="link" href={shownUrl} target="_blank" rel="noreferrer">
            Open full video
          </a>
        </div>
      )}
    </div>
  );
}
