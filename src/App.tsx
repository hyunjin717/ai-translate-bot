import { TranslatePopup } from './components/TranslatePopup'
import { HistoryWindow } from './components/HistoryWindow'
import { SettingsWindow } from './components/SettingsWindow'
import { OnboardingWindow } from './components/OnboardingWindow'

export default function App() {
  const hash = window.location.hash

  if (hash === '#/history') return <HistoryWindow />
  if (hash === '#/settings') return <SettingsWindow />
  if (hash === '#/onboarding') return <OnboardingWindow />

  return <TranslatePopup />
}
