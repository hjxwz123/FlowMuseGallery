import { forwardRef, type AnchorHTMLAttributes, type MouseEvent } from 'react'
import { useRouter } from '@/lib/router'

type LinkHref = string | URL

type LinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & {
  href: LinkHref
  replace?: boolean
  scroll?: boolean
  prefetch?: boolean
  locale?: string | false
}

function normalizeHref(href: LinkHref) {
  return href instanceof URL ? href.toString() : href
}

function shouldHandleClientSide(event: MouseEvent<HTMLAnchorElement>, href: string) {
  if (event.defaultPrevented) return false
  if (event.button !== 0) return false
  if (event.metaKey || event.altKey || event.ctrlKey || event.shiftKey) return false

  const target = event.currentTarget.getAttribute('target')
  if (target && target !== '_self') return false
  if (/^(mailto:|tel:|blob:|data:)/i.test(href)) return false

  const url = new URL(href, window.location.href)
  return url.origin === window.location.origin
}

const Link = forwardRef<HTMLAnchorElement, LinkProps>(function Link(
  {
    href,
    replace = false,
    scroll = true,
    prefetch: _prefetch,
    locale: _locale,
    onClick,
    ...props
  },
  ref,
) {
  const router = useRouter()
  const normalizedHref = normalizeHref(href)

  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event)

    if (!shouldHandleClientSide(event, normalizedHref)) return

    event.preventDefault()
    if (replace) {
      router.replace(normalizedHref, { scroll })
    } else {
      router.push(normalizedHref, { scroll })
    }
  }

  return <a ref={ref} href={normalizedHref} onClick={handleClick} {...props} />
})

export default Link
