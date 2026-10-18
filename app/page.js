'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Play, Pause, RotateCcw, Upload, Sparkles, Copy, Check,
  Film, Music, Sliders, Layers, Eye, Download, Plus, ChevronRight,
  Lock, Unlock, Clapperboard, Video, FileText, CheckCircle2, AlertCircle,
  RefreshCw, Trash2, X,
} from 'lucide-react';
import SceneGeneratePanel from '../components/SceneGeneratePanel';
import { useTranscription } from '../hooks/useTranscription';
import {
  DEFAULT_PALETTES, DEFAULT_STYLES, DEFAULT_CHARACTERS, DEFAULT_THEMES,
  INTERVAL_PRESETS, SHOT_TYPES, CAMERA_ANGLES, CAMERA_MOVES,
  SCENE_STATUS_LABEL,
} from '../lib/seed-data';
import { uid, formatTime, formatSrtTime, safeName, downloadFile, copyToClipboard, defaultSceneTitle } from '../lib/utils';

const STORAGE_KEY = 'mvd_projects_v1';
const STORE_VERSION = 2;
const PEAK_BINS = 700;

function freshStore() {
  return {
    version: STORE_VERSION,
    projects: [],
    activeId: null,
    characters: DEFAULT_CHARACTERS,
    palettes: DEFAULT_PALETTES,
    styles: DEFAULT_STYLES,
    themes: DEFAULT_THEMES,
  };
}

function blankProject(title) {
  return {
    id: uid(),
    title: title || 'Untitled Video',
    artist: '',
    audioDuration: 0,
    intervalSeconds: 10,
    aspectRatio: '9:16',
    enableCaptions: true,
    lockedAssets: {
      characterId: 'char-1',
      paletteId: 'pal-1',
      styleId: 'sty-1',
      themeId: 'thm-1',
    },
    rawLyrics: '',
    segments: [],
  };
}

function blankSegment(i, start, end, prev) {
  const p = prev || {};
  return {
    id: p.id || uid(),
    sceneNumber: i + 1,
    title: p.title || defaultSceneTitle(i),
    startTime: start,
    endTime: end,
    duration: end - start,
    lyrics: p.lyrics || '',
    shotType: p.shotType || 'Motion clip',
    lipSyncEnabled: !!p.lipSyncEnabled,
    characterAction: p.characterAction || '',
    cameraAngle: p.cameraAngle || 'Close-up',
    cameraMovement: p.cameraMovement || 'Static',
    setting: p.setting || '',
    lightingMood: p.lightingMood || '',
    notes: p.notes || '',
    approvedPrompt: p.approvedPrompt || '',
    videoStatus: p.videoStatus || 'empty',
    renderedVideoUrl: p.renderedVideoUrl || null,
  };
}

function StatusPill({ status }) {
  const label = SCENE_STATUS_LABEL[status] || SCENE_STATUS_LABEL.empty;
  const cls =
    status === 'rendered'
      ? 'bg-emerald-950 text-emerald-400 border-emerald-800'
      : status === 'prompt-ready'
        ? 'bg-amber-950 text-amber-400 border-amber-800'
        : status === 'generating'
          ? 'bg-indigo-950 text-indigo-300 border-indigo-800'
          : status === 'failed'
            ? 'bg-red-950 text-red-400 border-red-800'
            : 'bg-slate-800 text-slate-400 border-slate-700';
  return (
    <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${cls}`}>
      {label}
    </span>
  );
}

export default function DDCDirectorStudio() {
  // Navigation: 'projects' | 'timeline' | 'scenes' | 'assets' | 'coordination' | 'api-docs'
  const [activeTab, setActiveTab] = useState('timeline');
  const [store, setStore] = useState(freshStore);
  const [hydrated, setHydrated] = useState(false);

  // New Project modal
  const [showNewProjModal, setShowNewProjModal] = useState(false);
  const [newTitleInput, setNewTitleInput] = useState('');

  // Audio engine (session-only: the file itself is never persisted)
  const [audioUrl, setAudioUrl] = useState(null);
  const [audioFile, setAudioFile] = useState(null);
  const [audioFileName, setAudioFileName] = useState('');
  const [audioDur, setAudioDur] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeSegmentIndex, setActiveSegmentIndex] = useState(-1);
  const [loopEnabled, setLoopEnabled] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [customInterval, setCustomInterval] = useState('10');
  const [peaksVersion, setPeaksVersion] = useState(0);
  const peaksRef = useRef(null);
  const audioRef = useRef(null);
  const canvasRef = useRef(null);
  const playStateRef = useRef({ index: -1, start: 0, end: 0 });

  // Scene editor + misc UI
  const [selectedSceneIndex, setSelectedSceneIndex] = useState(0);
  const [copyFeedback, setCopyFeedback] = useState(null);

  // Asset add-forms
  const [newChar, setNewChar] = useState({ name: '', face: '', hair: '', outfit: '', imageUrl: '' });
  const [newPal, setNewPal] = useState({ name: '', hexes: ['#0f172a', '#f59e0b', '#06b6d4', '#475569'], mood: '' });
  const [newStyle, setNewStyle] = useState({ name: '', descriptor: '' });
  const [newTheme, setNewTheme] = useState({ name: '', notes: '' });

  const { transcribe, isTranscribing, error: transcribeError } = useTranscription();

  // ---------- Persistence ----------
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.version === STORE_VERSION && Array.isArray(parsed.projects)) {
          setStore({
            version: STORE_VERSION,
            projects: parsed.projects,
            activeId: parsed.activeId || null,
            characters: Array.isArray(parsed.characters) && parsed.characters.length ? parsed.characters : DEFAULT_CHARACTERS,
            palettes: Array.isArray(parsed.palettes) && parsed.palettes.length ? parsed.palettes : DEFAULT_PALETTES,
            styles: Array.isArray(parsed.styles) && parsed.styles.length ? parsed.styles : DEFAULT_STYLES,
            themes: Array.isArray(parsed.themes) && parsed.themes.length ? parsed.themes : DEFAULT_THEMES,
          });
          setHydrated(true);
          return;
        }
      }
    } catch { /* corrupted save — reseed */ }
    setStore(freshStore());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    } catch { /* storage full — ignore */ }
  }, [store, hydrated]);

  const project = store.projects.find((p) => p.id === store.activeId) || null;
  const projectSegments = project?.segments || [];

  const lockedChar = store.characters.find((c) => c.id === project?.lockedAssets.characterId) || store.characters[0] || null;
  const lockedPalette = store.palettes.find((p) => p.id === project?.lockedAssets.paletteId) || store.palettes[0] || null;
  const lockedStyle = store.styles.find((s) => s.id === project?.lockedAssets.styleId) || store.styles[0] || null;
  const lockedTheme = store.themes.find((t) => t.id === project?.lockedAssets.themeId) || store.themes[0] || null;

  function updateProject(patch) {
    setStore((s) => ({
      ...s,
      projects: s.projects.map((p) => (p.id === s.activeId ? { ...p, ...patch } : p)),
    }));
  }

  function updateSegment(idx, patch) {
    setStore((s) => ({
      ...s,
      projects: s.projects.map((p) => {
        if (p.id !== s.activeId) return p;
        const segs = (p.segments || []).map((sg, i) => (i === idx ? { ...sg, ...patch } : sg));
        return { ...p, segments: segs };
      }),
    }));
  }

  // ---------- Real audio: upload -> decode -> true duration + real peaks ----------
  async function handleAudioUpload(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    stopAudio();
    const url = URL.createObjectURL(file);
    setAudioFile(file);
    setAudioUrl(url);
    setAudioFileName(file.name);
    setCurrentTime(0);
    peaksRef.current = null;
    setPeaksVersion((v) => v + 1);
    try {
      const buf = await file.arrayBuffer();
      const AC = window.AudioContext || window.webkitAudioContext;
      const ctx = new AC();
      const audioBuf = await ctx.decodeAudioData(buf);
      const dur = audioBuf.duration;
      setAudioDur(dur);
      updateProject({ audioDuration: dur });
      const data = audioBuf.getChannelData(0);
      const peaks = new Float32Array(PEAK_BINS);
      const step = Math.max(1, Math.floor(data.length / PEAK_BINS));
      for (let i = 0; i < PEAK_BINS; i++) {
        let peak = 0;
        const s0 = i * step;
        for (let j = s0; j < Math.min(s0 + step, data.length); j += 8) {
          const v = Math.abs(data[j]);
          if (v > peak) peak = v;
        }
        peaks[i] = peak;
      }
      peaksRef.current = peaks;
      setPeaksVersion((v) => v + 1);
      ctx.close();
    } catch {
      setAudioDur(0);
    }
  }

  // ---------- Real waveform ----------
  function drawWaveform() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);
    const bgGrad = ctx.createLinearGradient(0, 0, 0, height);
    bgGrad.addColorStop(0, '#0f172a');
    bgGrad.addColorStop(1, '#020617');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    const peaks = peaksRef.current;
    const bars = 90;
    const barWidth = width / bars;
    const progress = audioDur > 0 ? currentTime / audioDur : 0;
    for (let i = 0; i < bars; i++) {
      let hgt;
      if (peaks) {
        const pi = Math.min(PEAK_BINS - 1, Math.floor((i / bars) * PEAK_BINS));
        hgt = Math.max(2, peaks[pi] * (height - 8));
      } else {
        hgt = 4;
      }
      const x = i * barWidth;
      const y = (height - hgt) / 2;
      ctx.fillStyle = i / bars <= progress ? '#06b6d4' : '#334155';
      ctx.fillRect(x, y, Math.max(1, barWidth - 2), hgt);
    }

    // Segment boundary markers
    ctx.strokeStyle = '#6366f1';
    ctx.lineWidth = 1.5;
    projectSegments.forEach((seg) => {
      if (!audioDur) return;
      const segX = (seg.startTime / audioDur) * width;
      ctx.beginPath();
      ctx.moveTo(segX, 0);
      ctx.lineTo(segX, height);
      ctx.stroke();
    });
  }

  useEffect(() => {
    drawWaveform();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTime, peaksVersion, projectSegments, audioDur, activeTab]);

  // ---------- Real segment playback (actual uploaded audio, loop toggle) ----------
  function stopAudio() {
    const a = audioRef.current;
    if (a) a.pause();
    playStateRef.current = { index: -1, start: 0, end: 0 };
    setIsPlaying(false);
    setActiveSegmentIndex(-1);
  }

  function playSegmentAudio(segIndex) {
    const seg = projectSegments[segIndex];
    const a = audioRef.current;
    if (!seg || !a || !audioUrl) return;
    if (a) a.pause();
    playStateRef.current = { index: segIndex, start: seg.startTime, end: seg.endTime };
    try {
      a.currentTime = Math.max(0, seg.startTime - 0.03);
    } catch { /* not ready */ }
    setActiveSegmentIndex(segIndex);
    setCurrentTime(seg.startTime);
    setIsPlaying(true);
    a.play().catch(() => {
      setIsPlaying(false);
      setActiveSegmentIndex(-1);
    });
  }

  function onTimeUpdate() {
    const a = audioRef.current;
    if (!a) return;
    setCurrentTime(a.currentTime);
    const { index, start, end } = playStateRef.current;
    if (index < 0) return;
    if (a.currentTime >= end - 0.05) {
      if (loopEnabled) {
        a.currentTime = Math.max(0, start);
      } else {
        stopAudio();
      }
    }
  }

  // ---------- Slicing (preserves per-index scene work on re-slice) ----------
  function sliceSegments(intervalSec) {
    if (!project || !audioDur) return;
    const old = project.segments || [];
    const count = Math.ceil(audioDur / intervalSec);
    const segs = [];
    for (let i = 0; i < count; i++) {
      const start = i * intervalSec;
      const end = Math.min((i + 1) * intervalSec, audioDur);
      segs.push(blankSegment(i, start, end, old[i]));
    }
    updateProject({ intervalSeconds: intervalSec, audioDuration: audioDur, segments: segs });
    setSelectedSceneIndex(0);
  }

  // ---------- Real lyrics: fal.ai whisper transcription -> map chunks onto segments ----------
  async function handleTranscribe() {
    if (!audioFile || !project) return;
    const result = await transcribe(audioFile);
    if (!result) return;
    const chunks = result.segments || [];
    const mapped = (project.segments || []).map((s) => ({
      ...s,
      lyrics: chunks.length
        ? chunks
            .filter((c) => c.start < s.endTime && c.end > s.startTime)
            .map((c) => c.text)
            .join('\n')
        : s.lyrics,
    }));
    updateProject({ rawLyrics: result.text || '', segments: mapped });
  }

  // ---------- AI prompt compiler (locked assets injected; user edits before generate) ----------
  function compilePromptForScene(scene) {
    const lipSyncDirective = scene.lipSyncEnabled
      ? `Protagonist strictly lipsyncing lyrics: "${scene.lyrics}". Mouth movements match syllables precisely.`
      : `B-Roll atmospheric action without vocalization.`;
    const styleDesc = lockedStyle ? lockedStyle.descriptor : 'cinematic photoreal style';
    const charDesc = lockedChar
      ? `${lockedChar.name}, ${lockedChar.face}, ${lockedChar.hair}, wearing ${lockedChar.outfit}`
      : 'the same performer throughout';
    const paletteHex = lockedPalette ? `[${lockedPalette.hexes.join(', ')}]` : '';
    const mood = scene.lightingMood || (lockedPalette ? lockedPalette.mood : 'cinematic');
    return (
      `Cinematic music video, ${styleDesc}. ` +
      `Character: ${charDesc}. ` +
      `Setting: ${scene.setting || (lockedTheme ? lockedTheme.notes : "director's choice")}. ` +
      `Action: ${scene.characterAction || 'cinematic performance'}. ` +
      `${lipSyncDirective} ` +
      `Camera Angle: ${scene.cameraAngle}. Camera Movement: ${scene.cameraMovement}. ` +
      `Lighting & Mood: ${mood}. ` +
      `Color Palette: ${paletteHex}. ` +
      `Flawless temporal consistency, master quality, 9:16 vertical ratio.`
    );
  }

  function handleGenerateAIPrompt(index) {
    updateSegment(index, {
      approvedPrompt: compilePromptForScene(projectSegments[index]),
      videoStatus: 'prompt-ready',
    });
  }

  function handlePromptChange(index, val) {
    const cur = projectSegments[index]?.videoStatus;
    updateSegment(index, {
      approvedPrompt: val,
      videoStatus: cur === 'generating' ? 'generating' : val.trim() ? 'prompt-ready' : 'empty',
    });
  }

  async function handleCopyPrompt(text, id) {
    await copyToClipboard(text || '');
    setCopyFeedback(id);
    setTimeout(() => setCopyFeedback(null), 2000);
  }

  // Generation lifecycle from the real fal.ai flow
  function handleGenState(index, status, videoUrl) {
    if (status === 'cancelled') {
      const cur = projectSegments[index];
      updateSegment(index, {
        videoStatus: cur?.approvedPrompt?.trim() ? 'prompt-ready' : 'empty',
      });
      return;
    }
    if (status === 'rendered' && videoUrl) {
      updateSegment(index, { videoStatus: 'rendered', renderedVideoUrl: videoUrl });
      return;
    }
    updateSegment(index, { videoStatus: status });
  }

  // ---------- Exports ----------
  function handleDownloadSRT() {
    if (!project) return;
    let srtContent = '';
    projectSegments.forEach((seg, i) => {
      srtContent += `${i + 1}\n${formatSrtTime(seg.startTime)} --> ${formatSrtTime(seg.endTime)}\n${seg.lyrics || '[Instrumental]'}\n\n`;
    });
    downloadFile(`${safeName(project.title)}_captions.srt`, srtContent, 'text/plain;charset=utf-8');
  }

  function handleDownloadShotList() {
    if (!project) return;
    let text = `====================================================\n`;
    text += `DDC DREAM DISCECT CREATE: MASTER PRODUCTION SHOT LIST\n`;
    text += `Song: ${project.title} | Duration: ${Math.round(project.audioDuration || audioDur)}s\n`;
    text += `Locked Character: ${lockedChar ? lockedChar.name : '—'}\n`;
    text += `Locked Palette: ${lockedPalette ? `${lockedPalette.name} (${lockedPalette.hexes.join(', ')})` : '—'}\n`;
    text += `Locked Style: ${lockedStyle ? lockedStyle.name : '—'}\n`;
    text += `Locked Theme: ${lockedTheme ? lockedTheme.name : '—'}\n`;
    text += `====================================================\n\n`;
    projectSegments.forEach((seg) => {
      text += `SCENE ${seg.sceneNumber} [${formatTime(seg.startTime)} - ${formatTime(seg.endTime)}] - "${seg.title}"\n`;
      text += `Shot Type: ${seg.shotType} | Lip Sync: ${seg.lipSyncEnabled ? 'YES' : 'NO'}\n`;
      text += `Lyrics: "${seg.lyrics}"\n`;
      text += `Angle: ${seg.cameraAngle} | Movement: ${seg.cameraMovement}\n`;
      text += `Action: ${seg.characterAction}\n`;
      text += `Lighting: ${seg.lightingMood}\n`;
      text += `Status: ${SCENE_STATUS_LABEL[seg.videoStatus] || seg.videoStatus}\n`;
      text += `Compiled Prompt:\n${seg.approvedPrompt || '(Draft prompt not compiled yet)'}\n`;
      text += `----------------------------------------------------\n\n`;
    });
    downloadFile(`${safeName(project.title)}_ShotList.txt`, text, 'text/plain;charset=utf-8');
  }

  function createProject() {
    if (!newTitleInput.trim()) return;
    const proj = blankProject(newTitleInput.trim());
    setStore((s) => ({ ...s, projects: [proj, ...s.projects], activeId: proj.id }));
    setNewTitleInput('');
    setShowNewProjModal(false);
    setActiveTab('timeline');
  }

  function deleteProject(id) {
    const proj = store.projects.find((p) => p.id === id);
    if (!proj) return;
    if (!window.confirm(`Delete "${proj.title}" and all its scenes?`)) return;
    setStore((s) => {
      const projects = s.projects.filter((p) => p.id !== id);
      return { ...s, projects, activeId: s.activeId === id ? (projects[0]?.id || null) : s.activeId };
    });
  }

  // ---------- Asset library helpers (global library, per-project locks) ----------
  function lockAsset(key, id) {
    updateProject({ lockedAssets: { ...project.lockedAssets, [key]: id } });
  }

  function deleteAsset(listKey, lockKey, id, label) {
    if (!window.confirm(`Delete this ${label}? Scenes using it will fall back to the next available.`)) return;
    setStore((s) => {
      const list = (s[listKey] || []).filter((x) => x.id !== id);
      return {
        ...s,
        [listKey]: list,
        projects: s.projects.map((p) =>
          p.id === s.activeId && p.lockedAssets[lockKey] === id
            ? { ...p, lockedAssets: { ...p.lockedAssets, [lockKey]: list[0]?.id || null } }
            : p
        ),
      };
    });
  }

  function addCharacter() {
    if (!newChar.name.trim()) return;
    setStore((s) => ({ ...s, characters: [...s.characters, { ...newChar, id: uid() }] }));
    setNewChar({ name: '', face: '', hair: '', outfit: '', imageUrl: '' });
  }

  function addPalette() {
    if (!newPal.name.trim()) return;
    setStore((s) => ({ ...s, palettes: [...s.palettes, { ...newPal, id: uid() }] }));
    setNewPal({ name: '', hexes: ['#0f172a', '#f59e0b', '#06b6d4', '#475569'], mood: '' });
  }

  function addStyle() {
    if (!newStyle.name.trim()) return;
    setStore((s) => ({ ...s, styles: [...s.styles, { ...newStyle, id: uid() }] }));
    setNewStyle({ name: '', descriptor: '' });
  }

  function addTheme() {
    if (!newTheme.name.trim()) return;
    setStore((s) => ({ ...s, themes: [...s.themes, { ...newTheme, id: uid() }] }));
    setNewTheme({ name: '', notes: '' });
  }

  // ==================== TAB: PROJECTS ====================
  function renderProjectsTab() {
    return (
      <div className="space-y-5 animate-fadeIn">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-white tracking-wide">Video Projects</h2>
            <p className="text-xs text-slate-400">All your song visualizer and music video workflows</p>
          </div>
          <button
            onClick={() => setShowNewProjModal(true)}
            className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold px-3 py-2 rounded-lg text-xs flex items-center space-x-1"
          >
            <Plus className="w-4 h-4" />
            <span>Create New</span>
          </button>
        </div>

        {!store.projects.length && (
          <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-6 text-center">
            <Clapperboard className="w-8 h-8 text-cyan-400 mx-auto mb-2" />
            <p className="text-sm text-slate-300 font-semibold">No projects yet</p>
            <p className="text-xs text-slate-400 mt-1">Create your first video project to start directing.</p>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {store.projects.map((proj) => {
            const isCurrent = proj.id === store.activeId;
            return (
              <div
                key={proj.id}
                onClick={() => {
                  setStore((s) => ({ ...s, activeId: proj.id }));
                  setActiveTab('timeline');
                }}
                className={`cursor-pointer p-4 rounded-xl border transition-all ${
                  isCurrent
                    ? 'bg-slate-900/90 border-cyan-500 ring-1 ring-cyan-500/50 shadow-lg shadow-cyan-950/30'
                    : 'bg-slate-900/40 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <span className="text-[10px] font-mono uppercase tracking-wider text-cyan-400 bg-cyan-950/70 px-2 py-0.5 rounded">
                      {proj.aspectRatio || '9:16'} Vertical
                    </span>
                    <h3 className="font-bold text-white text-base mt-2">{proj.title}</h3>
                    <p className="text-xs text-slate-400">{proj.artist || 'Master Audio'}</p>
                  </div>
                  <span className="text-xs font-mono text-slate-400 bg-slate-800 px-2 py-1 rounded">
                    {Math.round(proj.audioDuration || 0)}s
                  </span>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
                  <span>Sliced in: {proj.intervalSeconds}s segments · {(proj.segments || []).length} scenes</span>
                  <span className="flex items-center space-x-2">
                    <button
                      onClick={(ev) => {
                        ev.stopPropagation();
                        deleteProject(proj.id);
                      }}
                      className="text-slate-500 hover:text-red-400"
                      title="Delete project"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                    <span className="text-cyan-400 flex items-center space-x-1">
                      <span>Open Studio</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </span>
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ==================== TAB: TIMELINE ====================
  function renderTimelineTab() {
    if (!project) {
      return (
        <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-6 text-center">
          <p className="text-sm text-slate-300 font-semibold">No project open</p>
          <p className="text-xs text-slate-400 mt-1">Create or open a project first.</p>
          <button
            onClick={() => setActiveTab('projects')}
            className="mt-3 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold px-4 py-2 rounded-lg text-xs"
          >
            Go to Projects
          </button>
        </div>
      );
    }

    return (
      <div className="space-y-6">
        {/* Audio Upload Card */}
        <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <div>
              <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400">Track Master</span>
              <h3 className="text-base font-bold text-white flex items-center space-x-2">
                <Music className="w-4 h-4 text-cyan-400" />
                <span className="truncate">{audioFileName || 'No audio uploaded yet'}</span>
              </h3>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Re-upload your audio each visit — scenes, lyrics and assets are saved, the audio file itself is not.
              </p>
            </div>

            <label className="cursor-pointer bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 px-3 py-2 rounded-xl text-xs font-medium flex items-center justify-center space-x-2 transition active:scale-95">
              <Upload className="w-3.5 h-3.5 text-cyan-400" />
              <span>Upload Audio (MP3/WAV/M4A)</span>
              <input
                type="file"
                accept="audio/mp3,audio/wav,audio/m4a,audio/*"
                className="hidden"
                onChange={handleAudioUpload}
              />
            </label>
          </div>

          {/* Real Waveform */}
          <div className="relative rounded-xl overflow-hidden border border-slate-800/80 bg-slate-950 p-2">
            <canvas
              ref={canvasRef}
              width={700}
              height={100}
              className="w-full h-24 rounded-lg block cursor-pointer"
              onClick={(e) => {
                if (!audioDur || !projectSegments.length) return;
                const rect = e.currentTarget.getBoundingClientRect();
                const clickedRatio = (e.clientX - rect.left) / rect.width;
                const targetSec = clickedRatio * audioDur;
                const foundIndex = projectSegments.findIndex(
                  (s) => targetSec >= s.startTime && targetSec < s.endTime
                );
                if (foundIndex !== -1) playSegmentAudio(foundIndex);
              }}
            />
            <div className="absolute bottom-2 right-4 text-[10px] font-mono text-cyan-300 bg-slate-950/80 px-2 py-0.5 rounded border border-cyan-900/50">
              {formatTime(currentTime)} / {formatTime(audioDur)}
            </div>
          </div>

          {/* Interval Slicer Toolbar */}
          <div className="mt-4 pt-3 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center space-x-2">
              <span className="text-xs font-semibold text-slate-400">Slice Interval:</span>
              <div className="flex flex-wrap gap-1.5">
                {INTERVAL_PRESETS.map((sec) => (
                  <button
                    key={sec}
                    onClick={() => sliceSegments(sec)}
                    disabled={!audioDur}
                    className={`text-xs px-2.5 py-1 rounded-md font-mono font-medium transition disabled:opacity-40 ${
                      project.intervalSeconds === sec
                        ? 'bg-cyan-500 text-slate-950 font-bold shadow-md shadow-cyan-500/20'
                        : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    {sec}s
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center space-x-1.5 text-xs">
              <span className="text-slate-400">Custom:</span>
              <input
                type="number"
                min="2"
                max="120"
                value={customInterval}
                onChange={(e) => setCustomInterval(e.target.value)}
                className="w-14 bg-slate-950 border border-slate-700 rounded px-1.5 py-1 text-center font-mono text-white text-xs"
              />
              <button
                onClick={() => {
                  const val = parseInt(customInterval, 10);
                  if (val > 0) sliceSegments(val);
                }}
                disabled={!audioDur}
                className="bg-slate-800 hover:bg-slate-700 px-2 py-1 rounded text-cyan-400 font-bold disabled:opacity-40"
              >
                Set
              </button>
            </div>
          </div>
          {!audioDur && (
            <p className="text-[11px] text-amber-400/90 mt-2">
              Upload your audio above first — slicing needs the real track length.
            </p>
          )}
        </div>

        {/* Lyrics: real transcription */}
        <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-4 sm:p-5">
          <h3 className="text-sm font-bold text-white tracking-wide uppercase mb-1">Lyrics Sync</h3>
          <p className="text-[11px] text-slate-400 mb-3">
            The app listens to your uploaded audio and pulls the lyrics out with AI transcription —
            each line lands in its time segment automatically. Sung vocals can trip it up, so fix
            any misheard lines by hand in the Scenes tab.
          </p>
          <button
            onClick={handleTranscribe}
            disabled={!audioFile || isTranscribing}
            className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white px-3 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center space-x-2 transition active:scale-95"
          >
            {isTranscribing ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Listening… transcribing your audio (a full song takes a few minutes)</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                <span>Extract lyrics from audio</span>
              </>
            )}
          </button>
          {transcribeError && (
            <p className="text-[11px] text-red-400 mt-2 flex items-start space-x-1.5">
              <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
              <span>{transcribeError}</span>
            </p>
          )}
        </div>

        {/* Sliced Segments */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center space-x-2">
              <h3 className="text-sm font-bold text-white tracking-wide uppercase">
                Timeline Slices ({projectSegments.length} Scenes)
              </h3>
              <span className="text-xs text-slate-400 font-mono">
                [{project.intervalSeconds}s intervals]
              </span>
            </div>

            <button
              onClick={() => setLoopEnabled(!loopEnabled)}
              className={`text-xs px-3 py-1.5 rounded-lg flex items-center space-x-1.5 transition ${
                loopEnabled
                  ? 'bg-indigo-600/30 text-indigo-400 border border-indigo-500/50'
                  : 'bg-slate-800 text-slate-400 border border-slate-700'
              }`}
            >
              <RotateCcw className={`w-3 h-3 ${loopEnabled ? 'animate-spin-slow' : ''}`} />
              <span>Loop: {loopEnabled ? 'ON' : 'OFF'}</span>
            </button>
          </div>

          {!projectSegments.length && (
            <p className="text-xs text-slate-500 bg-slate-900/40 border border-slate-800 rounded-xl p-4 text-center">
              Upload audio, then pick an interval above to slice your song into scenes.
            </p>
          )}

          <div className="space-y-3">
            {projectSegments.map((seg, idx) => {
              const isCurrentPlaying = isPlaying && activeSegmentIndex === idx;
              return (
                <div
                  key={seg.id}
                  className={`p-3.5 rounded-xl border transition-all ${
                    isCurrentPlaying
                      ? 'bg-cyan-950/20 border-cyan-500 shadow-lg shadow-cyan-950/50 ring-1 ring-cyan-500/40'
                      : 'bg-slate-900/60 border-slate-800/80 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <button
                        onClick={() => {
                          if (isCurrentPlaying) stopAudio();
                          else playSegmentAudio(idx);
                        }}
                        disabled={!audioUrl}
                        className={`w-9 h-9 rounded-lg flex items-center justify-center transition active:scale-90 disabled:opacity-40 ${
                          isCurrentPlaying
                            ? 'bg-cyan-500 text-slate-950 font-bold shadow-md shadow-cyan-500/30'
                            : 'bg-slate-800 text-cyan-400 hover:bg-slate-700'
                        }`}
                      >
                        {isCurrentPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
                      </button>

                      <div>
                        <div className="flex items-center space-x-2">
                          <span className="font-bold text-white text-xs">Scene {seg.sceneNumber}:</span>
                          <input
                            type="text"
                            value={seg.title}
                            onChange={(e) => updateSegment(idx, { title: e.target.value })}
                            className="bg-transparent border-b border-transparent hover:border-slate-700 focus:border-cyan-500 focus:outline-none text-xs font-medium text-slate-200 w-40"
                          />
                        </div>
                        <span className="text-[11px] font-mono text-cyan-400">
                          {formatTime(seg.startTime)} – {formatTime(seg.endTime)} ({Math.round(seg.duration)}s)
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center space-x-2">
                      <StatusPill status={seg.videoStatus} />
                      <button
                        onClick={() => {
                          setSelectedSceneIndex(idx);
                          setActiveTab('scenes');
                        }}
                        className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-1"
                      >
                        <span>Edit Scene</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="mt-2 text-xs bg-slate-950/60 rounded px-2.5 py-1.5 text-slate-300 font-mono flex items-center space-x-2 border border-slate-800/50">
                    <span className="text-slate-400 text-[10px] uppercase flex-shrink-0">Lyrics:</span>
                    <span className="italic truncate">{seg.lyrics ? `"${seg.lyrics.split('\n')[0]}${seg.lyrics.includes('\n') ? ' …' : ''}"` : '(no lyrics yet — transcribe above)'}</span>
                  </div>

                  {seg.renderedVideoUrl && (
                    <div className="mt-2">
                      <video src={seg.renderedVideoUrl} controls playsInline preload="metadata" className="w-full max-h-40 rounded-lg border border-emerald-500/40 object-cover" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Export bar */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            <h4 className="text-xs font-bold text-white uppercase tracking-wider">Export Master Delivery</h4>
            <p className="text-[11px] text-slate-400">Assemble synchronized SRT captions and camera call shot list.</p>
          </div>

          <div className="flex items-center space-x-2 w-full sm:w-auto">
            <button
              onClick={handleDownloadSRT}
              disabled={!project.enableCaptions || !projectSegments.some((s) => (s.lyrics || '').trim())}
              className="flex-1 sm:flex-none bg-slate-800 hover:bg-slate-700 disabled:opacity-40 border border-slate-700 text-slate-200 px-3 py-2 rounded-lg text-xs font-bold flex items-center justify-center space-x-1.5 transition active:scale-95"
            >
              <Download className="w-3.5 h-3.5 text-cyan-400" />
              <span>Download .SRT</span>
            </button>

            <button
              onClick={handleDownloadShotList}
              disabled={!projectSegments.length}
              className="flex-1 sm:flex-none bg-cyan-500 hover:bg-cyan-400 disabled:opacity-40 text-slate-950 px-3 py-2 rounded-lg text-xs font-bold flex items-center justify-center space-x-1.5 shadow-md shadow-cyan-500/20 transition active:scale-95"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Export Shot List</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ==================== TAB: SCENES ====================
  function renderScenesTab() {
    if (!project) {
      return (
        <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-6 text-center">
          <p className="text-sm text-slate-300 font-semibold">No project open</p>
        </div>
      );
    }
    if (!projectSegments.length) {
      return (
        <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-6 text-center">
          <p className="text-sm text-slate-300 font-semibold">No scenes yet</p>
          <p className="text-xs text-slate-400 mt-1">Slice your song into segments in the Timeline tab first.</p>
          <button
            onClick={() => setActiveTab('timeline')}
            className="mt-3 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold px-4 py-2 rounded-lg text-xs"
          >
            Go to Timeline
          </button>
        </div>
      );
    }

    const scene = projectSegments[selectedSceneIndex];
    if (!scene) return null;
    const isRenderingThis = scene.videoStatus === 'generating';

    const genDisabledReason = !scene.approvedPrompt.trim()
      ? 'Draft or type a prompt above, then approve it — nothing generates until you say so.'
      : !(lockedChar && lockedChar.imageUrl)
        ? 'Add a reference image URL to your locked character in the Assets tab — Kling needs a starting image.'
        : '';

    return (
      <div className="space-y-6">
        {/* Scene Selector Strip */}
        <div className="flex items-center space-x-2 overflow-x-auto pb-2 scrollbar-thin">
          {projectSegments.map((seg, i) => (
            <button
              key={seg.id}
              onClick={() => setSelectedSceneIndex(i)}
              className={`flex-shrink-0 px-3 py-2 rounded-xl border text-xs font-bold flex flex-col items-center transition ${
                selectedSceneIndex === i
                  ? 'bg-cyan-500 text-slate-950 border-cyan-400 shadow-md shadow-cyan-500/30'
                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
              }`}
            >
              <span>Scene {seg.sceneNumber}</span>
              <span className="text-[10px] font-mono opacity-80">{formatTime(seg.startTime)}</span>
            </button>
          ))}
        </div>

        {/* Scene Card Editor */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 sm:p-6 shadow-2xl space-y-6 relative">
          {isRenderingThis && (
            <div className="absolute inset-0 z-10 rounded-2xl bg-slate-950/60 backdrop-blur-[1px] flex flex-col items-center justify-center pointer-events-none">
              <RefreshCw className="w-8 h-8 text-cyan-400 animate-spin mb-2" />
              <p className="text-xs font-bold text-cyan-300">Rendering clip via fal.ai…</p>
              <p className="text-[11px] text-slate-400 mt-1">This usually takes 1–2 minutes.</p>
            </div>
          )}

          {/* Scene Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-800 gap-3">
            <div>
              <div className="flex items-center space-x-2 flex-wrap gap-1.5">
                <span className="text-xs font-black uppercase tracking-wider bg-cyan-950 text-cyan-400 border border-cyan-800/80 px-2 py-0.5 rounded">
                  SCENE {scene.sceneNumber} OF {projectSegments.length}
                </span>
                <span className="text-xs font-mono text-slate-400">
                  {formatTime(scene.startTime)} – {formatTime(scene.endTime)} ({Math.round(scene.duration)}s clip)
                </span>
                <StatusPill status={scene.videoStatus} />
              </div>
              <h2 className="text-lg font-bold text-white mt-1">{scene.title}</h2>
            </div>

            <div className="flex items-center space-x-2">
              <button
                onClick={() => playSegmentAudio(selectedSceneIndex)}
                disabled={!audioUrl}
                className="bg-indigo-600/30 hover:bg-indigo-600/50 disabled:opacity-40 border border-indigo-500/50 text-indigo-300 px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-1.5"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Listen to Slice</span>
              </button>
            </div>
          </div>

          {/* Continuity Engine Injections */}
          <div className="p-3 bg-slate-950/80 rounded-xl border border-slate-800/80 text-xs">
            <span className="text-[10px] font-mono uppercase text-slate-400 block mb-1.5">
              Continuity Engine Injections (Locked Globally):
            </span>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-slate-300">
              <div className="truncate">
                <span className="text-slate-400">Actor:</span>{' '}
                <span className="font-semibold text-cyan-300">{lockedChar ? lockedChar.name : '—'}</span>
              </div>
              <div className="truncate">
                <span className="text-slate-400">Style:</span>{' '}
                <span className="font-semibold text-cyan-300">{lockedStyle ? lockedStyle.name : '—'}</span>
              </div>
              <div className="truncate flex items-center space-x-1">
                <span className="text-slate-400">Palette:</span>
                <div className="flex space-x-0.5">
                  {(lockedPalette ? lockedPalette.hexes : []).map((hex, hx) => (
                    <span key={hx} className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: hex }} />
                  ))}
                </div>
              </div>
              <div className="truncate">
                <span className="text-slate-400">Setting:</span>{' '}
                <span className="font-semibold text-cyan-300">{lockedTheme ? lockedTheme.name : '—'}</span>
              </div>
            </div>
          </div>

          {/* Direction Inputs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-3 bg-slate-950/50 p-3.5 rounded-xl border border-slate-800/80">
              <label className="text-xs font-bold text-slate-300 block">Shot Category</label>
              <div className="grid grid-cols-2 gap-2">
                {SHOT_TYPES.map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => updateSegment(selectedSceneIndex, {
                      shotType: type,
                      lipSyncEnabled: type === 'Lip sync' ? true : scene.lipSyncEnabled,
                    })}
                    className={`py-2 px-2.5 rounded-lg text-xs font-medium border text-center transition ${
                      scene.shotType === type
                        ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/60 font-bold'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    {type}
                  </button>
                ))}
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-slate-800">
                <span className="text-xs text-slate-300">Lip-Sync Vocal Match:</span>
                <button
                  onClick={() => updateSegment(selectedSceneIndex, { lipSyncEnabled: !scene.lipSyncEnabled })}
                  className={`text-xs px-2.5 py-1 rounded font-bold transition ${
                    scene.lipSyncEnabled
                      ? 'bg-emerald-500 text-slate-950 shadow-sm shadow-emerald-500/40'
                      : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  {scene.lipSyncEnabled ? 'ENABLED' : 'DISABLED'}
                </button>
              </div>
            </div>

            <div className="space-y-3 bg-slate-950/50 p-3.5 rounded-xl border border-slate-800/80">
              <div>
                <label className="text-xs font-bold text-slate-300 block mb-1">Camera Angle</label>
                <select
                  value={scene.cameraAngle}
                  onChange={(e) => updateSegment(selectedSceneIndex, { cameraAngle: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-cyan-500"
                >
                  {CAMERA_ANGLES.map((ang) => (
                    <option key={ang} value={ang}>{ang}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-300 block mb-1">Camera Movement</label>
                <select
                  value={scene.cameraMovement}
                  onChange={(e) => updateSegment(selectedSceneIndex, { cameraMovement: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-cyan-500"
                >
                  {CAMERA_MOVES.map((mov) => (
                    <option key={mov} value={mov}>{mov}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Action & Lyrics */}
          <div className="space-y-3">
            <div>
              <label className="text-xs font-bold text-slate-300 block mb-1">
                Character Movement / Action Directions
              </label>
              <input
                type="text"
                value={scene.characterAction}
                onChange={(e) => updateSegment(selectedSceneIndex, { characterAction: e.target.value })}
                placeholder="e.g. Actor turns slowly toward the rain, drops hands into coat pockets..."
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-slate-300 block mb-1">Setting / Location</label>
                <input
                  type="text"
                  value={scene.setting}
                  onChange={(e) => updateSegment(selectedSceneIndex, { setting: e.target.value })}
                  placeholder="Defaults to locked theme"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-300 block mb-1">Lighting &amp; Mood</label>
                <input
                  type="text"
                  value={scene.lightingMood}
                  onChange={(e) => updateSegment(selectedSceneIndex, { lightingMood: e.target.value })}
                  placeholder="Defaults to locked palette mood"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-bold text-slate-300 block mb-1">
                Segment Lyric Line (for mouth articulation and captions)
              </label>
              <textarea
                rows={2}
                value={scene.lyrics}
                onChange={(e) => updateSegment(selectedSceneIndex, { lyrics: e.target.value })}
                placeholder="Transcribe from the Timeline tab, or type the lyric line here…"
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono text-cyan-300 focus:outline-none focus:border-cyan-500"
              />
            </div>
          </div>

          {/* AI PROMPT BUILDER + APPROVAL GATE */}
          <div className="bg-gradient-to-b from-slate-950 to-[#070b12] border border-cyan-900/40 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Sparkles className="w-4 h-4 text-cyan-400" />
                <span className="text-xs font-bold text-white uppercase tracking-wider">
                  Video Generation Prompt (Rule: Read &amp; Approve First)
                </span>
              </div>
              <button
                type="button"
                onClick={() => handleGenerateAIPrompt(selectedSceneIndex)}
                className="bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition active:scale-95 shadow-md shadow-indigo-600/30"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>AI Assist Draft</span>
              </button>
            </div>

            <p className="text-[11px] text-slate-400">
              You always inspect and edit the prompt before anything generates. This merges your locked
              character, color palette, camera angles, and lyrics.
            </p>

            <textarea
              rows={4}
              value={scene.approvedPrompt}
              onChange={(e) => handlePromptChange(selectedSceneIndex, e.target.value)}
              placeholder="Type your prompt directions here, or tap 'AI Assist Draft' above to automatically construct the scene..."
              className="w-full bg-slate-900/90 border border-slate-700/80 rounded-lg p-3 text-xs text-slate-200 font-mono leading-relaxed focus:outline-none focus:border-cyan-400"
            />

            <div className="flex flex-col sm:flex-row items-stretch gap-3">
              <button
                type="button"
                onClick={() => handleCopyPrompt(scene.approvedPrompt, scene.id)}
                disabled={!scene.approvedPrompt.trim()}
                className="sm:w-auto bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 px-3 py-2 rounded-lg text-xs font-medium flex items-center justify-center space-x-1.5 border border-slate-700"
              >
                {copyFeedback === scene.id ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-emerald-400">Prompt Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Copy Prompt</span>
                  </>
                )}
              </button>
            </div>

            {/* REAL generation: fal.ai Kling via our server routes */}
            <SceneGeneratePanel
              prompt={scene.approvedPrompt}
              characterImageUrl={lockedChar?.imageUrl || ''}
              cameraDirection={`${scene.cameraAngle}, ${scene.cameraMovement}`}
              intervalLabel={`${formatTime(scene.startTime)} – ${formatTime(scene.endTime)}`}
              disabledReason={genDisabledReason}
              onGenState={(status, url) => handleGenState(selectedSceneIndex, status, url)}
            />

            {scene.renderedVideoUrl && (
              <div className="mt-2 pt-4 border-t border-slate-800">
                <span className="text-xs font-bold text-emerald-400 flex items-center space-x-1 mb-2">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Clip Rendered Successfully</span>
                </span>
                <div className="relative rounded-xl overflow-hidden bg-black aspect-[9/16] max-w-[200px] mx-auto border border-emerald-500/40 shadow-xl">
                  <video
                    src={scene.renderedVideoUrl}
                    controls
                    loop
                    playsInline
                    preload="metadata"
                    className="w-full h-full object-cover"
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ==================== TAB: ASSETS (Continuity Engine) ====================
  function renderAssetsTab() {
    if (!project) {
      return (
        <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-6 text-center">
          <p className="text-sm text-slate-300 font-semibold">No project open</p>
          <p className="text-xs text-slate-400 mt-1">Open a project to lock assets for it. The library below is shared across projects.</p>
        </div>
      );
    }

    const lockBtn = (isLocked, onLock) => (
      <button
        onClick={onLock}
        className={`text-[10px] font-bold px-2 py-0.5 rounded flex items-center space-x-1 ${
          isLocked ? 'bg-cyan-500 text-slate-950' : 'bg-slate-800 text-slate-400 hover:text-white'
        }`}
      >
        {isLocked ? <Lock className="w-3 h-3 inline mr-0.5" /> : <Unlock className="w-3 h-3 inline mr-0.5" />}
        <span>{isLocked ? 'Locked' : 'Lock As Default'}</span>
      </button>
    );

    const delBtn = (onDelete, label) => (
      <button
        onClick={onDelete}
        title={`Delete ${label}`}
        className="text-slate-600 hover:text-red-400 p-1"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    );

    const inputCls = "w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-2 text-xs text-white focus:outline-none focus:border-cyan-500";

    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-bold text-white tracking-wide">Global Continuity Engine</h2>
          <p className="text-xs text-slate-400">
            Lock your visual assets per project. All 5-to-40s intervals automatically inherit these
            settings for cinematic consistency.
          </p>
        </div>

        {/* 1. Characters */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-cyan-400 uppercase tracking-wider">1. Characters / Actors</h3>
            <span className="text-[11px] text-slate-400">1 Locked per project</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {store.characters.map((char) => {
              const isLocked = project.lockedAssets.characterId === char.id;
              return (
                <div
                  key={char.id}
                  className={`p-3.5 rounded-xl border flex gap-3 transition ${
                    isLocked
                      ? 'bg-slate-900 border-cyan-500 shadow-md shadow-cyan-950/50 ring-1 ring-cyan-500/40'
                      : 'bg-slate-900/40 border-slate-800'
                  }`}
                >
                  {char.imageUrl ? (
                    <img src={char.imageUrl} alt={char.name} className="w-16 h-20 object-cover rounded-lg border border-slate-700 flex-shrink-0" />
                  ) : (
                    <div className="w-16 h-20 rounded-lg border border-slate-700 bg-slate-950 flex items-center justify-center flex-shrink-0">
                      <span className="text-[10px] text-slate-600">No image</span>
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="font-bold text-white text-xs truncate">{char.name}</h4>
                      <div className="flex items-center space-x-1 flex-shrink-0">
                        {lockBtn(isLocked, () => lockAsset('characterId', char.id))}
                        {delBtn(() => deleteAsset('characters', 'characterId', char.id, 'character'), 'character')}
                      </div>
                    </div>
                    <p className="text-[11px] text-slate-300 line-clamp-2 mt-1">{char.face}</p>
                    <p className="text-[10px] text-slate-400 line-clamp-1 mt-0.5">Outfit: {char.outfit}</p>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3 space-y-2">
            <p className="text-[11px] font-bold text-slate-300">Add character</p>
            <input className={inputCls} placeholder="Name" value={newChar.name} onChange={(e) => setNewChar({ ...newChar, name: e.target.value })} />
            <input className={inputCls} placeholder="Face / vibe" value={newChar.face} onChange={(e) => setNewChar({ ...newChar, face: e.target.value })} />
            <div className="grid grid-cols-2 gap-2">
              <input className={inputCls} placeholder="Hair" value={newChar.hair} onChange={(e) => setNewChar({ ...newChar, hair: e.target.value })} />
              <input className={inputCls} placeholder="Outfit" value={newChar.outfit} onChange={(e) => setNewChar({ ...newChar, outfit: e.target.value })} />
            </div>
            <input className={inputCls} placeholder="Reference image URL (Kling generates from this)" value={newChar.imageUrl} onChange={(e) => setNewChar({ ...newChar, imageUrl: e.target.value })} />
            <button onClick={addCharacter} disabled={!newChar.name.trim()} className="w-full bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 py-2 rounded-lg text-xs font-bold flex items-center justify-center space-x-1">
              <Plus className="w-3.5 h-3.5" /><span>Add character</span>
            </button>
          </div>
        </div>

        {/* 2. Palettes */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-cyan-400 uppercase tracking-wider">2. Color Palettes</h3>
            <span className="text-[11px] text-slate-400">Guarantees color grading unity</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {store.palettes.map((pal) => {
              const isLocked = project.lockedAssets.paletteId === pal.id;
              return (
                <div
                  key={pal.id}
                  className={`p-3 rounded-xl border transition ${
                    isLocked ? 'bg-slate-900 border-cyan-500 shadow-md ring-1 ring-cyan-500/40' : 'bg-slate-900/40 border-slate-800'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2 gap-2">
                    <h4 className="text-xs font-bold text-white truncate">{pal.name}</h4>
                    <div className="flex items-center space-x-1 flex-shrink-0">
                      {lockBtn(isLocked, () => lockAsset('paletteId', pal.id))}
                      {delBtn(() => deleteAsset('palettes', 'paletteId', pal.id, 'palette'), 'palette')}
                    </div>
                  </div>
                  <div className="flex h-5 rounded-md overflow-hidden mb-2">
                    {pal.hexes.map((hex, i) => (
                      <div key={i} className="flex-1" style={{ backgroundColor: hex }} />
                    ))}
                  </div>
                  <p className="text-[10px] text-slate-400 line-clamp-2">{pal.mood}</p>
                </div>
              );
            })}
          </div>
          <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3 space-y-2">
            <p className="text-[11px] font-bold text-slate-300">Add palette</p>
            <input className={inputCls} placeholder="Palette name" value={newPal.name} onChange={(e) => setNewPal({ ...newPal, name: e.target.value })} />
            <div className="flex items-center space-x-2">
              {newPal.hexes.map((hex, i) => (
                <input
                  key={i}
                  type="color"
                  value={hex}
                  onChange={(e) => {
                    const hexes = [...newPal.hexes];
                    hexes[i] = e.target.value;
                    setNewPal({ ...newPal, hexes });
                  }}
                  className="w-9 h-9 rounded"
                />
              ))}
              <input className={`${inputCls} flex-1`} placeholder="Mood (e.g. moody neon night)" value={newPal.mood} onChange={(e) => setNewPal({ ...newPal, mood: e.target.value })} />
            </div>
            <button onClick={addPalette} disabled={!newPal.name.trim()} className="w-full bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 py-2 rounded-lg text-xs font-bold flex items-center justify-center space-x-1">
              <Plus className="w-3.5 h-3.5" /><span>Add palette</span>
            </button>
          </div>
        </div>

        {/* 3. Styles */}
        <div className="space-y-3">
          <h3 className="text-xs font-bold text-cyan-400 uppercase tracking-wider">3. Visual Film Styles</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {store.styles.map((sty) => {
              const isLocked = project.lockedAssets.styleId === sty.id;
              return (
                <div
                  key={sty.id}
                  className={`p-3 rounded-xl border transition ${
                    isLocked ? 'bg-slate-900 border-cyan-500 shadow-md ring-1 ring-cyan-500/40' : 'bg-slate-900/40 border-slate-800'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5 gap-2">
                    <h4 className="text-xs font-bold text-white truncate">{sty.name}</h4>
                    <div className="flex items-center space-x-1 flex-shrink-0">
                      {lockBtn(isLocked, () => lockAsset('styleId', sty.id))}
                      {delBtn(() => deleteAsset('styles', 'styleId', sty.id, 'style'), 'style')}
                    </div>
                  </div>
                  <p className="text-[10px] text-slate-400 font-mono leading-relaxed line-clamp-3">{sty.descriptor}</p>
                </div>
              );
            })}
          </div>
          <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3 space-y-2">
            <p className="text-[11px] font-bold text-slate-300">Add style</p>
            <input className={inputCls} placeholder="Style name" value={newStyle.name} onChange={(e) => setNewStyle({ ...newStyle, name: e.target.value })} />
            <input className={inputCls} placeholder="Descriptor (lenses, grain, grade…)" value={newStyle.descriptor} onChange={(e) => setNewStyle({ ...newStyle, descriptor: e.target.value })} />
            <button onClick={addStyle} disabled={!newStyle.name.trim()} className="w-full bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 py-2 rounded-lg text-xs font-bold flex items-center justify-center space-x-1">
              <Plus className="w-3.5 h-3.5" /><span>Add style</span>
            </button>
          </div>
        </div>

        {/* 4. Themes */}
        <div className="space-y-3">
          <h3 className="text-xs font-bold text-cyan-400 uppercase tracking-wider">4. Themes / Environments</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {store.themes.map((thm) => {
              const isLocked = project.lockedAssets.themeId === thm.id;
              return (
                <div
                  key={thm.id}
                  className={`p-3 rounded-xl border transition ${
                    isLocked ? 'bg-slate-900 border-cyan-500 shadow-md ring-1 ring-cyan-500/40' : 'bg-slate-900/40 border-slate-800'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5 gap-2">
                    <h4 className="text-xs font-bold text-white truncate">{thm.name}</h4>
                    <div className="flex items-center space-x-1 flex-shrink-0">
                      {lockBtn(isLocked, () => lockAsset('themeId', thm.id))}
                      {delBtn(() => deleteAsset('themes', 'themeId', thm.id, 'theme'), 'theme')}
                    </div>
                  </div>
                  <p className="text-[10px] text-slate-400 line-clamp-3">{thm.notes}</p>
                </div>
              );
            })}
          </div>
          <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3 space-y-2">
            <p className="text-[11px] font-bold text-slate-300">Add theme</p>
            <input className={inputCls} placeholder="Theme name" value={newTheme.name} onChange={(e) => setNewTheme({ ...newTheme, name: e.target.value })} />
            <input className={inputCls} placeholder="Environment notes" value={newTheme.notes} onChange={(e) => setNewTheme({ ...newTheme, notes: e.target.value })} />
            <button onClick={addTheme} disabled={!newTheme.name.trim()} className="w-full bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 py-2 rounded-lg text-xs font-bold flex items-center justify-center space-x-1">
              <Plus className="w-3.5 h-3.5" /><span>Add theme</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ==================== TAB: REVIEW (Coordination + Master settings) ====================
  function renderReviewTab() {
    if (!project) {
      return (
        <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-6 text-center">
          <p className="text-sm text-slate-300 font-semibold">No project open</p>
        </div>
      );
    }

    return (
      <div className="space-y-5">
        <div>
          <h2 className="text-xl font-bold text-white tracking-wide">Scene Coordination Check</h2>
          <p className="text-xs text-slate-400">
            Inspect continuity side by side across all segments to spot character, color, or camera
            clashes before rendering.
          </p>
        </div>

        {!projectSegments.length ? (
          <p className="text-xs text-slate-500 bg-slate-900/40 border border-slate-800 rounded-xl p-4 text-center">
            No scenes yet — slice your song in the Timeline tab.
          </p>
        ) : (
          <div className="overflow-x-auto border border-slate-800 rounded-xl bg-slate-900/70">
            <table className="w-full text-left text-xs min-w-[640px]">
              <thead className="bg-slate-950 border-b border-slate-800 text-slate-400 font-mono uppercase text-[10px]">
                <tr>
                  <th className="p-3">Scene #</th>
                  <th className="p-3">Timeframe</th>
                  <th className="p-3">Shot Type</th>
                  <th className="p-3">Angle &amp; Move</th>
                  <th className="p-3">Lip Sync</th>
                  <th className="p-3">Character</th>
                  <th className="p-3">Status</th>
                  <th className="p-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-medium">
                {projectSegments.map((seg, idx) => (
                  <tr key={seg.id} className="hover:bg-slate-800/30">
                    <td className="p-3 font-bold text-white">Scene {seg.sceneNumber}</td>
                    <td className="p-3 font-mono text-cyan-400">{formatTime(seg.startTime)} - {formatTime(seg.endTime)}</td>
                    <td className="p-3 text-slate-300">{seg.shotType}</td>
                    <td className="p-3 text-slate-300">{seg.cameraAngle} / {seg.cameraMovement}</td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        seg.lipSyncEnabled ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : 'bg-slate-800 text-slate-400'
                      }`}>
                        {seg.lipSyncEnabled ? 'Lip-sync ON' : 'Off'}
                      </span>
                    </td>
                    <td className="p-3 text-cyan-300">{lockedChar ? lockedChar.name : '—'}</td>
                    <td className="p-3">
                      <StatusPill status={seg.videoStatus} />
                    </td>
                    <td className="p-3 text-right">
                      <button
                        onClick={() => {
                          setSelectedSceneIndex(idx);
                          setActiveTab('scenes');
                        }}
                        className="text-cyan-400 hover:text-cyan-300 font-bold whitespace-nowrap"
                      >
                        Edit →
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Master settings */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 space-y-3">
          <h3 className="text-xs font-bold text-white uppercase tracking-wider">Master Settings</h3>
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-300">Aspect ratio</span>
            <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
              9:16 vertical · fixed
            </span>
          </div>
          <p className="text-[11px] text-slate-500 -mt-2">Fixed for generation — every scene renders as a vertical 9:16 clip.</p>
          <label className="flex items-center justify-between text-xs cursor-pointer">
            <span className="text-slate-300">Closed captions</span>
            <input
              type="checkbox"
              checked={!!project.enableCaptions}
              onChange={(e) => updateProject({ enableCaptions: e.target.checked })}
              className="w-4 h-4 accent-cyan-500"
            />
          </label>
          <div>
            <span className="text-xs text-slate-300 block mb-1.5">Default interval length</span>
            <div className="flex flex-wrap gap-1.5">
              {INTERVAL_PRESETS.map((sec) => (
                <button
                  key={sec}
                  onClick={() => updateProject({ intervalSeconds: sec })}
                  className={`text-xs px-2.5 py-1 rounded-md font-mono font-medium transition ${
                    project.intervalSeconds === sec
                      ? 'bg-cyan-500 text-slate-950 font-bold'
                      : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  {sec}s
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Rendered clips gallery */}
        {projectSegments.some((s) => s.renderedVideoUrl) && (
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">Rendered Clips</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {projectSegments.filter((s) => s.renderedVideoUrl).map((s) => (
                <div key={s.id} className="rounded-xl overflow-hidden border border-emerald-500/40 bg-black">
                  <video src={s.renderedVideoUrl} controls playsInline preload="metadata" className="w-full aspect-[9/16] object-cover" />
                  <p className="text-[10px] font-mono text-slate-400 p-1.5 bg-slate-950">
                    Scene {s.sceneNumber} · {formatTime(s.startTime)}–{formatTime(s.endTime)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ==================== API DOCS DRAWER ====================
  function renderApiDocs() {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-white">fal.ai Backend Integration</h2>
            <p className="text-xs text-slate-400">Real App Router routes — the fal.ai key stays server-side, never in the app.</p>
          </div>
          <button
            onClick={() => setActiveTab('scenes')}
            className="bg-slate-800 hover:bg-slate-700 text-xs px-3 py-1.5 rounded-lg text-slate-300"
          >
            Back to Studio
          </button>
        </div>

        <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-4 text-xs">
          <div>
            <p className="font-mono text-cyan-300 font-bold mb-1">POST /api/generate-video</p>
            <p className="text-slate-400 mb-2">Starts a Kling v1.5 Pro image-to-video render. Body:</p>
            <pre className="font-mono text-slate-300 bg-slate-900 rounded-lg p-3 overflow-x-auto whitespace-pre">{`{
  "prompt": "compiled scene prompt (edited & approved)",
  "characterImageUrl": "locked character reference image",
  "duration": "5" | "10",
  "cameraDirection": "Close-up, Dolly in"
}
// → { "request_id", "status_url", "response_url" }
// Server calls https://fal.run/fal-ai/kling-video/v1.5/pro/image-to-video
// with Authorization: Key $FAL_KEY (server env only). Duration is
// clamped to 5/10s — anything else returns 400.`}</pre>
          </div>

          <div>
            <p className="font-mono text-cyan-300 font-bold mb-1">GET /api/video-status?url=…</p>
            <p className="text-slate-400 mb-2">Polls the fal.ai queue with the key server-side; the browser never sees it.</p>
            <pre className="font-mono text-slate-300 bg-slate-900 rounded-lg p-3 overflow-x-auto whitespace-pre">{`// → { "status": "IN_QUEUE" | "IN_PROGRESS" | "COMPLETED" | "FAILED",
//      "video": { "url": "https://…" } }
// Client polls every 5s (40-poll timeout), then shows the MP4
// on the scene card + timeline block automatically.`}</pre>
          </div>

          <div>
            <p className="font-mono text-cyan-300 font-bold mb-1">POST /api/transcribe</p>
            <p className="text-slate-400 mb-2">Extracts lyrics from the uploaded audio with fal.ai Whisper.</p>
            <pre className="font-mono text-slate-300 bg-slate-900 rounded-lg p-3 overflow-x-auto whitespace-pre">{`// 1. { "action": "initiate", "file_name", "content_type" }
//    → { "upload_url", "file_url" }  (pre-signed fal storage URL)
// 2. Browser PUTs the audio bytes straight to fal.ai
//    (keeps big files off the serverless function)
// 3. { "action": "submit", "audio_url": file_url }
//    → whisper queue { "status_url", "response_url" }
// 4. Poll /api/video-status → timed chunks [{ start, end, text }],
//    auto-mapped onto your interval segments. Every line stays editable.`}</pre>
          </div>
        </div>
      </div>
    );
  }

  // ==================== SHELL ====================
  return (
    <div className="flex flex-col min-h-screen bg-[#07090e] text-slate-100 font-sans pb-24 md:pb-16 select-none">
      {/* Hidden real audio element */}
      <audio ref={audioRef} src={audioUrl || undefined} onTimeUpdate={onTimeUpdate} className="hidden" preload="auto" />

      {/* TOP DIRECTOR'S BAR */}
      <header className="sticky top-0 z-40 bg-[#0c1017]/90 backdrop-blur-md border-b border-slate-800/80 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-cyan-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
            <Clapperboard className="w-4 h-4 text-white" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="font-extrabold tracking-wider text-sm bg-gradient-to-r from-cyan-400 via-indigo-300 to-amber-300 bg-clip-text text-transparent">
                DDC STUDIO
              </span>
              <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-cyan-950 text-cyan-400 border border-cyan-800/50">
                PRO
              </span>
            </div>
            <p className="text-[11px] text-slate-400 truncate max-w-[180px] sm:max-w-xs">
              {project ? project.title : 'Dream Disect Create'}
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={() => setActiveTab('api-docs')}
            className="text-[11px] font-mono bg-slate-800/80 hover:bg-slate-700 text-slate-300 px-2.5 py-1.5 rounded-md border border-slate-700 flex items-center space-x-1"
          >
            <span>API Route</span>
          </button>

          <button
            onClick={() => setShowNewProjModal(true)}
            className="text-[11px] font-medium bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold px-2.5 py-1.5 rounded-md flex items-center space-x-1 shadow-md shadow-cyan-500/20 active:scale-95 transition"
          >
            <Plus className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">New Project</span>
          </button>
        </div>
      </header>

      {/* MAIN VIEW */}
      <main className="flex-1 max-w-5xl w-full mx-auto p-3 sm:p-5">
        {activeTab === 'projects' && renderProjectsTab()}
        {activeTab === 'timeline' && renderTimelineTab()}
        {activeTab === 'scenes' && renderScenesTab()}
        {activeTab === 'assets' && renderAssetsTab()}
        {activeTab === 'coordination' && renderReviewTab()}
        {activeTab === 'api-docs' && renderApiDocs()}
      </main>

      {/* NEW PROJECT MODAL */}
      {showNewProjModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 max-w-sm w-full space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-white">Create New Video Project</h3>
              <button onClick={() => setShowNewProjModal(false)} className="text-slate-500 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div>
              <label className="text-xs text-slate-400 block mb-1">Song Title</label>
              <input
                type="text"
                value={newTitleInput}
                onChange={(e) => setNewTitleInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') createProject(); }}
                placeholder="e.g. Midnight Mirage"
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-cyan-500"
              />
            </div>
            <div className="flex space-x-2 pt-2">
              <button
                onClick={() => setShowNewProjModal(false)}
                className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 py-2 rounded-lg text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={createProject}
                disabled={!newTitleInput.trim()}
                className="flex-1 bg-cyan-500 hover:bg-cyan-400 disabled:opacity-40 text-slate-950 py-2 rounded-lg text-xs font-bold"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {/* BOTTOM NAV */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-[#0a0d14]/95 backdrop-blur-lg border-t border-slate-800/80 px-2 py-1.5 flex items-center justify-around max-w-md mx-auto sm:max-w-none">
        {[
          { id: 'projects', label: 'Projects', Icon: Layers },
          { id: 'timeline', label: 'Timeline', Icon: Sliders },
          { id: 'scenes', label: 'Scenes', Icon: Film },
          { id: 'assets', label: 'Assets', Icon: Sparkles },
          { id: 'coordination', label: 'Review', Icon: Eye },
        ].map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`flex flex-col items-center justify-center py-1 px-3 rounded-xl transition ${
              activeTab === id ? 'text-cyan-400' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Icon className="w-4 h-4 mb-1" />
            <span className="text-[10px] font-medium tracking-tight">{label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
