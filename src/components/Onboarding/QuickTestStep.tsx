import { useState, useEffect } from 'react'
import { useReducedMotion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { Check } from 'lucide-react'
import { useAppStore } from '../../stores/appStore'
import { CapsuleLogo } from '../Capsule/CapsuleLogo'

// A visual demonstration only. Never opens the microphone or sends an API request.
export function QuickTestStep() {
  const { t } = useTranslation()
  const config = useAppStore((s) => s.config)
  const reducedMotion = useReducedMotion()
  const [phase, setPhase] = useState(0)
  useEffect(() => {
    if (reducedMotion) return
    const timer = setInterval(() => setPhase((value) => (value + 1) % 4), 2200)
    return () => clearInterval(timer)
  }, [reducedMotion])
  const current = reducedMotion ? 3 : phase
  return (
    <div className="space-y-6 text-center">
      <p className="text-[13px] text-text-secondary">
        {t(config.hotkey_mode === 'hold' ? 'onboarding.holdShortcut' : 'onboarding.pressShortcut', {
          shortcut: config.hotkey,
        })}
      </p>
      <div className="h-16 flex items-center justify-center" aria-hidden="true">
        <div
          className={`flex items-center justify-center rounded-full ${current === 0 ? 'jelly-capsule w-9 h-9' : 'jelly-capsule-active text-white w-[88px] h-8'}`}
        >
          {current === 0 && <CapsuleLogo size={18} />}
          {current === 1 && (
            <div className="flex items-center gap-[3px]">
              {[6, 12, 18, 10, 16, 8, 5].map((height, index) => (
                <span key={index} className="w-[3px] bg-current rounded-full" style={{ height }} />
              ))}
            </div>
          )}
          {current === 2 && (
            <div className="flex gap-1.5">
              {[0, 1, 2].map((index) => (
                <span key={index} className="w-1 h-1 rounded-full bg-current" />
              ))}
            </div>
          )}
          {current === 3 && <Check size={16} />}
        </div>
      </div>
      <p className="text-[13px] text-text-secondary">{t(`onboarding.demoPhase${current}`)}</p>
      <div className="bg-bg-secondary border border-border rounded-xl p-4 text-left">
        <p className="text-[11px] text-text-tertiary mb-2">{t('onboarding.exampleResult')}</p>
        <p className="text-[14px] text-text-primary">
          {t(config.polish_enabled ? 'onboarding.demoPolished' : 'onboarding.demoRaw')}
        </p>
      </div>
      <p className="text-[12px] text-text-tertiary">{t('onboarding.demoNotice')}</p>
    </div>
  )
}
