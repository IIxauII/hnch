import type { Page } from '@playwright/test';

/** A control that reaches past a container which clips it. */
export interface ClippedControl {
  /** The control's accessible name, or its text. */
  readonly control: string;
  /** The ancestor that clips it. */
  readonly clippedBy: string;
  /** How far the control reaches past each edge of that ancestor, in px. */
  readonly over: { left: number; right: number; top: number; bottom: number };
}

/**
 * Every visible control on the page that is cut off by an ancestor with
 * `overflow: hidden` / `clip`.
 *
 * Such a control is a defect twice over. The part past the edge is neither
 * drawn nor tappable, and anything that scrolls the control into view —
 * `scrollIntoView()`, which is also what Playwright does before a click —
 * scrolls the clipping ancestor, shifting and cutting off whatever sits
 * beside it. That is how a ⋯ button with a negative margin came to eat the
 * first letter of the participant's name next to it.
 *
 * Reaching past a *scroller* is not a defect: that is what scrolling is for,
 * so an axis stops being checked once the walk has passed a scroller on it.
 */
export async function clippedControls(page: Page): Promise<ClippedControl[]> {
  return page.evaluate(() => {
    const flatParent = (node: Node): Element | null => {
      const parent = (node as Element).assignedSlot ?? node.parentNode;
      if (parent instanceof ShadowRoot) return parent.host;
      return parent instanceof Element ? parent : null;
    };

    const everyElement = (root: ParentNode, out: Element[] = []): Element[] => {
      for (const el of root.querySelectorAll('*')) {
        out.push(el);
        if (el.shadowRoot) everyElement(el.shadowRoot, out);
      }
      return out;
    };

    const isShown = (el: Element): boolean => {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return false;
      for (let n: Element | null = el; n; n = flatParent(n)) {
        if (n.classList.contains('ion-page-hidden') || n.classList.contains('overlay-hidden')) {
          return false;
        }
        const style = getComputedStyle(n);
        if (style.visibility === 'hidden' || style.display === 'none') return false;
      }
      return true;
    };

    const nameOf = (el: Element): string => {
      const root = el.getRootNode();
      const host = root instanceof ShadowRoot ? root.host : el;
      const label = el.getAttribute('aria-label') ?? host.getAttribute('aria-label');
      return label ?? (host.textContent ?? '').trim().slice(0, 40);
    };

    const describe = (el: Element): string => {
      const root = el.getRootNode();
      const cls = el.classList.length > 0 ? `.${[...el.classList].slice(0, 2).join('.')}` : '';
      const within = root instanceof ShadowRoot ? ` in ${root.host.tagName.toLowerCase()}` : '';
      return `${el.tagName.toLowerCase()}${cls}${within}`;
    };

    const controls = everyElement(document.body).filter((el) => {
      if (!el.matches('button, a[href], input, textarea, select')) return false;
      if ((el as HTMLButtonElement).disabled) return false;
      // Ionic's select lays a full-size hidden button over itself.
      const root = el.getRootNode();
      if (root instanceof ShadowRoot && root.host.tagName === 'ION-SELECT') return false;
      return isShown(el);
    });

    const found: ClippedControl[] = [];
    for (const control of controls) {
      const rect = control.getBoundingClientRect();
      let scrollsX = false;
      let scrollsY = false;
      for (let n = flatParent(control); n; n = flatParent(n)) {
        const style = getComputedStyle(n);
        if (style.overflowX === 'auto' || style.overflowX === 'scroll') scrollsX = true;
        if (style.overflowY === 'auto' || style.overflowY === 'scroll') scrollsY = true;
        const clipsX = !scrollsX && (style.overflowX === 'hidden' || style.overflowX === 'clip');
        const clipsY = !scrollsY && (style.overflowY === 'hidden' || style.overflowY === 'clip');
        if (!clipsX && !clipsY) continue;

        const outer = n.getBoundingClientRect();
        const left = outer.left + n.clientLeft;
        const top = outer.top + n.clientTop;
        const over = {
          left: clipsX ? Math.max(0, left - rect.left) : 0,
          right: clipsX ? Math.max(0, rect.right - (left + n.clientWidth)) : 0,
          top: clipsY ? Math.max(0, top - rect.top) : 0,
          bottom: clipsY ? Math.max(0, rect.bottom - (top + n.clientHeight)) : 0,
        };
        // Half a pixel of slack for sub-pixel layout.
        if (Math.max(over.left, over.right, over.top, over.bottom) > 0.5) {
          found.push({ control: nameOf(control), clippedBy: describe(n), over });
          break;
        }
      }
    }
    return found;
  });
}
