// Fabrica las cookies de sesión del OS con @supabase/ssr (el MISMO formato que escribe el navegador)
// y mide el documento de cada ruta por HTTP puro: sin navegador, sin prefetch, sin JS.
// Lo que sale es lo que el servidor tarda en producir la pantalla — el número que el dueño siente.
import { createServerClient } from '@supabase/ssr'
import { readFileSync } from 'node:fs'

for (const l of readFileSync(new URL('../../.env.local', import.meta.url), 'utf8').split('\n')) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"([\s\S]*)"$/, '$1')
}
const BASE = process.env.PERF_BASE ?? 'http://127.0.0.1:3457'
const EMAIL = process.env.PERF_EMAIL ?? 'jorge.o.corona+direccion-test-1783513222134@gmail.com'
const PASS = process.env.PERF_PASS ?? 'TestPassword123!'

const jar = new Map()
const sb = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
  cookies: {
    getAll: () => [...jar].map(([name, value]) => ({ name, value })),
    setAll: (cs) => cs.forEach(({ name, value }) => jar.set(name, value)),
  },
})
const { error } = await sb.auth.signInWithPassword({ email: EMAIL, password: PASS })
if (error) { console.error('no pude entrar:', error.message); process.exit(1) }
const cookie = [...jar].map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('; ')

const RUTAS = (process.env.PERF_RUTAS ?? '/obras,/obras/gantt,/administracion/compras,/clientes,/administracion/personas,/administracion,/documentos').split(',')
const CALENTAR = Number(process.env.PERF_CALENTAR ?? 2)
const MEDIDAS = Number(process.env.PERF_MEDIDAS ?? 9)
const med = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]
const ventanas = []

for (const ruta of RUTAS) {
  const ms = []; let bytes = 0; let status = 0
  for (let i = 0; i < CALENTAR + MEDIDAS; i++) {
    const t0 = Date.now()
    const r = await fetch(BASE + ruta, { headers: { cookie }, redirect: 'manual' })
    const txt = await r.text()
    const t1 = Date.now()
    if (i >= CALENTAR) { ms.push(t1 - t0); bytes = txt.length; status = r.status; ventanas.push(`${ruta}\t${t0}\t${t1}`) }
  }
  console.log(`MEDIDA\t${ruta}\tstatus=${status}\tmediana=${med(ms)}\tmin=${Math.min(...ms)}\tmax=${Math.max(...ms)}\tkb=${Math.round(bytes/1024)}\ttodas=${ms.join(',')}`)
}
if (process.env.PERF_VENTANAS) (await import('node:fs')).writeFileSync(process.env.PERF_VENTANAS, ventanas.join('\n') + '\n')
