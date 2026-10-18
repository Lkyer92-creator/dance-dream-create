# 🎬 DDC Dream Disect Create

A director's studio that turns your finished song into a full AI music video, built scene by
scene — now with **real in-app video generation** powered by your own fal.ai key, plus
**automatic lyric transcription** straight from your uploaded audio.

Upload your audio, slice it into timed intervals (5/10/15/20/30/40s), listen to each segment,
sync lyrics to time frames, lock your character / theme / style / color palette, direct every
shot (movement, lip sync, camera angle + movement), generate the actual video clips right
inside each scene card via fal.ai's Kling model, then assemble the full plan with optional
closed captions.

Built with **Next.js 14 (App Router, JavaScript)**.

## How it works

- **Project tab** — name your project + song, upload audio (MP3/WAV/M4A). Waveform + duration
  are decoded in the browser. Audio is kept in memory only: re-upload each visit; scenes,
  lyrics and assets auto-save to localStorage.
- **Timeline tab** — pick an interval length, split the song into numbered segments, tap any
  segment to play just that slice (loop toggle), rename segments. **Extract lyrics from audio**
  transcribes your song via fal.ai whisper and drops each timed line into the right segment
  (everything stays editable); or paste lyrics by hand and auto-distribute them across segments
  or assign per segment.
- **Scenes tab** — one numbered card per segment: shot type (Keyframe / Motion clip / B-roll /
  Lip sync), character movement, lip-sync toggle + lyric cue, camera angle + movement, setting,
  lighting/mood, notes. **Prompt Assist** drafts an editable video prompt from your directions +
  the locked assets. Each card also has a **Generate clip** panel that renders a real 5s/10s
  video via fal.ai using your locked character's reference image. Every scene carries a status
  pill — No prompt yet, Prompt Ready, Generating…, Video Rendered, Failed — and the rendered
  clip plays right in the card.
- **Assets tab** — create Characters (with reference image URL), Themes, Styles, and Color
  palettes. Lock one of each per project so every clip stays coordinated.
- **Assemble tab** — ordered numbered shot list with timestamps and per-scene status pills plus
  rendered-clip previews, total runtime, a **Master settings** panel (9:16 vertical fixed,
  closed-caption toggle, default interval length), closed-caption `.srt` download, shot-list
  `.txt` download, project JSON export/import.

## Your fal.ai key stays secret

The key lives **only on the server** (`process.env.FAL_KEY`, read inside
`app/api/generate-video/route.js`, `app/api/video-status/route.js` and
`app/api/transcribe/route.js`). The browser talks to those routes — it never sees the key.
There is no `NEXT_PUBLIC_` key anywhere. Never commit a real key to git.

## Audio → lyrics transcription

The **Extract lyrics from audio** button (Timeline tab) runs your uploaded song through
fal.ai's `whisper` model (task=transcribe, segment-level timestamps), entirely server-side:

1. The app asks `/api/transcribe` to initiate a fal.ai storage upload.
2. Your browser PUTs the audio bytes **directly to fal.ai's storage** (pre-signed URL, no key
   involved) — this keeps big files off the serverless function.
3. The server submits the whisper queue job and returns the status URL.
4. The app polls the shared `/api/video-status` fal.ai queue proxy, then fetches the timed
   transcript.
5. Each timed chunk is mapped onto the interval segments it overlaps; the full text fills the
   lyrics box. **Everything stays editable** — sung vocals over music transcribe imperfectly,
   so fix lines by hand.

## Local development

```bash
npm install
cp .env.example .env.local
# paste your real fal.ai key into .env.local as FAL_KEY=...
npm run dev
```

Open http://localhost:3000.

## Deploy (Vercel free tier)

1. Push this folder to a GitHub repo.
2. Import the repo at vercel.com (New Project).
3. Under **Environment Variables**, add `FAL_KEY` with your fal.ai key.
4. Deploy. Your app URL is live with video generation working.

> GitHub Pages **cannot** host this app — the API routes are required to keep your key
> server-side. Any static-only host would force the key into the browser, where anyone
> could steal it and burn your credits.

## Honest notes

- Kling v1.5 pro image-to-video renders **5s or 10s per clip** — longer intervals chain
  multiple clips end to end.
- A character **reference image URL** is required for generation (Kling is image-to-video).
  Add one to your locked character in the Assets tab.
- Render usage bills to **your fal.ai account**.
- Generation usually takes 1–2 minutes per clip; the app polls for completion and times out
  after ~3.5 minutes (check your fal.ai dashboard for finished clips).
- Prompts are always editable before you hit Generate — nothing renders without your approval.
- Transcription is a starting point — sung vocals over music transcribe imperfectly, so every
  transcribed line stays editable for fixing by hand.

## Files

- `app/page.js` — the whole director workflow (5 tabs)
- `app/layout.js`, `app/globals.css` — shell + dark studio theme
- `app/api/generate-video/route.js` — server route: starts a fal.ai render (holds the key)
- `app/api/video-status/route.js` — server route: polls any fal.ai queue status (holds the key)
- `app/api/transcribe/route.js` — server route: fal.ai storage upload initiate + whisper
  transcription submit (holds the key)
- `components/IntervalSceneEditor.js` — per-scene generation panel
- `hooks/useVideoGeneration.js` — client hook: start + poll video render, no key client-side
- `hooks/useTranscription.js` — client hook: upload + transcribe audio, no key client-side
- `music-video-creator-app-prompt.txt` — the copy-paste prompt for the LastApp build
