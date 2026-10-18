// POST /api/transcribe
// Server-side audio → lyrics transcription via fal-ai/whisper. The FAL_KEY never
// reaches the browser.
//
// Two actions (JSON body):
//   { action: 'initiate', file_name, content_type }
//     → { upload_url, file_url }
//     Starts fal.ai's two-step storage upload (POST rest.alpha.fal.ai/storage/upload/initiate).
//     The BROWSER then PUTs the raw file bytes directly to upload_url (pre-signed, no auth
//     needed), which keeps large audio files off our serverless function entirely.
//
//   { action: 'submit', audio_url }  (or { action: 'submit', audio_data } as a fallback)
//     → { request_id, status_url, response_url }
//     Submits a fal-ai/whisper queue job (task=transcribe, chunk_level=segment so we get
//     timestamped chunks). The client polls status_url through /api/video-status (the shared
//     fal.ai queue proxy), then fetches the transcript from response_url the same way.
//
// Fallback note: fal.ai file inputs also accept base64 data URIs, so if the storage
// initiate step ever fails, the client may send { action:'submit', audio_data } with a
// data:audio/* URI instead. It works but is slower for large files.

const FAL_STORAGE_INITIATE = 'https://rest.alpha.fal.ai/storage/upload/initiate';
const FAL_WHISPER_QUEUE = 'https://queue.fal.run/fal-ai/whisper';

function needKey() {
  const FAL_KEY = process.env.FAL_KEY;
  if (!FAL_KEY) {
    return {
      error: Response.json(
        { error: 'FAL_KEY not configured. Add your fal.ai key to the server environment variables.' },
        { status: 500 }
      ),
    };
  }
  return { key: FAL_KEY };
}

export async function POST(req) {
  const { key: FAL_KEY, error } = needKey();
  if (error) return error;
  const auth = { Authorization: `Key ${FAL_KEY}` };

  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  // ---- Step 1: initiate a fal.ai storage upload; browser PUTs bytes directly ----
  if (body.action === 'initiate') {
    const file_name = String(body.file_name || 'audio.mp3').slice(0, 200);
    const content_type = String(body.content_type || 'audio/mpeg').slice(0, 120);

    let r;
    try {
      r = await fetch(FAL_STORAGE_INITIATE, {
        method: 'POST',
        headers: { ...auth, 'Content-Type': 'application/json' },
        body: JSON.stringify({ file_name, content_type }),
      });
    } catch {
      return Response.json(
        { error: 'Could not reach fal.ai file storage. Check your connection and try again.' },
        { status: 502 }
      );
    }

    let data = null;
    try { data = await r.json(); } catch { /* fall through */ }

    if (!r.ok || !data?.upload_url || !data?.file_url) {
      return Response.json(
        { error: `fal.ai storage error: ${data?.detail || data?.error || `HTTP ${r.status}`}` },
        { status: 502 }
      );
    }
    return Response.json({ upload_url: data.upload_url, file_url: data.file_url });
  }

  // ---- Step 2: submit the whisper queue job ----
  if (body.action === 'submit') {
    const audio_url = body.audio_url || body.audio_data;
    if (!audio_url || typeof audio_url !== 'string') {
      return Response.json({ error: 'Missing audio_url.' }, { status: 400 });
    }
    if (!/^https:|^data:audio\//.test(audio_url)) {
      return Response.json(
        { error: 'Audio must be an https URL or an audio data URI.' },
        { status: 400 }
      );
    }

    let r;
    try {
      r = await fetch(FAL_WHISPER_QUEUE, {
        method: 'POST',
        headers: { ...auth, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audio_url,
          task: 'transcribe',
          chunk_level: 'segment', // timestamped chunks → we map them onto her intervals
        }),
      });
    } catch {
      return Response.json(
        { error: 'Could not reach fal.ai. Check your connection and try again.' },
        { status: 502 }
      );
    }

    let data = null;
    try { data = await r.json(); } catch { /* fall through */ }

    if (!r.ok || !data?.status_url) {
      return Response.json(
        { error: `fal.ai error: ${data?.detail || data?.error || 'failed to start transcription'}` },
        { status: r.status || 502 }
      );
    }
    return Response.json({
      request_id: data.request_id,
      status_url: data.status_url,
      response_url: data.response_url,
    });
  }

  return Response.json(
    { error: "Unknown action. Use 'initiate' or 'submit'." },
    { status: 400 }
  );
}
