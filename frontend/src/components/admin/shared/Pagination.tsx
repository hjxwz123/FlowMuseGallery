/**
 * 分页组件
 * 用于数据表格分页
 */

'use client'

import { cn } from '@/lib/utils/cn'

interface PaginationProps {
  currentPage: number
  totalPages: number
  totalItems: number
  pageSize: number
  onPageChange: (page: number) => void
  className?: string
}

export const Pagination = ({
  currentPage,
  totalPages,
  totalItems,
  pageSize,
  onPageChange,
  className,
}: PaginationProps) => {
  const startItem = (currentPage - 1) * pageSize + 1
  const endItem = Math.min(currentPage * pageSize, totalItems)

  const canGoPrevious = currentPage > 1
  const canGoNext = currentPage < totalPages

  // 生成页码按钮
  const getPageNumbers = () => {
    const pages: (number | string)[] = []
    const maxVisible = 7 // 最多显示7个页码

    if (totalPages <= maxVisible) {
      // 如果总页数少于最大显示数,显示所有页码
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i)
      }
    } else {
      // 否则智能显示页码
      if (currentPage <= 3) {
        // 当前页在前面
        for (let i = 1; i <= 5; i++) {
          pages.push(i)
        }
        pages.push('...')
        pages.push(totalPages)
      } else if (currentPage >= totalPages - 2) {
        // 当前页在后面
        pages.push(1)
        pages.push('...')
        for (let i = totalPages - 4; i <= totalPages; i++) {
          pages.push(i)
        }
      } else {
        // 当前页在中间
        pages.push(1)
        pages.push('...')
        for (let i = currentPage - 1; i <= currentPage + 1; i++) {
          pages.push(i)
        }
        pages.push('...')
        pages.push(totalPages)
      }
    }

    return pages
  }

  if (totalPages <= 1) {
    return null
  }

  return (
    <div
      className={cn(
        'flex flex-col sm:flex-row items-center justify-between gap-4',
        'py-4 px-6 bg-white/80 backdrop-blur-sm border-t border-stone-200',
        className
      )}
    >
      {/* Items Info */}
      <div className="font-ui text-sm text-stone-600">
        显示 {startItem} - {endItem} 条，共 {totalItems} 条
      </div>

      {/* Pagination Buttons */}
      <div className="flex items-center gap-2">
        {/* Previous Button */}
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={!canGoPrevious}
          className={cn(
            'flex items-center gap-2 px-3 py-2 rounded-lg font-ui text-sm',
            'border border-stone-200 transition-all duration-300',
            canGoPrevious
              ? 'bg-white hover:bg-stone-50 text-stone-700 hover:border-aurora-purple/30'
              : 'bg-stone-50 text-stone-400 cursor-not-allowed'
          )}
        >
          <svg
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 19l-7-7 7-7"
            />
          </svg>
          上一页
        </button>

        {/* Page Numbers */}
        <div className="hidden sm:flex items-center gap-1">
          {getPageNumbers().map((page, index) => {
            if (page === '...') {
              return (
                <span
                  key={`ellipsis-${index}`}
                  className="px-3 py-2 font-ui text-sm text-stone-400"
                >
                  ...
                </span>
              )
            }

            return (
              <button
                key={page}
                onClick={() => onPageChange(page as number)}
                className={cn(
                  'px-3 py-2 rounded-lg font-ui text-sm transition-all duration-300',
                  'border',
                  page === currentPage
                    ? 'bg-gradient-to-r from-aurora-pink via-aurora-purple to-aurora-blue text-white border-transparent shadow-aurora'
                    : 'bg-white text-stone-700 border-stone-200 hover:bg-stone-50 hover:border-aurora-purple/30'
                )}
              >
                {page}
              </button>
            )
          })}
        </div>

        {/* Mobile Page Info */}
        <div className="sm:hidden px-3 py-2 font-ui text-sm text-stone-600">
          {currentPage} / {totalPages}
        </div>

        {/* Next Button */}
        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={!canGoNext}
          className={cn(
            'flex items-center gap-2 px-3 py-2 rounded-lg font-ui text-sm',
            'border border-stone-200 transition-all duration-300',
            canGoNext
              ? 'bg-white hover:bg-stone-50 text-stone-700 hover:border-aurora-purple/30'
              : 'bg-stone-50 text-stone-400 cursor-not-allowed'
          )}
        >
          下一页
          <svg
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5l7 7-7 7"
            />
          </svg>
        </button>
      </div>
    </div>
  )
}
