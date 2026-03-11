// Thin layer: only imports and exports feature component
'use client'

import { useTranslations } from 'next-intl'
import { TokenDashboard } from '@/features/token-usage/ui'

export default function TokenUsagePage() {
  const t = useTranslations('tokenUsage')

  return (
    <TokenDashboard
      texts={{
        title: t('title'),
        today: t('today'),
        week: t('week'),
        month: t('month'),
        total: t('total'),
        comingSoon: t('comingSoon'),
      }}
    />
  )
}
