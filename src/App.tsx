import { HashRouter, Routes, Route } from 'react-router-dom'
import { Home } from './pages/Home'
import { VideoDownloader } from './pages/VideoDownloader'
import { ClipDownloader } from './pages/ClipDownloader'
import { ScrollingScreenshot } from './pages/ScrollingScreenshot'
import { VideoQuality } from './pages/VideoQuality'

function App() {
  return (
    <HashRouter>
      <div className="h-screen w-screen flex flex-col text-foreground overflow-hidden">


        <main className="flex-1 overflow-hidden relative">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/video-downloader" element={<VideoDownloader />} />
            <Route path="/clip-downloader" element={<ClipDownloader />} />
            <Route path="/scrolling-screenshot" element={<ScrollingScreenshot />} />
            <Route path="/video-quality" element={<VideoQuality />} />
          </Routes>
        </main>
      </div>
    </HashRouter>
  )
}

export default App
