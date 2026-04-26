import { forwardRef, type ImgHTMLAttributes } from 'react'

type ImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> & {
  src: string | { src: string }
  alt: string
  width?: number | `${number}`
  height?: number | `${number}`
  fill?: boolean
  priority?: boolean
  quality?: number | `${number}`
  sizes?: string
}

const Image = forwardRef<HTMLImageElement, ImageProps>(function Image(
  {
    src,
    alt,
    fill,
    priority: _priority,
    quality: _quality,
    width,
    height,
    style,
    ...props
  },
  ref,
) {
  const normalizedSrc = typeof src === 'string' ? src : src.src
  const fillStyle = fill
    ? {
        position: 'absolute' as const,
        inset: 0,
        width: '100%',
        height: '100%',
        objectFit: style?.objectFit ?? 'cover',
      }
    : undefined

  return (
    <img
      ref={ref}
      src={normalizedSrc}
      alt={alt}
      width={fill ? undefined : width}
      height={fill ? undefined : height}
      style={{ ...fillStyle, ...style }}
      {...props}
    />
  )
})

export default Image
