import { useTranslation } from 'react-i18next'
import { SettingsSidebar, type PaneId } from './SettingsSidebar'
import { GeneralPane } from './GeneralPane'
import { SttPane } from './SttPane'
import { LlmPane } from './LlmPane'
import { AboutPane } from './AboutPane'
import { DirtyBar, useDirtyConfig } from './shared/DirtyBar'
import { useRoute } from '../../lib/router'

const paneTitleKeys: Record<PaneId, string> = {
  general: 'settings.general',
  dictation: 'settings.dictation',
  ai: 'settings.aiPolish',
  privacy: 'settings.privacy',
  about: 'settings.about',
}

export function Settings() {
  const { route, navigate } = useRoute()
  const activePane = (route.startsWith('settings/') ? route.split('/')[1] : 'general') as PaneId
  const isDirty = useDirtyConfig()
  const { t } = useTranslation()
  return (
    <div className="w-full h-full bg-bg-primary text-text-primary flex flex-col">
      <div className="px-6 pt-6 pb-4">
        <h1 className="text-[24px] font-semibold tracking-tight">{t('settings.title')}</h1>
      </div>
      <SettingsSidebar activePane={activePane} onSelect={(pane) => navigate(`settings/${pane}`)} />
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="w-full max-w-[720px] space-y-6" key={activePane}>
          <h2 className="text-[17px] font-semibold">{t(paneTitleKeys[activePane])}</h2>
          {activePane === 'general' && <GeneralPane section="general" />}
          {activePane === 'dictation' && (
            <>
              <GeneralPane section="dictation" />
              <SttPane />
            </>
          )}
          {activePane === 'ai' && <LlmPane />}
          {activePane === 'privacy' && <GeneralPane section="privacy" />}
          {activePane === 'about' && <AboutPane />}
        </div>
      </div>
      {isDirty && <DirtyBar />}
    </div>
  )
}
