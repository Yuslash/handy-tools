export {}

declare global {
  interface Window {
    bench: import('../electron/preload').BenchApi
  }
}
