# Voice Note Implementation Logic

## Overview

This page implements the full voice-note experience in the communication chat UI. The flow covers recording, preview, sending, playback, and download behavior.

## 1. Recording Flow

### Start recording
- The user taps the microphone control.
- The page checks whether microphone access is supported.
- If permission is granted, it opens a browser audio stream using `MediaRecorder`.
- A recording timer starts and the UI enters the recording state.

### Key states
- `isRecordingVoice` → shows that recording is active.
- `voiceSeconds` → tracks the recording duration.
- `willCancelVoice` → indicates the user is dragging to cancel.
- `isVoiceLocked` → indicates the user has locked the recording.

### Gesture handling
- Drag upward to lock the recording.
- Drag sideways to cancel the recording.
- Release to finalize the action.

## 2. Preview Flow

### Prepare preview
- When the recording is stopped, the audio blob is created.
- The app can either:
  - discard the recording,
  - prepare a preview,
  - or send it immediately.

### Preview state
- `voicePreview` stores the generated audio blob, MIME type, duration, size, and preview URL.
- The preview can be played before sending.

## 3. Send Flow

### Optimistic message
- Before the backend call finishes, the app adds a temporary local message to the chat UI.
- This message shows a voice-note bubble with a pending status.

### Upload to backend
- The audio is sent through `sendAttachmentMessage`.
- The request includes:
  - the audio blob,
  - file name,
  - message text,
  - reply context,
  - file type,
  - duration.

### Backend response handling
- If the server responds successfully, the temporary local message is updated with the real server message ID and status.
- If the request fails, the message is marked as failed and can be retried.

## 4. Playback Flow

### Play a voice message
- When a user taps a voice message, the app loads its audio source.
- Playback state is tracked using:
  - `audioElementRefs`
  - `playingVoiceMessageId`
  - `voiceProgressById`
  - `voiceCurrentTimeById`

### Remote audio loading
- For remote voice notes, the app fetches the audio using the auth token.
- The audio is converted into an object URL and cached for reuse.

## 5. Download Flow

### Attachment download
- The app can download voice notes and other attachments.
- It uses the attachment download URL if available.
- If the file is local, it downloads directly from the generated object URL.

## 6. Main Implementation Labels

### Core functions
- `startVoiceRecording` → starts the microphone recording.
- `stopVoiceRecording` → finalizes the recording and creates the audio blob.
- `sendVoiceNoteBlob` → sends the voice note and updates the chat UI.
- `handleSendVoicePreview` → sends the previewed voice note.
- `handleVoicePlayPause` → controls playback for voice messages.
- `ensureRemoteVoiceUrl` → loads and caches remote voice audio.
- `handleDownloadAttachment` → downloads the attachment file.

## 7. Summary

The voice-note implementation works as a full lifecycle:

1. Record audio
2. Preview it
3. Send it to the backend
4. Show it in the chat as a message
5. Play it back when tapped
6. Download it if needed

This makes the voice-note feature feel like a complete in-chat media experience rather than a simple one-step upload.
