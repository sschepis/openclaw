/**
 * Focus Trap Utility
 * 
 * Provides focus management for modals and overlays to ensure:
 * 1. Focus stays within the container when tabbing
 * 2. Focus returns to the trigger element when closed
 * 3. Proper ARIA roles and keyboard handling
 */

const FOCUSABLE_SELECTORS = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
  '[contenteditable="true"]',
].join(', ');

export interface FocusTrapOptions {
  /** The container element to trap focus within */
  container: HTMLElement;
  /** Optional element to return focus to when trap is released */
  returnFocusTo?: HTMLElement | null;
  /** Whether to focus the first focusable element automatically */
  autoFocus?: boolean;
  /** Callback when escape key is pressed */
  onEscape?: () => void;
}

export interface FocusTrap {
  /** Activate the focus trap */
  activate: () => void;
  /** Deactivate the focus trap and return focus */
  deactivate: () => void;
  /** Update the return focus target */
  updateReturnTarget: (element: HTMLElement | null) => void;
}

/**
 * Creates a focus trap for the given container.
 * 
 * Usage:
 * ```ts
 * const trap = createFocusTrap({
 *   container: modalElement,
 *   returnFocusTo: triggerButton,
 *   onEscape: () => closeModal()
 * });
 * 
 * trap.activate();  // When modal opens
 * trap.deactivate(); // When modal closes
 * ```
 */
export function createFocusTrap(options: FocusTrapOptions): FocusTrap {
  const { container, autoFocus = true, onEscape } = options;
  let returnFocusTo = options.returnFocusTo ?? null;
  let isActive = false;

  function getFocusableElements(): HTMLElement[] {
    const elements = container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTORS);
    return Array.from(elements).filter((el) => {
      // Filter out elements that are not visible
      return el.offsetParent !== null || el.offsetWidth > 0 || el.offsetHeight > 0;
    });
  }

  function handleKeyDown(event: KeyboardEvent): void {
    if (!isActive) return;

    // Handle Escape key
    if (event.key === 'Escape' && onEscape) {
      event.preventDefault();
      event.stopPropagation();
      onEscape();
      return;
    }

    // Handle Tab key for focus cycling
    if (event.key === 'Tab') {
      const focusableElements = getFocusableElements();
      if (focusableElements.length === 0) {
        event.preventDefault();
        return;
      }

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];
      const activeElement = document.activeElement as HTMLElement;

      if (event.shiftKey) {
        // Shift+Tab: Go backwards
        if (activeElement === firstElement || !container.contains(activeElement)) {
          event.preventDefault();
          lastElement.focus();
        }
      } else {
        // Tab: Go forwards
        if (activeElement === lastElement || !container.contains(activeElement)) {
          event.preventDefault();
          firstElement.focus();
        }
      }
    }
  }

  function handleFocusOut(event: FocusEvent): void {
    if (!isActive) return;

    const relatedTarget = event.relatedTarget as HTMLElement | null;
    
    // If focus is leaving the container entirely, bring it back
    if (relatedTarget && !container.contains(relatedTarget)) {
      event.preventDefault();
      const focusableElements = getFocusableElements();
      if (focusableElements.length > 0) {
        focusableElements[0].focus();
      } else {
        container.focus();
      }
    }
  }

  function activate(): void {
    if (isActive) return;
    isActive = true;

    // Store the currently focused element if not already set
    if (!returnFocusTo && document.activeElement instanceof HTMLElement) {
      returnFocusTo = document.activeElement;
    }

    // Add event listeners
    document.addEventListener('keydown', handleKeyDown, true);
    container.addEventListener('focusout', handleFocusOut);

    // Make container focusable if it isn't already
    if (!container.hasAttribute('tabindex')) {
      container.setAttribute('tabindex', '-1');
    }

    // Focus the first focusable element or the container
    if (autoFocus) {
      requestAnimationFrame(() => {
        const focusableElements = getFocusableElements();
        
        // Check for autofocus attribute first
        const autofocusElement = container.querySelector<HTMLElement>('[autofocus]');
        if (autofocusElement && focusableElements.includes(autofocusElement)) {
          autofocusElement.focus();
        } else if (focusableElements.length > 0) {
          focusableElements[0].focus();
        } else {
          container.focus();
        }
      });
    }
  }

  function deactivate(): void {
    if (!isActive) return;
    isActive = false;

    // Remove event listeners
    document.removeEventListener('keydown', handleKeyDown, true);
    container.removeEventListener('focusout', handleFocusOut);

    // Return focus to the original element
    if (returnFocusTo && returnFocusTo.isConnected) {
      requestAnimationFrame(() => {
        returnFocusTo?.focus();
      });
    }
  }

  function updateReturnTarget(element: HTMLElement | null): void {
    returnFocusTo = element;
  }

  return {
    activate,
    deactivate,
    updateReturnTarget,
  };
}

/**
 * A simpler hook-style focus trap that auto-manages lifecycle.
 * Use this when you just need to trap focus in a container.
 */
export function trapFocus(container: HTMLElement, onEscape?: () => void): () => void {
  const previouslyFocused = document.activeElement as HTMLElement | null;
  
  const trap = createFocusTrap({
    container,
    returnFocusTo: previouslyFocused,
    onEscape,
  });

  trap.activate();

  // Return cleanup function
  return () => trap.deactivate();
}

/**
 * Utility to check if an element is focusable.
 */
export function isFocusable(element: Element): boolean {
  return element.matches(FOCUSABLE_SELECTORS);
}

/**
 * Find the first focusable descendant of an element.
 */
export function findFirstFocusable(container: HTMLElement): HTMLElement | null {
  return container.querySelector<HTMLElement>(FOCUSABLE_SELECTORS);
}

/**
 * Find the last focusable descendant of an element.
 */
export function findLastFocusable(container: HTMLElement): HTMLElement | null {
  const elements = container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTORS);
  return elements.length > 0 ? elements[elements.length - 1] : null;
}
