import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Titlebar } from './components/Titlebar'
import { Rail } from './components/Rail'
import { BackendProvider } from './state/backend'
import { LogsProvider } from './state/logs'
import { InputsProvider } from './state/inputs'
import { TransfersProvider } from './state/transfers'
import { Download } from './pages/Download'
import { Clip } from './pages/Clip'
import { Segment } from './pages/Segment'
import { Inspect } from './pages/Inspect'
import { Gif } from './pages/Gif'

export default function App() {
  return (
    <BackendProvider>
      {/* Logs sit above transfers so download events can be recorded. */}
      <LogsProvider>
        <InputsProvider>
          <TransfersProvider>
          <HashRouter>
            <div className="flex h-full flex-col bg-bg">
              <Titlebar />
              <div className="flex min-h-0 flex-1">
                <Rail />
                <main className="min-w-0 flex-1">
                  <Routes>
                    <Route path="/" element={<Download />} />
                    <Route path="/clip" element={<Clip />} />
                    <Route path="/segment" element={<Segment />} />
                    <Route path="/inspect" element={<Inspect />} />
                    <Route path="/gif" element={<Gif />} />
                    <Route path="*" element={<Navigate to="/" replace />} />
                  </Routes>
                </main>
              </div>
            </div>
          </HashRouter>
          </TransfersProvider>
        </InputsProvider>
      </LogsProvider>
    </BackendProvider>
  )
}
