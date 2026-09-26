import { useSyncExternalStore } from 'react'

const captures = new Set<symbol>()
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((listener) => listener())

/** Hold the save guard until native shortcut restoration has completed. */
export function beginHotkeyCapture() {
  const token = Symbol()
  captures.add(token)
  notify()
  return () => {
    captures.delete(token)
    notify()
  }
}

export const isHotkeyCaptureBusy = () => captures.size > 0

export function useHotkeyCaptureBusy() {
  return useSyncExternalStore((listener) => {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }, isHotkeyCaptureBusy)
}
