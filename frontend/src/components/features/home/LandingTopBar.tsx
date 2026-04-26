import { type LandingHomeCopy } from './landingHomePage.shared'
import { LandingTopBarActions } from './LandingTopBarActions'
import styles from './LandingHomePage.module.css'

export type LandingTopBarProps = {
  locale: string
  copy: LandingHomeCopy
}

export function LandingTopBar({
  locale,
  copy,
}: LandingTopBarProps) {
  return (
    <header className={`${styles.topBar} ${styles.topBarMenuOnly}`}>
      <LandingTopBarActions
        locale={locale}
        copy={copy}
      />
    </header>
  )
}
