import { useTranslation } from 'react-i18next'
import { useAppStore } from '../../stores/appStore'
import { Waveform } from './Waveform'
import { CapsuleCancel } from './CapsuleCancel'
import { interimTail } from '../../lib/interimTail'

export function CapsuleRecording() {
  const { t } = useTranslation()
  const partialTranscript = useAppStore((s) => s.partialTranscript)
  const interim = interimTail(partialTranscript)

  return (
    <div
      className={`capsule-activity${interim ? ' capsule-activity-interim' : ''}`}
      role="status"
      aria-label={t('capsule.recording')}
    >
      <Waveform />
      {/* Hidden from assistive technology: a status region that rewrites
          itself several times a second would drown out everything else. */}
      {interim && (
        <span className="capsule-interim" aria-hidden="true" data-testid="capsule-interim">
          {interim}
        </span>
      )}
      <CapsuleCancel />
    </div>
  )
}
