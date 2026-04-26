/**
 * Dashboard 页面加载骨架屏
 * 用于个人资料、作品等页面
 */

'use client'

import { motion } from 'framer-motion'

interface DashboardLoadingSkeletonProps {
  variant?: 'profile' | 'gallery' | 'list'
}

export function DashboardLoadingSkeleton({
  variant = 'profile'
}: DashboardLoadingSkeletonProps) {
  return (
    <div className="min-h-screen bg-transparent py-8 px-4">
      <div className="max-w-6xl mx-auto">
        {/* 页面标题骨架 */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="mb-8"
        >
          <div className="h-10 w-48 bg-stone-200 rounded-xl animate-pulse" />
        </motion.div>

        {/* Profile 变体 */}
        {variant === 'profile' && (
          <div className="space-y-6">
            {/* 用户卡片骨架 */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white rounded-2xl border border-stone-200 p-8"
            >
              <div className="flex items-center gap-6">
                <div className="w-24 h-24 rounded-full bg-gradient-to-br from-stone-100 to-stone-200 animate-pulse" />
                <div className="flex-1 space-y-3">
                  <div className="h-6 w-32 bg-stone-200 rounded animate-pulse" />
                  <div className="h-4 w-48 bg-stone-100 rounded animate-pulse" />
                </div>
              </div>
            </motion.div>

            {/* 表单区域骨架 */}
            {[1, 2].map((i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
                className="bg-white rounded-2xl border border-stone-200 p-6"
              >
                <div className="space-y-4">
                  <div className="h-5 w-32 bg-stone-200 rounded animate-pulse" />
                  <div className="space-y-3">
                    <div className="h-10 bg-stone-100 rounded-xl animate-pulse" />
                    <div className="h-10 bg-stone-100 rounded-xl animate-pulse" />
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}

        {/* Gallery 变体 - 网格布局 */}
        {variant === 'gallery' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="bg-white rounded-2xl border border-stone-200 overflow-hidden"
              >
                {/* 图片骨架 */}
                <div className="w-full aspect-square bg-gradient-to-br from-stone-100 to-stone-200 animate-pulse" />

                {/* 内容骨架 */}
                <div className="p-4 space-y-3">
                  <div className="h-5 bg-stone-200 rounded animate-pulse" />
                  <div className="flex justify-between items-center">
                    <div className="h-4 w-20 bg-stone-100 rounded animate-pulse" />
                    <div className="h-8 w-24 bg-stone-100 rounded-full animate-pulse" />
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}

        {/* List 变体 - 列表布局 */}
        {variant === 'list' && (
          <div className="space-y-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="bg-white rounded-2xl border border-stone-200 p-6"
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1 space-y-2">
                    <div className="h-5 w-48 bg-stone-200 rounded animate-pulse" />
                    <div className="h-4 w-32 bg-stone-100 rounded animate-pulse" />
                  </div>
                  <div className="h-10 w-32 bg-stone-100 rounded-xl animate-pulse" />
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
