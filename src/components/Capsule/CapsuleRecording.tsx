import { useTranslation } from 'react-i18next'
import { Waveform } from './Waveform'
import { CapsuleCancel } from './CapsuleCancel'

export function CapsuleRecording() {
  const { t } = useTranslation()

  return (
    <div className="capsule-activity" role="status" aria-label={t('capsule.recording')}>
      <Waveform />
      <CapsuleCancel />
    </div>
  )
}
