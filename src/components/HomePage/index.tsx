import { Mic, Sparkles, BookOpen, ArrowUpRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '../../stores/appStore'
import { useRoute, type Route } from '../../lib/router'
import { STT_PROVIDERS, LLM_PROVIDERS } from '../../lib/constants'

export function HomePage() {
  const config = useAppStore((s) => s.savedConfig ?? s.config)
  const { navigate } = useRoute()
  const { t } = useTranslation()
  const cards: { route: Route; title: string; detail: string; icon: typeof Mic }[] = [
    {
      route: 'settings/dictation',
      title: t('settings.dictation'),
      detail:
        STT_PROVIDERS.find((p) => p.value === config.stt_provider)?.label ?? config.stt_provider,
      icon: Mic,
    },
    {
      route: 'settings/ai',
      title: t('settings.aiPolish'),
      detail: config.polish_enabled
        ? (LLM_PROVIDERS.find((p) => p.value === config.llm_provider)?.label ?? config.llm_provider)
        : t('home.disabled'),
      icon: Sparkles,
    },
    {
      route: 'dictionary',
      title: t('settings.dictionary'),
      detail: t('home.dictionaryHint'),
      icon: BookOpen,
    },
  ]
  return (
    <div className="p-6 space-y-7 max-w-[900px] mx-auto">
      <header className="pt-2">
        <h1 className="text-[24px] font-semibold tracking-tight mb-3">{t('home.welcome')}</h1>
        <p className="text-[14px] text-text-secondary leading-relaxed max-w-[520px]">
          {t(config.hotkey_mode === 'toggle' ? 'home.toggleDescription' : 'home.description')}
        </p>
        <button
          onClick={() => navigate('settings/dictation')}
          className="mt-5 px-3 py-2 jelly-btn rounded-lg text-[13px] cursor-pointer"
          aria-label={t('settings.hotkey')}
        >
          <kbd className="font-mono">{config.hotkey}</kbd>
        </button>
      </header>
      <div className="space-y-3">
        {cards.map(({ route, title, detail, icon: Icon }) => (
          <button
            key={route}
            onClick={() => navigate(route)}
            className="w-full flex items-center gap-4 rounded-xl p-5 jelly-card text-left cursor-pointer hover:border-text-tertiary transition-colors"
          >
            <Icon size={20} className="text-accent shrink-0" />
            <span className="flex-1">
              <span className="block text-[14px] font-medium">{title}</span>
              <span className="block text-[13px] text-text-secondary mt-1">{detail}</span>
            </span>
            <ArrowUpRight size={16} className="text-text-tertiary" />
          </button>
        ))}
      </div>
      <p className="text-[12px] text-text-tertiary leading-relaxed">{t('home.setupHint')}</p>
    </div>
  )
}
