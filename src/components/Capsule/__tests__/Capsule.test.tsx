/**
 * Capsule shell behavior for selected-text editing:
 *   - the amber mode ring is on the pill for the whole run when this dictation
 *     will replace a selection, and absent otherwise
 *   - the ring never survives into idle, because the pill in idle is the plain
 *     mic and an amber ring there would be a permanent false alarm
 *   - the edited tip renders, and ranks below the clipboard tip
 *
 * The ring is a CSS class rather than a component, so the class name is the only
 * observable. It has to be a class on the *same* element as jelly-capsule-active:
 * the ring is an inset box-shadow that replaces that class's shadow stack, and a
 * separate wrapper element would either be clipped by `overflow: hidden` or
 * change the pill's size.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup, fireEvent, screen, act } from '@testing-library/react'
import React from 'react'
import { useAppStore, type PipelineState } from '../../../stores/appStore'

afterEach(() => {
  cleanup()
})

const MOTION_PROPS = new Set(['initial', 'animate', 'exit', 'transition', 'whileHover', 'whileTap'])
vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useReducedMotion: () => false,
  motion: new Proxy(
    {},
    {
      get:
        (_t, tag: string) =>
        ({ children, ...rest }: Record<string, unknown> & { children?: React.ReactNode }) => {
          const domProps: Record<string, unknown> = {}
          for (const [k, v] of Object.entries(rest)) {
            if (!MOTION_PROPS.has(k)) domProps[k] = v
          }
          return React.createElement(tag as string, domProps, children)
        },
    },
  ),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en', changeLanguage: vi.fn() },
  }),
}))

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn().mockResolvedValue(undefined) }))

// The resize hook drives the real capsule NSWindow; it has its own test and
// nothing here depends on the size it returns.
vi.mock('../../../hooks/useCapsuleResize', () => ({
  useCapsuleResize: () => ({ width: 220, height: 36 }),
}))

import { Capsule } from '../index'

/** The pill itself — the element carrying the jelly-capsule-* classes. */
function pill(container: HTMLElement): HTMLElement {
  const el = container.querySelector('.rounded-full.pointer-events-auto')
  if (!el) throw new Error('capsule pill not found')
  return el as HTMLElement
}

function setUp(state: PipelineState, editingSelection: boolean) {
  useAppStore.setState({ ...useAppStore.getInitialState(), pipelineState: state, editingSelection })
}

describe('Capsule — selected-text mode ring', () => {
  beforeEach(() => {
    useAppStore.setState(useAppStore.getInitialState())
  })

  it.each<PipelineState>(['recording', 'transcribing', 'polishing', 'outputting'])(
    'shows the ring during %s when a selection is being edited',
    (state) => {
      setUp(state, true)
      const { container } = render(<Capsule />)
      expect(pill(container).className).toContain('jelly-capsule-editing')
      // Must compose with the active pill, not replace it.
      expect(pill(container).className).toContain('jelly-capsule-active')
    },
  )

  it.each<PipelineState>(['recording', 'transcribing', 'polishing', 'outputting'])(
    'omits the ring during %s for an ordinary dictation',
    (state) => {
      setUp(state, false)
      const { container } = render(<Capsule />)
      expect(pill(container).className).not.toContain('jelly-capsule-editing')
    },
  )

  it('never rings the idle pill, even if the flag is somehow still set', () => {
    // Rust clears the flag at the start of every run and useTauriEvents clears it
    // on idle, but the ring must not depend on either having fired: an amber ring
    // on the resting mic would read as a permanent warning.
    setUp('idle', true)
    const { container } = render(<Capsule />)
    expect(pill(container).className).not.toContain('jelly-capsule-editing')
  })

  it('does not ring the error pill', () => {
    useAppStore.setState({
      ...useAppStore.getInitialState(),
      pipelineState: 'idle',
      editingSelection: true,
      pipelineError: 'Polish failed',
    })
    const { container } = render(<Capsule />)
    expect(pill(container).className).toContain('jelly-capsule-error')
    expect(pill(container).className).not.toContain('jelly-capsule-editing')
  })
})

describe('Capsule — edited tip', () => {
  beforeEach(() => {
    useAppStore.setState(useAppStore.getInitialState())
  })

  it('renders the edited tip when the flag is set', () => {
    useAppStore.setState({ ...useAppStore.getInitialState(), editedTip: true })
    const { container } = render(<Capsule />)
    expect(container.textContent).toContain('capsule.editedTip')
  })

  it('yields to the clipboard tip', () => {
    // A paste that never landed needs the user to act; a successful edit only
    // needs acknowledging. Rust also guards the pairing, so this is belt and
    // braces for the case where both flags are somehow set.
    useAppStore.setState({
      ...useAppStore.getInitialState(),
      editedTip: true,
      clipboardTip: true,
    })
    const { container } = render(<Capsule />)
    expect(container.textContent).toContain('capsule.clipboardTip')
    expect(container.textContent).not.toContain('capsule.editedTip')
  })

  it('yields to a permission error', () => {
    useAppStore.setState({
      ...useAppStore.getInitialState(),
      editedTip: true,
      pipelineError: 'ACCESSIBILITY_REQUIRED',
    })
    const { container } = render(<Capsule />)
    expect(container.textContent).not.toContain('capsule.editedTip')
  })
})

describe('Capsule compact interactions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useAppStore.setState(useAppStore.getInitialState())
  })

  afterEach(() => vi.useRealTimers())

  it('still stops at the configured limit without showing a timer', async () => {
    vi.useFakeTimers()
    const { invoke } = await import('@tauri-apps/api/core')
    setUp('recording', false)
    useAppStore.getState().updateConfig({ max_recording_seconds: 2 })
    const { container } = render(<Capsule />)
    expect(container.textContent).toBe('')
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000)
    })
    expect(invoke).toHaveBeenCalledWith('stop_recording')
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000)
    })
    expect(
      vi.mocked(invoke).mock.calls.filter(([command]) => command === 'stop_recording'),
    ).toHaveLength(1)
  })

  it('clears the old deadline when recording ends and starts a fresh one for the next dictation', async () => {
    vi.useFakeTimers()
    const { invoke } = await import('@tauri-apps/api/core')
    setUp('recording', false)
    useAppStore.getState().updateConfig({ max_recording_seconds: 2 })
    render(<Capsule />)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
    })
    act(() => useAppStore.getState().setPipelineState('transcribing'))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000)
    })
    expect(invoke).not.toHaveBeenCalledWith('stop_recording')
    act(() => useAppStore.getState().setPipelineState('recording'))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1999)
    })
    expect(invoke).not.toHaveBeenCalledWith('stop_recording')
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
    })
    expect(invoke).toHaveBeenCalledWith('stop_recording')
  })

  it('cancels without letting pointer-up submit the recording', async () => {
    const { invoke } = await import('@tauri-apps/api/core')
    setUp('recording', false)
    render(<Capsule />)
    const cancel = screen.getByRole('button', { name: 'capsule.cancel' })
    fireEvent.pointerDown(cancel, { button: 0 })
    fireEvent.pointerUp(cancel, { button: 0 })
    fireEvent.click(cancel)
    expect(invoke).toHaveBeenCalledWith('abort_recording')
    expect(invoke).not.toHaveBeenCalledWith('stop_recording')
  })

  it.each<PipelineState>(['transcribing', 'polishing'])(
    'keeps %s text-free even with a partial transcript',
    (state) => {
      setUp(state, false)
      useAppStore.setState({ partialTranscript: 'Private unfinished words' })
      const { container } = render(<Capsule />)
      expect(container.textContent).toBe('')
      expect(screen.getByRole('status')).toHaveAttribute('aria-label', 'capsule.processing')
      expect(screen.getByRole('button', { name: 'capsule.cancel' })).toBeEnabled()
    },
  )
})
