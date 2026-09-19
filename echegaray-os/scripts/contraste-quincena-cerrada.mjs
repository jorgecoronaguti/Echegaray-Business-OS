#!/usr/bin/env node
// CONTRASTE FILA POR FILA: lo que la pantalla MUESTRA de una quincena cerrada contra `liquidacion_linea`.
//
// ═══ PARA QUÉ EXISTE (auditoría del 17/09/2026) ═══
//
// Una quincena cerrada es el registro de lo que se pagó. La pantalla la dibujaba RECOMPONIÉNDOLA —horas de
// `registros_hh` vivo, $/h de `persona_tarifa`— y en 45 de 324 líneas cerradas eso no coincide con lo guardado:
// Bazán Juan (16–31/03/2026) mostraba $4.000/h contra $4.300 guardados, y a Agüero (1ª de junio) le fabricaba un
// saldo de −$378.000 sobre una línea que dice cobra $469.800 y pagado $0.
//
// Un test puro prueba que el CÓDIGO prefiere la línea guardada (`selloDeLaQuincenaCerrada.test.ts`). Esto prueba
// el EFECTO: abre la pantalla real con sesión, lee el DOM y lo compara contra Postgres. No entra en la suite
// porque necesita red y credenciales, y la red no puede ser un control que corra en cada edición.
//
//   node scripts/contraste-quincena-cerrada.mjs <url-base> <dia-de-la-quincena>
//   node scripts/contraste-quincena-cerrada.mjs http://127.0.0.1:3479 2026-06-10
//
// Sale 0 si toda fila mostrada coincide con su línea guardada, 1 si alguna difiere. Lo que NO tiene línea
// guardada se lista aparte: no es una diferencia, es una ausencia, y la pantalla la declara como reconstruida.

import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const BASE = process.argv[2] ?? 'http://127.0.0.1:3000'
const DIA = process.argv[3] ?? '2026-06-10'
const EMAIL = process.env.QA_EMAIL ?? 'jorge.o.corona+direccion-test-1783513222134@gmail.com'
const PASS = process.env.QA_PASSWORD ?? 'TestPassword123!'

/** El `.env.local` del proyecto, sin dependencias: sólo `CLAVE="valor"` por renglón. */
function entorno(ruta) {
  const out = {}
  for (const linea of readFileSync(ruta, 'utf8').split('\n')) {
    const k = linea.indexOf('=')
    if (k < 1 || linea.trimStart().startsWith('#')) continue
    out[linea.slice(0, k).trim()] = linea.slice(k + 1).trim().replace(/^['"]|['"]$/g, '')
  }
  return out
}

/** «$230.240,12» → 230240.12. `null` cuando la celda no dice un número. */
const aNumero = (texto) => {
  if (texto == null) return null
  const limpio = String(texto).replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.')
  const n = Number(limpio)
  return limpio !== '' && Number.isFinite(n) ? n : null
}

const env = entorno(new URL('../.env.local', import.meta.url).pathname)
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

// ─── 1 · EL REGISTRO ──────────────────────────────────────────────────────────────────────────
const { data: cuadros, error: eq } = await sb.from('liquidacion_quincena')
  .select('id, grupo, desde, hasta, estado').lte('desde', DIA).gte('hasta', DIA)
if (eq) throw new Error(`liquidacion_quincena: ${eq.message}`)
const cerrados = (cuadros ?? []).filter((c) => c.estado === 'cerrada')
if (cerrados.length === 0) throw new Error(`No hay cuadro CERRADO que contenga ${DIA}. Este contraste sólo aplica a una cerrada.`)

const { data: lineas, error: el } = await sb.from('liquidacion_linea')
  .select('liquidacion_id, persona_id, horas, valor_hora, cobra, adelanto, ya_transferido, por_banco, en_efectivo, total')
  .in('liquidacion_id', cerrados.map((c) => c.id))
if (el) throw new Error(`liquidacion_linea: ${el.message}`)
const guardadas = new Map((lineas ?? []).map((l) => [l.persona_id, l]))

// ─── 2 · LO QUE MUESTRA LA PANTALLA ───────────────────────────────────────────────────────────
const navegador = await chromium.launch()
const ctx = await navegador.newContext({ viewport: { width: 1600, height: 1200 } })
const page = await ctx.newPage()
await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 180000 })
await page.fill('input[name="email"]', EMAIL)
await page.fill('input[name="password"]', PASS)
await page.click('button[type="submit"]')
await page.waitForURL(/\/(obras|clientes|flujo-caja|administracion)/, { timeout: 60000 })
await page.goto(`${BASE}/administracion/personas?vista=liquidacion&quincena=${DIA}`, { waitUntil: 'domcontentloaded', timeout: 120000 })
await page.waitForSelector('[data-testid^="espejo-fila-"]', { timeout: 60000 })
await page.waitForTimeout(8000)

const mostrado = await page.evaluate(() => [...document.querySelectorAll('[data-testid^="espejo-fila-"]')].map((f) => {
  const id = f.getAttribute('data-testid').replace('espejo-fila-', '')
  const t = (sel) => f.querySelector(sel)?.textContent?.trim() ?? null
  return {
    personaId: id,
    tipo: f.getAttribute('data-tipo'),
    nombre: t(`[data-testid="espejo-nombre-${id}"]`),
    horas: t(`[data-testid="espejo-hs-pagas-${id}"]`),
    valorHora: t(`[data-testid="hora-categoria-${id}"]`),
    cobra: t(`[data-testid="total-${id}"]`),
    cobro: t(`[data-testid="cobro-${id}"]`),
    origen: f.querySelector(`[data-testid="cobro-${id}"]`)?.getAttribute('data-origen') ?? null,
  }
}))
await navegador.close()

// ─── 3 · EL CONTRASTE ─────────────────────────────────────────────────────────────────────────
//
// EL CUADRO DE MENSUALES NO TIENE COLUMNA DE HORAS NI DE $/H, y no es un olvido: un jefe de obra cobra por mes
// (dueño, 17/09/2026 — «quince columnas de horas que no mueven un peso se leían como dato de pago»). El sello SÍ
// guarda `horas` y `valor_hora` para ellos, así que esas dos cifras existen y no se muestran en ninguna parte.
// Eso se lista aparte como HUECO DECLARADO: no es que la pantalla diga otro número, es que no dice ninguno.
const CAMPOS = [['horas', 'horas'], ['valorHora', 'valor_hora'], ['cobra', 'cobra']]
const SOLO_JORNALERO = new Set(['horas', 'valorHora'])
const difieren = []
const sinRegistro = []
const huecos = []
for (const fila of mostrado) {
  const g = guardadas.get(fila.personaId)
  if (!g) { sinRegistro.push(fila); continue }
  for (const [enPantalla, enLaBase] of CAMPOS) {
    if (fila.tipo === 'mensual' && SOLO_JORNALERO.has(enPantalla)) {
      if (g[enLaBase] != null) huecos.push({ nombre: fila.nombre, campo: enPantalla, guardado: Number(g[enLaBase]) })
      continue
    }
    const visto = aNumero(fila[enPantalla])
    const guardado = g[enLaBase] == null ? null : Number(g[enLaBase])
    if (guardado == null) continue
    // UN «—» NO ES UN CERO: se cuenta como diferencia, que es exactamente el defecto que se está buscando.
    if (visto == null || Math.abs(visto - guardado) > 0.01) {
      difieren.push({ nombre: fila.nombre, campo: enPantalla, pantalla: fila[enPantalla], guardado })
    }
  }
}

const ok = (s) => `\x1b[32m${s}\x1b[0m`
const mal = (s) => `\x1b[31m${s}\x1b[0m`
console.log(`Quincena ${cerrados[0].desde} → ${cerrados[0].hasta} · ${cerrados.map((c) => c.grupo).join(' + ')} · CERRADA`)
console.log(`Filas en pantalla: ${mostrado.length} · líneas guardadas: ${guardadas.size}`)
for (const f of mostrado) {
  const g = guardadas.get(f.personaId)
  const marca = !g ? '?' : difieren.some((d) => d.nombre === f.nombre) ? mal('✗') : ok('✓')
  console.log(` ${marca} ${String(f.nombre).padEnd(34)} pantalla h=${String(f.horas).padStart(7)} $/h=${String(f.valorHora).padStart(9)} cobra=${String(f.cobra).padStart(12)}`
    + (g ? `  │ guardado h=${String(g.horas).padStart(7)} $/h=${String(g.valor_hora).padStart(7)} cobra=${String(g.cobra).padStart(10)}` : '  │ SIN LÍNEA GUARDADA')
    + (f.origen ? `  [${f.origen}]` : ''))
}
if (huecos.length > 0) {
  console.log(`\nHuecos declarados — el cuadro de mensuales no tiene esa columna (${huecos.length}):`)
  for (const h of huecos) console.log(`  ${h.nombre} · ${h.campo} guardado ${h.guardado}: sellado y no mostrado`)
}
if (sinRegistro.length > 0) {
  console.log(`\nSin línea guardada (${sinRegistro.length}): ${sinRegistro.map((f) => f.nombre).join(', ')}`)
  console.log('  No es una diferencia: es una ausencia, y la pantalla la declara reconstruida.')
}
if (difieren.length > 0) {
  console.log(mal(`\nDIFIEREN ${difieren.length} celdas:`))
  for (const d of difieren) console.log(mal(`  ${d.nombre} · ${d.campo}: pantalla «${d.pantalla}» vs guardado ${d.guardado}`))
  process.exit(1)
}
console.log(ok('\nToda fila mostrada coincide con su línea guardada.'))
