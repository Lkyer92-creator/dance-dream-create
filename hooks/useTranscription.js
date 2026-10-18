'use client';

import { useCallback, useState } from 'react';

const POLL_MS = 5000;
const MAX_POLLS = 60; // ~5 minutes — a full song takes a while to transcribe
const MAX_BYTES = 100 * 1024 * 1024;

async function readJson(res) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

// Normalizes fal-ai/whisper output into { text, segments: [{ start, end, text }] }.
// Handles both chunk shapes seen in the wild: timestamp:[start,end] tuples and
// start/end number fields.
function normalizeWhisper(data) {
  const chunks = Array.isArray(data?.chunks) ? data.chunks : [];
  const segments = [];
  for (const c of chunks) {
    let start = null;
    let end = null;
    if (Array.isArray(c.timestamp)) {
      start = Number(c.timestamp[0]);
      end = Number(c.timestamp[1]);
    } else if (typeof c.start === 'number') {
      start = c.start;
      end = c.end;
    }
    const text = String(c?.text || '').trim();
    if (text && Number.isFinite(start) && Number.isFinite(end) && end > start) {
      segments.push({ start, end, text });
    }
  }
  return { text: String(data?.text || '').trim(), segments };
}

// Drives audio → lyrics transcription through our own API routes.
// Flow: initiate fal storage upload (server) → browser PUTs bytes straight to fal
// (keeps big files off our serverless function) → submit whisper queue job (server)
// → poll the shared /api/video-status fal queue proxy → fetch transcript.
// The fal.ai key NEVER touches this code — it stays server-side.
export function useTranscription() {
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [error, setError] = useState(null);

  const transcribe = useCallback(async (file) => {
    setIsTranscribing(true);
    setError(null);
    try {
      if (!file) throw new Error('No audio file to transcribe.');
      if (file.size > MAX_BYTES) {
        throw new Error('That file is over 100MB — try a smaller MP3.');
      }

      // 1. Ask the server to initiate a fal.ai storage upload
      const initRes = await fetch('/api/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'initiate',
          file_name: file.name || 'audio.mp3',
          content_type: file.type || 'audio/mpeg',
        }),
      });
      const initData = await readJson(initRes);
      if (!initRes.ok || !initData?.upload_url || !initData?.file_url) {
        throw new Error(initData?.error || 'Could not start the upload. Try again.');
      }

      // 2. Upload bytes directly to fal.ai storage (pre-signed URL, no key needed)
      let putRes;
      try {
        putRes = await fetch(initData.upload_url, {
          method: 'PUT',
          headers: { 'Content-Type': file.type || 'audio/mpeg' },
          body: file,
        });
      } catch {
        throw new Error('Upload to fal.ai was interrupted. Check your connection and try again.');
      }
      if (!putRes.ok) {
        throw new Error('Upload to fal.ai failed. Try again.');
      }

      // 3. Submit the whisper transcription job
      const subRes = await fetch('/api/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'submit', audio_url: initData.file_url }),
      });
      const subData = await readJson(subRes);
      if (!subRes.ok || !subData?.status_url) {
        throw new Error(subData?.error || 'Could not start transcription. Try again.');
      }
      const { status_url, response_url } = subData;

      // 4. Poll for completion
      let completed = false;
      let statusData = null;
      for (let i = 0; i < MAX_POLLS; i++) {
        await new Promise((r) => setTimeout(r, POLL_MS));
        const stRes = await fetch(`/api/video-status?url=${encodeURIComponent(status_url)}`);
        statusData = await readJson(stRes);
        if (!stRes.ok) {
          throw new Error(statusData?.error || 'Lost contact with fal.ai. Try again.');
        }
        if (statusData?.status === 'COMPLETED') {
          completed = true;
          break;
        }
        if (statusData?.status === 'FAILED') {
          throw new Error('Transcription failed on fal.ai. Try again or paste lyrics by hand.');
        }
      }
      if (!completed) {
        throw new Error('Transcription is taking too long — check your fal.ai dashboard, or paste lyrics by hand.');
      }

      // 5. Get the transcript (inline if the status response already has it,
      //    otherwise fetch the queue result URL)
      let result = statusData;
      if (!result?.text && response_url) {
        const resRes = await fetch(`/api/video-status?url=${encodeURIComponent(response_url)}`);
        result = await readJson(resRes);
        if (!resRes.ok) {
          throw new Error(result?.error || 'Transcription finished but the text did not come back.');
        }
      }

      const normalized = normalizeWhisper(result);
      if (!normalized.text && !normalized.segments.length) {
        throw new Error('fal.ai returned an empty transcript — the vocals may be too buried in the mix. Paste lyrics by hand instead.');
      }
      return normalized;
    } catch (err) {
      setError(err?.message || 'Something went wrong transcribing the audio.');
      return null;
    } finally {
      setIsTranscribing(false);
    }
  }, []);

  return { transcribe, isTranscribing, error };
}
