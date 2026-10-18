'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import IntervalSceneEditor from '../components/IntervalSceneEditor';
import { useTranscription } from '../hooks/useTranscription';

const STORAGE_KEY = 'mvd_projects_v1';
const INTERVAL_PRESETS = [5, 10, 15, 20, 30, 40];
const SHOT_TYPES = ['Keyframe', 'Motion clip', 'B-roll', 'Lip sync'];
const CAMERA_ANGLES = ['Close-up', 'Medium shot', 'Wide shot', 'Low angle', 'High angle', 'Over-the-shoulder', 'Drone/aerial'];
const CAMERA_MOVES = ['Static', 'Pan', 'Tilt', 'Dolly in', 'Dolly out', 'Tracking shot', 'Orbit', 'Handheld'];
const TABS = [
  { id: 'project', label: 'Project' },
  { id: 'timeline', label: 'Timeline' },
  { id: 'scenes', label: 'Scenes' },
  { id: 'assets', label: 'Assets' },
  { id: 'assemble', label: 'Assemble' },
];

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
}

function fmt(s) {
  if (!isFinite(s) || s < 0) return '0:00';
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function toSrtTime(s) {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  const ms = Math.round((s % 1) * 1000);
  return `${pad2(h)}:${pad2(m)}:${pad2(sec)},${String(ms).padStart(3, '0')}`;
}

function downloadFile(name, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function safeName(s) {
  return (s || 'music-video').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'music-video';
}

function blankSegment(n, start, end) {
  return {
    id: uid(), n, start, end,
    label: '', lyrics: '',
    shotType: 'Motion clip', movement: '', lipSync: false, lyricCue: '',
    cameraAngle: 'Medium shot', cameraMove: 'Static',
    setting: '', lighting: '', notes: '', promptDraft: '',
    status: 'empty', videoUrl: '',
  };
}

// Per-scene generation status: 'empty' | 'prompt-ready' | 'generating' | 'rendered' | 'failed'
const SEG_STATUS_LABEL = {
  'empty': 'No prompt yet',
  'prompt-ready': 'Prompt Ready',
  'generating': 'Generating…',
  'rendered': 'Video Rendered',
  'failed': 'Failed',
};

const SEG_STATUS_CLASS = {
  'empty': 'pill-empty',
  'prompt-ready': 'pill-ready',
  'generating': 'pill-generating',
  'rendered': 'pill-rendered',
  'failed': 'pill-failed',
};

function segStatus(s) {
  const st = (s && s.status) || 'empty';
  return SEG_STATUS_LABEL[st] ? st : 'empty';
}

function StatusPill({ status }) {
  const st = segStatus({ status });
  return <span className={`pill ${SEG_STATUS_CLASS[st]}`}>{SEG_STATUS_LABEL[st]}</span>;
}

function blankProject(name) {
  return {
    id: uid(),
    name: name || 'Untitled project',
    songTitle: '',
    lyricsRaw: '',
    segments: [],
    characters: [], themes: [], styles: [], palettes: [],
    locked: { characterId: null, themeId: null, styleId: null, paletteId: null },
    captionsOn: true,
  };
}

export default function Home() {
  const [store, setStore] = useState({ projects: [], activeId: null });
  const [tab, setTab] = useState('project');
  const [audioUrl, setAudioUrl] = useState(null);
  const [audioFile, setAudioFile] = useState(null);
  const [audioName, setAudioName] = useState('');
  const [audioDur, setAudioDur] = useState(0);
  const [playingSegId, setPlayingSegId] = useState(null);
  const [loopSeg, setLoopSeg] = useState(false);
  const [intervalSecs, setIntervalSecs] = useState(10);
  const [customSecs, setCustomSecs] = useState('');
  const [copiedId, setCopiedId] = useState(null);
  const [newChar, setNewChar] = useState({ name: '', look: '', hair: '', outfit: '', notes: '', imageUrl: '' });
  const [newTheme, setNewTheme] = useState({ name: '', description: '' });
  const [newStyle, setNewStyle] = useState({ name: '', description: '' });
  const [newPalette, setNewPalette] = useState({ name: '', colors: ['#00e5ff', '#7b2ff7', '#ff2e88', '#ffd166', '#0b0f14'] });
  const { transcribe: transcribeAudio, isTranscribing, error: transcribeError } = useTranscription();

  const audioRef = useRef(null);
  const waveRef = useRef(null);

  // Load saved projects
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.projects)) setStore(parsed);
      }
    } catch { /* corrupted save — start fresh */ }
  }, []);

  // Persist on change
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    } catch { /* storage full — ignore */ }
  }, [store]);

  const activeProject = useMemo(
    () => store.projects.find((p) => p.id === store.activeId) || null,
    [store]
  );

  const lockedChar = activeProject?.characters.find((c) => c.id === activeProject.locked.characterId) || null;
  const lockedTheme = activeProject?.themes.find((t) => t.id === activeProject.locked.themeId) || null;
  const lockedStyle = activeProject?.styles.find((s) => s.id === activeProject.locked.styleId) || null;
  const lockedPalette = activeProject?.palettes.find((p) => p.id === activeProject.locked.paletteId) || null;

  function updateActive(fn) {
    setStore((s) => ({
      ...s,
      projects: s.projects.map((p) => (p.id === s.activeId ? fn(p) : p)),
    }));
  }

  // ---------- Audio ----------

  async function handleAudioFile(file) {
    if (!file) return;
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    const url = URL.createObjectURL(file);
    setAudioUrl(url);
    setAudioFile(file);
    setAudioName(file.name);
    setPlayingSegId(null);
    try {
      const buf = await file.arrayBuffer();
      const AC = window.AudioContext || window.webkitAudioContext;
      const ctx = new AC();
      const audioBuf = await ctx.decodeAudioData(buf.slice(0));
      setAudioDur(audioBuf.duration);
      drawWaveform(audioBuf);
      ctx.close();
    } catch {
      setAudioDur(0);
    }
  }

  function drawWaveform(audioBuf) {
    const canvas = waveRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth || 300;
    const h = 72;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    const g = canvas.getContext('2d');
    g.scale(dpr, dpr);
    g.clearRect(0, 0, w, h);
    const data = audioBuf.getChannelData(0);
    const bars = Math.floor(w / 3);
    const step = Math.max(1, Math.floor(data.length / bars));
    g.fillStyle = '#00e5ff';
    for (let i = 0; i < bars; i++) {
      let peak = 0;
      const start = i * step;
      for (let j = start; j < Math.min(start + step, data.length); j += 4) {
        const v = Math.abs(data[j]);
        if (v > peak) peak = v;
      }
      const bh = Math.max(2, peak * h * 0.92);
      g.fillRect(i * 3, (h - bh) / 2, 2, bh);
    }
  }

  function playSegment(seg) {
    const a = audioRef.current;
    if (!a || !audioUrl) return;
    a.currentTime = Math.max(0, seg.start - 0.05);
    setPlayingSegId(seg.id);
    a.play().catch(() => setPlayingSegId(null));
  }

  function stopPlayback() {
    const a = audioRef.current;
    if (a) a.pause();
    setPlayingSegId(null);
  }

  function onTimeUpdate() {
    const a = audioRef.current;
    if (!a || !playingSegId || !activeProject) return;
    const seg = activeProject.segments.find((s) => s.id === playingSegId);
    if (!seg) return;
    if (a.currentTime >= seg.end) {
      if (loopSeg) {
        a.currentTime = seg.start;
      } else {
        a.pause();
        setPlayingSegId(null);
      }
    }
  }

  // ---------- Timeline ----------

  function splitSegments() {
    const secs = customSecs ? parseInt(customSecs, 10) : intervalSecs;
    if (!secs || secs <= 0) return;
    if (!audioDur) return;
    const segs = [];
    let t = 0;
    let n = 1;
    while (t < audioDur - 0.01) {
      const end = Math.min(t + secs, audioDur);
      segs.push(blankSegment(n, t, end));
      t = end;
      n += 1;
    }
    updateActive((p) => ({ ...p, segments: segs }));
    setTab('scenes');
  }

  function autoDistribute() {
    if (!activeProject) return;
    const lines = activeProject.lyricsRaw.split('\n').map((l) => l.trim()).filter(Boolean);
    const segs = activeProject.segments;
    if (!segs.length || !lines.length) return;
    const per = Math.ceil(lines.length / segs.length);
    updateActive((p) => ({
      ...p,
      segments: p.segments.map((s, i) => ({
        ...s,
        lyrics: lines.slice(i * per, (i + 1) * per).join('\n'),
      })),
    }));
  }

  // Transcribe the uploaded audio via fal.ai whisper, then map each timed chunk
  // onto the interval segments it overlaps. Everything stays editable.
  async function handleTranscribe() {
    if (!audioFile || !activeProject) return;
    const result = await transcribeAudio(audioFile);
    if (!result) return;
    const tSegs = result.segments;
    updateActive((p) => ({
      ...p,
      lyricsRaw: result.text,
      segments: p.segments.map((s) => ({
        ...s,
        lyrics: tSegs.length
          ? tSegs
              .filter((c) => c.start < s.end && c.end > s.start)
              .map((c) => c.text)
              .join('\n')
          : s.lyrics,
      })),
    }));
  }

  // ---------- Prompt Assist ----------

  function buildPrompt(seg) {
    const dur = Math.max(1, Math.round(seg.end - seg.start));
    let d = lockedStyle
      ? `${lockedStyle.name}${lockedStyle.description ? ' — ' + lockedStyle.description : ''}.`
      : 'Cinematic photoreal style.';
    d += lockedChar
      ? ` CHARACTER: ${lockedChar.name} — ${lockedChar.look || 'signature look'}${lockedChar.hair ? ', ' + lockedChar.hair + ' hair' : ''}, wearing ${lockedChar.outfit || 'their signature outfit'}.${lockedChar.notes ? ' ' + lockedChar.notes : ''}`
      : ' CHARACTER: keep the same performer throughout.';
    if (seg.setting) d += ` SETTING: ${seg.setting}.`;
    if (seg.movement) d += ` ACTION: ${seg.movement}.`;
    d += ` CAMERA: ${seg.cameraAngle}, ${seg.cameraMove}.`;
    if (seg.lighting) d += ` LIGHTING/MOOD: ${seg.lighting}.`;
    if (lockedPalette) d += ` COLOR PALETTE: ${lockedPalette.name} (${lockedPalette.colors.join(', ')}).`;
    if (lockedTheme) d += ` THEME: ${lockedTheme.name}${lockedTheme.description ? ' — ' + lockedTheme.description : ''}.`;
    if (seg.shotType === 'Lip sync' || seg.lipSync) {
      const cue = (seg.lyricCue || seg.lyrics.split('\n')[0] || '').trim();
      d += ` LIP SYNC: the character mouths these lyrics: "${cue}".`;
    } else if (seg.shotType === 'B-roll') {
      d += ' B-ROLL: no lip sync, atmospheric cutaway matching the mood.';
    }
    d += ` Clip duration: ${dur} seconds.`;
    return d;
  }

  async function copyText(text, id) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch { /* ignore */ }
      document.body.removeChild(ta);
    }
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  }

  // ---------- Export ----------

  function downloadSrt() {
    if (!activeProject) return;
    const segs = activeProject.segments.filter((s) => s.lyrics.trim());
    if (!segs.length) return;
    let out = '';
    segs.forEach((s, i) => {
      out += `${i + 1}\n${toSrtTime(s.start)} --> ${toSrtTime(s.end)}\n${s.lyrics.trim()}\n\n`;
    });
    downloadFile(`${safeName(activeProject.songTitle || activeProject.name)}.srt`, out, 'text/plain');
  }

  function downloadShotList() {
    if (!activeProject) return;
    let out = `${activeProject.name}${activeProject.songTitle ? ' — ' + activeProject.songTitle : ''}\n`;
    out += `Total runtime: ${fmt(audioDur || (activeProject.segments.length ? activeProject.segments[activeProject.segments.length - 1].end : 0))}\n\n`;
    activeProject.segments.forEach((s) => {
      out += `SCENE ${s.n} [${fmt(s.start)}–${fmt(s.end)}]${s.label ? ' — ' + s.label : ''} (${s.shotType})\n`;
      if (s.lyrics.trim()) out += `Lyrics:\n${s.lyrics.trim()}\n`;
      const prompt = s.promptDraft.trim() || buildPrompt(s);
      out += `Prompt: ${prompt}\n\n`;
    });
    downloadFile(`${safeName(activeProject.songTitle || activeProject.name)}-shot-list.txt`, out, 'text/plain');
  }

  function exportJson() {
    if (!activeProject) return;
    downloadFile(
      `${safeName(activeProject.songTitle || activeProject.name)}-project.json`,
      JSON.stringify(activeProject, null, 2),
      'application/json'
    );
  }

  async function importJson(file) {
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!data || typeof data !== 'object' || !data.name) throw new Error('bad file');
      const proj = { ...blankProject(data.name), ...data, id: uid() };
      setStore((s) => ({ projects: [...s.projects, proj], activeId: proj.id }));
      setTab('project');
    } catch {
      alert('That file is not a valid DDC Dream Disect Create project.');
    }
  }

  // ---------- Tab renders ----------

  function renderProjectTab() {
    return (
      <div>
        <div className="card">
          <h3 className="card-title">Project</h3>
          {!activeProject && <p className="hint">Create a project to get started.</p>}
          <div className="row">
            <label className="field half">
              <span className="label">Project name</span>
              <input
                className="input"
                value={activeProject?.name || ''}
                onChange={(e) => updateActive((p) => ({ ...p, name: e.target.value }))}
                placeholder="My music video"
              />
            </label>
            <label className="field half">
              <span className="label">Song title</span>
              <input
                className="input"
                value={activeProject?.songTitle || ''}
                onChange={(e) => updateActive((p) => ({ ...p, songTitle: e.target.value }))}
                placeholder="Song title"
              />
            </label>
          </div>
          <label className="field">
            <span className="label">Upload audio (MP3, WAV, M4A)</span>
            <input
              className="input"
              type="file"
              accept="audio/*"
              onChange={(e) => handleAudioFile(e.target.files && e.target.files[0])}
            />
          </label>
          {audioUrl && (
            <div>
              <p className="hint">{audioName} — {fmt(audioDur)}</p>
              <canvas ref={waveRef} className="waveform" />
            </div>
          )}
          <p className="hint">
            Re-upload your audio each visit — your scenes, lyrics and assets are saved, the audio
            file itself is not.
          </p>
        </div>

        <div className="card">
          <h3 className="card-title">My projects</h3>
          {store.projects.map((p) => (
            <div key={p.id} className={`project-row ${p.id === store.activeId ? 'active' : ''}`}>
              <div className="grow">
                <div className="pname">{p.name}</div>
                <div className="muted" style={{ fontSize: '0.82rem' }}>
                  {p.songTitle || 'No song title'} · {p.segments.length} scenes
                </div>
              </div>
              <button className="btn-ghost btn btn-small" onClick={() => setStore((s) => ({ ...s, activeId: p.id }))}>
                Open
              </button>
              <button
                className="btn-ghost btn btn-small"
                onClick={() => {
                  if (!window.confirm(`Delete "${p.name}"?`)) return;
                  setStore((s) => {
                    const projects = s.projects.filter((x) => x.id !== p.id);
                    return { projects, activeId: projects.length ? projects[0].id : null };
                  });
                }}
              >
                Delete
              </button>
            </div>
          ))}
          <button
            className="btn btn-ghost"
            style={{ width: '100%' }}
            onClick={() => {
              const proj = blankProject(`Project ${store.projects.length + 1}`);
              setStore((s) => ({ projects: [...s.projects, proj], activeId: proj.id }));
            }}
          >
            + New project
          </button>
          <label className="field" style={{ marginTop: 8 }}>
            <span className="label">Import project from JSON</span>
            <input
              className="input"
              type="file"
              accept="application/json"
              onChange={(e) => importJson(e.target.files && e.target.files[0])}
            />
          </label>
        </div>
      </div>
    );
  }

  function renderTimelineTab() {
    if (!activeProject) return <div className="empty">Create a project first.</div>;
    const segs = activeProject.segments;
    return (
      <div>
        <div className="card">
          <h3 className="card-title">Break into time intervals</h3>
          {!audioDur && <p className="warn">Upload your audio in the Project tab first.</p>}
          <p className="label">Interval length</p>
          <div className="row wrap" style={{ marginBottom: 10 }}>
            {INTERVAL_PRESETS.map((s) => (
              <button
                key={s}
                className={`btn-ghost btn btn-small ${!customSecs && intervalSecs === s ? '' : ''}`}
                style={!customSecs && intervalSecs === s ? { borderColor: 'var(--cyan)', color: 'var(--cyan)' } : {}}
                onClick={() => { setIntervalSecs(s); setCustomSecs(''); }}
              >
                {s}s
              </button>
            ))}
            <input
              className="input"
              style={{ width: 90 }}
              type="number"
              min="1"
              placeholder="Custom"
              value={customSecs}
              onChange={(e) => setCustomSecs(e.target.value)}
            />
          </div>
          <button className="btn btn-primary" disabled={!audioDur} onClick={splitSegments}>
            Split {audioDur ? fmt(audioDur) : 'song'} into segments
          </button>
          <p className="hint">Splitting replaces the current segments. Longer scenes can chain multiple 5s/10s clips.</p>
        </div>

        <div className="card">
          <h3 className="card-title">Lyrics</h3>
          <button
            className="btn btn-ghost"
            style={{ width: '100%' }}
            onClick={handleTranscribe}
            disabled={!audioFile || isTranscribing}
          >
            {isTranscribing ? '🎧 Listening… transcribing your audio' : '🎧 Extract lyrics from audio'}
          </button>
          {transcribeError && <p className="error">{transcribeError}</p>}
          <p className="hint">
            Auto-transcription is a starting point — sung vocals over music transcribe
            imperfectly, so fix lines by hand.
            {!segs.length && ' Split the song into segments above and each line lands in its time frame automatically.'}
          </p>
          <label className="field">
            <span className="label">Paste full lyrics</span>
            <textarea
              className="input"
              rows={4}
              value={activeProject.lyricsRaw}
              onChange={(e) => updateActive((p) => ({ ...p, lyricsRaw: e.target.value }))}
              placeholder="Paste the full lyrics here…"
            />
          </label>
          <button className="btn btn-ghost" style={{ width: '100%' }} onClick={autoDistribute} disabled={!segs.length}>
            Auto-distribute lyrics across segments
          </button>
        </div>

        {segs.map((s) => (
          <div key={s.id} className={`seg-item ${playingSegId === s.id ? 'playing' : ''}`}>
            <div className="seg-head">
              <span className="seg-num">#{s.n} · {fmt(s.start)}–{fmt(s.end)}</span>
              <input
                className="input"
                style={{ flex: 1 }}
                value={s.label}
                onChange={(e) => updateActive((p) => ({
                  ...p,
                  segments: p.segments.map((x) => (x.id === s.id ? { ...x, label: e.target.value } : x)),
                }))}
                placeholder="Label (e.g. Chorus 1)"
              />
            </div>
            {playingSegId === s.id ? (
              <button className="btn btn-danger" onClick={stopPlayback}>Stop</button>
            ) : (
              <button className="btn btn-ghost" style={{ width: '100%' }} onClick={() => playSegment(s)} disabled={!audioUrl}>
                ▶ Play this segment
              </button>
            )}
            <label className="field" style={{ marginTop: 8, marginBottom: 0 }}>
              <span className="label">Lyrics for this segment</span>
              <textarea
                className="input"
                rows={2}
                value={s.lyrics}
                onChange={(e) => updateActive((p) => ({
                  ...p,
                  segments: p.segments.map((x) => (x.id === s.id ? { ...x, lyrics: e.target.value } : x)),
                }))}
                placeholder="Lyrics in this time frame…"
              />
            </label>
          </div>
        ))}

        <label className="toggle-row">
          <span>Loop segment playback</span>
          <input type="checkbox" checked={loopSeg} onChange={(e) => setLoopSeg(e.target.checked)} />
        </label>
      </div>
    );
  }

  function renderScenesTab() {
    if (!activeProject) return <div className="empty">Create a project first.</div>;
    const segs = activeProject.segments;
    if (!segs.length) return <div className="empty">Split your song into segments in the Timeline tab first.</div>;

    return (
      <div>
        <div className="card">
          <h3 className="card-title">Locked coordination</h3>
          <div>
            <span className="chip locked">Character: {lockedChar ? lockedChar.name : '—'}</span>
            <span className="chip locked">Theme: {lockedTheme ? lockedTheme.name : '—'}</span>
            <span className="chip locked">Style: {lockedStyle ? lockedStyle.name : '—'}</span>
            <span className="chip locked">Palette: {lockedPalette ? lockedPalette.name : '—'}</span>
          </div>
          <p className="hint">Lock assets in the Assets tab — every scene prompt inherits them so all clips match.</p>
        </div>

        {segs.map((s) => {
          const upd = (patch) =>
            updateActive((p) => ({
              ...p,
              segments: p.segments.map((x) => (x.id === s.id ? { ...x, ...patch } : x)),
            }));
          return (
            <div key={s.id} className="card scene-card">
              <h3 className="card-title">
                Scene {s.n} <span className="muted">({fmt(s.start)}–{fmt(s.end)}){s.label ? ` — ${s.label}` : ''}</span>{' '}
                <StatusPill status={segStatus(s)} />
              </h3>
              {segStatus(s) === 'generating' && (
                <div className="gen-overlay">
                  <div className="spinner" />
                  <p className="hint" style={{ margin: 0 }}>Rendering clip…</p>
                </div>
              )}

              <div className="row">
                <label className="field half">
                  <span className="label">Shot type</span>
                  <select className="input" value={s.shotType} onChange={(e) => upd({ shotType: e.target.value })}>
                    {SHOT_TYPES.map((t) => <option key={t}>{t}</option>)}
                  </select>
                </label>
                <label className="field half">
                  <span className="label">Camera angle</span>
                  <select className="input" value={s.cameraAngle} onChange={(e) => upd({ cameraAngle: e.target.value })}>
                    {CAMERA_ANGLES.map((t) => <option key={t}>{t}</option>)}
                  </select>
                </label>
              </div>

              <div className="row">
                <label className="field half">
                  <span className="label">Camera movement</span>
                  <select className="input" value={s.cameraMove} onChange={(e) => upd({ cameraMove: e.target.value })}>
                    {CAMERA_MOVES.map((t) => <option key={t}>{t}</option>)}
                  </select>
                </label>
                <label className="toggle-row half" style={{ padding: '18px 0 0' }}>
                  <span>Lip sync</span>
                  <input type="checkbox" checked={s.lipSync} onChange={(e) => upd({ lipSync: e.target.checked })} />
                </label>
              </div>

              <label className="field">
                <span className="label">Character movement / action</span>
                <textarea className="input" rows={2} value={s.movement}
                  onChange={(e) => upd({ movement: e.target.value })}
                  placeholder="What does the actor do in this shot?" />
              </label>

              <label className="field">
                <span className="label">Lyric cue (lip-sync lines)</span>
                <textarea className="input" rows={2} value={s.lyricCue}
                  onChange={(e) => upd({ lyricCue: e.target.value })}
                  placeholder={s.lyrics.split('\n')[0] || 'Which lyrics are mouthed here?'} />
              </label>

              <div className="row">
                <label className="field half">
                  <span className="label">Setting</span>
                  <input className="input" value={s.setting}
                    onChange={(e) => upd({ setting: e.target.value })} placeholder="Location" />
                </label>
                <label className="field half">
                  <span className="label">Lighting / mood</span>
                  <input className="input" value={s.lighting}
                    onChange={(e) => upd({ lighting: e.target.value })} placeholder="e.g. neon night" />
                </label>
              </div>

              <label className="field">
                <span className="label">Notes</span>
                <input className="input" value={s.notes}
                  onChange={(e) => upd({ notes: e.target.value })} placeholder="Anything else…" />
              </label>

              <button className="btn btn-ghost" style={{ width: '100%' }}
                onClick={() => upd({ promptDraft: buildPrompt(s), status: s.status === 'generating' ? 'generating' : 'prompt-ready' })}>
                ✨ Prompt Assist — draft from my directions + locked assets
              </button>

              <label className="field">
                <span className="label">Video prompt (edit before generating)</span>
                <textarea className="input" rows={4} value={s.promptDraft}
                  onChange={(e) => {
                    const v = e.target.value;
                    upd({
                      promptDraft: v,
                      status: s.status === 'generating' ? 'generating' : (v.trim() ? 'prompt-ready' : 'empty'),
                    });
                  }}
                  placeholder="Tap Prompt Assist, or type your own directions…" />
              </label>
              <button className="btn btn-ghost" style={{ width: '100%' }}
                onClick={() => copyText(s.promptDraft.trim() || buildPrompt(s), s.id)}>
                {copiedId === s.id ? 'Copied!' : 'Copy prompt'}
              </button>

              <IntervalSceneEditor
                intervalId={s.id}
                startTime={s.start}
                endTime={s.end}
                characterImageUrl={lockedChar?.imageUrl || ''}
                lyrics={s.lyricCue || s.lyrics}
                initialVideoUrl={s.videoUrl || ''}
                onGenState={(st, url) => {
                  if (st === 'cancelled') {
                    upd({ status: s.promptDraft && s.promptDraft.trim() ? 'prompt-ready' : 'empty' });
                    return;
                  }
                  upd(url ? { status: st, videoUrl: url } : { status: st });
                }}
              />
            </div>
          );
        })}
      </div>
    );
  }

  function assetList(items, lockedId, onLock, onDelete, renderItem) {
    return (
      <div>
        {items.map((it) => (
          <div key={it.id} className={`asset-card ${it.id === lockedId ? 'is-locked' : ''}`}>
            {renderItem(it)}
            <div className="row" style={{ marginTop: 8 }}>
              {it.id === lockedId ? (
                <span className="chip locked">Locked for this project</span>
              ) : (
                <button className="btn-ghost btn btn-small" onClick={() => onLock(it.id)}>Lock</button>
              )}
              <button className="btn-ghost btn btn-small" onClick={() => onDelete(it.id)}>Delete</button>
            </div>
          </div>
        ))}
        {!items.length && <p className="hint">None yet — add one below.</p>}
      </div>
    );
  }

  function renderAssetsTab() {
    if (!activeProject) return <div className="empty">Create a project first.</div>;
    const lock = (key, id) => updateActive((p) => ({ ...p, locked: { ...p.locked, [key]: id } }));
    const del = (key, lockKey, id) =>
      updateActive((p) => ({
        ...p,
        [key]: p[key].filter((x) => x.id !== id),
        locked: { ...p.locked, [lockKey]: p.locked[lockKey] === id ? null : p.locked[lockKey] },
      }));

    return (
      <div>
        <div className="card">
          <h3 className="card-title">Characters / actors</h3>
          {assetList(
            activeProject.characters,
            activeProject.locked.characterId,
            (id) => lock('characterId', id),
            (id) => del('characters', 'characterId', id),
            (c) => (
              <div>
                <strong>{c.name}</strong>
                <div className="muted" style={{ fontSize: '0.88rem' }}>
                  {[c.look, c.hair ? c.hair + ' hair' : '', c.outfit ? 'wearing ' + c.outfit : ''].filter(Boolean).join(' · ')}
                </div>
                {c.notes && <div className="muted" style={{ fontSize: '0.85rem' }}>{c.notes}</div>}
                {c.imageUrl && <div className="hint" style={{ wordBreak: 'break-all' }}>Ref image: {c.imageUrl}</div>}
              </div>
            )
          )}
          <div style={{ marginTop: 10 }}>
            <input className="input" style={{ marginBottom: 6 }} placeholder="Name" value={newChar.name}
              onChange={(e) => setNewChar({ ...newChar, name: e.target.value })} />
            <input className="input" style={{ marginBottom: 6 }} placeholder="Look (face, vibe)" value={newChar.look}
              onChange={(e) => setNewChar({ ...newChar, look: e.target.value })} />
            <div className="row">
              <input className="input" style={{ marginBottom: 6 }} placeholder="Hair" value={newChar.hair}
                onChange={(e) => setNewChar({ ...newChar, hair: e.target.value })} />
              <input className="input" style={{ marginBottom: 6 }} placeholder="Outfit" value={newChar.outfit}
                onChange={(e) => setNewChar({ ...newChar, outfit: e.target.value })} />
            </div>
            <input className="input" style={{ marginBottom: 6 }} placeholder="Reference image URL (used for video generation)" value={newChar.imageUrl}
              onChange={(e) => setNewChar({ ...newChar, imageUrl: e.target.value })} />
            <input className="input" style={{ marginBottom: 6 }} placeholder="Notes" value={newChar.notes}
              onChange={(e) => setNewChar({ ...newChar, notes: e.target.value })} />
            <button className="btn btn-ghost" style={{ width: '100%' }}
              disabled={!newChar.name.trim()}
              onClick={() => {
                updateActive((p) => ({ ...p, characters: [...p.characters, { ...newChar, id: uid() }] }));
                setNewChar({ name: '', look: '', hair: '', outfit: '', notes: '', imageUrl: '' });
              }}>
              + Add character
            </button>
          </div>
        </div>

        <div className="card">
          <h3 className="card-title">Themes</h3>
          {assetList(
            activeProject.themes,
            activeProject.locked.themeId,
            (id) => lock('themeId', id),
            (id) => del('themes', 'themeId', id),
            (t) => (<div><strong>{t.name}</strong>{t.description && <div className="muted" style={{ fontSize: '0.88rem' }}>{t.description}</div>}</div>)
          )}
          <div style={{ marginTop: 10 }}>
            <input className="input" style={{ marginBottom: 6 }} placeholder="Theme name" value={newTheme.name}
              onChange={(e) => setNewTheme({ ...newTheme, name: e.target.value })} />
            <input className="input" style={{ marginBottom: 6 }} placeholder="Description" value={newTheme.description}
              onChange={(e) => setNewTheme({ ...newTheme, description: e.target.value })} />
            <button className="btn btn-ghost" style={{ width: '100%' }}
              disabled={!newTheme.name.trim()}
              onClick={() => {
                updateActive((p) => ({ ...p, themes: [...p.themes, { ...newTheme, id: uid() }] }));
                setNewTheme({ name: '', description: '' });
              }}>
              + Add theme
            </button>
          </div>
        </div>

        <div className="card">
          <h3 className="card-title">Styles</h3>
          {assetList(
            activeProject.styles,
            activeProject.locked.styleId,
            (id) => lock('styleId', id),
            (id) => del('styles', 'styleId', id),
            (s) => (<div><strong>{s.name}</strong>{s.description && <div className="muted" style={{ fontSize: '0.88rem' }}>{s.description}</div>}</div>)
          )}
          <div style={{ marginTop: 10 }}>
            <input className="input" style={{ marginBottom: 6 }} placeholder="Style name (e.g. cinematic photoreal)" value={newStyle.name}
              onChange={(e) => setNewStyle({ ...newStyle, name: e.target.value })} />
            <input className="input" style={{ marginBottom: 6 }} placeholder="Description" value={newStyle.description}
              onChange={(e) => setNewStyle({ ...newStyle, description: e.target.value })} />
            <button className="btn btn-ghost" style={{ width: '100%' }}
              disabled={!newStyle.name.trim()}
              onClick={() => {
                updateActive((p) => ({ ...p, styles: [...p.styles, { ...newStyle, id: uid() }] }));
                setNewStyle({ name: '', description: '' });
              }}>
              + Add style
            </button>
          </div>
        </div>

        <div className="card">
          <h3 className="card-title">Color palettes</h3>
          {assetList(
            activeProject.palettes,
            activeProject.locked.paletteId,
            (id) => lock('paletteId', id),
            (id) => del('palettes', 'paletteId', id),
            (pl) => (
              <div>
                <strong>{pl.name}</strong>
                <div className="swatch-row" style={{ marginTop: 6 }}>
                  {pl.colors.map((c, i) => (
                    <span key={i} className="swatch-static" style={{ background: c }} title={c} />
                  ))}
                </div>
              </div>
            )
          )}
          <div style={{ marginTop: 10 }}>
            <input className="input" style={{ marginBottom: 6 }} placeholder="Palette name" value={newPalette.name}
              onChange={(e) => setNewPalette({ ...newPalette, name: e.target.value })} />
            <div className="swatch-row" style={{ marginBottom: 6 }}>
              {newPalette.colors.map((c, i) => (
                <input
                  key={i}
                  type="color"
                  className="swatch"
                  value={c}
                  onChange={(e) => {
                    const colors = [...newPalette.colors];
                    colors[i] = e.target.value;
                    setNewPalette({ ...newPalette, colors });
                  }}
                />
              ))}
            </div>
            <button className="btn btn-ghost" style={{ width: '100%' }}
              disabled={!newPalette.name.trim()}
              onClick={() => {
                updateActive((p) => ({ ...p, palettes: [...p.palettes, { ...newPalette, id: uid() }] }));
                setNewPalette({ name: '', colors: ['#00e5ff', '#7b2ff7', '#ff2e88', '#ffd166', '#0b0f14'] });
              }}>
              + Add palette
            </button>
          </div>
        </div>
      </div>
    );
  }

  function renderAssembleTab() {
    if (!activeProject) return <div className="empty">Create a project first.</div>;
    const segs = activeProject.segments;
    const runtime = audioDur || (segs.length ? segs[segs.length - 1].end : 0);

    return (
      <div>
        <div className="card">
          <h3 className="card-title">
            Full video plan <span className="muted">({fmt(runtime)} total)</span>
          </h3>
          {!segs.length && <p className="hint">No segments yet — split your song in the Timeline tab.</p>}
          {segs.map((s) => (
            <div key={s.id} className="shot-row">
              {segStatus(s) === 'generating' && (
                <div className="gen-overlay">
                  <div className="spinner" />
                  <p className="hint" style={{ margin: 0 }}>Rendering…</p>
                </div>
              )}
              <div>
                <strong>Scene {s.n}</strong>{' '}
                <span className="muted">{fmt(s.start)}–{fmt(s.end)}{s.label ? ` — ${s.label}` : ''}</span>{' '}
                <StatusPill status={segStatus(s)} />
              </div>
              <div style={{ margin: '4px 0' }}>
                <span className="chip">{s.shotType}</span>
                <span className="chip">{s.cameraAngle}</span>
                <span className="chip">{s.cameraMove}</span>
              </div>
              <div className="muted" style={{ fontSize: '0.85rem' }}>
                {((s.promptDraft || '').trim() || buildPrompt(s)).slice(0, 140)}…
              </div>
              {s.videoUrl && (
                <div className="preview">
                  <video src={s.videoUrl} controls playsInline preload="metadata" className="preview-video" />
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="card">
          <h3 className="card-title">Master settings</h3>
          <div className="row" style={{ alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <span>Aspect ratio</span>
            <span className="chip">9:16 vertical · fixed</span>
          </div>
          <p className="hint">Fixed for generation — every scene renders as a vertical 9:16 clip.</p>
          <label className="toggle-row">
            <span>Closed captions</span>
            <input
              type="checkbox"
              checked={activeProject.captionsOn}
              onChange={(e) => updateActive((p) => ({ ...p, captionsOn: e.target.checked }))}
            />
          </label>
          <p className="label">Default interval length</p>
          <div className="row wrap" style={{ marginBottom: 6 }}>
            {INTERVAL_PRESETS.map((sec) => (
              <button
                key={sec}
                className="btn-ghost btn btn-small"
                style={!customSecs && intervalSecs === sec ? { borderColor: 'var(--cyan)', color: 'var(--cyan)' } : {}}
                onClick={() => { setIntervalSecs(sec); setCustomSecs(''); }}
              >
                {sec}s
              </button>
            ))}
          </div>
          <p className="hint">Used next time you split the song in the Timeline tab.</p>
        </div>

        <div className="card">
          <h3 className="card-title">Export</h3>
          <button className="btn btn-primary" onClick={downloadSrt} disabled={!activeProject.captionsOn || !segs.some((s) => s.lyrics.trim())}>
            Download captions (.srt)
          </button>
          <button className="btn btn-ghost" style={{ width: '100%' }} onClick={downloadShotList} disabled={!segs.length}>
            Download shot list (.txt)
          </button>
          <button className="btn btn-ghost" style={{ width: '100%' }} onClick={exportJson}>
            Export project (.json)
          </button>
          <p className="hint">
            Kling renders 5s or 10s per clip — longer intervals chain multiple clips end to end.
            Render usage bills to your fal.ai account.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <div className="app-header">
        <span className="logo-dot" />
        <h1>DDC Dream Disect Create</h1>
      </div>

      <audio ref={audioRef} src={audioUrl || undefined} onTimeUpdate={onTimeUpdate} className="hidden-audio" />

      {tab === 'project' && renderProjectTab()}
      {tab === 'timeline' && renderTimelineTab()}
      {tab === 'scenes' && renderScenesTab()}
      {tab === 'assets' && renderAssetsTab()}
      {tab === 'assemble' && renderAssembleTab()}

      <nav className="tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`tab-btn ${tab === t.id ? 'active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
