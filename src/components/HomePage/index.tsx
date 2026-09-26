import { Settings, History } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '../../stores/appStore'
import { useRoute } from '../../lib/router'

export function HomePage() {
  const config = useAppStore((s) => s.config)
  const history = useAppStore((s) => s.history)
  const { navigate } = useRoute()
  const { t } = useTranslation()

  const now = new Date()
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const todayCount = history.filter((h) => h.created_at.startsWith(today)).length

  return (
    <div className="p-7 space-y-7 max-w-[900px] mx-auto">
      <div className="pt-3 pb-2">
        <h2 className="text-[28px] font-semibold tracking-tight mb-3">{t('home.welcome')}</h2>
        <p className="text-[14px] text-text-secondary leading-relaxed max-w-[520px]">
          {t('home.description', { hotkey: config.hotkey })}
        </p>
        <kbd className="inline-flex mt-5 px-3 py-1.5 bg-bg-elevated border border-border rounded-md font-mono text-[13px] shadow-sm">
          {config.hotkey}
        </kbd>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-[18px] p-4 jelly-card">
          <p className="text-[11px] text-text-tertiary uppercase tracking-wider mb-1">
            {t('home.totalRecordings')}
          </p>
          <p className="text-[22px] font-semibold">{history.length}</p>
        </div>
        <div className="rounded-[18px] p-4 jelly-card">
          <p className="text-[11px] text-text-tertiary uppercase tracking-wider mb-1">
            {t('home.today')}
          </p>
          <p className="text-[22px] font-semibold">{todayCount}</p>
        </div>
      </div>

      {/* Current config */}
      <div className="rounded-[18px] p-5 jelly-card">
        <h3 className="text-[13px] font-medium mb-3">{t('home.currentConfig')}</h3>
        <div className="space-y-2 text-[13px]">
          <div className="flex justify-between">
            <span className="text-text-secondary">{t('home.sttProvider')}</span>
            <span className="text-text-primary font-medium">{config.stt_provider}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-secondary">{t('home.llmProvider')}</span>
            <span className="text-text-primary font-medium">{config.llm_provider}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-secondary">{t('home.aiPolish')}</span>
            <span className="text-text-primary font-medium">
              {config.polish_enabled ? t('home.enabled') : t('home.disabled')}
            </span>
          </div>
        </div>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => navigate('settings')}
          className="flex items-center gap-2.5 rounded-[14px] p-4 cursor-pointer text-left jelly-btn"
        >
          <Settings size={16} className="text-text-secondary" />
          <span className="text-[13px] font-medium">{t('nav.settings')}</span>
        </button>
        <button
          onClick={() => navigate('history')}
          className="flex items-center gap-2.5 rounded-[14px] p-4 cursor-pointer text-left jelly-btn"
        >
          <History size={16} className="text-text-secondary" />
          <span className="text-[13px] font-medium">{t('nav.history')}</span>
        </button>
      </div>
    </div>
  )
}
