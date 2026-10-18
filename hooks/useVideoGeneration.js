'use client';

import { useCallback, useRef, useState } from 'react';

const POLL_INTERVAL_MS = 5000;
const MAX_POLLS = 40; // ~3.5 minutes max wait

// Drives real fal.ai video generation through our own API routes.
// The fal.ai key NEVER touches this code — it stays server-side.
export function useVideoGeneration() {
  const [isGenerating, setIsGenerating] = useState(false);
  const [videoUrl, setVideoUrl] = useState(null);
  const [error, setError] = useState(null);
  const cancelledRef = useRef(false);

  const cancel = useCallback(() => {
    cancelledRef.current = true;
    setIsGenerating(false);
  }, []);

  const generateVideo = useCallback(async ({ prompt, characterImageUrl, duration, cameraDirection }) => {
    cancelledRef.current = false;
    setIsGenerating(true);
    setError(null);
    setVideoUrl(null);

    try {
      // 1. Start generation (server route talks to fal.ai with the key)
      const startRes = await fetch('/api/generate-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, characterImageUrl, duration, cameraDirection }),
      });

      let startData;
      try {
        startData = await startRes.json();
      } catch {
        throw new Error('The server sent back an unreadable response. Try again.');
      }

      if (!startRes.ok) {
        throw new Error(startData?.error || 'Failed to start generation.');
      }

      const { status_url, response_url } = startData;
      if (!status_url) {
        throw new Error('fal.ai did not return a status URL. Try again.');
      }

      // 2. Poll our own status route every 5 seconds (server holds the key)
      for (let i = 0; i < MAX_POLLS; i++) {
        if (cancelledRef.current) return;

        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
        if (cancelledRef.current) return;

        const statusRes = await fetch(
          `/api/video-status?url=${encodeURIComponent(status_url)}`
        );

        let statusData;
        try {
          statusData = await statusRes.json();
        } catch {
          throw new Error('Lost contact with the render. Check your fal.ai dashboard.');
        }

        if (!statusRes.ok) {
          throw new Error(statusData?.error || 'Status check failed.');
        }

        if (statusData.status === 'COMPLETED') {
          // The status response usually carries the video inline; if not,
          // fetch the full result from the response URL as a fallback.
          let url = statusData.video?.url;
          if (!url && response_url) {
            try {
              const resRes = await fetch(
                `/api/video-status?url=${encodeURIComponent(response_url)}`
              );
              const resData = await resRes.json().catch(() => null);
              url = resData?.video?.url;
            } catch { /* fall through to the error below */ }
          }
          if (!url) throw new Error('Render finished but no video URL came back.');
          if (!cancelledRef.current) setVideoUrl(url);
          return;
        }

        if (statusData.status === 'FAILED') {
          throw new Error('AI engine failed to render. Try tweaking the prompt or reference image.');
        }
        // IN_PROGRESS / IN_QUEUE / anything else → keep polling
      }

      throw new Error('Render timed out — check your fal.ai dashboard for the finished clip.');
    } catch (err) {
      if (!cancelledRef.current) {
        setError(err?.message || 'Something went wrong generating the video.');
      }
    } finally {
      if (!cancelledRef.current) setIsGenerating(false);
    }
  }, []);

  return { generateVideo, cancel, isGenerating, videoUrl, error };
}
