import { useEffect, useRef } from 'react'

export function InteractiveGrid() {
    const canvasRef = useRef<HTMLCanvasElement>(null)

    useEffect(() => {
        const canvas = canvasRef.current
        if (!canvas) return

        const ctx = canvas.getContext('2d')
        if (!ctx) return

        let width = canvas.width = window.innerWidth
        let height = canvas.height = window.innerHeight

        const particles: { x: number, y: number, size: number, vx: number, vy: number, alpha: number }[] = []
        const particleCount = 150 // Sparse stars

        // Initialize particles
        for (let i = 0; i < particleCount; i++) {
            particles.push({
                x: Math.random() * width,
                y: Math.random() * height,
                size: Math.random() * 1.5,
                vx: (Math.random() - 0.5) * 0.2,
                vy: (Math.random() - 0.5) * 0.2,
                alpha: Math.random() * 0.5 + 0.1
            })
        }

        let mouseX = -1000
        let mouseY = -1000

        const handleMouseMove = (e: MouseEvent) => {
            mouseX = e.clientX
            mouseY = e.clientY
        }

        window.addEventListener('mousemove', handleMouseMove)
        window.addEventListener('resize', () => {
            width = canvas.width = window.innerWidth
            height = canvas.height = window.innerHeight
        })

        const animate = () => {
            ctx.clearRect(0, 0, width, height)

            // Draw Gradient Background (Deep Void) is handled by CSS body, we just draw stars here

            particles.forEach(p => {
                p.x += p.vx
                p.y += p.vy

                if (p.x < 0) p.x = width
                if (p.x > width) p.x = 0
                if (p.y < 0) p.y = height
                if (p.y > height) p.y = 0

                const dx = mouseX - p.x
                const dy = mouseY - p.y
                const dist = Math.sqrt(dx * dx + dy * dy)

                let currentAlpha = p.alpha

                // Subtle interaction
                if (dist < 200) {
                    const boost = (1 - dist / 200) * 0.5
                    currentAlpha += boost
                }

                ctx.fillStyle = `rgba(255, 255, 255, ${currentAlpha})`
                ctx.beginPath()
                ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
                ctx.fill()
            })

            requestAnimationFrame(animate)
        }

        animate()

        return () => {
            window.removeEventListener('mousemove', handleMouseMove)
        }
    }, [])

    return (
        <div className="fixed inset-0 z-0 pointer-events-none">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-zinc-900/20 via-[#050505]/80 to-[#050505]" />
            <canvas
                ref={canvasRef}
                className="absolute inset-0 z-0 opacity-60"
            />
        </div>
    )
}
