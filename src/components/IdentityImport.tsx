import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  importLegacyIdentity,
  restartAfterIdentityChoice,
  startFreshIdentity,
  type IdentityImportReport,
} from '../lib/tauri'

export function IdentityImport() {
  const { t } = useTranslation()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [report, setReport] = useState<IdentityImportReport | null>(null)

  const run = async (choice: 'import' | 'fresh') => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      if (choice === 'import') {
        setReport(await importLegacyIdentity())
      } else {
        await startFreshIdentity()
        await restartAfterIdentityChoice()
      }
    } catch (cause) {
      setError(String(cause))
    } finally {
      setBusy(false)
    }
  }

  const restart = async () => {
    setBusy(true)
    setError(null)
    try {
      await restartAfterIdentityChoice()
    } catch (cause) {
      setError(String(cause))
      setBusy(false)
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-bg-primary p-6">
      <div className="w-full max-w-[540px] rounded-[16px] border border-border bg-bg-secondary p-8 shadow-lg">
        <h1 className="text-[24px] font-semibold text-text-primary">{t('identityImport.title')}</h1>
        <p className="mt-3 text-[14px] leading-6 text-text-secondary">
          {t('identityImport.description')}
        </p>
        <p className="mt-3 text-[13px] leading-5 text-text-secondary">
          {t('identityImport.quitOldApp')}
        </p>
        {report ? (
          <div className="mt-6 space-y-3">
            <p role="status" className="text-[14px] text-text-primary">
              {t('identityImport.imported')}
            </p>
            {report.credentialsToReenter.length > 0 && (
              <p role="alert" className="text-[13px] text-text-secondary">
                {t('identityImport.keysToReenter', {
                  providers: report.credentialsToReenter.join(', '),
                })}
              </p>
            )}
            {report.legacyCredentialStoreUnavailable && (
              <p role="alert" className="text-[13px] text-text-secondary">
                {t('identityImport.checkKeys')}
              </p>
            )}
            <button
              type="button"
              disabled={busy}
              onClick={() => void restart()}
              className="rounded-[10px] bg-accent px-5 py-2.5 text-[13px] font-medium text-white disabled:opacity-50"
            >
              {t('identityImport.restart')}
            </button>
          </div>
        ) : (
          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              disabled={busy}
              onClick={() => void run('import')}
              className="rounded-[10px] bg-accent px-5 py-2.5 text-[13px] font-medium text-white disabled:opacity-50"
            >
              {t('identityImport.import')}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void run('fresh')}
              className="rounded-[10px] border border-border px-5 py-2.5 text-[13px] font-medium text-text-primary disabled:opacity-50"
            >
              {t('identityImport.startFresh')}
            </button>
          </div>
        )}
        {error && (
          <p role="alert" className="mt-4 text-[13px] text-error">
            {error}
          </p>
        )}
      </div>
    </main>
  )
}
