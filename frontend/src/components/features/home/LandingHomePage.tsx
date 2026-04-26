import { LandingHeroForm } from './LandingHeroForm'
import { LandingHomePageShellClient } from './LandingHomePageShellClient'
import { LandingTopBarClient } from './LandingTopBarClient'
import {
  HOME_HERO_IMAGE_BACKGROUNDS,
  HOME_HERO_VIDEO_BACKGROUND,
  getLandingHomeCopy,
} from './landingHomePage.shared'
import styles from './LandingHomePage.module.css'
import type { ApiTask } from '@/lib/api/types'

export type LandingHomePageProps = {
  locale: string
  heroTasks: ApiTask[]
}

export function LandingHomePage({
  locale,
  heroTasks,
}: LandingHomePageProps) {
  const copy = getLandingHomeCopy(locale)
  const userImageUrls = heroTasks
    .filter((item) => item.type === 'image' && item.status === 'completed')
    .map((item) => item.resultUrl || item.thumbnailUrl || '')
    .filter(Boolean)
  const userVideoUrls = heroTasks
    .filter((item) => item.type === 'video' && item.status === 'completed')
    .map((item) => item.resultUrl || '')
    .filter(Boolean)
  const backgroundImages = userImageUrls.length > 0
    ? userImageUrls
    : HOME_HERO_IMAGE_BACKGROUNDS.filter((item) => item.trim().length > 0)
  const backgroundVideos = userVideoUrls.length > 0
    ? userVideoUrls
    : [HOME_HERO_VIDEO_BACKGROUND].filter((item) => item.trim().length > 0)

  return (
    <LandingHomePageShellClient
      backgroundImages={backgroundImages}
      backgroundVideos={backgroundVideos}
    >
      <LandingTopBarClient
        locale={locale}
        copy={copy}
      />

      <section className={styles.heroSection}>
        <div id="landing-hero-content" className={styles.heroContent}>
          <div className={styles.textContent}>
            <h1 className={styles.headline} data-text={copy.title}>
              {copy.title}
            </h1>
            <p className={styles.subHeadline}>{copy.subtitle}</p>
          </div>

          <LandingHeroForm locale={locale} copy={copy} />
        </div>
      </section>
    </LandingHomePageShellClient>
  )
}
