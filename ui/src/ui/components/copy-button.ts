/**
 * Copy Button Component
 * 
 * A reusable copy-to-clipboard button with visual feedback.
 * Designed for code blocks but can be used anywhere.
 */
import { html, nothing } from 'lit';
import { icons } from '../icons';

export type CopyButtonState = 'idle' | 'copying' | 'success' | 'error';

export interface CopyButtonProps {
  /** Content to copy */
  content: string;
  /** Button label for accessibility */
  label?: string;
  /** Optional CSS class */
  className?: string;
  /** Size variant */
  size?: 'sm' | 'md';
  /** Callback when copy succeeds */
  onSuccess?: () => void;
  /** Callback when copy fails */
  onError?: (error: Error) => void;
}

/**
 * Copy text to clipboard with fallback for older browsers.
 */
export async function copyToClipboard(text: string): Promise<void> {
  // Modern async clipboard API
  if (navigator.clipboard && navigator.clipboard.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  // Fallback for older browsers
  const textArea = document.createElement('textarea');
  textArea.value = text;
  textArea.style.position = 'fixed';
  textArea.style.left = '-9999px';
  textArea.style.top = '-9999px';
  textArea.setAttribute('readonly', '');
  document.body.appendChild(textArea);

  try {
    textArea.select();
    textArea.setSelectionRange(0, text.length);
    const success = document.execCommand('copy');
    if (!success) {
      throw new Error('Copy command failed');
    }
  } finally {
    document.body.removeChild(textArea);
  }
}

/**
 * Creates a copy button handler that manages state.
 */
export function createCopyHandler(
  setStateCallback: (state: CopyButtonState) => void,
  content: string,
  onSuccess?: () => void,
  onError?: (error: Error) => void
): () => Promise<void> {
  let timeoutId: number | null = null;

  return async () => {
    // Clear any pending timeout
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }

    setStateCallback('copying');

    try {
      await copyToClipboard(content);
      setStateCallback('success');
      onSuccess?.();

      // Reset to idle after 2 seconds
      timeoutId = window.setTimeout(() => {
        setStateCallback('idle');
      }, 2000);
    } catch (error) {
      setStateCallback('error');
      onError?.(error instanceof Error ? error : new Error('Copy failed'));

      // Reset to idle after 3 seconds
      timeoutId = window.setTimeout(() => {
        setStateCallback('idle');
      }, 3000);
    }
  };
}

/**
 * Render a copy button with the given state.
 */
export function renderCopyButton(
  props: CopyButtonProps,
  state: CopyButtonState,
  onClick: () => void
) {
  const { label = 'Copy to clipboard', className = '', size = 'sm' } = props;
  
  const getIcon = () => {
    switch (state) {
      case 'copying':
        return icons.loader;
      case 'success':
        return icons.check;
      case 'error':
        return icons.alert;
      default:
        return icons.copy;
    }
  };

  const getTitle = () => {
    switch (state) {
      case 'copying':
        return 'Copying...';
      case 'success':
        return 'Copied!';
      case 'error':
        return 'Failed to copy';
      default:
        return label;
    }
  };

  const sizeClass = size === 'sm' ? 'copy-btn--sm' : '';
  const stateClass = state !== 'idle' ? `copy-btn--${state}` : '';

  return html`
    <button
      class="copy-btn ${sizeClass} ${stateClass} ${className}"
      type="button"
      @click=${onClick}
      title=${getTitle()}
      aria-label=${label}
      ?disabled=${state === 'copying'}
    >
      ${getIcon()}
      ${state === 'success' ? html`<span class="copy-btn__text">Copied!</span>` : nothing}
    </button>
  `;
}

/**
 * Simple copy button that manages its own state.
 * For use in static templates without Lit element state.
 */
export function createCopyButtonElement(content: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.className = 'copy-btn copy-btn--sm';
  button.type = 'button';
  button.title = 'Copy to clipboard';
  button.setAttribute('aria-label', 'Copy to clipboard');
  button.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`;

  let timeoutId: number | null = null;

  button.addEventListener('click', async () => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }

    button.classList.add('copy-btn--copying');
    button.disabled = true;

    try {
      await copyToClipboard(content);
      button.classList.remove('copy-btn--copying');
      button.classList.add('copy-btn--success');
      button.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg><span class="copy-btn__text">Copied!</span>`;
      button.title = 'Copied!';

      timeoutId = window.setTimeout(() => {
        button.classList.remove('copy-btn--success');
        button.disabled = false;
        button.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`;
        button.title = 'Copy to clipboard';
      }, 2000);
    } catch {
      button.classList.remove('copy-btn--copying');
      button.classList.add('copy-btn--error');
      button.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`;
      button.title = 'Failed to copy';

      timeoutId = window.setTimeout(() => {
        button.classList.remove('copy-btn--error');
        button.disabled = false;
        button.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`;
        button.title = 'Copy to clipboard';
      }, 3000);
    }
  });

  return button;
}

/**
 * Injects copy buttons into code blocks within a container.
 * Can be called after rendering markdown content.
 */
export function injectCopyButtonsIntoCodeBlocks(container: HTMLElement) {
  const codeBlocks = container.querySelectorAll('pre');
  
  codeBlocks.forEach((pre) => {
    // Skip if already has a copy button
    if (pre.querySelector('.copy-btn')) {
      return;
    }

    // Get the code content
    const code = pre.textContent || '';
    if (!code.trim()) {
      return;
    }

    // Create and append the button
    const button = createCopyButtonElement(code);
    
    // Ensure relative positioning for absolute button placement
    if (getComputedStyle(pre).position === 'static') {
      pre.style.position = 'relative';
    }
    
    pre.appendChild(button);
  });
}
