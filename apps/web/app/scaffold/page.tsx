import { useTranslations } from 'next-intl'

export default function ScaffoldPage() {
  const t = useTranslations('scaffold')

  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold mb-4">{t('title')}</h1>
      <p className="text-gray-600">{t('description')}</p>
    </div>
  )
}
