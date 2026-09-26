import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BrandIcon } from '../BrandIcon'
import { ExternalLink } from 'lucide-react'
import { openUrl } from '@tauri-apps/plugin-opener'
import { getVersion } from '@tauri-apps/api/app'
import { APP_NAME, APP_REPO_URL } from '../../lib/constants'

export function AboutPane() {
  const { t } = useTranslation()
  // Read the version from the bundle rather than a checked-in constant. The
  // release workflow rewrites tauri.conf.json from the tag, so this is the only
  // value that tracks the actual release; a constant in the repo stays at
  // 0.1.0 because the workflow deliberately never commits version bumps.
  const [version, setVersion] = useState('')
  useEffect(() => {
    getVersion()
      // No IPC outside the Tauri shell (e.g. vitest, a browser preview). Show
      // nothing rather than a hardcoded number that would be wrong again.
      .then((v) => setVersion(`v${v}`))
      .catch(() => setVersion(''))
  }, [])

  return (
    <div className="space-y-5 text-[13px]">
      {/* Header */}
      <div className="text-center py-6 flex flex-col items-center gap-2">
        <BrandIcon size={64} />
        <h2 className="text-[22px] font-semibold text-text-primary">{APP_NAME}</h2>
        <p className="text-text-secondary mt-1 text-[13px]">{version}</p>
      </div>

      <p className="text-text-secondary leading-relaxed">{t('settings.aboutDescription')}</p>

      {/* Open Source */}
      <SectionCard title={t('settings.openSource')}>
        <InfoRow label={t('settings.license')} value={t('settings.mit')} />
        <LinkRow label={t('settings.github')} url={APP_REPO_URL} linkText={t('settings.view')} />
        <LinkRow
          label={t('settings.originalProject')}
          url="https://github.com/tover0314-w/opentypeless"
          linkText="OpenTypeless"
        />
      </SectionCard>
    </div>
  )
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border border-border rounded-[10px] overflow-hidden">
      <div className="px-3 py-2.5 bg-bg-secondary/50 border-b border-border">
        <h3 className="text-[13px] font-medium text-text-primary">{title}</h3>
      </div>
      {children}
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between px-3 py-2.5 border-b border-border last:border-b-0">
      <span className="text-text-secondary">{label}</span>
      <span className="text-text-primary">{value}</span>
    </div>
  )
}

function LinkRow({ label, url, linkText }: { label: string; url: string; linkText: string }) {
  return (
    <button
      onClick={() => openUrl(url)}
      className="flex justify-between items-center w-full px-3 py-2.5 border-b border-border last:border-b-0 bg-transparent border-x-0 border-t-0 cursor-pointer text-[13px]"
    >
      <span className="text-text-secondary">{label}</span>
      <span className="text-accent flex items-center gap-1">
        {linkText} <ExternalLink size={12} />
      </span>
    </button>
  )
}
