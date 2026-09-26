import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Onboarding } from '../index'
import { useAppStore } from '../../../stores/appStore'
import { updateConfig, saveOnboardingCompleted } from '../../../lib/tauri'

vi.mock('../../../lib/tauri', () => ({ updateConfig: vi.fn(), saveOnboardingCompleted: vi.fn() }))
vi.mock('../../../lib/credentials', () => ({
  writeKeyDrafts: vi.fn().mockResolvedValue(undefined),
  refreshCredentialStatus: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
vi.mock('../../Settings/SttPane', () => ({ SttPane: () => null }))
vi.mock('../../Settings/LlmPane', () => ({ LlmPane: () => null }))
vi.mock('../WelcomeStep', () => ({ WelcomeStep: () => null }))
vi.mock('../PermissionsStep', () => ({ PermissionsStep: () => null }))
vi.mock('../QuickTestStep', () => ({ QuickTestStep: () => null }))
vi.mock('../DoneStep', () => ({ DoneStep: () => null }))

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(updateConfig).mockResolvedValue(undefined)
  useAppStore.setState({ onboardingStep: 2, onboardingCompleted: false, llmTestStatus: 'idle' })
  useAppStore.getState().updateConfig({ polish_enabled: false })
})
afterEach(cleanup)

describe('onboarding persistence and optional AI', () => {
  it('continues without a tested AI provider when processing is off', async () => {
    render(<Onboarding />)
    fireEvent.click(screen.getByText('onboarding.next'))
    await waitFor(() => expect(useAppStore.getState().onboardingStep).toBe(3))
    expect(updateConfig).toHaveBeenCalledWith(expect.objectContaining({ polish_enabled: false }))
  })

  it('requires a tested connection when AI is enabled', () => {
    useAppStore.getState().updateConfig({ polish_enabled: true })
    render(<Onboarding />)
    expect(screen.getByText('onboarding.next')).toBeDisabled()
  })

  it('stays on the current step and reports persistence failures', async () => {
    vi.mocked(updateConfig).mockRejectedValue(new Error('Disk full'))
    render(<Onboarding />)
    fireEvent.click(screen.getByText('onboarding.next'))
    expect(await screen.findByRole('alert')).toHaveTextContent('Disk full')
    expect(useAppStore.getState().onboardingStep).toBe(2)
    expect(screen.getByText('onboarding.next')).toBeEnabled()
  })

  it('does not mark setup complete when saving during skip fails', async () => {
    vi.mocked(updateConfig).mockRejectedValue(new Error('Disk full'))
    render(<Onboarding />)
    fireEvent.click(screen.getByText('onboarding.skipSetup'))
    await screen.findByRole('alert')
    expect(saveOnboardingCompleted).not.toHaveBeenCalled()
    expect(useAppStore.getState().onboardingCompleted).toBe(false)
  })
  it('reports completion-marker failures without leaving setup', async () => {
    vi.mocked(saveOnboardingCompleted).mockRejectedValue(new Error('Store unavailable'))
    render(<Onboarding />)
    fireEvent.click(screen.getByText('onboarding.skipSetup'))
    expect(await screen.findByRole('alert')).toHaveTextContent('Store unavailable')
    expect(useAppStore.getState().onboardingCompleted).toBe(false)
  })
})
