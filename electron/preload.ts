import { ipcRenderer, contextBridge } from 'electron'

export type BackendStatus =
  | { state: 'starting' }
  | { state: 'ready'; port: number }
  | { state: 'failed'; reason: string }

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

  openDownloads: (): Promise<string> => ipcRenderer.invoke('open-downloads'),
  selectDirectory: (): Promise<string | null> => ipcRenderer.invoke('select-directory'),
  selectFile: (): Promise<string | null> => ipcRenderer.invoke('select-file'),
  revealFile: (filePath: string): Promise<boolean> => ipcRenderer.invoke('open-file-location', filePath),
}

contextBridge.exposeInMainWorld('bench', api)

export type BenchApi = typeof api
