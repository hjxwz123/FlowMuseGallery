/**
 * 交错动画容器
 * 子元素依次动画进入
 */

'use client'

import { motion } from 'framer-motion'
import { staggerContainer } from '@/lib/utils/animations'

interface StaggerContainerProps {
  children: React.ReactNode
  className?: string
  delay?: number
}

export function StaggerContainer({
  children,
  className,
  delay = 0,
}: StaggerContainerProps) {
  return (
    <motion.div
      initial="initial"
      animate="animate"
      variants={staggerContainer}
      transition={{ delay }}
      className={className}
    >
      {children}
    </motion.div>
  )
}
