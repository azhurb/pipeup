import { X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { abortRecording } from '../../lib/tauri'

/** Kept focusable, but revealed only when the user interacts with the capsule. */
export function CapsuleCancel() {
  const { t } = useTranslation()

  return (
    <button
      type="button"
      className="capsule-cancel"
      aria-label={t('capsule.cancel')}
      onPointerDown={(event) => event.stopPropagation()}
      onPointerUp={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation()
        abortRecording().catch((error) => console.error('Failed to cancel dictation:', error))
      }}
    >
      <X size={12} aria-hidden="true" />
    </button>
  )
}
