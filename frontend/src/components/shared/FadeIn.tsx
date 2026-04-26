/**
 * 淡入动画组件
 * 用于元素进入视图时的淡入效果
 */

'use client'

import { motion } from 'framer-motion'
import { fadeIn, slideUp, scaleIn } from '@/lib/utils/animations'
import type { Variants } from 'framer-motion'

interface FadeInProps {
  children: React.ReactNode
  className?: string
  delay?: number
  variant?: 'fade' | 'slide' | 'scale'
}

const variants: Record<string, Variants> = {
  fade: fadeIn,
  slide: slideUp,
  scale: scaleIn,
}

export function FadeIn({
  children,
  className,
  delay = 0,
  variant = 'fade',
}: FadeInProps) {
  const selectedVariant = variants[variant]

  return (
    <motion.div
      initial="initial"
      animate="animate"
      variants={selectedVariant}
      transition={{ delay }}
      className={className}
    >
      {children}
    </motion.div>
  )
}
