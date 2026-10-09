// @vitest-environment node
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(path, 'utf8')
describe('Recuperación segura de recursos desplegados', () => {
  it('no reescribe recursos estáticos a HTML', () => {
    const config = JSON.parse(read('vercel.json'))
    expect(config.rewrites).toBeUndefined()
    expect(config.routes).toContainEqual({ handle: 'filesystem' })
    expect(config.routes.some((route: { src?: string; status?: number }) => route.src === '/assets/.*' && route.status === 404)).toBe(true)
  })
  it('rechaza HTML para scripts antes de almacenar o devolver la respuesta', () => {
    const sw = read('public/sw.js')
    expect(sw).toContain('isValidAssetResponse')
    expect(sw).toContain("request.destination === 'script'")
    expect(sw).toContain("status: 502")
  })
  it('no fuerza recargas desde errores de módulos ni cambios de controlador', () => {
    expect(read('src/App.tsx')).not.toContain('window.location.reload()')
    expect(read('src/main.tsx')).not.toContain('window.location.reload()')
    expect(read('index.html')).not.toContain('window.location.reload()')
    expect(read('src/components/ui/ErrorBoundary.tsx')).not.toContain('sessionStorage')
  })
  it('muestra recuperación inicial aunque Vite quite el id del script', () => {
    const html = read('index.html')
    const script = html.match(/<script>\s*(\/\/ Funciona incluso[\s\S]*?)<\/script>/)?.[1]
    expect(script).toBeTruthy()
    let handler: (event: unknown) => void = () => {}
    const panel = { append: () => {}, style: { cssText: '' }, textContent: '' }
    const root = { childElementCount: 0, append: () => { root.childElementCount++ } }
    runInNewContext(script!, {
      window: { addEventListener: (_: string, fn: typeof handler) => { handler = fn } },
      document: { getElementById: () => root, createElement: () => ({ ...panel }) },
    })
    handler({ target: { tagName: 'SCRIPT', type: 'module' } })
    expect(root.childElementCount).toBe(1)
    handler({ target: { tagName: 'IMG' } })
    expect(root.childElementCount).toBe(1)
  })
})
