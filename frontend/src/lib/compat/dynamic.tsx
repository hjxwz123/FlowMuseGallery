import { lazy, Suspense, type ComponentType } from 'react'

type DynamicOptions<P extends object> = {
  loading?: ComponentType<P>
  ssr?: boolean
}

type LoaderResult<P extends object> = ComponentType<P> | { default: ComponentType<P> }

export default function dynamic<P extends object>(
  loader: () => Promise<LoaderResult<P>>,
  options: DynamicOptions<P> = {},
) {
  const LazyComponent = lazy(async () => {
    const mod = await loader()
    if (typeof mod === 'function') {
      return { default: mod }
    }
    return mod
  })

  return function DynamicComponent(props: P) {
    const Loading = options.loading

    return (
      <Suspense fallback={Loading ? <Loading {...props} /> : null}>
        <LazyComponent {...props} />
      </Suspense>
    )
  }
}
