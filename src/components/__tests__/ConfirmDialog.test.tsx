import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { ConfirmDialog } from '../ConfirmDialog'

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
afterEach(cleanup)

describe('confirmation dialog keyboard access', () => {
  it('names the dialog, traps focus in both directions, and restores the opener', () => {
    const onCancel = vi.fn()
    const props = { message: 'Delete all history?', onCancel, onConfirm: vi.fn() }
    const { rerender } = render(
      <>
        <button>Open</button>
        <ConfirmDialog {...props} open={false} />
      </>,
    )
    const opener = screen.getByRole('button', { name: 'Open' })
    opener.focus()
    rerender(
      <>
        <button>Open</button>
        <ConfirmDialog {...props} open />
      </>,
    )
    expect(screen.getByRole('dialog', { name: 'Delete all history?' })).toBeInTheDocument()
    const cancel = screen.getByRole('button', { name: 'common.cancel' })
    const confirm = screen.getByRole('button', { name: 'common.confirm' })
    expect(cancel).toHaveFocus()
    fireEvent.keyDown(cancel, { key: 'Tab', shiftKey: true })
    expect(confirm).toHaveFocus()
    fireEvent.keyDown(confirm, { key: 'Tab' })
    expect(cancel).toHaveFocus()
    opener.focus()
    expect(cancel).toHaveFocus()
    fireEvent.keyDown(cancel, { key: 'Escape' })
    expect(onCancel).toHaveBeenCalledOnce()
    rerender(
      <>
        <button>Open</button>
        <ConfirmDialog {...props} open={false} />
      </>,
    )
    expect(opener).toHaveFocus()
  })

  it('does not reset focus when its parent rerenders with a new cancel callback', () => {
    const { rerender } = render(
      <ConfirmDialog open message="Delete?" onCancel={() => {}} onConfirm={() => {}} />,
    )
    screen.getByRole('button', { name: 'common.confirm' }).focus()
    rerender(<ConfirmDialog open message="Delete?" onCancel={() => {}} onConfirm={() => {}} />)
    expect(screen.getByRole('button', { name: 'common.confirm' })).toHaveFocus()
  })
})
