import React from 'react'
import ReactDOM from 'react-dom/client'
import { MainLayout } from './components/MainLayout'
import { HomePage } from './components/HomePage'
import { Settings } from './components/Settings'
import { useAppStore } from './stores/appStore'
import './i18n'
import './styles/globals.css'

const config = {
  ...useAppStore.getState().config,
  stt_provider: 'groq-whisper' as const,
  llm_provider: 'gemini' as const,
  llm_model: 'gemini-3.5-flash-lite',
  llm_base_url: 'https://generativelanguage.googleapis.com/v1beta/openai',
  hotkey: 'Alt+/',
  theme: 'light' as const,
}

useAppStore.setState({ config, savedConfig: config, configLoaded: true })

const settings = new URLSearchParams(window.location.search).get('page') === 'settings'
window.location.hash = settings ? '#/settings/ai' : '#/'

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <MainLayout>{settings ? <Settings /> : <HomePage />}</MainLayout>
  </React.StrictMode>,
)
