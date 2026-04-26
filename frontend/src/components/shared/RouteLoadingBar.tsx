/**
 * 路由加载进度条
 * 在路由切换时显示顶部进度条，提升用户体验
 */

'use client'

import { useEffect, useState } from 'react'
import { usePathname, useSearchParams } from '@/lib/router'
import { motion, AnimatePresence } from 'framer-motion'

export function RouteLoadingBar() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isLoading, setIsLoading] = useState(false)
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    let progressTimer: NodeJS.Timeout

    // 路由开始变化时
    setIsLoading(true)
    setProgress(0)

    // 模拟进度条增长
    const startProgress = () => {
      let currentProgress = 0
      progressTimer = setInterval(() => {
        currentProgress += Math.random() * 30
        if (currentProgress > 90) {
          currentProgress = 90
          clearInterval(progressTimer)
        }
        setProgress(currentProgress)
      }, 200)
    }

    startProgress()

    // 路由变化完成后
    const timer = setTimeout(() => {
      setProgress(100)
      setTimeout(() => {
        setIsLoading(false)
        setProgress(0)
        clearInterval(progressTimer)
      }, 200)
    }, 100)

    return () => {
      clearTimeout(timer)
      clearInterval(progressTimer)
    }
  }, [pathname, searchParams])

  return (
    <AnimatePresence>
      {isLoading && (
        <motion.div
          className="fixed top-0 left-0 right-0 z-[100] h-1 bg-gradient-to-r from-aurora-pink via-aurora-purple to-aurora-blue origin-left"
          initial={{ scaleX: 0 }}
          animate={{ scaleX: progress / 100 }}
          exit={{ scaleX: 1, opacity: 0 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          style={{
            transformOrigin: 'left',
          }}
        >
          {/* 发光效果 */}
          <motion.div
            className="absolute inset-0 bg-gradient-to-r from-transparent via-white/50 to-transparent"
            animate={{
              x: ['-100%', '100%'],
            }}
            transition={{
              duration: 1,
              repeat: Infinity,
              ease: 'linear',
            }}
          />
        </motion.div>
      )}
    </AnimatePresence>
  )
}
