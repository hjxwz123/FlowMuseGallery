/**
 * 通用数据表格组件
 * 基于 shadcn/ui Table 组件
 */

'use client'

import { cn } from '@/lib/utils'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Loading } from '@/components/ui/Loading'

export interface DataTableColumn<T> {
  key: string
  label: string
  width?: string
  align?: 'left' | 'center' | 'right'
  sortable?: boolean
  render?: (item: T, index: number) => React.ReactNode
}

interface DataTableProps<T> {
  data: T[]
  columns: DataTableColumn<T>[]
  keyExtractor: (item: T) => string
  loading?: boolean
  emptyText?: string
  onSort?: (key: string) => void
  sortKey?: string
  sortOrder?: 'asc' | 'desc'
  className?: string
}

export function DataTable<T>({
  data,
  columns,
  keyExtractor,
  loading = false,
  emptyText = '暂无数据',
  onSort,
  sortKey,
  sortOrder,
  className,
}: DataTableProps<T>) {
  const handleSort = (key: string) => {
    if (onSort) {
      onSort(key)
    }
  }

  const renderCell = (item: T, column: DataTableColumn<T>, index: number) => {
    if (column.render) {
      return column.render(item, index)
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (item as any)[column.key] || '-'
  }

  return (
    <div
      className={cn(
        'overflow-hidden rounded-2xl border border-stone-200 bg-white/80 shadow-canvas backdrop-blur-sm dark:border-stone-800 dark:bg-stone-950/80 dark:shadow-none',
        className
      )}
    >
      <Table>
        <TableHeader className="bg-stone-50 dark:bg-stone-900/80">
          <TableRow>
            {columns.map((column) => (
              <TableHead
                key={column.key}
                style={{ width: column.width }}
                className={cn(
                  'font-ui text-sm font-semibold text-stone-700 dark:text-stone-200',
                  column.align === 'center' && 'text-center',
                  column.align === 'right' && 'text-right',
                  column.sortable && 'cursor-pointer hover:text-aurora-purple',
                  sortKey === column.key && 'text-aurora-purple'
                )}
                onClick={() => column.sortable && handleSort(column.key)}
              >
                <div className="flex items-center gap-2">
                  {column.label}
                  {column.sortable && (
                    <svg
                      className={cn(
                        'h-4 w-4 transition-transform',
                        sortKey === column.key &&
                          sortOrder === 'desc' &&
                          'rotate-180'
                      )}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M7 10l5 5 5-5"
                      />
                    </svg>
                  )}
                </div>
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableRow>
              <TableCell
                colSpan={columns.length}
                className="h-64 text-center"
              >
                <Loading />
              </TableCell>
            </TableRow>
          ) : !data || data.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={columns.length}
                className="h-64 text-center"
              >
                <div className="flex flex-col items-center justify-center gap-3">
                  <svg
                    className="h-12 w-12 text-stone-400 dark:text-stone-600"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
                    />
                  </svg>
                  <p className="font-ui text-sm text-stone-500 dark:text-stone-400">{emptyText}</p>
                </div>
              </TableCell>
            </TableRow>
          ) : (
            data.map((item, index) => (
              <TableRow
                key={keyExtractor(item)}
                className="transition-colors hover:bg-stone-50/50 dark:hover:bg-stone-900/60"
              >
                {columns.map((column) => (
                  <TableCell
                    key={column.key}
                    className={cn(
                      'font-ui text-sm text-stone-700 dark:text-stone-300',
                      column.align === 'center' && 'text-center',
                      column.align === 'right' && 'text-right'
                    )}
                  >
                    {renderCell(item, column, index)}
                  </TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  )
}
