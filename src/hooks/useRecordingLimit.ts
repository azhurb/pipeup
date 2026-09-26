import { useEffect, useRef } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { useAppStore } from '../stores/appStore'

/** Recording limits belong to the lifecycle, not the visible capsule contents. */
export function useRecordingLimit() {
  const recording = useAppStore((state) => state.pipelineState === 'recording')
  const maxSeconds = useAppStore((state) => state.config.max_recording_seconds)
  const startedAt = useRef<number | null>(null)
  const stopped = useRef(false)

  useEffect(() => {
    if (!recording) {
      startedAt.current = null
      stopped.current = false
      return
    }
    if (stopped.current) return
    startedAt.current ??= Date.now()
    const remaining = Math.max(0, maxSeconds * 1000 - (Date.now() - startedAt.current))
    const timeout = setTimeout(() => {
      stopped.current = true
      invoke('stop_recording').catch((error: unknown) => {
        console.error('Failed to stop recording at its time limit:', error)
      })
    }, remaining)
    return () => clearTimeout(timeout)
  }, [recording, maxSeconds])
}
