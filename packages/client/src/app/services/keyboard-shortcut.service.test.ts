import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { KeyboardShortcutService } from './keyboard-shortcut.service'

// ---------------------------------------------------------------------------
// matchMedia mock helpers
// ---------------------------------------------------------------------------

function mockMatchMedia(matches: boolean): void {
  vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => ({
    matches: query === '(hover: hover) and (pointer: fine)' ? matches : false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }))
}

function makeService(): KeyboardShortcutService {
  return new KeyboardShortcutService()
}

function fireKey(key: string): void {
  document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
}

// ---------------------------------------------------------------------------

describe('KeyboardShortcutService — enabled (hover: hover, pointer: fine)', () => {
  beforeEach(() => {
    mockMatchMedia(true)
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('fires the registered handler when the key is dispatched', () => {
    const service = makeService()
    const handler = vi.fn()
    const unregister = service.register({ r: handler })

    fireKey('r')
    expect(handler).toHaveBeenCalledTimes(1)

    unregister()
  })

  it('does NOT fire when a modifier key (Ctrl) is held', () => {
    const service = makeService()
    const handler = vi.fn()
    const unregister = service.register({ r: handler })

    const event = new KeyboardEvent('keydown', { key: 'r', ctrlKey: true, bubbles: true })
    document.dispatchEvent(event)
    expect(handler).not.toHaveBeenCalled()

    unregister()
  })

  it('does NOT fire when target is <input>', () => {
    const service = makeService()
    const handler = vi.fn()
    const unregister = service.register({ r: handler })

    const input = document.createElement('input')
    document.body.appendChild(input)
    // Dispatch on the element so it bubbles; event.target is the input.
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'r', bubbles: true }))
    expect(handler).not.toHaveBeenCalled()

    document.body.removeChild(input)
    unregister()
  })

  it('does NOT fire when target is <textarea>', () => {
    const service = makeService()
    const handler = vi.fn()
    const unregister = service.register({ n: handler })

    const textarea = document.createElement('textarea')
    document.body.appendChild(textarea)
    textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'n', bubbles: true }))
    expect(handler).not.toHaveBeenCalled()

    document.body.removeChild(textarea)
    unregister()
  })

  it('does NOT fire when target is <select>', () => {
    const service = makeService()
    const handler = vi.fn()
    const unregister = service.register({ n: handler })

    const select = document.createElement('select')
    document.body.appendChild(select)
    select.dispatchEvent(new KeyboardEvent('keydown', { key: 'n', bubbles: true }))
    expect(handler).not.toHaveBeenCalled()

    document.body.removeChild(select)
    unregister()
  })

  it('does NOT fire when target is <div contenteditable="true">', () => {
    const service = makeService()
    const handler = vi.fn()
    const unregister = service.register({ r: handler })

    const div = document.createElement('div')
    div.contentEditable = 'true'
    document.body.appendChild(div)
    // Dispatch on the element so it bubbles; event.target is the div.
    div.dispatchEvent(new KeyboardEvent('keydown', { key: 'r', bubbles: true }))
    expect(handler).not.toHaveBeenCalled()

    document.body.removeChild(div)
    unregister()
  })

  it('unregister removes the handler — no further calls after unregister', () => {
    const service = makeService()
    const handler = vi.fn()
    const unregister = service.register({ r: handler })

    fireKey('r')
    expect(handler).toHaveBeenCalledTimes(1)

    unregister()
    fireKey('r')
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('last-registered wins: handler B shadows handler A for same key', () => {
    const service = makeService()
    const handlerA = vi.fn()
    const handlerB = vi.fn()

    const unregisterA = service.register({ r: handlerA })
    const unregisterB = service.register({ r: handlerB })

    fireKey('r')

    expect(handlerB).toHaveBeenCalledTimes(1)
    expect(handlerA).not.toHaveBeenCalled()

    unregisterA()
    unregisterB()
  })

  it('key matching is case-insensitive (R fires r handler)', () => {
    const service = makeService()
    const handler = vi.fn()
    const unregister = service.register({ r: handler })

    fireKey('R')
    expect(handler).toHaveBeenCalledTimes(1)

    unregister()
  })

  // ---------------------------------------------------------------------------
  // Shadow-DOM / Ionic editable targets
  // ---------------------------------------------------------------------------

  it('does NOT fire when composedPath()[0] is a native <input> (shadow-DOM scenario)', () => {
    const service = makeService()
    const handler = vi.fn()
    const unregister = service.register({ r: handler })

    const innerInput = document.createElement('input')
    const ionInput = document.createElement('ion-input')
    document.body.appendChild(ionInput)

    const event = new KeyboardEvent('keydown', { key: 'r', bubbles: true })
    Object.defineProperty(event, 'composedPath', { value: () => [innerInput, ionInput, document.body] })
    document.dispatchEvent(event)
    expect(handler).not.toHaveBeenCalled()

    document.body.removeChild(ionInput)
    unregister()
  })

  it('does NOT fire when composedPath()[0] is an <ion-input> host element', () => {
    const service = makeService()
    const handler = vi.fn()
    const unregister = service.register({ r: handler })

    const ionInput = document.createElement('ion-input')
    document.body.appendChild(ionInput)

    const event = new KeyboardEvent('keydown', { key: 'r', bubbles: true })
    Object.defineProperty(event, 'composedPath', { value: () => [ionInput, document.body] })
    document.dispatchEvent(event)
    expect(handler).not.toHaveBeenCalled()

    document.body.removeChild(ionInput)
    unregister()
  })

  it('falls back to event.target when composedPath is undefined (synthetic event)', () => {
    const service = makeService()
    const handler = vi.fn()
    const unregister = service.register({ r: handler })

    const event = new KeyboardEvent('keydown', { key: 'r', bubbles: true })
    // Remove composedPath so fallback to event.target (document) is exercised.
    Object.defineProperty(event, 'composedPath', { value: undefined })
    document.dispatchEvent(event)
    // document is not an editable target — handler should fire.
    expect(handler).toHaveBeenCalledTimes(1)

    unregister()
  })

  // ---------------------------------------------------------------------------
  // Modal-open guard
  // ---------------------------------------------------------------------------

  it('does NOT fire when body has class modal-open', () => {
    const service = makeService()
    const handler = vi.fn()
    const unregister = service.register({ r: handler })

    document.body.classList.add('modal-open')
    fireKey('r')
    expect(handler).not.toHaveBeenCalled()

    document.body.classList.remove('modal-open')
    fireKey('r')
    expect(handler).toHaveBeenCalledTimes(1)

    unregister()
  })

  it('does NOT fire when an ion-modal.show-modal exists in DOM', () => {
    const service = makeService()
    const handler = vi.fn()
    const unregister = service.register({ r: handler })

    const modal = document.createElement('ion-modal')
    modal.classList.add('show-modal')
    document.body.appendChild(modal)

    fireKey('r')
    expect(handler).not.toHaveBeenCalled()

    document.body.removeChild(modal)
    fireKey('r')
    expect(handler).toHaveBeenCalledTimes(1)

    unregister()
  })

  // ---------------------------------------------------------------------------
  // Listener attach / teardown
  // ---------------------------------------------------------------------------

  it('attaches addEventListener exactly once for multiple register calls', () => {
    const addSpy = vi.spyOn(document, 'addEventListener')
    const service = makeService()
    const u1 = service.register({ r: vi.fn() })
    const u2 = service.register({ n: vi.fn() })

    // Only one listener attachment.
    expect(addSpy.mock.calls.filter(([e]) => e === 'keydown')).toHaveLength(1)

    u1()
    u2()
    addSpy.mockRestore()
  })

  it('removeEventListener called after last handler unregistered', () => {
    const removeSpy = vi.spyOn(document, 'removeEventListener')
    const service = makeService()
    const u1 = service.register({ r: vi.fn() })

    u1()

    expect(removeSpy.mock.calls.filter(([e]) => e === 'keydown')).toHaveLength(1)

    removeSpy.mockRestore()
  })

  it('calling unregister twice does not throw', () => {
    const service = makeService()
    const unregister = service.register({ r: vi.fn() })

    unregister()
    expect(() => unregister()).not.toThrow()
  })
})

describe('KeyboardShortcutService — disabled (touch-only device)', () => {
  beforeEach(() => {
    mockMatchMedia(false)
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('register returns a no-op and handler never fires', () => {
    const service = makeService()
    const handler = vi.fn()
    const unregister = service.register({ r: handler })

    fireKey('r')
    expect(handler).not.toHaveBeenCalled()

    // Unregister should also be a no-op (no throw).
    expect(() => unregister()).not.toThrow()
  })
})
