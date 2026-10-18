// GET /api/video-status?url=<fal.ai status_url>
// Proxies the fal.ai queue status check server-side so the key never reaches the browser.
// Only allows fal.ai queue/status hosts (prevents the endpoint being used as an open proxy).

const ALLOWED_HOSTS = ['queue.fal.run', 'fal.run'];

export async function GET(req) {
  const FAL_KEY = process.env.FAL_KEY;
  if (!FAL_KEY) {
    return Response.json(
      { error: 'FAL_KEY not configured. Add your fal.ai key to the server environment variables.' },
      { status: 500 }
    );
  }

  const statusUrl = req.nextUrl.searchParams.get('url');
  if (!statusUrl) {
    return Response.json({ error: 'Missing ?url= status URL.' }, { status: 400 });
  }

  let parsed;
  try {
    parsed = new URL(statusUrl);
  } catch {
    return Response.json({ error: 'Invalid status URL.' }, { status: 400 });
  }

  if (parsed.protocol !== 'https:' || !ALLOWED_HOSTS.includes(parsed.hostname)) {
    return Response.json({ error: 'Status URL must be a fal.ai queue URL.' }, { status: 400 });
  }

  let falRes;
  try {
    falRes = await fetch(statusUrl, {
      headers: { Authorization: `Key ${FAL_KEY}` },
    });
  } catch {
    return Response.json({ error: 'Could not reach fal.ai.' }, { status: 502 });
  }

  let data;
  try {
    data = await falRes.json();
  } catch {
    return Response.json({ error: 'fal.ai returned an unreadable response.' }, { status: 502 });
  }

  if (!falRes.ok) {
    const detail = data?.detail || data?.error || 'Status check failed.';
    return Response.json({ error: `fal.ai error: ${detail}` }, { status: falRes.status });
  }

  return Response.json(data);
}
