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
 *
 * What clips: `overflow: hidden` / `clip`, and paint containment
 * (`contain: paint | content | strict` — `ion-list` has it). Only ancestors
 * that can clip the control are asked: an absolutely positioned box is not
 * clipped by the static boxes between it and its containing block, and a
 * fixed one only by an ancestor that is a containing block for it — one
 * with a transform, a filter, containment and the like. Edges are compared
 * in viewport pixels, so an ancestor that is scaled (the selected card is)
 * is measured scaled.
 *
 * Not covered: `clip-path`, and transforms that are not a scale.
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
      // Disabled ones too: cut off is cut off, whether or not it can be used.
      if (!el.matches('button, a[href], input, textarea, select')) return false;
      // Ionic's select lays a full-size hidden button over itself.
      const root = el.getRootNode();
      if (root instanceof ShadowRoot && root.host.tagName === 'ION-SELECT') return false;
      return isShown(el);
    });

    const paints = (contain: string): boolean => /\b(?:paint|content|strict)\b/u.test(contain);

    // What makes a box the containing block of everything positioned inside
    // it, fixed boxes included.
    const containsPositioned = (style: CSSStyleDeclaration): boolean => {
      const set = (value: string | undefined, unset: string): boolean =>
        value !== undefined && value !== '' && value !== unset;
      return (
        set(style.transform, 'none') ||
        set(style.translate, 'none') ||
        set(style.rotate, 'none') ||
        set(style.scale, 'none') ||
        set(style.perspective, 'none') ||
        set(style.filter, 'none') ||
        set(style.backdropFilter, 'none') ||
        set(style.containerType, 'normal') ||
        /\b(?:layout|paint|content|strict)\b/u.test(style.contain) ||
        /\b(?:transform|translate|rotate|scale|perspective|filter)\b/u.test(style.willChange)
      );
    };

    const found: ClippedControl[] = [];
    for (const control of controls) {
      const rect = control.getBoundingClientRect();
      let scrollsX = false;
      let scrollsY = false;
      // How the box we are following up the tree is positioned: the control
      // first, then each ancestor that turned out to contain it.
      let position = getComputedStyle(control).position;
      for (let n = flatParent(control); n; n = flatParent(n)) {
        const style = getComputedStyle(n);
        const contains = containsPositioned(style);
        // Not in the containing-block chain: it cannot clip what it does not contain.
        if (position === 'fixed' && !contains) continue;
        if (position === 'absolute' && style.position === 'static' && !contains) continue;
        position = style.position;

        if (style.overflowX === 'auto' || style.overflowX === 'scroll') scrollsX = true;
        if (style.overflowY === 'auto' || style.overflowY === 'scroll') scrollsY = true;
        const contained = paints(style.contain);
        const clipsX =
          !scrollsX && (contained || style.overflowX === 'hidden' || style.overflowX === 'clip');
        const clipsY =
          !scrollsY && (contained || style.overflowY === 'hidden' || style.overflowY === 'clip');
        if (!clipsX && !clipsY) continue;

        // What is clipped to is the box inside the border. The rect is in
        // viewport pixels, the border in the element's own: a scaled
        // ancestor has to be measured scaled. `offsetWidth` is a whole
        // number, so a box that is off by less than a pixel is a box with a
        // fraction in its width, not a scaled one.
        const outer = n.getBoundingClientRect();
        const box = n as HTMLElement;
        const scaled = (rendered: number, laidOut: number | undefined): number =>
          laidOut !== undefined && laidOut > 0 && Math.abs(rendered - laidOut) > 1
            ? rendered / laidOut
            : 1;
        const scaleX = scaled(outer.width, box.offsetWidth);
        const scaleY = scaled(outer.height, box.offsetHeight);
        const border = (width: string): number => Number.parseFloat(width) || 0;
        const left = outer.left + border(style.borderLeftWidth) * scaleX;
        const top = outer.top + border(style.borderTopWidth) * scaleY;
        const right = outer.right - border(style.borderRightWidth) * scaleX;
        const bottom = outer.bottom - border(style.borderBottomWidth) * scaleY;
        const over = {
          left: clipsX ? Math.max(0, left - rect.left) : 0,
          right: clipsX ? Math.max(0, rect.right - right) : 0,
          top: clipsY ? Math.max(0, top - rect.top) : 0,
          bottom: clipsY ? Math.max(0, rect.bottom - bottom) : 0,
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
