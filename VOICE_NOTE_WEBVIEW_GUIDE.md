# Voice Note Flow from WebView to Native Recorder

This document explains how to record a user voice note from a React Native app, trigger it from a WebView, and send the recorded audio back into the WebView for easy reuse in another app.

---

## 1. What this feature does

The app supports this flow:

1. The WebView sends a request to the native app.
2. The native app opens a voice recorder UI.
3. The user records audio.
4. The native app converts the recording into a data URL.
5. The native app sends that result back to the WebView.

This is useful when your web page wants to let users upload a voice note without building the recorder inside the web page.

---

## 2. Message flow

### WebView to Native

The WebView sends this message:

```js
window.postMessage({ type: "REQUEST_NATIVE_AUDIO_NOTE" }, "*");
```

### Native to WebView

After recording, the native app sends this back:

```js
{
  type: "NATIVE_AUDIO_NOTE_RESULT",
  ok: true,
  dataUrl: "data:audio/m4a;base64,...",
  mimeType: "audio/m4a",
  fileName: "voice-note-12345.m4a",
  base64Length: 12345
}
```

---

## 3. How it works in this app

### A. WebView request handler

In the WebView bridge, the app listens for the request message and triggers the native recorder.

Relevant logic is in:
- [src/components/SchoolWebView.js](src/components/SchoolWebView.js)

Key part:

```js
if (message.type === "REQUEST_NATIVE_AUDIO_NOTE") {
  console.log("[Bridge] Web requested native audio recorder");
  onRequestNativeAudioNote?.();
  return;
}
```

### B. Native recorder UI

The recorder UI is implemented in:
- [src/components/NativeAudioRecorderModal.js](src/components/NativeAudioRecorderModal.js)

It uses Expo Audio:

```js
import { Audio } from "expo-av";
```

Flow:

```js
await Audio.requestPermissionsAsync();

const recording = new Audio.Recording();
await recording.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
await recording.startAsync();
```

When stopped:

```js
await recording.stopAndUnloadAsync();
const uri = recording.getURI();
```

### C. Send result back to WebView

The native app injects JavaScript into the WebView and sends the recorded audio as a data URL.

Relevant logic is in:
- [src/screens/MainAppScreen.js](src/screens/MainAppScreen.js)

Example:

```js
const sendNativeAudioResultToWeb = (payload) => {
  if (!webViewRef.current) return;

  const safePayload = JSON.stringify({
    type: "NATIVE_AUDIO_NOTE_RESULT",
    ...payload,
  });

  webViewRef.current.injectJavaScript(`
    (function() {
      try {
        var data = ${safePayload};
        var raw = JSON.stringify(data);
        window.dispatchEvent(new MessageEvent('message', { data: raw }));
        document.dispatchEvent(new MessageEvent('message', { data: raw }));
        if (typeof window.onNativeAudioNoteResult === 'function') {
          window.onNativeAudioNoteResult(data);
        }
      } catch (e) {
        console.error('[Bridge] native audio result inject error', e);
      }
    })();
    true;
  `);
};
```

---

## 4. How to receive it in the WebView

In your web page or web app, use this code:

```html
<script>
  window.addEventListener("message", function (event) {
    try {
      const data = JSON.parse(event.data);

      if (data.type === "NATIVE_AUDIO_NOTE_RESULT") {
        console.log("Voice note received", data);

        if (data.ok) {
          // Use the recorded file
          const audioUrl = data.dataUrl;
          console.log("Audio data URL", audioUrl);
        }
      }
    } catch (e) {
      console.log("Message parse error", e);
    }
  });

  function recordVoiceNote() {
    window.postMessage({ type: "REQUEST_NATIVE_AUDIO_NOTE" }, "*");
  }
</script>
```

You can also use a callback:

```js
window.onNativeAudioNoteResult = function (data) {
  if (data.ok) {
    console.log("Recorded voice note ready", data.dataUrl);
  }
};
```

---

## 5. Simple reusable example for another app

### React Native side

```js
// Native side: when webview requests voice recording
const handleRequest = () => {
  openVoiceRecorderModal();
};

// After recording is done
const sendToWebView = (payload) => {
  webViewRef.current.injectJavaScript(`
    (function() {
      const data = ${JSON.stringify(payload)};
      window.postMessage(JSON.stringify(data), "*");
    })();
  `);
};
```

### WebView side

```js
function requestVoiceNote() {
  window.postMessage({ type: "REQUEST_NATIVE_AUDIO_NOTE" }, "*");
}

window.addEventListener("message", function (event) {
  try {
    const data = JSON.parse(event.data);
    if (data.type === "NATIVE_AUDIO_NOTE_RESULT") {
      if (data.ok) {
        const audio = new Audio(data.dataUrl);
        audio.play();
      }
    }
  } catch (e) {}
});
```

---

## 6. Important notes

- The audio is sent as a base64 data URL.
- This is good for quick web integration.
- For large audio files, you may want to upload the file directly to a server instead of sending it through the WebView bridge.
- On mobile devices, microphone permission is required.

---

## 7. Prompt-style implementation template

Use this prompt in another app:

```text
Build a React Native Expo app with a WebView. When the web page sends the message { type: "REQUEST_NATIVE_AUDIO_NOTE" }, open a native voice recorder UI. Ask for microphone permission, record audio using expo-av, stop the recording, convert it to a base64 data URL, and send it back to the WebView using the message type "NATIVE_AUDIO_NOTE_RESULT" with fields ok, dataUrl, mimeType, fileName, and base64Length. On the web side, listen for the message event and handle the voice note in the browser. Also provide a simple button in the web page that calls window.postMessage({ type: "REQUEST_NATIVE_AUDIO_NOTE" }, "*").
```

---

## 8. Short summary

If you want the easiest implementation:

- WebView sends: `REQUEST_NATIVE_AUDIO_NOTE`
- Native app records voice
- Native app sends back: `NATIVE_AUDIO_NOTE_RESULT`
- WebView receives the `dataUrl` and uses it

This pattern is simple and reusable for other apps.
