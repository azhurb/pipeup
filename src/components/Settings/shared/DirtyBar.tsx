import { useHotkeyCaptureBusy, isHotkeyCaptureBusy } from '../../../lib/hotkeyCapture'
import i18n from '../../../i18n'
import { useTranslation } from 'react-i18next'
import { useState } from 'react'
import { motion } from 'framer-motion'
import { Loader2 } from 'lucide-react'
import { useAppStore } from '../../../stores/appStore'
import { updateConfig } from '../../../lib/tauri'
import { refreshCredentialStatus, writeKeyDrafts } from '../../../lib/credentials'

export function useDirtyConfig() {
  const config = useAppStore((s) => s.config)
  const savedConfig = useAppStore((s) => s.savedConfig)
  const keyDrafts = useAppStore((s) => s.keyDrafts)
  // A typed key is an unsaved change even though it is not part of the config.
  // `null` means the field was never touched, so a pane showing a saved key's
  // placeholder stays clean — the placeholder is not a value.
  const hasKeyDraft = keyDrafts.stt !== null || keyDrafts.llm !== null
  return (
    savedConfig !== null && (hasKeyDraft || JSON.stringify(config) !== JSON.stringify(savedConfig))
  )
}

type SaveResult = 'idle' | 'success' | 'error'

export function DirtyBar() {
  const { t } = useTranslation()
  const capturingShortcut = useHotkeyCaptureBusy()
  const config = useAppStore((s) => s.config)
  const resetConfig = useAppStore((s) => s.resetConfig)
  const setSavedConfig = useAppStore((s) => s.setSavedConfig)
  const clearKeyDrafts = useAppStore((s) => s.clearKeyDrafts)
  const [saving, setSaving] = useState(false)
  const [saveResult, setSaveResult] = useState<SaveResult>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  const handleSave = async () => {
    if (saving || isHotkeyCaptureBusy()) return
    setSaving(true)
    setSaveResult('idle')
    setErrorMsg('')
    try {
      // Keys go to the vault first. If the credential store rejects one, the
      // error surfaces here with the draft still in the field, rather than
      // after a "saved" confirmation that quietly dropped the key.
      await writeKeyDrafts()
      await updateConfig(config)
      setSavedConfig(config)
      if (config.ui_language && config.ui_language !== i18n.language) {
        await i18n.changeLanguage(config.ui_language)
        localStorage.setItem('ui_language', config.ui_language)
      }
      clearKeyDrafts()
      await refreshCredentialStatus()
      setSaveResult('success')
      setTimeout(() => {
        setSaveResult('idle')
      }, 1500)
    } catch (e) {
      const msg = e instanceof Error ? e.message : t('common.saveFailed')
      setErrorMsg(msg)
      setSaveResult('error')
    } finally {
      setSaving(false)
    }
  }

  const handleReset = () => {
    if (isHotkeyCaptureBusy()) return
    setSaveResult('idle')
    setErrorMsg('')
    resetConfig()
    clearKeyDrafts()
  }

  const bgClass =
    saveResult === 'success'
      ? 'bg-success/10 border-t border-success/20'
      : saveResult === 'error'
        ? 'bg-error/10 border-t border-error/20'
        : 'bg-warning/10 border-t border-warning/20'

  const labelText =
    saveResult === 'success'
      ? t('common.settingsSaved')
      : saveResult === 'error'
        ? errorMsg || t('common.saveFailed')
        : t('common.unsavedChanges')

  const labelColor =
    saveResult === 'success'
      ? 'text-success'
      : saveResult === 'error'
        ? 'text-error'
        : 'text-warning'

  return (
    <motion.div
      className={`flex items-center justify-between px-5 py-3 ${bgClass}`}
      initial={{ y: 20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 20, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
    >
      <span className={`${labelColor} text-[13px] truncate mr-3`}>{labelText}</span>
      {saveResult !== 'success' && (
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={handleReset}
            disabled={saving || capturingShortcut}
            className="px-3 py-1.5 text-[12px] text-text-secondary hover:text-text-primary bg-transparent border-none cursor-pointer rounded-[10px] hover:bg-bg-tertiary transition-colors disabled:opacity-50"
          >
            {t('common.discardChanges')}
          </button>
          <button
            onClick={handleSave}
            disabled={saving || capturingShortcut}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] text-white bg-accent rounded-[10px] border-none cursor-pointer hover:opacity-90 transition-opacity disabled:opacity-70"
          >
            {saving && (
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 0.8, ease: 'linear' }}
              >
                <Loader2 size={12} />
              </motion.div>
            )}
            {saving ? t('common.saving') : t('common.save')}
          </button>
        </div>
      )}
    </motion.div>
  )
}
