// @vitest-environment node
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { describe, expect, it, vi } from 'vitest'

function worker(network: () => Promise<Response>, cached?: Response) {
  const listeners: Record<string, (event: unknown) => void> = {}
  const put = vi.fn()
  const context = {
    self: { location: { origin: 'https://pos.test' }, addEventListener: (name: string, fn: (event: unknown) => void) => { listeners[name] = fn }, skipWaiting: vi.fn(), clients: { claim: vi.fn() } },
    caches: { open: async () => ({ put }), match: async () => cached },
    fetch: network, URL, Response,
  }
  runInNewContext(readFileSync('public/sw.js', 'utf8'), context)
  async function request(url = 'https://pos.test/assets/chunk.js') {
    let result: Promise<Response> | undefined
    const tasks: Promise<unknown>[] = []
    listeners.fetch({ request: { url, method: 'GET', destination: 'script' }, respondWith: (value: Promise<Response>) => { result = value }, waitUntil: (task: Promise<unknown>) => tasks.push(task) })
    const response = await result
    await Promise.all(tasks)
    return response
  }
  return { request, put }
}

describe('Service Worker: integridad de módulos', () => {
  it('rechaza HTML con estado 200 y no lo almacena', async () => {
    const sw = worker(async () => new Response('<html/>', { headers: { 'Content-Type': 'text/html' } }))
    expect((await sw.request())?.status).toBe(502)
    expect(sw.put).not.toHaveBeenCalled()
  })
  it('acepta y guarda JavaScript con charset', async () => {
    const sw = worker(async () => new Response('export {}', { headers: { 'Content-Type': 'text/javascript; charset=utf-8' } }))
    expect((await sw.request())?.status).toBe(200)
    expect(sw.put).toHaveBeenCalledOnce()
  })
  it('no devuelve HTML en caché durante una caída de red', async () => {
    const sw = worker(async () => { throw new Error('offline') }, new Response('<html/>', { headers: { 'Content-Type': 'text/html' } }))
    expect((await sw.request())?.status).toBe(503)
  })
  it('permite usar JavaScript válido en caché sin conexión', async () => {
    const sw = worker(async () => { throw new Error('offline') }, new Response('export {}', { headers: { 'Content-Type': 'application/javascript' } }))
    expect((await sw.request())?.status).toBe(200)
  })
  it('no intercepta recursos externos', async () => {
    const network = vi.fn()
    const sw = worker(network)
    expect(await sw.request('https://other.test/file.js')).toBeUndefined()
    expect(network).not.toHaveBeenCalled()
  })
})
