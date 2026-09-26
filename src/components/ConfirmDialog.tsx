import { useEffect, useId, useRef } from 'react'
import { useTranslation } from 'react-i18next'

interface Props {
  open: boolean
  message: string
  /** Defaults to `common.confirm`. */
  confirmLabel?: string
  /** Defaults to `common.cancel`. */
  cancelLabel?: string
  /** Styles the confirm button as destructive. Irreversible deletes should set it. */
  destructive?: boolean
  onConfirm: () => void
  onCancel: () => void
}

/**
 * In-app replacement for `window.confirm`, which cannot be used here.
 *
 * WKWebView only shows JS dialogs when the host implements `WKUIDelegate`'s
 * `runJavaScriptConfirmPanelWithMessage:` — and wry implements no such method, so
 * on macOS `window.confirm()` returns falsy immediately without displaying
 * anything. Any guard written as `if (!window.confirm(...)) return` therefore
 * always takes the early return, which is how "Clear All History" came to
 * silently do nothing. Use this component instead; never `window.confirm`.
 */
export function ConfirmDialog({
  open,
  message,
  confirmLabel,
  cancelLabel,
  destructive = false,
  onConfirm,
  onCancel,
}: Props) {
  const { t } = useTranslation()
  // Destructive actions focus Cancel, so a stray Enter/Space dismisses rather
  // than deletes.
  const cancelRef = useRef<HTMLButtonElement>(null)
  const confirmRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const messageId = useId()
  const onCancelRef = useRef(onCancel)
  onCancelRef.current = onCancel

  useEffect(() => {
    if (!open) return
    const previousFocus = document.activeElement
    cancelRef.current?.focus()
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onCancelRef.current()
      } else if (e.key === 'Tab') {
        // The dialog has two actions. Keep both directions inside it, including
        // a key event dispatched while focus was moved outside programmatically.
        if (e.shiftKey && document.activeElement !== confirmRef.current) {
          e.preventDefault()
          confirmRef.current?.focus()
        } else if (!e.shiftKey && document.activeElement !== cancelRef.current) {
          e.preventDefault()
          cancelRef.current?.focus()
        }
      }
    }
    const keepFocusInside = (e: FocusEvent) => {
      if (e.target instanceof Node && !dialogRef.current?.contains(e.target)) {
        cancelRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    document.addEventListener('focusin', keepFocusInside)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('focusin', keepFocusInside)
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus()
    }
  }, [open])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/40 px-6"
      onClick={onCancel}
    >
      <div
        ref={dialogRef}
        data-testid="confirm-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={messageId}
        // Clicks inside must not reach the backdrop's cancel handler.
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[320px] p-4 bg-bg-secondary border border-border rounded-[14px] shadow-xl"
      >
        <p
          id={messageId}
          className="text-[13px] text-text-primary leading-relaxed whitespace-pre-line"
        >
          {message}
        </p>
        <div className="flex items-center justify-end gap-2 mt-4">
          <button
            ref={cancelRef}
            data-testid="confirm-dialog-cancel"
            onClick={onCancel}
            className="px-3 py-1.5 text-[12px] text-text-secondary hover:text-text-primary bg-transparent border-none cursor-pointer rounded-[10px] hover:bg-bg-tertiary transition-colors"
          >
            {cancelLabel ?? t('common.cancel')}
          </button>
          <button
            ref={confirmRef}
            data-testid="confirm-dialog-confirm"
            onClick={onConfirm}
            className={`px-3 py-1.5 text-[12px] text-white rounded-[10px] border-none cursor-pointer hover:opacity-90 transition-opacity ${
              destructive ? 'bg-error' : 'bg-accent'
            }`}
          >
            {confirmLabel ?? t('common.confirm')}
          </button>
        </div>
      </div>
    </div>
  )
}
