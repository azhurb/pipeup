import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { FormField } from '../FormField'
import { SegmentedControl } from '../SegmentedControl'

afterEach(cleanup)

describe('settings control accessibility', () => {
  it('names inputs rendered inside nested custom components without naming adjacent actions', () => {
    function KeyInput() {
      return (
        <div>
          <input type="password" />
          <button>Test connection</button>
        </div>
      )
    }
    render(
      <FormField label="API key">
        <KeyInput />
      </FormField>,
    )
    expect(screen.getByLabelText('API key', { selector: 'input' })).toHaveAttribute(
      'type',
      'password',
    )
    expect(screen.getByRole('button', { name: 'Test connection' })).toBeInTheDocument()
  })

  it('keeps explicit control names and provides a name for button groups', () => {
    render(
      <FormField label="Languages">
        <button aria-pressed="true">English</button>
        <input aria-label="Find language" />
      </FormField>,
    )
    expect(screen.getByRole('group', { name: 'Languages' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Find language' })).toBeInTheDocument()
  })

  it('exposes the selected segment and sends the requested value', () => {
    const change = vi.fn()
    render(
      <SegmentedControl
        options={[
          { value: 'hold', label: 'Hold' },
          { value: 'toggle', label: 'Toggle' },
        ]}
        value="hold"
        onChange={change}
      />,
    )
    expect(screen.getByRole('button', { name: 'Hold', pressed: true })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Toggle', pressed: false }))
    expect(change).toHaveBeenCalledWith('toggle')
  })
})
