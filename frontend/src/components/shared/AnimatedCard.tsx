/**
 * 带动画的卡片组件
 * 支持悬停和点击动画
 */

'use client'

import { motion } from 'framer-motion'
import { cardHover, buttonTap } from '@/lib/utils/animations'
import { cn } from '@/lib/utils/cn'

interface AnimatedCardProps {
  children: React.ReactNode
  className?: string
  onClick?: () => void
  enableHover?: boolean
  enableTap?: boolean
}

export function AnimatedCard({
  children,
  className,
  onClick,
  enableHover = true,
  enableTap = true,
}: AnimatedCardProps) {
  return (
    <motion.div
      initial="rest"
      whileHover={enableHover ? 'hover' : undefined}
      whileTap={enableTap && onClick ? buttonTap : undefined}
      variants={cardHover}
      onClick={onClick}
      className={cn(onClick && 'cursor-pointer', className)}
    >
      {children}
    </motion.div>
  )
}
