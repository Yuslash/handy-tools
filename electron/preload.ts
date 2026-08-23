import { ipcRenderer, contextBridge } from 'electron'

export type BackendStatus =
  | { state: 'starting' }
  | { state: 'ready'; port: number }
  | { state: 'failed'; reason: string }

export type LogScope = 'system' | 'download' | 'clip' | 'segment' | 'inspect' | 'gif' | 'edit' | 'record'

export interface LogLine {
  at: number
  source: 'app' | 'backend'
  level: 'info' | 'error'
  text: string
  scope?: LogScope
}

export interface ScreenSource {
  id: string
  name: string
  thumbnail: string
  display_id: string
}

export interface RecordAction {
  type: 'start' | 'pause' | 'resume' | 'stop' | 'cancel' | 'status_update' | 'request_status'
  payload?: {
    status?: 'idle' | 'ready' | 'countdown' | 'recording' | 'paused' | 'converting' | 'done' | 'failed'
    recording?: boolean
    paused?: boolean
    seconds?: number
    maxSeconds?: number
    countdown?: number
  }
}

/**
 * A named surface rather than a raw ipcRenderer passthrough, so the renderer can
 * only reach the channels listed here.
 */
const api = {
  minimize: () => ipcRenderer.send('minimize'),
  close: () => ipcRenderer.send('close'),
  toggleMaximize: () => ipcRenderer.send('maximize-toggle'),

  getBackendStatus: (): Promise<BackendStatus> => ipcRenderer.invoke('get-backend-status'),

  /** Subscribe to backend state changes. Returns an unsubscribe function. */
  onBackendStatus: (cb: (status: BackendStatus) => void) => {
    const listener = (_e: unknown, status: BackendStatus) => cb(status)
    ipcRenderer.on('backend-status', listener)
    return () => {
      ipcRenderer.off('backend-status', listener)
    }
  },

  /** Everything logged so far this run. */
  getLogs: (): Promise<LogLine[]> => ipcRenderer.invoke('get-logs'),

  /** Stream new log lines as they arrive. Returns an unsubscribe function. */
  onLog: (cb: (line: LogLine) => void) => {
    const listener = (_e: unknown, line: LogLine) => cb(line)
    ipcRenderer.on('backend-log', listener)
    return () => {
      ipcRenderer.off('backend-log', listener)
    }
  },

  showLogFile: (): Promise<string> => ipcRenderer.invoke('open-log-file'),
  restartBackend: (): Promise<BackendStatus> => ipcRenderer.invoke('restart-backend'),

  openDownloads: (): Promise<string> => ipcRenderer.invoke('open-downloads'),
  selectDirectory: (): Promise<string | null> => ipcRenderer.invoke('select-directory'),
  selectFile: (): Promise<string | null> => ipcRenderer.invoke('select-file'),
  revealFile: (filePath: string): Promise<boolean> => ipcRenderer.invoke('open-file-location', filePath),

  // Screen recording & overlay IPC
  getScreenSources: (): Promise<ScreenSource[]> => ipcRenderer.invoke('get-screen-sources'),
  saveTempRecording: (buffer: ArrayBuffer): Promise<string> => ipcRenderer.invoke('save-temp-recording', buffer),
  showRecordOverlay: (): Promise<boolean> => ipcRenderer.invoke('show-record-overlay'),
  hideRecordOverlay: (): Promise<boolean> => ipcRenderer.invoke('hide-record-overlay'),
  restoreMainWindow: (): Promise<boolean> => ipcRenderer.invoke('restore-main-window'),
  sendRecordAction: (action: RecordAction): void => ipcRenderer.send('record-action', action),
  onRecordAction: (cb: (action: RecordAction) => void) => {
    const listener = (_e: unknown, action: RecordAction) => cb(action)
    ipcRenderer.on('record-action', listener)
    return () => {
      ipcRenderer.off('record-action', listener)
    }
  },
}

contextBridge.exposeInMainWorld('bench', api)

export type BenchApi = typeof api
