import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from 'react'
import { defaultLocale, type Locale } from './locales'
import { messagesByLocale, type Messages } from './messages'

type TranslationValues = Record<string, string | number | boolean | null | undefined>

type I18nContextValue = {
  locale: Locale
  messages: Messages
}

const I18nContext = createContext<I18nContextValue>({
  locale: defaultLocale,
  messages: messagesByLocale[defaultLocale],
})

function readPath(source: unknown, path: string) {
  if (!path) return source

  return path.split('.').reduce<unknown>((current, segment) => {
    if (typeof current !== 'object' || current === null || Array.isArray(current)) {
      return undefined
    }

    return (current as Record<string, unknown>)[segment]
  }, source)
}

function interpolate(template: string, values?: TranslationValues) {
  if (!values) return template

  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    const value = values[key]
    return value === null || value === undefined ? match : String(value)
  })
}

export function I18nProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      messages: messagesByLocale[locale] ?? messagesByLocale[defaultLocale],
    }),
    [locale],
  )

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useLocale() {
  return useContext(I18nContext).locale
}

export function useMessages() {
  return useContext(I18nContext).messages
}

export function useTranslations(namespace = '') {
  const { messages } = useContext(I18nContext)

  return useCallback(
    (key: string, values?: TranslationValues) => {
      const fullKey = namespace ? `${namespace}.${key}` : key
      const value = readPath(messages, fullKey)

      if (typeof value === 'string') {
        return interpolate(value, values)
      }

      if (typeof value === 'number' || typeof value === 'boolean') {
        return String(value)
      }

      return fullKey
    },
    [messages, namespace],
  )
}
