import { useState } from 'react'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { useAuthStore } from '../../stores/authStore'

export function LoginScreen() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const { login, cargando, error } = useAuthStore()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await login(email, password)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-indigo-600 mb-2">🏪</h1>
          <h2 className="text-2xl font-bold text-gray-900">KioskoPOS</h2>
          <p className="text-gray-500 mt-1">Sistema de Ventas</p>
        </div>

        {/* Formulario */}
        <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="space-y-4">
            <Input
              label="Email"
              type="email"
              placeholder="tu@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
            <Input
              label="Contraseña"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </div>

          {error && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          <Button
            type="submit"
            fullWidth
            size="lg"
            loading={cargando}
            className="mt-6"
          >
            Ingresar
          </Button>
        </form>

        <p className="text-center text-xs text-gray-400 mt-6">
          KioskoPOS v1.0 · Sistema de gestión de kioscos
        </p>
      </div>
    </div>
  )
}
