/**
 * Ref callback that injects copy buttons into code blocks after rendering.
 */
import { injectCopyButtonsIntoCodeBlocks } from '../components/copy-button';

/**
 * Creates a ref callback that injects copy buttons when the element is rendered.
 * Usage: ${ref(withCopyButtons())}
 */
export function withCopyButtons() {
  return (element: Element | undefined) => {
    if (element && element instanceof HTMLElement) {
      // Use requestAnimationFrame to ensure DOM is fully rendered
      requestAnimationFrame(() => {
        injectCopyButtonsIntoCodeBlocks(element);
      });
    }
  };
}
