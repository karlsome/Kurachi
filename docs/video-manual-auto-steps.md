# Video Manual: Create Steps from Video (backend notes)

The full design doc is in the freyaAdmin2 repo: `freyaAdmin2/docs/VIDEO_MANUAL_AUTO_STEPS.md`.

The backend part lives in `server.js`, in the section "Video Manual: auto steps from voice" (after the step PATCH route):

- `POST /api/video-manuals-studio/projects/:id/transcribe`: pass-through to Gemini `gemini-3.5-transcribe`
  (word timestamps). It is cached in `videoManualTranscripts` by the SHA-256 of the audio (TTL 15 days on
  `lastUsedAt`), with at most 2 concurrent calls. No media processing happens on Render.
- `GET | PUT | DELETE /api/video-manuals-studio/projects/:id/auto-steps-draft`: one draft per project and user in
  `videoManualAutoStepDrafts`, so the browser can resume. Drafts untouched for 15 days are removed and their unused
  video is recycled.
- `POST /api/video-manuals-studio/projects/:id/steps/bulk`: appends ready-made steps in one save and deletes the draft.
