/**
 * 页面加载骨架屏
 * 在页面切换时提供优雅的加载状态
 */

'use client'

import { motion } from 'framer-motion'

export function PageLoadingSkeleton() {
  return (
    <div className="min-h-screen bg-transparent py-12 px-4">
      <div className="max-w-7xl mx-auto">
        {/* 头部骨架 */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center mb-12 space-y-4"
        >
          <div className="h-12 w-64 mx-auto bg-stone-200 rounded-2xl animate-pulse" />
          <div className="h-6 w-96 mx-auto bg-stone-100 rounded-2xl animate-pulse" />
        </motion.div>

        {/* 内容骨架 */}
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
                <div className="h-6 bg-stone-200 rounded animate-pulse" />
                <div className="space-y-2">
                  <div className="h-4 bg-stone-100 rounded animate-pulse" />
                  <div className="h-4 bg-stone-100 rounded w-4/5 animate-pulse" />
                </div>
                <div className="flex justify-between items-center">
                  <div className="h-4 w-20 bg-stone-100 rounded animate-pulse" />
                  <div className="h-6 w-16 bg-stone-100 rounded-full animate-pulse" />
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  )
}
