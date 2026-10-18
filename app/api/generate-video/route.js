// POST /api/generate-video
// Body: { prompt, characterImageUrl, duration, cameraDirection }
// The fal.ai key lives ONLY here (server-side). The browser never sees it.

export async function POST(req) {
  const FAL_KEY = process.env.FAL_KEY;
  if (!FAL_KEY) {
    return Response.json(
      { error: 'FAL_KEY not configured. Add your fal.ai key to the server environment variables.' },
      { status: 500 }
    );
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Request body must be valid JSON.' }, { status: 400 });
  }

  const { prompt, characterImageUrl, duration, cameraDirection } = body || {};

  if (!prompt || !String(prompt).trim()) {
    return Response.json({ error: 'A prompt is required.' }, { status: 400 });
  }

  if (!characterImageUrl || !String(characterImageUrl).trim()) {
    return Response.json(
      { error: 'A character reference image is needed for video generation. Add an image URL to your locked character in the Assets tab.' },
      { status: 400 }
    );
  }

  // Kling v1.5 pro image-to-video only supports 5s or 10s clips.
  const dur = String(duration || '5');
  if (dur !== '5' && dur !== '10') {
    return Response.json(
      { error: 'Duration must be "5" or "10" seconds — Kling only renders 5s or 10s clips. Chain multiple clips for longer scenes.' },
      { status: 400 }
    );
  }

  const fullPrompt = `${String(prompt).trim()}, camera movement: ${cameraDirection || 'Static'}, cinematic lighting, photorealistic, 9:16 vertical aspect ratio`;

  let falRes;
  try {
    falRes = await fetch('https://fal.run/fal-ai/kling-video/v1.5/pro/image-to-video', {
      method: 'POST',
      headers: {
        Authorization: `Key ${FAL_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt: fullPrompt,
        image_url: String(characterImageUrl).trim(),
        duration: dur,
        aspect_ratio: '9:16',
      }),
    });
  } catch (err) {
    return Response.json(
      { error: 'Could not reach fal.ai. Check your internet connection and try again.' },
      { status: 502 }
    );
  }

  let data;
  try {
    data = await falRes.json();
  } catch {
    return Response.json({ error: 'fal.ai returned an unreadable response.' }, { status: 502 });
  }

  if (!falRes.ok) {
    const detail = data?.detail || data?.error || 'fal.ai rejected the request.';
    return Response.json({ error: `fal.ai error: ${detail}` }, { status: falRes.status });
  }

  return Response.json({
    request_id: data.request_id,
    status_url: data.status_url,
    response_url: data.response_url,
  });
}
