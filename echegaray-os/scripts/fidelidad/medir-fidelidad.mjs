#!/usr/bin/env node
// MEDIDOR DE FIDELIDAD DISEÑO → PRODUCCIÓN. Determinístico: CERO llamadas a un LLM (ni Anthropic ni
// ningún otro). Compara, para cada pantalla listada en `pantallas.json`, el marco del diseño
// (docs/diseno/erp-obras/*.dc.html) contra la ruta real en producción, texto por texto, y calcula un
// puntaje 0–100 con una fórmula fija (ver PUNTAJE más abajo). SÓLO LEE producción: nunca hace click,
// fill ni ninguna acción que escriba.
//
//   ecos browser -- env LD_LIBRARY_PATH=/home/jorge/.local/pw-libs/root/usr/lib/x86_64-linux-gnu \
//     node scripts/fidelidad/medir-fidelidad.mjs --base https://app.ecsas.com.ar [--pantallas 05,M07]
//
// Salida: un JSON por pantalla en scripts/fidelidad/out/<code>.json, un resumen Markdown de a lo sumo
// 40 líneas en scripts/fidelidad/out/resumen.md, y exit 1 si alguna pantalla quedó por debajo de su
// `umbral` en pantallas.json.
//
// ═══ PUNTAJE (0–100), FÓRMULA FIJA Y DOCUMENTADA ═══
//
// N = cantidad de textos del diseño considerados (iguales + con diferencia de estilo + ausentes en
// producción), sin duplicados por texto normalizado. Si N=0 (pantalla sin texto comparable) el
// puntaje es 100 y se marca `sinDatos: true` en el JSON — no hay nada que penalizar, pero tampoco se
// probó nada.
//
// Por cada texto con diferencia de estilo se suma una penalización con estos pesos por propiedad
// (capada en 6 por texto, para que un solo elemento catastrófico no arrastre todo el puntaje):
//   tamaño de fuente (fs) = 3 · peso (fw) = 2 · color (c) = 2 · familia (ff) = 2
//   mayúsculas/transform (tt) = 1 · fondo (bg) = 1 · alto de caja (h, sólo controles) = 1
// Cada texto del diseño AUSENTE en producción penaliza 4 (fijo).
// avgPenal = (Σ penalización por texto) / N
// Los textos SÓLO EN PRODUCCIÓN (no estaban en el diseño) no achican N —no son un texto del diseño
// que falló— pero sí penalizan aparte, señal de deriva/ruido: min(extra, 20) × 0.3, capado en 6.
//
// puntaje = round( clamp( 100 − avgPenal×10 − extraPenal , 0 , 100 ) )
//
// Un puntaje de 100 exige CERO diferencias de estilo, CERO textos ausentes y CERO textos extra: es
// intencionalmente estricto. El umbral de cada pantalla en pantallas.json es el piso de NO
// REGRESIÓN, no un ideal.
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { chromium, devices, cookiesDeSesion, BASE as BASE_DEFAULT, DISENO_DIR } from './lib.mjs'
import { digestFn } from './digest.mjs'

const HERE = path.dirname(new URL(import.meta.url).pathname)
const OUT_DIR = path.join(HERE, 'out')

const arg = (n, def) => {
  const m = process.argv.find((a) => a.startsWith(`--${n}=`))
  if (m) return m.slice(n.length + 3)
  const i = process.argv.indexOf(`--${n}`)
  if (i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')) return process.argv[i + 1]
  return def
}

const BASE = arg('base', BASE_DEFAULT)
const EMAIL = arg('email', 'jorge@ecsas.com.ar')
const SOLO = (arg('pantallas', '') || '').split(',').map((s) => s.trim()).filter(Boolean)

// ═══ NORMALIZACIÓN Y ESTILO — misma técnica que comparar.mjs de la auditoría independiente ═══
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9%$]+/g, ' ').trim()
const hex = (c) => {
  const m = String(c || '').match(/\d+(\.\d+)?/g)
  if (!m) return c
  const [r, g, b, a] = m.map(Number)
  return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase()
    + (a !== undefined && a < 1 ? `@${a}` : '')
}

const PESOS = { fs: 3, fw: 2, c: 2, ff: 2, tt: 1, bg: 1, h: 1 }
const TOPE_POR_TEXTO = 6
const PENAL_FALTA = 4

function diferenciasDe(d, p) {
  const props = []
  if (d.fs !== p.fs) props.push({ k: 'fs', de: d.fs, a: p.fs })
  if (d.fw !== p.fw) props.push({ k: 'fw', de: d.fw, a: p.fw })
  if (hex(d.c) !== hex(p.c)) props.push({ k: 'c', de: hex(d.c), a: hex(p.c) })
  if ((d.tt || '') !== (p.tt || '')) props.push({ k: 'tt', de: d.tt || 'none', a: p.tt || 'none' })
  const famD = (d.ff || '').split(' ')[0]; const famP = (p.ff || '').split(' ')[0]
  if (famD !== famP && !(d.ff?.includes('Mono') === p.ff?.includes('Mono'))) props.push({ k: 'ff', de: d.ff, a: p.ff })
  const bgD = d.bg ? hex(d.bg) : ''; const bgP = p.bg ? hex(p.bg) : ''
  if (bgD !== bgP) props.push({ k: 'bg', de: bgD || '-', a: bgP || '-' })
  if (Math.abs((d.h || 0) - (p.h || 0)) > 3 && /button|input|select|a/.test(p.tag || '')) {
    props.push({ k: 'h', de: d.h, a: p.h })
  }
  return props
}

/** PURA — compara dos digests {W,H,items} y arma el objeto de resultado sin tocar red ni disco. */
export function comparar(D, P) {
  const pIdx = new Map()
  for (const i of P.items) { const k = norm(i.t); if (!k) continue; if (!pIdx.has(k)) pIdx.set(k, []); pIdx.get(k).push(i) }
  const iguales = []; const difs = []; const faltan = []
  const vistos = new Set()
  for (const d of D.items) {
    const k = norm(d.t)
    if (!k || k.length < 2 || vistos.has(k)) continue
    vistos.add(k)
    const cand = pIdx.get(k)
    if (!cand) { faltan.push({ texto: d.t, x: d.x, y: d.y }); continue }
    const props = diferenciasDe(d, cand[0])
    if (props.length) difs.push({ texto: d.t.slice(0, 60), props, dis: { x: d.x, y: d.y, w: d.w, h: d.h }, prod: { x: cand[0].x, y: cand[0].y, w: cand[0].w, h: cand[0].h } })
    else iguales.push(d.t.slice(0, 40))
  }
  const dk = new Set(D.items.map((i) => norm(i.t)))
  const extra = []; const ev = new Set()
  for (const p of P.items) { const k = norm(p.t); if (!k || k.length < 2 || dk.has(k) || ev.has(k)) continue; ev.add(k); extra.push(p.t.slice(0, 60)) }

  const N = iguales.length + difs.length + faltan.length
  let puntaje = 100
  let sinDatos = false
  if (N === 0) sinDatos = true
  else {
    let penalTotal = 0
    for (const d of difs) {
      let p = 0
      for (const pr of d.props) p += PESOS[pr.k] || 1
      penalTotal += Math.min(p, TOPE_POR_TEXTO)
    }
    penalTotal += faltan.length * PENAL_FALTA
    const avgPenal = penalTotal / N
    const extraPenal = Math.min(Math.min(extra.length, 20) * 0.3, 6)
    puntaje = Math.round(Math.max(0, Math.min(100, 100 - avgPenal * 10 - extraPenal)))
  }
  return {
    disWH: { W: D.W, H: D.H }, prodWH: { W: P.W, H: P.H },
    N, iguales, difs, faltan, extra, puntaje, sinDatos,
  }
}

// ═══ ESPERA DE ESQUELETOS — misma condición que cap-prod.mjs de la auditoría independiente ═══
function noEstaCargando() {
  const vis = (e) => { const b = e.getBoundingClientRect(); const s = getComputedStyle(e); return b.width > 0 && b.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' }
  const q = [...document.querySelectorAll('[data-testid^="esqueleto"],[aria-busy="true"],.animate-pulse,[class*="motion-safe:animate-pulse"],[data-cargando]')].filter(vis)
  const txt = /Cargando…|Cargando\.\.\./.test(document.body.innerText)
  return q.length === 0 && !txt
}

async function capturarDiseno(browser, labels) {
  const src = path.join(DISENO_DIR, pantallasCfg.disenoArchivo)
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 })
  await page.goto(pathToFileURL(src).href, { waitUntil: 'networkidle' })
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(1500)
  const out = {}
  for (const l of labels) {
    const idx = await page.evaluate((l) => {
      const s = document.querySelector(`section[data-screen-label="${l}"]`)
      if (!s) return -2
      const kids = [...s.children]
      const i = kids.findIndex((k) => {
        const b = k.getBoundingClientRect()
        return (Math.abs(b.width - 1442) < 4 || Math.abs(b.width - 392) < 4 || Math.abs(b.width - 1440) < 4 || Math.abs(b.width - 390) < 4) && b.height > 300
      })
      kids.forEach((k) => k.removeAttribute('data-marco'))
      if (i >= 0) kids[i].setAttribute('data-marco', l)
      return i
    }, l)
    if (idx === -2) { out[l] = null; continue }
    const sel = idx >= 0 ? `[data-marco="${l}"]` : `section[data-screen-label="${l}"]`
    out[l] = await page.evaluate(digestFn, sel)
  }
  await page.close()
  return out
}

async function esperarListo(page) {
  // Espera a que NO haya esqueleto/spinner/texto «Cargando…» visible.
  await page.waitForFunction(noEstaCargando, null, { timeout: 45000, polling: 300 }).catch(() => {})
  await page.waitForLoadState('networkidle').catch(() => {})
  await page.waitForTimeout(800)
}

async function capturarProduccion(browser, cookies, pantallas) {
  const ctxs = {}
  const ctxDe = async (ancho) => {
    if (ctxs[ancho]) return ctxs[ancho]
    const opts = ancho === 390
      ? { ...devices['iPhone 13'], viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, locale: 'es-AR', timezoneId: 'America/Argentina/San_Juan' }
      : { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, locale: 'es-AR', timezoneId: 'America/Argentina/San_Juan' }
    const c = await browser.newContext(opts)
    await c.addCookies(cookies)
    ctxs[ancho] = c
    return c
  }
  const out = {}
  for (const pant of pantallas) {
    const c = await ctxDe(pant.ancho)
    const page = await c.newPage()
    let status = null
    try { const r = await page.goto(BASE + pant.ruta, { waitUntil: 'networkidle', timeout: 90000 }); status = r && r.status() } catch (e) { status = 'ERR ' + e.message.slice(0, 80) }
    await page.evaluate(() => document.fonts.ready).catch(() => {})
    await esperarListo(page)
    const dig = await page.evaluate(digestFn, null).catch((e) => ({ W: 0, H: 0, items: [], err: e.message }))
    dig.url = page.url().replace(BASE, '')
    out[pant.code] = { status, digest: dig }
    await page.close()
  }
  for (const c of Object.values(ctxs)) await c.close()
  return out
}

let pantallasCfg
async function main() {
  pantallasCfg = JSON.parse(fs.readFileSync(path.join(HERE, 'pantallas.json'), 'utf8'))
  let pantallas = pantallasCfg.pantallas
  if (SOLO.length) pantallas = pantallas.filter((p) => SOLO.includes(p.code))
  if (!pantallas.length) { console.error('sin pantallas para medir (revisá --pantallas)'); process.exit(2) }

  fs.mkdirSync(OUT_DIR, { recursive: true })
  const browser = await chromium.launch()
  let resultados
  try {
    const digDiseno = await capturarDiseno(browser, pantallas.map((p) => p.disenoLabel))
    const cookies = await cookiesDeSesion(EMAIL)
    const digProd = await capturarProduccion(browser, cookies, pantallas)

    resultados = pantallas.map((pant) => {
      const D = digDiseno[pant.disenoLabel]
      const prodEntry = digProd[pant.code]
      const P = prodEntry?.digest
      if (!D || !P) {
        return { code: pant.code, ruta: pant.ruta, ancho: pant.ancho, rol: pant.rol, umbral: pant.umbral, error: !D ? 'marco de diseño no encontrado' : 'sin datos de producción', puntaje: 0 }
      }
      const cmp = comparar(D, P)
      return { code: pant.code, ruta: pant.ruta, ancho: pant.ancho, rol: pant.rol, umbral: pant.umbral, status: prodEntry.status, url: P.url, ...cmp }
    })
  } finally {
    await browser.close()
  }

  for (const r of resultados) fs.writeFileSync(path.join(OUT_DIR, `${r.code}.json`), JSON.stringify(r, null, 1))

  const md = []
  md.push(`# Fidelidad diseño → producción — ${new Date().toISOString().slice(0, 10)}`)
  md.push('')
  md.push(`Base: ${BASE}`)
  md.push('')
  md.push('| Pantalla | Ruta | Ancho | Puntaje | Umbral | Estado |')
  md.push('|---|---|---|---|---|---|')
  let huboFallo = false
  for (const r of resultados) {
    const bajoUmbral = r.puntaje < r.umbral
    if (bajoUmbral) huboFallo = true
    md.push(`| ${r.code} | ${r.ruta.length > 32 ? r.ruta.slice(0, 29) + '…' : r.ruta} | ${r.ancho} | ${r.puntaje}${r.sinDatos ? ' (sin datos)' : ''} | ${r.umbral} | ${bajoUmbral ? '✗ BAJO UMBRAL' : '✓'} |`)
  }
  md.push('')
  for (const r of resultados) {
    if (r.error) { md.push(`- ${r.code}: ${r.error}`); continue }
    const top = (r.difs || []).slice(0, 2).map((d) => `«${d.texto.slice(0, 24)}» ${d.props.map((p) => p.k).join('/')}`)
    if (top.length || r.faltan?.length) {
      md.push(`- ${r.code}: ${r.difs?.length || 0} con diferencia de estilo, ${r.faltan?.length || 0} ausentes en prod, ${r.extra?.length || 0} sólo en prod${top.length ? ' — ej: ' + top.join('; ') : ''}`)
    }
  }
  md.push('')
  md.push(huboFallo ? '⛔ una o más pantallas por debajo de su umbral (no regresión).' : '✓ todas las pantallas medidas están en o sobre su umbral.')
  const mdTexto = md.slice(0, 40).join('\n')
  fs.writeFileSync(path.join(OUT_DIR, 'resumen.md'), mdTexto + '\n')
  console.log(mdTexto)

  process.exit(huboFallo ? 1 : 0)
}

main().catch((e) => { console.error('medir-fidelidad falló:', e.stack || e.message); process.exit(2) })
