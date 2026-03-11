import { SettingsPage } from '@/features/settings/ui/SettingsPage'

export default function SettingsPageRoute() {
  return (
    <div className="-m-4 h-[calc(100dvh-var(--top-nav-height,2.5rem))] overflow-hidden md:-m-8">
      <SettingsPage />
    </div>
  )
}
