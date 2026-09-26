import { motion, useReducedMotion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { CapsuleCancel } from './CapsuleCancel'

export function CapsuleProcessing() {
  const reduced = useReducedMotion()
  const { t } = useTranslation()

  return (
    <div className="capsule-activity" role="status" aria-label={t('capsule.processing')}>
      <div className="flex items-center gap-1.5" aria-hidden="true">
        {[0, 1, 2].map((index) => (
          <motion.span
            key={index}
            className="block w-1 h-1 rounded-full bg-current"
            animate={reduced ? undefined : { opacity: [0.35, 1, 0.35] }}
            transition={{ repeat: Infinity, duration: 1.2, delay: index * 0.18 }}
          />
        ))}
      </div>
      <CapsuleCancel />
    </div>
  )
}
