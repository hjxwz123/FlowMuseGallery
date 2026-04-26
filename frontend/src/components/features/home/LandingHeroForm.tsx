'use client'

import { useRef, useState, type FormEvent } from 'react'

import { useLandingHomePageShell } from './LandingHomePageShellClient'
import { buildCreateHref, type LandingHomeCopy } from './landingHomePage.shared'
import styles from './LandingHomePage.module.css'

type LandingHeroFormProps = {
  locale: string
  copy: LandingHomeCopy
}

export function LandingHeroForm({ locale, copy }: LandingHeroFormProps) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const { mode, navigateWithTransition, setMode } = useLandingHomePageShell()
  const [prompt, setPrompt] = useState('')
  const [isShaking, setIsShaking] = useState(false)

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!prompt.trim()) {
      setIsShaking(true)
      setTimeout(() => setIsShaking(false), 500)
      inputRef.current?.focus()
      return
    }

    navigateWithTransition(buildCreateHref(locale, mode, prompt))
  }

  return (
    <form
      action={`/${locale}/create`}
      method="get"
      className={styles.interactionArea}
      onSubmit={handleSubmit}
    >
      <input type="hidden" name="mode" value={mode} />

      <div className={styles.modeSwitcher} data-mode={mode}>
        <div className={styles.modeIndicator} />
        <button
          type="button"
          className={`${styles.modeButton} ${mode === 'image' ? styles.modeButtonActive : ''}`}
          onClick={() => setMode('image')}
        >
          <svg className={styles.modeButtonIcon} viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" stroke="currentColor" strokeWidth="2" />
            <circle cx="8.5" cy="8.5" r="1.5" fill="currentColor" />
            <path d="M21 15L16 10 5 21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {copy.imageMode}
        </button>
        <button
          type="button"
          className={`${styles.modeButton} ${mode === 'video' ? styles.modeButtonActive : ''}`}
          onClick={() => setMode('video')}
        >
          <svg className={styles.modeButtonIcon} viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <polygon points="23 7 16 12 23 17 23 7" fill="currentColor" />
            <rect x="1" y="5" width="15" height="14" rx="2" ry="2" stroke="currentColor" strokeWidth="2" />
          </svg>
          {copy.videoMode}
        </button>
      </div>

      <div className={`${styles.inputWrapper} ${isShaking ? styles.inputWrapperError : ''}`}>
        <input
          ref={inputRef}
          type="text"
          name="prompt"
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          className={styles.promptInput}
          placeholder={mode === 'image' ? copy.imagePlaceholder : copy.videoPlaceholder}
          autoComplete="off"
          spellCheck={false}
        />
        <button
          type="submit"
          className={styles.submitButton}
          aria-label={copy.enterCreate}
        >
          <svg viewBox="0 0 24 24" fill="none">
            <path d="M5 12h14" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
            <path d="M12 5l7 7-7 7" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
    </form>
  )
}
