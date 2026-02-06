import { createSpeechRecognition, speakText, type SpeechRecognition } from "./speech";
import type { OpenClawApp } from "./app";

type App = OpenClawApp & {
  isListening: boolean;
  recognition: SpeechRecognition | null;
  chatMessage: string;
  mobileSessionsOpen: boolean;
  commandPaletteOpen: boolean;
  shadowRoot: ShadowRoot | null;
  handleToggleCommandPalette: () => void;
};

export function handleToggleMic(app: App) {
  if (app.isListening) {
    app.recognition?.stop();
    app.isListening = false;
    return;
  }

  if (!app.recognition) {
    app.recognition = createSpeechRecognition();
    if (!app.recognition) {
      alert("Speech recognition is not supported in this browser.");
      return;
    }
    app.recognition.continuous = false;
    app.recognition.interimResults = true;
    app.recognition.lang = "en-US";

    app.recognition.onresult = (event) => {
      let finalTranscript = "";
      let interimTranscript = "";

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        } else {
          interimTranscript += event.results[i][0].transcript;
        }
      }

      if (finalTranscript) {
        const current = app.chatMessage ? app.chatMessage + " " : "";
        app.chatMessage = current + finalTranscript;
      }
    };

    app.recognition.onerror = (event) => {
      console.error("Speech recognition error", event.error);
      app.isListening = false;
    };

    app.recognition.onend = () => {
      app.isListening = false;
    };
  }

  app.recognition.start();
  app.isListening = true;
}

export function handleSpeak(text: string) {
  speakText(text);
}

export async function handleFileUpload(app: App, file: File) {
  const reader = new FileReader();
  reader.onload = (e) => {
    const text = e.target?.result as string;
    if (text) {
      const header = `\n\n--- ${file.name} ---\n`;
      const current = app.chatMessage ? app.chatMessage + header : header;
      app.chatMessage = current + text + "\n---\n";
    }
  };
  reader.readAsText(file);
}

export function handleGlobalKeydown(app: App, e: KeyboardEvent) {
  const isCmd = e.metaKey || e.ctrlKey;
  
  // Cmd+K: Toggle Command Palette
  if (isCmd && e.key === "k") {
    e.preventDefault();
    app.handleToggleCommandPalette();
    return;
  }

  // Cmd+B: Toggle Mobile Sidebar
  if (isCmd && e.key === "b") {
    e.preventDefault();
    app.mobileSessionsOpen = !app.mobileSessionsOpen;
  }
}
