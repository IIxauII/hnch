/**
 * KeyboardShortcutService — desktop-only keyboard shortcut registry.
 *
 * Enabled only on pointer-fine / hover-capable devices. On touch-only
 * devices every method is a no-op. ADR-0038.
 *
 * Usage:
 *   const unregister = this.shortcuts.register({ r: () => this.onReveal() })
 *   // in ngOnDestroy:
 *   unregister()
 */
import { Injectable } from '@angular/core'

type HandlerMap = Partial<Record<string, () => void>>

/**
 * Ionic shadow-DOM host tags that own keyboard focus. The inner native
 * input lives in the shadow tree; `event.target` resolves to the host,
 * so we must treat these tags as editable themselves.
 */
const IONIC_EDITABLE_TAGS = new Set([
  'INPUT',
  'TEXTAREA',
  'SELECT',
  'ION-INPUT',
  'ION-TEXTAREA',
  'ION-SEARCHBAR',
  'ION-SELECT',
  'ION-RADIO',
  'ION-CHECKBOX',
  'ION-TOGGLE',
])

/**
 * Resolve the real focused element, piercing shadow-DOM boundaries.
 * `event.composedPath()[0]` is the innermost target; fall back to
 * `event.target` when composedPath is unavailable (e.g. synthetic
 * events in tests).
 */
function resolveTarget(event: KeyboardEvent): Element | null {
  const path = event.composedPath?.()
  const first = path && path.length > 0 ? path[0] : event.target
  return first instanceof Element ? first : null
}

/** Returns true when the resolved element is editable. */
function isEditableTarget(el: Element | null): boolean {
  if (!el) return false
  if (IONIC_EDITABLE_TAGS.has(el.tagName)) return true
  // Use the IDL property — evaluates contentEditable per spec, including inherit.
  // Fallback to contentEditable property for jsdom compat (tests).
  const html = el as HTMLElement
  if (html.isContentEditable) return true
  if (html.contentEditable === 'true') return true
  return false
}

/**
 * Returns true when any ion-modal is currently presented. Ionic adds
 * `.show-modal` to `<ion-modal>` while open and sets `body.modal-open`.
 * Checking globally avoids the portal-render problem where modal content
 * is not a DOM descendant of `<ion-modal>`.
 */
function isAnyModalOpen(): boolean {
  return (
    document.body.classList.contains('modal-open') ||
    document.querySelector('ion-modal.show-modal') !== null
  )
}

@Injectable({ providedIn: 'root' })
export class KeyboardShortcutService {
  private readonly enabled: boolean

  /**
   * Stack of registered handler maps. Last-registered wins per key
   * (later entries shadow earlier ones).
   */
  private readonly stack: HandlerMap[] = []
  private listenerAttached = false

  constructor() {
    if (typeof window === 'undefined') {
      this.enabled = false
      return
    }
    this.enabled = window.matchMedia('(hover: hover) and (pointer: fine)').matches
  }

  /**
   * Register a set of key handlers. Returns an unregister function that
   * removes this exact handler set from the stack.
   *
   * Keys are matched case-insensitively against `KeyboardEvent.key`.
   * Modifier keys (Ctrl, Meta, Alt, Shift) prevent firing.
   */
  register(handlers: HandlerMap): () => void {
    if (!this.enabled) return () => {}

    // Normalize keys to lowercase for case-insensitive matching.
    const normalized: HandlerMap = {}
    for (const [key, fn] of Object.entries(handlers)) {
      if (fn) normalized[key.toLowerCase()] = fn
    }

    this.stack.push(normalized)
    this.ensureListener()

    return () => {
      const idx = this.stack.lastIndexOf(normalized)
      if (idx !== -1) this.stack.splice(idx, 1)
      this.teardownIfEmpty()
    }
  }

  private ensureListener(): void {
    if (this.listenerAttached) return
    this.listenerAttached = true
    document.addEventListener('keydown', this.handleKeydown)
  }

  private teardownIfEmpty(): void {
    if (this.stack.length === 0 && this.listenerAttached) {
      document.removeEventListener('keydown', this.handleKeydown)
      this.listenerAttached = false
    }
  }

  private readonly handleKeydown = (event: KeyboardEvent): void => {
    // Modifier keys block shortcut firing.
    if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return

    // Any open modal blocks all shortcuts.
    if (isAnyModalOpen()) return

    // Editable targets (including Ionic shadow-DOM hosts) block shortcut firing.
    const target = resolveTarget(event)
    if (isEditableTarget(target)) return

    const key = event.key.toLowerCase()

    // Walk the stack from last to first — last-registered wins.
    for (let i = this.stack.length - 1; i >= 0; i--) {
      const handler = this.stack[i]?.[key]
      if (handler) {
        handler()
        return
      }
    }
  }
}
