// Shared helpers for DDC Dream Disect Create.

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
}

// Seconds -> "MM:SS"
export function formatTime(sec) {
  const s = Math.max(0, Math.floor(sec || 0));
  const mins = Math.floor(s / 60);
  const secs = s % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

// Seconds -> "HH:MM:SS,mmm" (SRT)
export function formatSrtTime(totalSec) {
  const t = Math.max(0, totalSec || 0);
  const hrs = Math.floor(t / 3600);
  const mins = Math.floor((t % 3600) / 60);
  const secs = Math.floor(t % 60);
  const ms = Math.floor((t % 1) * 1000);
  const p2 = (n) => String(n).padStart(2, '0');
  return `${p2(hrs)}:${p2(mins)}:${p2(secs)},${String(ms).padStart(3, '0')}`;
}

export function safeName(s) {
  return (
    (s || 'music-video').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') ||
    'music-video'
  );
}

export function downloadFile(name, content, type) {
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

export async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      return true;
    } catch {
      return false;
    }
  }
}

// Default structural titles for freshly sliced scenes.
export function defaultSceneTitle(i) {
  if (i === 0) return 'Intro / Hook';
  if (i === 1) return 'Verse 1';
  if (i === 2) return 'Pre-Chorus';
  return `Chorus Section ${i}`;
}
