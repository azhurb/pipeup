import { Home, Settings, History } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useRoute, type Route } from '../../lib/router'
import { BrandIcon } from '../BrandIcon'
import { AccessibilityBanner } from './AccessibilityBanner'
import { MicDeniedBanner } from './MicDeniedBanner'

const navItems: { id: Route; labelKey: string; icon: typeof Home }[] = [
  { id: 'home', labelKey: 'nav.home', icon: Home },
  { id: 'settings', labelKey: 'nav.settings', icon: Settings },
  { id: 'history', labelKey: 'nav.history', icon: History },
]

interface Props {
  children: React.ReactNode
}

export function MainLayout({ children }: Props) {
  const { route, navigate } = useRoute()
  const { t } = useTranslation()

  return (
    <div className="w-full h-full flex bg-bg-primary text-text-primary">
      {/* Primary navigation */}
      <aside className="w-[176px] flex flex-col border-r border-border jelly-surface-flat shrink-0">
        <div className="flex items-center gap-2.5 px-4 pt-6 pb-7" data-tauri-drag-region>
          <BrandIcon size={34} />
          <h1 className="text-[17px] font-semibold tracking-tight">{t('app.name')}</h1>
        </div>

        {/* Main Nav */}
        <nav className="flex-1 px-3 space-y-0.5 relative" aria-label="Main navigation">
          {navItems.map(({ id, labelKey, icon: Icon }) => {
            const active = route === id
            const label = t(labelKey)
            return (
              <button
                key={id}
                onClick={() => navigate(id)}
                aria-label={label}
                aria-current={active ? 'page' : undefined}
                className={`flex items-center gap-2.5 w-full px-3 py-2 text-[13px] rounded-[8px] transition-colors bg-transparent border-none cursor-pointer text-left relative ${
                  active
                    ? 'jelly-nav-active text-accent font-medium'
                    : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                <span className="relative z-10 flex items-center gap-2.5">
                  <Icon size={16} />
                  {label}
                </span>
              </button>
            )
          })}
        </nav>
      </aside>

      {/* Content */}
      <main className="flex-1 min-w-0 flex flex-col">
        <MicDeniedBanner />
        <AccessibilityBanner />
        <div className="flex-1 overflow-y-auto">{children}</div>
      </main>
    </div>
  )
}
