'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react'
import { useRouter } from '@/lib/router'

import { HOME_NAV_TRANSITION_MS, type LandingMode } from './landingHomePage.shared'
import styles from './LandingHomePage.module.css'

type LandingHomePageShellContextValue = {
  isTransitioning: boolean
  mode: LandingMode
  navigateWithTransition: (href: string) => void
  setMode: Dispatch<SetStateAction<LandingMode>>
}

const LandingHomePageShellContext = createContext<LandingHomePageShellContextValue | null>(null)

type LandingHomePageShellClientProps = {
  backgroundImages: string[]
  backgroundVideos: string[]
  children: ReactNode
}

export function LandingHomePageShellClient({
  backgroundImages,
  backgroundVideos,
  children,
}: LandingHomePageShellClientProps) {
  const router = useRouter()
  const backgroundVideoRef = useRef<HTMLVideoElement | null>(null)
  const backgroundParallaxRef = useRef<HTMLDivElement | null>(null)
  const heroContentRef = useRef<HTMLElement | null>(null)
  const [mode, setMode] = useState<LandingMode>('image')
  const [isTransitioning, setIsTransitioning] = useState(false)
  const [currentBackgroundIndex, setCurrentBackgroundIndex] = useState(0)
  const [currentVideoIndex, setCurrentVideoIndex] = useState(0)
  const [activeBackgroundLayer, setActiveBackgroundLayer] = useState<'primary' | 'secondary'>('primary')
  const [primaryBackgroundSrc, setPrimaryBackgroundSrc] = useState(() => backgroundImages[0] || '')
  const [secondaryBackgroundSrc, setSecondaryBackgroundSrc] = useState(
    () => backgroundImages[1] || backgroundImages[0] || ''
  )

  const backgroundVideo = backgroundVideos[currentVideoIndex] || ''
  const hasBackgroundVideo = backgroundVideo.length > 0

  useEffect(() => {
    const firstBackgroundImage = backgroundImages[0] || ''
    const secondBackgroundImage = backgroundImages[1] || firstBackgroundImage

    setCurrentBackgroundIndex(0)
    setActiveBackgroundLayer('primary')
    setPrimaryBackgroundSrc(firstBackgroundImage)
    setSecondaryBackgroundSrc(secondBackgroundImage)
  }, [backgroundImages])

  useEffect(() => {
    setCurrentVideoIndex(0)
  }, [backgroundVideos])

  useEffect(() => {
    if (backgroundImages.length <= 1) return

    const nextBackgroundIndex = (currentBackgroundIndex + 1) % backgroundImages.length
    const nextBackgroundSrc = backgroundImages[nextBackgroundIndex]
    const preloadedImage = new Image()
    preloadedImage.src = nextBackgroundSrc

    if (activeBackgroundLayer === 'primary') {
      if (secondaryBackgroundSrc !== nextBackgroundSrc) {
        setSecondaryBackgroundSrc(nextBackgroundSrc)
      }
    } else if (primaryBackgroundSrc !== nextBackgroundSrc) {
      setPrimaryBackgroundSrc(nextBackgroundSrc)
    }
  }, [
    activeBackgroundLayer,
    backgroundImages,
    currentBackgroundIndex,
    primaryBackgroundSrc,
    secondaryBackgroundSrc,
  ])

  useEffect(() => {
    if (mode !== 'image' || backgroundImages.length <= 1) return

    const timer = window.setInterval(() => {
      const nextBackgroundIndex = (currentBackgroundIndex + 1) % backgroundImages.length
      setActiveBackgroundLayer((prev) => (prev === 'primary' ? 'secondary' : 'primary'))
      setCurrentBackgroundIndex(nextBackgroundIndex)
    }, 8000)

    return () => window.clearInterval(timer)
  }, [backgroundImages.length, currentBackgroundIndex, mode])

  useEffect(() => {
    if (mode !== 'video' || backgroundVideos.length <= 1) return

    const timer = window.setInterval(() => {
      setCurrentVideoIndex((prev) => (prev + 1) % backgroundVideos.length)
    }, 12000)

    return () => window.clearInterval(timer)
  }, [backgroundVideos.length, mode])

  useEffect(() => {
    const video = backgroundVideoRef.current
    if (!video) return

    if (mode !== 'video' || !hasBackgroundVideo) {
      video.pause()
      return
    }

    video.currentTime = 0
    const playPromise = video.play()
    if (playPromise && typeof playPromise.catch === 'function') {
      playPromise.catch(() => {})
    }
  }, [hasBackgroundVideo, mode])

  useEffect(() => {
    heroContentRef.current = document.getElementById('landing-hero-content')
    let ticking = false
    let cachedViewportHeight = window.innerHeight
    const backgroundParallax = backgroundParallaxRef.current
    const heroContent = heroContentRef.current

    const handleResize = () => {
      cachedViewportHeight = window.innerHeight
      handleScroll()
    }

    const handleScroll = () => {
      if (ticking) return
      ticking = true

      window.requestAnimationFrame(() => {
        const scrollY = window.scrollY

        if (heroContent || backgroundParallax) {
          const clampedScrollY = Math.min(scrollY, cachedViewportHeight)
          const progress = clampedScrollY / cachedViewportHeight

          if (backgroundParallax) {
            const backgroundShift = -(clampedScrollY * 0.08)
            backgroundParallax.style.transform = `translate3d(0, ${backgroundShift.toFixed(2)}px, 0)`
          }

          if (heroContent) {
            const opacity = Math.max(0, 1 - progress * 1.45)
            const translateY = clampedScrollY * 0.44
            const scale = 1 - progress * 0.065
            heroContent.style.opacity = opacity.toFixed(3)
            heroContent.style.transform = `translate3d(0, ${translateY.toFixed(2)}px, 0) scale(${scale.toFixed(4)})`
          }
        }

        ticking = false
      })
    }

    if (backgroundParallax) {
      backgroundParallax.style.willChange = 'transform'
      handleScroll()
    }

    if (heroContent) {
      heroContent.style.willChange = 'transform, opacity'
      handleScroll()
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    window.addEventListener('resize', handleResize, { passive: true })

    return () => {
      window.removeEventListener('scroll', handleScroll)
      window.removeEventListener('resize', handleResize)
      if (heroContent) {
        heroContent.style.willChange = ''
        heroContent.style.opacity = ''
        heroContent.style.transform = ''
      }
      if (backgroundParallax) {
        backgroundParallax.style.willChange = ''
        backgroundParallax.style.transform = ''
      }
    }
  }, [])

  const navigateWithTransition = useCallback((href: string) => {
    if (isTransitioning) return

    setIsTransitioning(true)
    window.setTimeout(() => {
      router.push(href)
    }, HOME_NAV_TRANSITION_MS)
  }, [isTransitioning, router])

  const contextValue = useMemo<LandingHomePageShellContextValue>(() => ({
    isTransitioning,
    mode,
    navigateWithTransition,
    setMode,
  }), [isTransitioning, mode, navigateWithTransition])

  return (
    <LandingHomePageShellContext.Provider value={contextValue}>
      <div className={styles.page}>
        <div className={`${styles.transitionOverlay} ${isTransitioning ? styles.transitionOverlayActive : ''}`}>
          <div className={styles.transitionLoader} aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
        </div>

        <div
          className={`${styles.backgroundSystem} ${isTransitioning ? styles.backgroundSystemExit : ''}`}
          aria-hidden="true"
        >
          <div ref={backgroundParallaxRef} className={styles.backgroundParallax}>
            <div
              className={`${styles.bgLayer} ${((mode === 'image') || (mode === 'video' && !hasBackgroundVideo)) && backgroundImages.length > 0 ? styles.bgLayerActive : ''}`}
            >
              {primaryBackgroundSrc ? (
                <img
                  key="primary-layer"
                  src={primaryBackgroundSrc}
                  alt=""
                  className={`${styles.carouselImage} ${activeBackgroundLayer === 'primary' ? styles.carouselImageActive : ''}`}
                  loading="eager"
                  fetchPriority={activeBackgroundLayer === 'primary' ? 'high' : 'low'}
                  decoding="async"
                />
              ) : null}

              {secondaryBackgroundSrc ? (
                <img
                  key="secondary-layer"
                  src={secondaryBackgroundSrc}
                  alt=""
                  className={`${styles.carouselImage} ${activeBackgroundLayer === 'secondary' ? styles.carouselImageActive : ''}`}
                  loading="eager"
                  fetchPriority={activeBackgroundLayer === 'secondary' ? 'high' : 'low'}
                  decoding="async"
                />
              ) : null}
            </div>

            {hasBackgroundVideo ? (
              <video
                ref={backgroundVideoRef}
                key={backgroundVideo}
                className={`${styles.bgLayer} ${styles.videoLayer} ${mode === 'video' ? styles.bgLayerActive : ''}`}
                src={backgroundVideo}
                muted
                loop={backgroundVideos.length <= 1}
                playsInline
                autoPlay
                preload="auto"
                onEnded={() => {
                  if (backgroundVideos.length > 1) {
                    setCurrentVideoIndex((prev) => (prev + 1) % backgroundVideos.length)
                  }
                }}
              />
            ) : null}
          </div>

          <div className={styles.noiseOverlay} />
          <div className={styles.vignette} />
        </div>

        <main className={`${styles.mainWrapper} ${isTransitioning ? styles.mainWrapperExit : ''}`}>
          {children}
        </main>
      </div>
    </LandingHomePageShellContext.Provider>
  )
}

export function useLandingHomePageShell() {
  const context = useContext(LandingHomePageShellContext)

  if (!context) {
    throw new Error('useLandingHomePageShell must be used within LandingHomePageShellClient')
  }

  return context
}
