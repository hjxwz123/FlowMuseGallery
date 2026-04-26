/**
 * Canvas 动画背景组件
 * 创建流动的粒子动画效果
 */

'use client'

import { useEffect, useRef } from 'react'

interface Particle {
  x: number
  y: number
  size: number
  speedX: number
  speedY: number
  opacity: number
  color: string
}

export function CanvasBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // 设置 canvas 尺寸
    const resizeCanvas = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }
    resizeCanvas()
    window.addEventListener('resize', resizeCanvas)

    // 粒子颜色 - Canvas 风格的柔和色调
    const colors = [
      'rgba(255, 107, 157, 0.5)', // aurora-pink
      'rgba(183, 148, 246, 0.5)', // aurora-purple
      'rgba(96, 165, 250, 0.5)',  // aurora-blue
      'rgba(52, 211, 153, 0.4)',  // aurora-green
    ]

    // 创建粒子
    const particles: Particle[] = []
    const particleCount = 50

    for (let i = 0; i < particleCount; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        size: Math.random() * 4 + 1,
        speedX: (Math.random() - 0.5) * 0.5,
        speedY: (Math.random() - 0.5) * 0.5,
        opacity: Math.random() * 0.5 + 0.2,
        color: colors[Math.floor(Math.random() * colors.length)]
      })
    }

    // 绘制连接线
    const drawConnections = () => {
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x
          const dy = particles[i].y - particles[j].y
          const distance = Math.sqrt(dx * dx + dy * dy)

          if (distance < 150) {
            ctx.beginPath()
            ctx.strokeStyle = `rgba(183, 148, 246, ${0.15 * (1 - distance / 150)})`
            ctx.lineWidth = 1
            ctx.moveTo(particles[i].x, particles[i].y)
            ctx.lineTo(particles[j].x, particles[j].y)
            ctx.stroke()
          }
        }
      }
    }

    // 动画循环
    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      // 绘制渐变背景
      const isDark = document.documentElement.classList.contains('dark')
      const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height)
      if (isDark) {
        gradient.addColorStop(0, 'rgba(24, 24, 27, 0.97)')
        gradient.addColorStop(0.5, 'rgba(20, 20, 22, 0.97)')
        gradient.addColorStop(1, 'rgba(24, 24, 27, 0.97)')
      } else {
        gradient.addColorStop(0, 'rgba(250, 250, 249, 0.95)')
        gradient.addColorStop(0.5, 'rgba(245, 245, 244, 0.95)')
        gradient.addColorStop(1, 'rgba(250, 250, 249, 0.95)')
      }
      ctx.fillStyle = gradient
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      // 绘制连接线
      drawConnections()

      // 更新和绘制粒子
      particles.forEach(particle => {
        // 更新位置
        particle.x += particle.speedX
        particle.y += particle.speedY

        // 边界检测
        if (particle.x < 0 || particle.x > canvas.width) particle.speedX *= -1
        if (particle.y < 0 || particle.y > canvas.height) particle.speedY *= -1

        // 绘制粒子
        ctx.beginPath()
        ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2)
        ctx.fillStyle = particle.color
        ctx.fill()

        // 添加发光效果
        ctx.shadowBlur = 15
        ctx.shadowColor = particle.color
        ctx.fill()
        ctx.shadowBlur = 0
      })

      requestAnimationFrame(animate)
    }

    animate()

    return () => {
      window.removeEventListener('resize', resizeCanvas)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 -z-10 pointer-events-none"
      style={{ background: 'transparent' }}
    />
  )
}
