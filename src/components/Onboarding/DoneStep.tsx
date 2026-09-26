import { useTranslation } from 'react-i18next'
import { Check, Keyboard, MousePointerClick, GripHorizontal, MousePointer } from 'lucide-react'
import { useAppStore } from '../../stores/appStore'

export function DoneStep() {
  const { t } = useTranslation()
  const config = useAppStore((s) => s.config)

  return (
    <div className="flex flex-col items-center gap-5 py-2">
      {/* Success animation */}
      <div className="w-16 h-16 rounded-full bg-success/10 flex items-center justify-center">
        <div>
          <Check size={28} className="text-success" />
        </div>
      </div>

      <div className="text-center">
        <h2 className="text-[17px] font-semibold text-text-primary">{t('onboarding.allSet')}</h2>
        <p className="text-[13px] text-text-secondary mt-1">{t('onboarding.readyHint')}</p>
      </div>

      {/* Usage tips */}
      <div className="w-full space-y-2">
        <Tip
          icon={Keyboard}
          title={config.hotkey}
          desc={t(
            config.hotkey_mode === 'hold' ? 'onboarding.holdShortcut' : 'onboarding.pressShortcut',
            { shortcut: config.hotkey },
          )}
        />
        <Tip
          icon={MousePointerClick}
          title={t('onboarding.clickCapsule')}
          desc={t('onboarding.startRecording')}
        />
        <Tip
          icon={GripHorizontal}
          title={t('onboarding.dragCapsule')}
          desc={t('onboarding.dragHint')}
        />
        <Tip
          icon={MousePointer}
          title={t('onboarding.menuCapsule')}
          desc={t('onboarding.menuHint')}
        />
      </div>
    </div>
  )
}

function Tip({
  icon: Icon,
  title,
  desc,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>
  title: string
  desc: string
}) {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5 bg-bg-secondary rounded-[10px]">
      <div className="p-1.5 rounded-[8px] bg-bg-tertiary text-text-tertiary shrink-0">
        <Icon size={14} />
      </div>
      <div>
        <p className="text-[13px] font-medium text-text-primary">{title}</p>
        <p className="text-[11px] text-text-tertiary">{desc}</p>
      </div>
    </div>
  )
}
