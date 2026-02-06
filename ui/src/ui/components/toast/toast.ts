import { LitElement, html, css, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { icons } from '../../icons';

export type ToastType = 'success' | 'error' | 'warning' | 'info' | 'loading';

export interface ToastAction {
  label: string;
  onClick: () => void;
  primary?: boolean;
}

export interface ToastOptions {
  id?: string;
  title: string;
  message?: string;
  type?: ToastType;
  duration?: number; // Duration in ms, 0 for persistent
  actions?: ToastAction[];
  position?: 'top-right' | 'top-left' | 'top-center' | 'bottom-right' | 'bottom-left' | 'bottom-center';
}

@customElement('toast-notification')
export class ToastNotification extends LitElement {
  @property({ type: String }) toastId = '';
  @property({ type: String }) title = '';
  @property({ type: String }) message = '';
  @property({ type: String }) type: ToastType = 'info';
  @property({ type: Number }) duration = 5000;
  @property({ type: Array }) actions: ToastAction[] = [];
  @property({ type: Boolean }) closing = false;

  @state() private _progress = 100;
  private _startTime = 0;
  private _animationFrame: number | null = null;
  private _timeout: number | null = null;
  private _paused = false;

  createRenderRoot() {
    return this; // Render in light DOM to use global styles
  }

  connectedCallback() {
    super.connectedCallback();
    
    if (this.duration > 0) {
      this._startTimer();
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._clearTimer();
  }

  private _startTimer() {
    this._startTime = Date.now();
    this._timeout = window.setTimeout(() => {
      this._close();
    }, this.duration);
    
    // Animation loop for progress bar if needed via JS (CSS animation is preferred for performance)
    // We use CSS animation in the stylesheet, but this handles the logic
  }

  private _clearTimer() {
    if (this._timeout) {
      clearTimeout(this._timeout);
      this._timeout = null;
    }
    if (this._animationFrame) {
      cancelAnimationFrame(this._animationFrame);
      this._animationFrame = null;
    }
  }

  private _pauseTimer() {
    this._paused = true;
    this._clearTimer();
    // In a full implementation, we'd calculate remaining time
  }

  private _resumeTimer() {
    this._paused = false;
    // In a full implementation, we'd resume with remaining time
    // For now, simpler implementation relies on CSS animation state
  }

  private _close() {
    this.closing = true;
    this.requestUpdate();
    
    // Dispatch event for parent to remove from DOM after animation
    this.dispatchEvent(new CustomEvent('toast-close', {
      detail: { id: this.toastId },
      bubbles: true,
      composed: true
    }));
  }

  private _handleAction(action: ToastAction) {
    action.onClick();
    this._close();
  }

  private _getIcon() {
    switch (this.type) {
      case 'success': return icons.checkCircle;
      case 'error': return icons.alert;
      case 'warning': return icons.alertTriangle;
      case 'info': return icons.info;
      case 'loading': return icons.loader;
      default: return icons.info;
    }
  }

  render() {
    const icon = this._getIcon();
    
    return html`
      <div 
        class="toast toast--${this.type} ${this.closing ? 'toast--exit' : 'toast--enter-right'}"
        role="alert"
        @mouseenter=${this._pauseTimer}
        @mouseleave=${this._resumeTimer}
      >
        <div class="toast__icon">
          ${icon}
        </div>
        
        <div class="toast__content">
          <div class="toast__title">${this.title}</div>
          ${this.message ? html`<div class="toast__message">${this.message}</div>` : nothing}
          
          ${this.actions.length > 0 ? html`
            <div class="toast__actions">
              ${this.actions.map(action => html`
                <button 
                  class="toast__action ${action.primary ? 'toast__action--primary' : ''}"
                  @click=${() => this._handleAction(action)}
                >
                  ${action.label}
                </button>
              `)}
            </div>
          ` : nothing}
        </div>
        
        <button class="toast__close" @click=${this._close} aria-label="Close notification">
          ${icons.x}
        </button>
        
        ${this.duration > 0 ? html`
          <div class="toast__progress">
            <div 
              class="toast__progress-bar" 
              style="animation-duration: ${this.duration}ms;"
            ></div>
          </div>
        ` : nothing}
      </div>
    `;
  }
}

// Toast Manager to handle multiple toasts
export class ToastManager {
  private static instance: ToastManager;
  private container: HTMLElement;
  private toasts: Map<string, HTMLElement> = new Map();

  private constructor() {
    this.container = document.createElement('div');
    this.container.className = 'toast-container toast-container--top-right';
    document.body.appendChild(this.container);
    
    // Listen for close events from toasts
    document.addEventListener('toast-close', (e: any) => {
      this.remove(e.detail.id);
    });
  }

  static getInstance(): ToastManager {
    if (!ToastManager.instance) {
      ToastManager.instance = new ToastManager();
    }
    return ToastManager.instance;
  }

  show(options: ToastOptions): string {
    const id = options.id || Math.random().toString(36).substring(2, 9);
    
    // Create toast element
    const toast = document.createElement('toast-notification') as ToastNotification;
    toast.toastId = id;
    toast.title = options.title;
    toast.message = options.message || '';
    toast.type = options.type || 'info';
    toast.duration = options.duration ?? 5000;
    toast.actions = options.actions || [];
    
    // Update position if specified
    if (options.position) {
      this.container.className = `toast-container toast-container--${options.position}`;
    }
    
    this.container.appendChild(toast);
    this.toasts.set(id, toast);
    
    return id;
  }

  remove(id: string) {
    const toast = this.toasts.get(id);
    if (toast) {
      // Wait for animation to finish then remove
      setTimeout(() => {
        if (toast.parentNode === this.container) {
          this.container.removeChild(toast);
        }
        this.toasts.delete(id);
      }, 300); // Match exit animation duration
    }
  }

  success(title: string, message?: string, options?: Partial<ToastOptions>) {
    return this.show({ ...options, title, message, type: 'success' });
  }

  error(title: string, message?: string, options?: Partial<ToastOptions>) {
    return this.show({ ...options, title, message, type: 'error' });
  }

  warning(title: string, message?: string, options?: Partial<ToastOptions>) {
    return this.show({ ...options, title, message, type: 'warning' });
  }

  info(title: string, message?: string, options?: Partial<ToastOptions>) {
    return this.show({ ...options, title, message, type: 'info' });
  }

  loading(title: string, message?: string, options?: Partial<ToastOptions>) {
    return this.show({ ...options, title, message, type: 'loading', duration: 0 });
  }
}

// Export a singleton for easy use
export const toast = ToastManager.getInstance();
