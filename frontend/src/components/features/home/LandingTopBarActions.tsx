'use client'

import { useMemo } from 'react'
import { Github } from 'lucide-react'

import { PERSONAL_GITHUB_URL } from '@/lib/utils/siteSettings'
import { useLandingHomePageShell } from './LandingHomePageShellClient'
import { type LandingHomeCopy } from './landingHomePage.shared'
import styles from './LandingHomePage.module.css'

type LandingTopBarActionsProps = {
  locale: string
  copy: LandingHomeCopy
}

export function LandingTopBarActions({
  locale,
  copy,
}: LandingTopBarActionsProps) {
  const { navigateWithTransition } = useLandingHomePageShell()

  const capsuleMenuItems = useMemo(
    () => [
      { key: 'quick', label: copy.quick, href: `/${locale}/create` },
      { key: 'workflow', label: copy.workflow, href: `/${locale}/chat` },
      { key: 'tasks', label: copy.tasks, href: `/${locale}/tasks` },
      { key: 'projects', label: copy.projects, href: `/${locale}/projects` },
    ],
    [copy.projects, copy.quick, copy.tasks, copy.workflow, locale],
  )

  return (
    <nav className={styles.capsuleMenu} aria-label={copy.workspace}>
      {capsuleMenuItems.map((item) => (
        <button
          key={item.key}
          type="button"
          className={styles.capsuleMenuItem}
          onClick={() => navigateWithTransition(item.href)}
        >
          {item.label}
        </button>
      ))}
      <a
        href={PERSONAL_GITHUB_URL}
        target="_blank"
        rel="noreferrer"
        className={`${styles.capsuleMenuItem} ${styles.capsuleMenuIconItem}`}
        aria-label="GitHub"
        title="GitHub"
      >
        <Github aria-hidden="true" />
      </a>
    </nav>
  )
}
