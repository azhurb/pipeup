import { Settings, Mic, Sparkles, Shield, Info } from 'lucide-react'
import { useTranslation } from 'react-i18next'

const PANES = [
  { id: 'general', labelKey: 'settings.general', icon: Settings },
  { id: 'dictation', labelKey: 'settings.dictation', icon: Mic },
  { id: 'ai', labelKey: 'settings.aiPolish', icon: Sparkles },
  { id: 'privacy', labelKey: 'settings.privacy', icon: Shield },
  { id: 'about', labelKey: 'settings.about', icon: Info },
] as const

export type PaneId = (typeof PANES)[number]['id']

interface Props {
  activePane: PaneId
  onSelect: (id: PaneId) => void
}

export function SettingsSidebar({ activePane, onSelect }: Props) {
  const { t } = useTranslation()

  return (
    <nav
      className="flex flex-wrap gap-1 px-6 pb-4 border-b border-border"
      aria-label={t('settings.title')}
    >
      {PANES.map((pane) => {
        const Icon = pane.icon
        const isActive = activePane === pane.id
        return (
          <button
            key={pane.id}
            onClick={() => onSelect(pane.id)}
            aria-current={isActive ? 'page' : undefined}
            className={`flex items-center gap-2.5 px-3 py-2 rounded-[8px] text-[13px] border-none cursor-pointer transition-colors text-left relative ${
              isActive
                ? 'jelly-nav-active text-accent font-medium'
                : 'bg-transparent text-text-secondary hover:text-text-primary'
            }`}
          >
            <span className="relative z-10 flex items-center gap-2.5">
              <Icon size={16} />
              {t(pane.labelKey)}
            </span>
          </button>
        )
      })}
    </nav>
  )
}
