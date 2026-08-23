import { useCallback, useEffect, useRef, useState } from 'react'
import { convertToGif, convertToVideo, startCursorTracker, type CursorTrackData } from '../lib/backend'
import type { GifState } from './useGifConvert'
import { useToolLog } from '../state/logs'

export interface ScreenRecorderState {
  status: 'idle' | 'ready' | 'countdown' | 'recording' | 'paused' | 'converting' | 'done' | 'failed'
  countdown: number
  seconds: number
  maxSeconds: number
  gifState: GifState
  tempVideoPath?: string
  outputPath?: string
  error?: string
}

export interface RecordConfig {
  sourceId?: string
  fps: number
  width: number
  countdown: boolean
  limitDuration: boolean
  highQuality: boolean
  format: 'gif' | 'video'
  zoomEnabled: boolean
  zoomFactor: number
  zoomKey: string
  zoomSpeed: number
  zoomRadius?: number
  zoomBezier?: [number, number, number, number]
  zoomTriggerMode?: 'hold' | 'toggle'
}

const MAX_RECORD_SECONDS = 10

// High-precision Cubic Bézier curve solver (Newton-Raphson)
function solveCubicBezier(x1: number, y1: number, x2: number, y2: number, t: number): number {
  if (t <= 0) return 0
  if (t >= 1) return 1

  const cx = 3 * x1
  const bx = 3 * (x2 - x1) - cx
  const ax = 1 - cx - bx

  const cy = 3 * y1
  const by = 3 * (y2 - y1) - cy
  const ay = 1 - cy - by

  let u = t
  for (let i = 0; i < 6; i++) {
    const currentX = ((ax * u + bx) * u + cx) * u
    const currentSlope = (3 * ax * u + 2 * bx) * u + cx
    if (Math.abs(currentSlope) < 1e-6) break
    u -= (currentX - t) / currentSlope
    u = Math.max(0, Math.min(1, u))
  }

  return ((ay * u + by) * u + cy) * u
}

export function useScreenRecorder() {
  const [status, setStatus] = useState<ScreenRecorderState['status']>('idle')
  const [countdown, setCountdown] = useState(3)
  const [seconds, setSeconds] = useState(0)
  const [gifState, setGifState] = useState<GifState>({ status: 'idle', percent: 0, message: '' })
  const [outputPath, setOutputPath] = useState<string | undefined>(undefined)
  const [error, setError] = useState<string | undefined>(undefined)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const rawStreamRef = useRef<MediaStream | null>(null)
  const videoElemRef = useRef<HTMLVideoElement | null>(null)
  const animFrameRef = useRef<number | null>(null)
  const renderIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const trackerCleanupRef = useRef<(() => void) | null>(null)
  const cursorStateRef = useRef<CursorTrackData>({ x: 0, y: 0, pressed: false })

  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const startTimeRef = useRef<number>(0)
  const pausedTimeRef = useRef<number>(0)
  const isPausedRef = useRef<boolean>(false)
  const currentOptionsRef = useRef<RecordConfig>({
    fps: 30,
    width: 640,
    countdown: true,
    limitDuration: true,
    highQuality: true,
    format: 'gif',
    zoomEnabled: true,
    zoomFactor: 2.0,
    zoomKey: 'ctrl',
    zoomSpeed: 0.1,
    zoomRadius: 16,
    zoomBezier: [0.22, 1.0, 0.36, 1.0],
  })

  const statusRef = useRef<ScreenRecorderState['status']>('idle')
  statusRef.current = status

  const secondsRef = useRef<number>(0)
  secondsRef.current = seconds

  const countdownRef = useRef<number>(3)
  countdownRef.current = countdown

  const log = useToolLog('record')

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current)
      countdownTimerRef.current = null
    }
  }, [])

  const broadcastStatus = useCallback(
    (currentSt: ScreenRecorderState['status'], sec: number, paused: boolean, count?: number) => {
      const maxSec = currentOptionsRef.current.limitDuration ? MAX_RECORD_SECONDS : 0
      window.bench?.sendRecordAction({
        type: 'status_update',
        payload: {
          status: currentSt,
          recording: currentSt === 'recording',
          paused,
          seconds: sec,
          maxSeconds: maxSec,
          countdown: count,
        },
      })
    },
    [],
  )

  const stopTracks = useCallback(() => {
    if (renderIntervalRef.current) {
      clearInterval(renderIntervalRef.current)
      renderIntervalRef.current = null
    }
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current)
      animFrameRef.current = null
    }
    if (trackerCleanupRef.current) {
      trackerCleanupRef.current()
      trackerCleanupRef.current = null
    }
    if (videoElemRef.current) {
      videoElemRef.current.pause()
      videoElemRef.current.srcObject = null
      videoElemRef.current.remove()
      videoElemRef.current = null
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
    if (rawStreamRef.current) {
      rawStreamRef.current.getTracks().forEach((track) => track.stop())
      rawStreamRef.current = null
    }
  }, [])

  const cancel = useCallback(async () => {
    clearTimer()
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.onstop = null
      mediaRecorderRef.current.stop()
    }
    stopTracks()
    await window.bench?.hideRecordOverlay().catch(() => {})
    await window.bench?.restoreMainWindow().catch(() => {})
    setStatus('idle')
    setSeconds(0)
    log.info('Screen recording cancelled')
  }, [clearTimer, stopTracks, log])

  const pause = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.pause()
      isPausedRef.current = true
      pausedTimeRef.current = Date.now()
      setStatus('paused')
      broadcastStatus('paused', secondsRef.current, true)
      log.info('Recording paused')
    }
  }, [broadcastStatus, log])

  const resume = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'paused') {
      mediaRecorderRef.current.resume()
      isPausedRef.current = false
      if (pausedTimeRef.current > 0) {
        startTimeRef.current += Date.now() - pausedTimeRef.current
        pausedTimeRef.current = 0
      }
      setStatus('recording')
      broadcastStatus('recording', secondsRef.current, false)
      log.info('Recording resumed')
    }
  }, [broadcastStatus, log])

  const processAndConvert = useCallback(
    async (blob: Blob, fps: number, width: number) => {
      try {
        const opts = currentOptionsRef.current
        const isVideo = opts.format === 'video'

        setStatus('converting')
        broadcastStatus('converting', 0, false)
        setGifState({
          status: 'converting',
          percent: 0,
          message: isVideo ? 'Saving recorded video…' : 'Saving recorded capture…',
        })
        log.info(`Processing recorded screen capture (${isVideo ? 'MP4 Video' : 'GIF'})…`)

        const arrayBuffer = await blob.arrayBuffer()
        const tempPath = await window.bench?.saveTempRecording(arrayBuffer)
        if (!tempPath) throw new Error('Failed to save temporary recording file.')

        log.info(`Temp recording saved to ${tempPath}`)

        if (isVideo) {
          log.info(`Encoding MP4 Video at ${fps} fps, ${width > 0 ? `${width}px` : 'native'} width…`)
          setGifState({ status: 'converting', percent: 5, message: 'Encoding MP4 video…' })

          for await (const event of convertToVideo({ file_path: tempPath, fps, width })) {
            switch (event.type) {
              case 'status':
                setGifState((s) => ({ ...s, message: event.message }))
                log.info(event.message)
                break
              case 'progress':
                setGifState((s) => ({
                  ...s,
                  percent: event.percent ?? s.percent,
                  message: `Encoding video… (${event.percent}%)`,
                }))
                break
              case 'complete':
                setGifState({
                  status: 'done',
                  percent: 100,
                  message: 'MP4 Video generated successfully!',
                  outputPath: event.output_path,
                })
                setOutputPath(event.output_path)
                setStatus('done')
                log.info(`Video saved: ${event.output_path}`)
                return
              case 'error':
                setGifState({ status: 'failed', percent: 0, message: event.message })
                setError(event.message)
                setStatus('failed')
                log.error(event.message)
                return
            }
          }
        } else {
          log.info(`Converting to GIF at ${fps} fps, ${width > 0 ? `${width}px` : 'native'} width (${opts.highQuality ? 'High Quality' : 'Standard'})…`)
          setGifState({ status: 'converting', percent: 5, message: 'Initializing GIF conversion…' })

          for await (const event of convertToGif({
            file_path: tempPath,
            fps,
            width,
            high_quality: opts.highQuality,
          })) {
            switch (event.type) {
              case 'status':
                setGifState((s) => ({ ...s, message: event.message }))
                log.info(event.message)
                break
              case 'progress':
                setGifState((s) => ({
                  ...s,
                  percent: event.percent ?? s.percent,
                  message: event.frame ? `Processing frame ${event.frame}` : s.message,
                }))
                break
              case 'complete':
                setGifState({
                  status: 'done',
                  percent: 100,
                  message: 'GIF generated successfully!',
                  outputPath: event.output_path,
                })
                setOutputPath(event.output_path)
                setStatus('done')
                log.info(`GIF saved: ${event.output_path}`)
                return
              case 'error':
                setGifState({ status: 'failed', percent: 0, message: event.message })
                setError(event.message)
                setStatus('failed')
                log.error(event.message)
                return
            }
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to process recording.'
        setGifState({ status: 'failed', percent: 0, message: msg })
        setError(msg)
        setStatus('failed')
        log.error(msg)
      }
    },
    [broadcastStatus, log],
  )

  const stop = useCallback(async () => {
    clearTimer()
    await window.bench?.hideRecordOverlay().catch(() => {})
    await window.bench?.restoreMainWindow().catch(() => {})

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
    } else {
      stopTracks()
    }
  }, [clearTimer, stopTracks])

  const startActualRecording = useCallback(
    async (sourceId: string, fps: number, width: number) => {
      try {
        chunksRef.current = []
        isPausedRef.current = false
        pausedTimeRef.current = 0

        const opts = currentOptionsRef.current
        const targetFps = Math.max(10, Math.min(60, fps))

        let rawStream: MediaStream
        if (sourceId) {
          rawStream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: {
              mandatory: {
                chromeMediaSource: 'desktop',
                chromeMediaSourceId: sourceId,
                minWidth: 1280,
                maxWidth: 1920,
                minHeight: 720,
                maxHeight: 1080,
                frameRate: { ideal: targetFps, max: Math.max(60, targetFps) },
              },
            } as unknown as MediaTrackConstraints,
          })
        } else {
          const sources = await window.bench?.getScreenSources()
          const primarySourceId = sources?.[0]?.id
          if (primarySourceId) {
            rawStream = await navigator.mediaDevices.getUserMedia({
              audio: false,
              video: {
                mandatory: {
                  chromeMediaSource: 'desktop',
                  chromeMediaSourceId: primarySourceId,
                  minWidth: 1280,
                  maxWidth: 1920,
                  minHeight: 720,
                  maxHeight: 1080,
                  frameRate: { ideal: targetFps, max: Math.max(60, targetFps) },
                },
              } as unknown as MediaTrackConstraints,
            })
          } else {
            rawStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false })
          }
        }

        rawStreamRef.current = rawStream

        let recordedStream: MediaStream

        // -------------------------------------------------------------------
        // Canvas Zoom Engine with Exact Easing & Framerate-Independent Interpolation
        // -------------------------------------------------------------------
        if (opts.zoomEnabled) {
          log.info(`Enabling dynamic cursor zoom (Key: ${opts.zoomKey.toUpperCase()}, Zoom: ${opts.zoomFactor}x)`)

          const video = document.createElement('video')
          video.srcObject = rawStream
          video.muted = true
          video.playsInline = true
          videoElemRef.current = video

          await new Promise<void>((resolve) => {
            video.onloadedmetadata = () => {
              video.play().then(() => resolve()).catch(() => resolve())
            }
          })

          const vw = video.videoWidth || 1920
          const vh = video.videoHeight || 1080

          const canvas = document.createElement('canvas')
          canvas.width = vw
          canvas.height = vh
          const ctx = canvas.getContext('2d', { alpha: false })!

          let isToggled = false
          let lastRawPressed = false

          // Start Native Cursor & Hotkey Tracker
          trackerCleanupRef.current = startCursorTracker(opts.zoomKey || 'ctrl', (data) => {
            cursorStateRef.current = data
            if (opts.zoomTriggerMode === 'toggle') {
              if (data.pressed && !lastRawPressed) {
                isToggled = !isToggled
              }
              lastRawPressed = data.pressed
            }
          })

          const [x1, y1, x2, y2] = opts.zoomBezier || [0.22, 1.0, 0.36, 1.0]
          const durationSec =
            opts.zoomSpeed === 0.08
              ? 0.70
              : opts.zoomSpeed === 0.12
                ? 0.45
                : opts.zoomSpeed === 0.22
                  ? 0.25
                  : Math.max(0.05, Math.min(3.0, opts.zoomSpeed || 0.45))

          const targetZoomVal = opts.zoomFactor || 2.0

          let zoomProgress = 0.0
          let curZoom = 1.0
          let curX = vw / 2
          let curY = vh / 2
          let lastTime = performance.now()

          const renderFrame = () => {
            const now = performance.now()
            const dt = Math.min(0.08, Math.max(0.001, (now - lastTime) / 1000))
            lastTime = now

            const isPressed =
              opts.zoomTriggerMode === 'toggle' ? isToggled : cursorStateRef.current.pressed

            // Advance progression towards 1.0 (pressed) or 0.0 (released)
            if (isPressed) {
              zoomProgress = Math.min(1.0, zoomProgress + dt / durationSec)
            } else {
              zoomProgress = Math.max(0.0, zoomProgress - dt / durationSec)
            }

            // Exact Bézier curve interpolation matching studio settings
            const easedT = solveCubicBezier(x1, y1, x2, y2, zoomProgress)
            curZoom = 1.0 + (targetZoomVal - 1.0) * easedT

            // Smoothly track mouse cursor location
            const targetX = isPressed ? Math.max(0, Math.min(vw, cursorStateRef.current.x)) : vw / 2
            const targetY = isPressed ? Math.max(0, Math.min(vh, cursorStateRef.current.y)) : vh / 2

            const panFactor = 1 - Math.exp(-18 * dt)
            curX += (targetX - curX) * panFactor
            curY += (targetY - curY) * panFactor

            const sw = vw / Math.max(0.2, curZoom)
            const sh = vh / Math.max(0.2, curZoom)
            const sx = Math.max(0, Math.min(vw - sw, curX - sw / 2))
            const sy = Math.max(0, Math.min(vh - sh, curY - sh / 2))

            ctx.drawImage(video, sx, sy, sw, sh, 0, 0, vw, vh)
          }

          // Initial paint
          renderFrame()

          // Dual render driver: Interval ensures steady background ticking without Chromium throttling
          const intervalMs = Math.max(8, Math.round(1000 / targetFps))
          renderIntervalRef.current = setInterval(renderFrame, intervalMs)

          const rafTick = () => {
            renderFrame()
            animFrameRef.current = requestAnimationFrame(rafTick)
          }
          animFrameRef.current = requestAnimationFrame(rafTick)

          recordedStream = canvas.captureStream(targetFps)
        } else {
          recordedStream = rawStream
        }

        streamRef.current = recordedStream

        const mimeTypes = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']
        const supportedMime = mimeTypes.find((m) => MediaRecorder.isTypeSupported(m)) || 'video/webm'
        const recorder = new MediaRecorder(recordedStream, {
          mimeType: supportedMime,
          videoBitsPerSecond: opts.highQuality ? 8_000_000 : 2_500_000,
        })
        mediaRecorderRef.current = recorder

        recorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) {
            chunksRef.current.push(e.data)
          }
        }

        recorder.onstop = async () => {
          stopTracks()
          const blob = new Blob(chunksRef.current, { type: supportedMime })
          log.info(`Recorded ${chunksRef.current.length} chunks (${(blob.size / 1024).toFixed(1)} KB)`)
          await processAndConvert(blob, currentOptionsRef.current.fps, width)
        }

        recorder.start(250) // collect chunks every 250ms
        startTimeRef.current = Date.now()
        const isLimited = opts.limitDuration
        log.info(`Screen recording started (${opts.format === 'video' ? 'MP4 Video' : 'GIF'}, ${isLimited ? 'max 10s' : 'unlimited'})`)

        timerRef.current = setInterval(() => {
          if (isPausedRef.current) return

          const elapsed = (Date.now() - startTimeRef.current) / 1000
          if (isLimited) {
            const clamped = Math.min(MAX_RECORD_SECONDS, elapsed)
            setSeconds(clamped)
            broadcastStatus('recording', clamped, false)

            if (elapsed >= MAX_RECORD_SECONDS) {
              log.info('Maximum 10 seconds reached, stopping recording…')
              stop()
            }
          } else {
            setSeconds(elapsed)
            broadcastStatus('recording', elapsed, false)
          }
        }, 100)
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Could not access screen recording.'
        setError(msg)
        setStatus('failed')
        log.error(msg)
        stopTracks()
        await window.bench?.hideRecordOverlay().catch(() => {})
        await window.bench?.restoreMainWindow().catch(() => {})
      }
    },
    [broadcastStatus, stop, processAndConvert, stopTracks, log],
  )

  const startFromOverlay = useCallback(() => {
    const opts = currentOptionsRef.current
    if (opts.countdown) {
      setStatus('countdown')
      setCountdown(3)
      broadcastStatus('countdown', 0, false, 3)
      log.info('Countdown started: 3s')

      let currentCount = 3
      countdownTimerRef.current = setInterval(() => {
        currentCount -= 1
        setCountdown(currentCount)
        broadcastStatus('countdown', 0, false, currentCount)
        log.info(`Countdown: ${currentCount}s`)

        if (currentCount <= 0) {
          clearInterval(countdownTimerRef.current!)
          countdownTimerRef.current = null
          startActualRecording(opts.sourceId || '', opts.fps, opts.width)
        }
      }, 1000)
    } else {
      startActualRecording(opts.sourceId || '', opts.fps, opts.width)
    }
  }, [broadcastStatus, startActualRecording, log])

  useEffect(() => {
    const unsub = window.bench?.onRecordAction((action) => {
      switch (action.type) {
        case 'start':
          startFromOverlay()
          break
        case 'pause':
          pause()
          break
        case 'resume':
          resume()
          break
        case 'stop':
          stop()
          break
        case 'cancel':
          cancel()
          break
        case 'request_status':
          broadcastStatus(statusRef.current, secondsRef.current, isPausedRef.current, countdownRef.current)
          break
      }
    })

    return () => {
      unsub?.()
    }
  }, [startFromOverlay, pause, resume, stop, cancel, broadcastStatus])

  const openWidget = useCallback(
    async (options: RecordConfig) => {
      currentOptionsRef.current = options
      setStatus('ready')
      setSeconds(0)
      setError(undefined)
      setOutputPath(undefined)
      setGifState({ status: 'idle', percent: 0, message: '' })

      try {
        log.info('Launching floating recorder widget…')
        await window.bench?.showRecordOverlay()
        broadcastStatus('ready', 0, false)
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Could not launch recording overlay.'
        setError(msg)
        setStatus('failed')
        log.error(msg)
      }
    },
    [broadcastStatus, log],
  )

  const reset = useCallback(() => {
    clearTimer()
    stopTracks()
    setStatus('idle')
    setSeconds(0)
    setOutputPath(undefined)
    setError(undefined)
    setGifState({ status: 'idle', percent: 0, message: '' })
  }, [clearTimer, stopTracks])

  return {
    state: {
      status,
      countdown,
      seconds,
      maxSeconds: currentOptionsRef.current.limitDuration ? MAX_RECORD_SECONDS : 0,
      gifState,
      outputPath,
      error,
    },
    openWidget,
    stop,
    cancel,
    reset,
  }
}
