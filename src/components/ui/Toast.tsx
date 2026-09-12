import { Toaster } from 'react-hot-toast'
import { useThemeStore } from '../../stores/themeStore'

export function AppToaster() {
  const { tema } = useThemeStore()

  return (
    <Toaster
      position="top-right"
      toastOptions={{
        duration: 3000,
        style: {
          borderRadius: '12px',
          padding: '12px 16px',
          fontSize: '14px',
          background: tema === 'dark' ? '#1f2937' : '#fff',
          color: tema === 'dark' ? '#f3f4f6' : '#111827',
          border: tema === 'dark' ? '1px solid #374151' : '1px solid #e5e7eb',
        },
        success: {
          iconTheme: {
            primary: '#10b981',
            secondary: '#fff',
          },
        },
        error: {
          iconTheme: {
            primary: '#ef4444',
            secondary: '#fff',
          },
          duration: 5000,
        },
      }}
    />
  )
}

