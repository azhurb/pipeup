import { useId, useLayoutEffect, useRef } from 'react'

interface Props {
  label: string
  children: React.ReactNode
}

export function FormField({ label, children }: Props) {
  const labelId = useId()
  const fieldRef = useRef<HTMLFieldSetElement>(null)

  // Inspect rendered controls so nested wrappers and custom input components
  // receive the same accessible label. Button groups use the fieldset legend.
  useLayoutEffect(() => {
    const control = fieldRef.current?.querySelector('input, select, textarea, [role="combobox"]')
    if (!control || control.hasAttribute('aria-label') || control.hasAttribute('aria-labelledby')) {
      return
    }
    control.setAttribute('aria-labelledby', labelId)
    return () => control.removeAttribute('aria-labelledby')
  }, [children, labelId])

  return (
    <fieldset ref={fieldRef} className="min-w-0 border-0 p-0">
      <legend id={labelId} className="block text-[13px] font-medium text-text-secondary mb-2 p-0">
        {label}
      </legend>
      {children}
    </fieldset>
  )
}
