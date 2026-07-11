# Codex Prompt: Implement Voice Note Logic in Another Project

Use the implementation details from [voice-note-implementation-logic.md](voice-note-implementation-logic.md) and recreate the same voice-note experience in the target project.

## Goal

Implement a complete voice-note feature with the same working logic as the reference implementation:
- record audio
- preview before sending
- upload to backend
- show a message in chat
- play voice notes back
- support download if needed

## What to implement

### 1. Recording flow
- Use browser media recording APIs such as `MediaRecorder`.
- Request microphone permission before recording.
- Start recording only if the browser supports it.
- Show recording timer and active recording state.
- Support simple gesture-based UI behavior:
  - drag upward to lock recording
  - drag sideways to cancel recording
  - release to finalize

### 2. Preview flow
- After stopping recording, create an audio blob.
- Show a preview before sending.
- Allow the user to play the preview before sending.
- Store preview state such as blob, MIME type, duration, and size.

### 3. Send flow
- Add an optimistic local chat message immediately when the user sends the voice note.
- Send the audio to the backend using the project’s existing attachment or file upload API.
- If the backend responds successfully, update the temporary message with the real message data.
- If it fails, mark it as failed and allow retry.

### 4. Playback flow
- Show voice notes inside chat as playable audio items.
- Play/pause audio using browser audio elements.
- Track playback progress and current time.
- Stop other playing audio when a new one starts.

### 5. Download flow
- Allow the user to download voice notes and attachments.
- Use the attachment download URL when available.
- If the file is local, download the generated blob URL.

## Technical requirements

- Follow the architecture of the target project.
- Use the same pattern of state handling and UI updates as the reference implementation.
- Keep the implementation clean, modular, and reusable.
- Add proper error messages for permission denial, unsupported browser, failed uploads, and missing auth.
- Ensure the feature works in a modern browser.

## Expected behavior

1. The user taps the microphone button.
2. The app requests microphone access if needed.
3. Recording starts and shows a timer.
4. The user can lock or cancel the recording via gesture.
5. The recording becomes a preview.
6. The user sends the voice note.
7. The voice note appears in the chat immediately.
8. The user can play it back later.
9. The user can download it if needed.

## Deliverables

- Implement the voice-note feature in the target project.
- Add or update the necessary UI components.
- Add or update the relevant API/service integration.
- Keep the code organized and explain the main implementation points.

## Notes

- If the target project already has a chat page, attach the feature there.
- If it does not, create a minimal chat-like page and wire the voice note feature into it.
- Preserve the project’s existing styling and component patterns.

## Copy-paste prompt for Codex

Implement a voice note feature in this project using the same logic and behavior described in the attached implementation guide. The feature should support recording audio, previewing before send, uploading the voice note, showing it as a chat message, playing it back, and downloading it when needed.

Use browser media recording APIs such as MediaRecorder, request microphone permission, manage recording states, and support simple gesture-based lock/cancel actions. Add optimistic message handling so the voice note appears immediately in the UI before the upload completes. Integrate with the project’s existing attachment or messaging API if available. If the project has a chat UI, wire the feature into that flow; otherwise, create a minimal chat interface that demonstrates the same behavior.

Make the implementation modular, avoid hardcoded hacks, and follow the project’s existing architecture and style. Include clear error handling for permission issues, unsupported browsers, upload failures, and missing authentication. Provide a short explanation of the main implementation flow after completing the work.
