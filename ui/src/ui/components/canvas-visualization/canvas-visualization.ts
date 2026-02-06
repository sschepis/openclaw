import { LitElement, html, css, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { ref } from "lit/directives/ref.js";
import { icons } from "../../icons";

export type CanvasVisualization = {
  id: string;
  title: string;
  code: string;
  createdAt: number;
  sessionKey: string;
  /** Optional description of what the visualization shows */
  description?: string;
  /** Whether the visualization is currently playing */
  isPlaying?: boolean;
  /** Error message if the visualization failed to render */
  error?: string | null;
};

/**
 * Sandboxed canvas visualization renderer.
 * Executes user-provided JavaScript in a sandboxed iframe to render
 * interactive canvas animations.
 */
@customElement("canvas-visualization")
export class CanvasVisualizationElement extends LitElement {
  static styles = css`
    :host {
      display: block;
      position: relative;
      border-radius: 8px;
      overflow: hidden;
      background: var(--canvas-bg, #0a0a0f);
    }
    
    .canvas-container {
      position: relative;
      width: 100%;
      aspect-ratio: 16 / 9;
      min-height: 200px;
      background: var(--canvas-bg, #0a0a0f);
    }
    
    .canvas-container--expanded {
      aspect-ratio: auto;
      height: 400px;
    }
    
    .canvas-iframe {
      width: 100%;
      height: 100%;
      border: none;
      display: block;
    }
    
    .canvas-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 12px;
      background: rgba(0, 0, 0, 0.3);
      border-bottom: 1px solid var(--border, rgba(255, 255, 255, 0.1));
    }
    
    .canvas-title {
      font-size: 13px;
      font-weight: 600;
      color: var(--text, #fff);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    
    .canvas-controls {
      display: flex;
      gap: 4px;
    }
    
    .canvas-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      border: none;
      border-radius: 4px;
      background: rgba(255, 255, 255, 0.1);
      color: var(--text-muted, #888);
      cursor: pointer;
      transition: all 0.15s ease;
    }
    
    .canvas-btn:hover {
      background: rgba(255, 255, 255, 0.2);
      color: var(--text, #fff);
    }
    
    .canvas-btn--active {
      background: var(--accent, #00e5cc);
      color: #000;
    }
    
    .canvas-btn svg {
      width: 16px;
      height: 16px;
    }
    
    .canvas-error {
      position: absolute;
      inset: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 16px;
      background: rgba(0, 0, 0, 0.8);
      color: var(--danger, #ff4d4d);
      text-align: center;
    }
    
    .canvas-error__icon {
      width: 32px;
      height: 32px;
    }
    
    .canvas-error__message {
      font-size: 12px;
      max-width: 80%;
      word-break: break-word;
    }
    
    .canvas-loading {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(0, 0, 0, 0.5);
    }
    
    .canvas-loading__spinner {
      width: 24px;
      height: 24px;
      animation: spin 1s linear infinite;
    }
    
    @keyframes spin {
      from {
        transform: rotate(0deg);
      }
      to {
        transform: rotate(360deg);
      }
    }
    
    .canvas-description {
      padding: 8px 12px;
      font-size: 12px;
      color: var(--text-muted, #888);
      background: rgba(0, 0, 0, 0.2);
      border-top: 1px solid var(--border, rgba(255, 255, 255, 0.1));
    }
  `;

  @property({ type: Object }) visualization: CanvasVisualization | null = null;
  @property({ type: Boolean }) expanded = false;
  @property({ type: Boolean }) showControls = true;

  @state() private isPlaying = true;
  @state() private loading = false;
  @state() private error: string | null = null;

  private iframe: HTMLIFrameElement | null = null;
  private animationFrameId: number | null = null;

  disconnectedCallback() {
    super.disconnectedCallback();
    this.cleanup();
  }

  private cleanup() {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  private handleIframeRef(el: Element | undefined) {
    if (el instanceof HTMLIFrameElement) {
      this.iframe = el;
      this.renderVisualization();
    }
  }

  private renderVisualization() {
    if (!this.iframe || !this.visualization?.code) {
      return;
    }

    this.loading = true;
    this.error = null;

    const code = this.visualization.code;

    // Create a sandboxed HTML document with the canvas code
    const htmlContent = `
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
        // Store logical size for user code
        canvas.logicalWidth = rect.width;
        canvas.logicalHeight = rect.height;
      }
      
      resize();
      window.addEventListener('resize', resize);
      
      // Animation state
      let animationId = null;
      let isPlaying = true;
      let startTime = performance.now();
      
      // Helper utilities exposed to user code
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
          // Simple pseudo-random noise
          const n = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453;
          return n - Math.floor(n);
        },
        hsl: (h, s, l) => \`hsl(\${h}, \${s}%, \${l}%)\`,
        hsla: (h, s, l, a) => \`hsla(\${h}, \${s}%, \${l}%, \${a})\`,
      };
      
      // Expose to user code
      window.canvas = canvas;
      window.ctx = ctx;
      window.utils = utils;
      
      // Message handler for play/pause control
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
      
      // User code execution
      let setup, draw;
      try {
        ${code}
        
        // User code should define setup() and/or draw(time)
        if (typeof window.setup === 'function') setup = window.setup;
        if (typeof window.draw === 'function') draw = window.draw;
      } catch (err) {
        showError(err);
      }
      
      // Run setup
      if (setup) {
        try { setup(); } catch (err) { showError(err); }
      }
      
      // Animation loop
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
      
      // Start animation
      if (draw) {
        loop();
      }
      
      // Signal ready
      window.parent.postMessage({ type: 'ready' }, '*');
    })();
  </script>
</body>
</html>
    `.trim();

    // Create blob URL for the iframe
    const blob = new Blob([htmlContent], { type: "text/html" });
    const url = URL.createObjectURL(blob);

    // Set up message listener for errors
    const handleMessage = (e: MessageEvent) => {
      if (e.source !== this.iframe?.contentWindow) {
        return;
      }

      if (e.data.type === "ready") {
        this.loading = false;
      } else if (e.data.type === "error") {
        this.error = e.data.message;
        this.loading = false;
      }
    };

    window.addEventListener("message", handleMessage);

    // Clean up previous blob URL
    if (this.iframe.src && this.iframe.src.startsWith("blob:")) {
      URL.revokeObjectURL(this.iframe.src);
    }

    this.iframe.src = url;

    // Cleanup listener when component is removed
    this.iframe.addEventListener(
      "load",
      () => {
        // Remove listener after a timeout to catch late errors
        setTimeout(() => {
          window.removeEventListener("message", handleMessage);
        }, 5000);
      },
      { once: true },
    );
  }

  private handlePlayPause() {
    this.isPlaying = !this.isPlaying;
    this.iframe?.contentWindow?.postMessage({ type: this.isPlaying ? "play" : "pause" }, "*");
  }

  private handleRestart() {
    this.iframe?.contentWindow?.postMessage({ type: "restart" }, "*");
  }

  private handleFullscreen() {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      void this.shadowRoot?.querySelector(".canvas-container")?.requestFullscreen();
    }
  }

  private handleExpand() {
    this.expanded = !this.expanded;
    this.dispatchEvent(new CustomEvent("expand", { detail: { expanded: this.expanded } }));
  }

  private handleCopyCode() {
    if (this.visualization?.code) {
      void navigator.clipboard.writeText(this.visualization.code);
    }
  }

  private handleOpenInSidebar() {
    if (this.visualization) {
      this.dispatchEvent(
        new CustomEvent("open-sidebar", {
          detail: { visualization: this.visualization },
          bubbles: true,
          composed: true,
        }),
      );
    }
  }

  render() {
    if (!this.visualization) {
      return nothing;
    }

    return html`
      ${
        this.showControls
          ? html`
        <div class="canvas-header">
          <span class="canvas-title">${this.visualization.title}</span>
          <div class="canvas-controls">
            <button
              class="canvas-btn ${this.isPlaying ? "canvas-btn--active" : ""}"
              @click=${() => this.handlePlayPause()}
              title=${this.isPlaying ? "Pause" : "Play"}
            >
              ${this.isPlaying ? icons.pause : icons.play}
            </button>
            <button
              class="canvas-btn"
              @click=${() => this.handleRestart()}
              title="Restart"
            >
              ${icons.refreshCw}
            </button>
            <button
              class="canvas-btn"
              @click=${() => this.handleCopyCode()}
              title="Copy code"
            >
              ${icons.copy}
            </button>
            <button
              class="canvas-btn"
              @click=${() => this.handleFullscreen()}
              title="Fullscreen"
            >
              ${icons.maximize}
            </button>
            <button
              class="canvas-btn"
              @click=${() => this.handleOpenInSidebar()}
              title="Open in sidebar"
            >
              ${icons.panelRightOpen}
            </button>
          </div>
        </div>
      `
          : nothing
      }

      <div class="canvas-container ${this.expanded ? "canvas-container--expanded" : ""}">
        <iframe
          ${ref((el) => this.handleIframeRef(el))}
          class="canvas-iframe"
          sandbox="allow-scripts"
          title="Canvas visualization"
        ></iframe>

        ${
          this.loading
            ? html`
          <div class="canvas-loading">
            <div class="canvas-loading__spinner">${icons.loader}</div>
          </div>
        `
            : nothing
        }

        ${
          this.error
            ? html`
          <div class="canvas-error">
            <div class="canvas-error__icon">${icons.alertTriangle}</div>
            <div class="canvas-error__message">${this.error}</div>
          </div>
        `
            : nothing
        }
      </div>

      ${
        this.visualization.description
          ? html`
        <div class="canvas-description">${this.visualization.description}</div>
      `
          : nothing
      }
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "canvas-visualization": CanvasVisualizationElement;
  }
}
