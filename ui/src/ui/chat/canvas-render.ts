import { html, nothing } from "lit";
import { ref } from "lit/directives/ref.js";
import type { CanvasVisualization } from "../components/canvas-visualization";
import { icons } from "../icons";
import { extractCanvasBlocks, type ParsedCanvasBlock } from "./canvas-parser";

/**
 * State for a rendered canvas block.
 */
type CanvasBlockState = {
  isPlaying: boolean;
  loading: boolean;
  error: string | null;
  expanded: boolean;
  showCode: boolean;
};

// Track state per canvas block by ID
const canvasStates = new Map<string, CanvasBlockState>();

function getCanvasState(id: string): CanvasBlockState {
  if (!canvasStates.has(id)) {
    canvasStates.set(id, {
      isPlaying: true,
      loading: true,
      error: null,
      expanded: false,
      showCode: false,
    });
  }
  return canvasStates.get(id)!;
}

/**
 * Renders a canvas visualization block inline in chat.
 */
export function renderCanvasBlock(
  block: ParsedCanvasBlock,
  id: string,
  onAddVisualization?: (viz: CanvasVisualization, sessionKey: string) => void,
  sessionKey?: string,
) {
  const state = getCanvasState(id);

  const handleIframeRef = (el: Element | undefined) => {
    if (!(el instanceof HTMLIFrameElement)) {
      return;
    }

    state.loading = true;

    const htmlContent = buildCanvasHtml(block.code);
    const blob = new Blob([htmlContent], { type: "text/html" });
    const url = URL.createObjectURL(blob);

    // Message handler for iframe communication
    const handleMessage = (e: MessageEvent) => {
      if (e.source !== el.contentWindow) {
        return;
      }

      if (e.data.type === "ready") {
        state.loading = false;
        // Trigger re-render (note: in Lit, this would need reactivity)
      } else if (e.data.type === "error") {
        state.error = e.data.message;
        state.loading = false;
      }
    };

    window.addEventListener("message", handleMessage);

    // Clean up previous blob URL
    if (el.src && el.src.startsWith("blob:")) {
      URL.revokeObjectURL(el.src);
    }

    el.src = url;

    // Cleanup after 5 seconds
    setTimeout(() => {
      window.removeEventListener("message", handleMessage);
    }, 5000);
  };

  const handlePlayPause = (el: HTMLIFrameElement | null) => {
    if (!el) {
      return;
    }
    state.isPlaying = !state.isPlaying;
    el.contentWindow?.postMessage({ type: state.isPlaying ? "play" : "pause" }, "*");
  };

  const handleRestart = (el: HTMLIFrameElement | null) => {
    if (!el) {
      return;
    }
    el.contentWindow?.postMessage({ type: "restart" }, "*");
  };

  const handleFullscreen = (container: HTMLElement | null) => {
    if (!container) {
      return;
    }
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      void container.requestFullscreen();
    }
  };

  const handleCopy = () => {
    void navigator.clipboard.writeText(block.code);
  };

  const handleAddToSidebar = () => {
    if (onAddVisualization && sessionKey) {
      const viz: CanvasVisualization = {
        id: `viz-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        title: block.title,
        code: block.code,
        description: block.description,
        createdAt: Date.now(),
        sessionKey,
      };
      onAddVisualization(viz, sessionKey);
    }
  };

  let iframeEl: HTMLIFrameElement | null = null;
  let containerEl: HTMLElement | null = null;

  return html`
    <div 
      class="chat-canvas-block fade-in"
      ${ref((el) => {
        containerEl = el as HTMLElement;
      })}
    >
      <div class="chat-canvas-header">
        <div class="chat-canvas-title">
          <span class="chat-canvas-title-icon">${icons.canvas}</span>
          <span>${block.title}</span>
        </div>
        <div class="chat-canvas-controls">
          <button
            class="chat-canvas-btn ${state.isPlaying ? "chat-canvas-btn--active" : ""}"
            @click=${() => handlePlayPause(iframeEl)}
            title=${state.isPlaying ? "Pause" : "Play"}
          >
            ${state.isPlaying ? icons.pause : icons.play}
          </button>
          <button
            class="chat-canvas-btn"
            @click=${() => handleRestart(iframeEl)}
            title="Restart"
          >
            ${icons.refreshCw}
          </button>
          <button
            class="chat-canvas-btn"
            @click=${handleCopy}
            title="Copy code"
          >
            ${icons.copy}
          </button>
          <button
            class="chat-canvas-btn"
            @click=${() => handleFullscreen(containerEl)}
            title="Fullscreen"
          >
            ${icons.maximize}
          </button>
          ${
            onAddVisualization
              ? html`
            <button
              class="chat-canvas-btn"
              @click=${handleAddToSidebar}
              title="Add to sidebar"
            >
              ${icons.panelRightOpen}
            </button>
          `
              : nothing
          }
        </div>
      </div>

      <div class="chat-canvas-container ${state.expanded ? "chat-canvas-container--expanded" : ""}">
        <iframe
          ${ref((el) => {
            iframeEl = el as HTMLIFrameElement;
            handleIframeRef(el);
          })}
          class="chat-canvas-iframe"
          sandbox="allow-scripts"
          title="Canvas visualization"
        ></iframe>

        ${
          state.loading
            ? html`
          <div class="chat-canvas-loading">
            ${icons.loader}
          </div>
        `
            : nothing
        }

        ${
          state.error
            ? html`
          <div class="chat-canvas-error">
            <div class="chat-canvas-error-icon">${icons.alertTriangle}</div>
            <div class="chat-canvas-error-message">${state.error}</div>
          </div>
        `
            : nothing
        }
      </div>

      ${
        block.description
          ? html`
        <div class="chat-canvas-description">${block.description}</div>
      `
          : nothing
      }
    </div>
  `;
}

/**
 * Extracts canvas blocks from message content and renders them.
 */
export function renderCanvasBlocksFromContent(
  content: string,
  messageKey: string,
  onAddVisualization?: (viz: CanvasVisualization, sessionKey: string) => void,
  sessionKey?: string,
) {
  const blocks = extractCanvasBlocks(content);

  if (blocks.length === 0) {
    return nothing;
  }

  return html`
    ${blocks.map((block, index) =>
      renderCanvasBlock(block, `${messageKey}-canvas-${index}`, onAddVisualization, sessionKey),
    )}
  `;
}

/**
 * Checks if content has canvas blocks.
 */
export function hasCanvasContent(content: string): boolean {
  const blocks = extractCanvasBlocks(content);
  return blocks.length > 0;
}

/**
 * Builds the sandboxed HTML for the canvas iframe.
 */
function buildCanvasHtml(code: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { 
      width: 100%; 
      height: 100%; 
      overflow: hidden;
      background: #0a0a0f;
    }
    canvas {
      display: block;
      width: 100%;
      height: 100%;
    }
    #error {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      color: #ff4d4d;
      font-family: system-ui, sans-serif;
      font-size: 14px;
      text-align: center;
      padding: 16px;
      max-width: 90%;
    }
  </style>
</head>
<body>
  <canvas id="canvas"></canvas>
  <div id="error" style="display: none;"></div>
  <script>
    (function() {
      "use strict";
      
      const canvas = document.getElementById('canvas');
      const ctx = canvas.getContext('2d');
      const errorEl = document.getElementById('error');
      
      // Resize canvas to match container
      function resize() {
        const dpr = window.devicePixelRatio || 1;
        const rect = canvas.getBoundingClientRect();
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        ctx.scale(dpr, dpr);
        canvas.logicalWidth = rect.width;
        canvas.logicalHeight = rect.height;
      }
      
      resize();
      window.addEventListener('resize', resize);
      
      let animationId = null;
      let isPlaying = true;
      let startTime = performance.now();
      
      // Helper utilities
      const utils = {
        width: () => canvas.logicalWidth || canvas.width,
        height: () => canvas.logicalHeight || canvas.height,
        clear: (color = '#0a0a0f') => {
          ctx.fillStyle = color;
          ctx.fillRect(0, 0, canvas.logicalWidth, canvas.logicalHeight);
        },
        time: () => (performance.now() - startTime) / 1000,
        lerp: (a, b, t) => a + (b - a) * t,
        clamp: (x, min, max) => Math.max(min, Math.min(max, x)),
        map: (x, a, b, c, d) => c + (d - c) * ((x - a) / (b - a)),
        noise: (x, y = 0, z = 0) => {
          const n = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453;
          return n - Math.floor(n);
        },
        hsl: (h, s, l) => \`hsl(\${h}, \${s}%, \${l}%)\`,
        hsla: (h, s, l, a) => \`hsla(\${h}, \${s}%, \${l}%, \${a})\`,
      };
      
      window.canvas = canvas;
      window.ctx = ctx;
      window.utils = utils;
      
      window.addEventListener('message', (e) => {
        if (e.data.type === 'play') {
          isPlaying = true;
          if (!animationId) loop();
        } else if (e.data.type === 'pause') {
          isPlaying = false;
          if (animationId) {
            cancelAnimationFrame(animationId);
            animationId = null;
          }
        } else if (e.data.type === 'restart') {
          startTime = performance.now();
          if (typeof setup === 'function') {
            try { setup(); } catch (e) { showError(e); }
          }
        }
      });
      
      function showError(err) {
        errorEl.textContent = String(err);
        errorEl.style.display = 'block';
        window.parent.postMessage({ type: 'error', message: String(err) }, '*');
      }
      
      let setup, draw;
      try {
        ${code}
        
        if (typeof window.setup === 'function') setup = window.setup;
        if (typeof window.draw === 'function') draw = window.draw;
      } catch (err) {
        showError(err);
      }
      
      if (setup) {
        try { setup(); } catch (err) { showError(err); }
      }
      
      function loop() {
        if (!isPlaying) return;
        
        if (draw) {
          try {
            const t = (performance.now() - startTime) / 1000;
            draw(t);
          } catch (err) {
            showError(err);
            return;
          }
        }
        
        animationId = requestAnimationFrame(loop);
      }
      
      if (draw) {
        loop();
      }
      
      window.parent.postMessage({ type: 'ready' }, '*');
    })();
  </script>
</body>
</html>
  `.trim();
}
