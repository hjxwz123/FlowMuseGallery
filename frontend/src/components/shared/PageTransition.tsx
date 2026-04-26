/**
 * 页面过渡动画组件
 * 包裹页面内容以添加进入/退出动画
 */

'use client'

import { motion } from 'framer-motion'
import { pageTransition } from '@/lib/utils/animations'

interface PageTransitionProps {
  children: React.ReactNode
  className?: string
}

export function PageTransition({ children, className }: PageTransitionProps) {
  return (
    <motion.div
      initial="initial"
      animate="animate"
      exit="exit"
      variants={pageTransition}
      className={className}
    >
      {children}
    </motion.div>
  )
}
