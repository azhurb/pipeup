import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AnimatePresence, motion } from 'framer-motion'
import { useAppStore } from '../../stores/appStore'
import { saveOnboardingCompleted, updateConfig as saveConfig } from '../../lib/tauri'
import { refreshCredentialStatus, writeKeyDrafts } from '../../lib/credentials'
import { OnboardingLayout } from './OnboardingLayout'
import { WelcomeStep } from './WelcomeStep'
import { SttPane } from '../Settings/SttPane'
import { LlmPane } from '../Settings/LlmPane'
import { PermissionsStep } from './PermissionsStep'
import { QuickTestStep } from './QuickTestStep'
import { DoneStep } from './DoneStep'
import { slideRight } from '../../lib/animations'

const isMac =
  typeof navigator !== 'undefined' && navigator.platform.toUpperCase().indexOf('MAC') >= 0

// Permissions step exists only on macOS — Linux/Windows don't need the grants.
const TOTAL_STEPS = isMac ? 6 : 5

// Index map: on macOS we add Permissions between LLM and QuickTest.
// macOS:    0 Welcome | 1 STT | 2 LLM | 3 Permissions | 4 QuickTest | 5 Done
// non-mac:  0 Welcome | 1 STT | 2 LLM | 3 QuickTest   | 4 Done
const STEP_PERMISSIONS = isMac ? 3 : -1
const STEP_QUICK_TEST = isMac ? 4 : 3
const STEP_DONE = isMac ? 5 : 4

export function Onboarding() {
  const { t } = useTranslation()
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const config = useAppStore((s) => s.config)
  const step = useAppStore((s) => s.onboardingStep)
  const setStep = useAppStore((s) => s.setOnboardingStep)
  const setOnboardingCompleted = useAppStore((s) => s.setOnboardingCompleted)
  const sttTestStatus = useAppStore((s) => s.sttTestStatus)
  const llmTestStatus = useAppStore((s) => s.llmTestStatus)

  const canNext = (() => {
    if (step === 0) return true // Welcome
    if (step === 1) return sttTestStatus === 'success'
    if (step === 2) return !config.polish_enabled || llmTestStatus === 'success'
    if (step === STEP_PERMISSIONS) return true // optional grants
    if (step === STEP_QUICK_TEST) return true
    if (step === STEP_DONE) return true
    return false
  })()

  const titles: Record<number, { title: string; subtitle?: string }> = {
    0: { title: t('onboarding.welcomeTitle'), subtitle: t('onboarding.welcomeSubtitle') },
    1: { title: t('onboarding.speechTitle'), subtitle: t('onboarding.speechSubtitle') },
    2: { title: t('onboarding.aiTitle'), subtitle: t('onboarding.aiSubtitle') },
    [STEP_QUICK_TEST]: { title: t('onboarding.demoTitle'), subtitle: t('onboarding.demoSubtitle') },
    [STEP_DONE]: { title: t('onboarding.doneTitle') },
  }
  if (STEP_PERMISSIONS >= 0) {
    titles[STEP_PERMISSIONS] = {
      title: t('permissions.title'),
      subtitle: t('permissions.description'),
    }
  }

  const clearKeyDrafts = useAppStore((s) => s.clearKeyDrafts)

  /**
   * Persist the config plus any key typed on this step.
   *
   * The keys are not part of the config any more, so onboarding has to flush
   * them separately — otherwise stepping past the STT pane would drop the key
   * the user just tested. Drafts clear only after the vault accepted them, so a
   * failure leaves the field populated for a retry.
   */
  const persistStep = async () => {
    await writeKeyDrafts()
    await saveConfig(config)
    clearKeyDrafts()
    await refreshCredentialStatus()
  }

  const navigate = async (destination: number | 'complete') => {
    if (saving) return
    setSaving(true)
    setSaveError(null)
    try {
      await persistStep()
      if (destination === 'complete') {
        await saveOnboardingCompleted()
        setOnboardingCompleted(true)
      } else {
        setStep(destination)
      }
    } catch (error) {
      setSaveError(`${t('onboarding.saveFailed')} ${String(error)}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <OnboardingLayout
      step={step}
      totalSteps={TOTAL_STEPS}
      title={titles[step].title}
      subtitle={titles[step].subtitle}
      canNext={canNext && !saving}
      canBack={step > 0 && !saving}
      nextLabel={
        saving
          ? t('common.saving')
          : step === TOTAL_STEPS - 1
            ? t('onboarding.getStarted')
            : t('onboarding.next')
      }
      onNext={() => void navigate(step === TOTAL_STEPS - 1 ? 'complete' : step + 1)}
      onBack={() => void navigate(step - 1)}
      onSkip={saving ? undefined : () => void navigate('complete')}
    >
      {saveError && (
        <p role="alert" className="text-[13px] text-error mb-4">
          {saveError}
        </p>
      )}
      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          variants={slideRight}
          initial="initial"
          animate="animate"
          exit="exit"
          transition={{ duration: 0.2 }}
        >
          {step === 0 && <WelcomeStep />}
          {step === 1 && <SttPane />}
          {step === 2 && <LlmPane />}
          {step === STEP_PERMISSIONS && <PermissionsStep />}
          {step === STEP_QUICK_TEST && <QuickTestStep />}
          {step === STEP_DONE && <DoneStep />}
        </motion.div>
      </AnimatePresence>
    </OnboardingLayout>
  )
}
