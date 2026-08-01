#!/usr/bin/env node
// EXPLORADOR DE BALANZ — mapea el DOM real en SOLO LECTURA, para poder validar el extractor.
//
//   node orquestador/scripts/balanz-explorar.mjs                 # las rutas informativas por defecto
//   node orquestador/scripts/balanz-explorar.mjs /fondos         # una ruta puntual
//   node orquestador/scripts/balanz-explorar.mjs --json > mapa.json
//
// ═══ QUÉ HACE Y QUÉ NO ═══
//
// Recorre las rutas informativas y devuelve la ESTRUCTURA de cada pantalla: encabezados, tablas con
// sus columnas, listas, y el veredicto de la barrera sobre cada control. Con eso se eligen selectores
// semánticos —rol, nombre accesible, encabezado de tabla— en vez de clases CSS que cambian con cada
// despliegue del bróker.
//
// NO extrae posiciones ni saldos de la cuenta, no guarda capturas del sitio autenticado, y no toca un
// solo control: cada interacción pasa por `balanz-denylist.mjs`.
//
// ═══ ANTES DE CORRERLO ═══
//
// Hace falta un Chrome DEDICADO (perfil aparte del personal) con el puerto de depuración abierto, y
// la sesión iniciada A MANO. En Mac:
//
//   "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
//     --remote-debugging-address=127.0.0.1 --remote-debugging-port=9222 \
//     --user-data-dir="$HOME/.chrome-balanz-agent"
//
// Y, si el OS corre en otra máquina, un túnel que ate el puerto SÓLO a loopback del servidor:
//
//   ssh -N -R 127.0.0.1:9222:127.0.0.1:9222 <usuario>@<servidor>

import { sesionDisponible, ENDPOINT_CDP, ORIGEN_BALANZ, SesionRequerida } from '../lib/tesoreria/balanz-navegador.mjs'
import { evaluarNavegacion, evaluarElemento } from '../lib/tesoreria/balanz-denylist.mjs'
import { RUTAS_INFORMATIVAS } from '../lib/tesoreria/ciclo.mjs'

const args = process.argv.slice(2)
const JSON_OUT = args.includes('--json')
const rutas = args.filter((a) => a.startsWith('/'))
const RUTAS = rutas.length ? rutas : RUTAS_INFORMATIVAS

/** Extrae la estructura semántica de la página. Se corre EN el navegador, en una sola pasada. */
const MAPEAR = `() => {
  const texto = (el) => (el?.innerText || '').trim().slice(0, 120)
  const encabezados = [...document.querySelectorAll('h1,h2,h3,[role=heading]')].slice(0, 40).map((h) => ({
    nivel: h.tagName.toLowerCase(), texto: texto(h),
  }))
  const tablas = [...document.querySelectorAll('table,[role=table],[role=grid]')].slice(0, 20).map((t, i) => {
    const cabecera = [...t.querySelectorAll('th,[role=columnheader]')].map(texto).filter(Boolean)
    const filas = [...t.querySelectorAll('tbody tr,[role=row]')].length
    const muestra = [...t.querySelectorAll('tbody tr,[role=row]')].slice(1, 4).map(
      (r) => [...r.querySelectorAll('td,[role=cell],[role=gridcell]')].map(texto),
    )
    return { i, cabecera, filas, muestra, tieneAria: Boolean(t.getAttribute('aria-label')) }
  })
  const listas = [...document.querySelectorAll('[role=list],ul')].slice(0, 10)
    .map((l) => ({ items: l.children.length, primero: texto(l.children[0]) }))
    .filter((l) => l.items > 2 && l.primero)
  const tabs = [...document.querySelectorAll('[role=tab],[role=tablist] button')].slice(0, 20).map(texto).filter(Boolean)
  const paginacion = [...document.querySelectorAll('[aria-label*=agina],[class*=pagina],[class*=pagination]')].length
  return {
    titulo: document.title, url: location.href,
    encabezados, tablas, listas, tabs, paginacion,
    alto: document.body.scrollHeight, visible: window.innerHeight,
  }
}`

const EXTRAER_CONTROL = `(el) => ({
  tag: el.tagName, rol: el.getAttribute('role'), tipo: el.getAttribute('type'),
  texto: (el.innerText || el.textContent || '').slice(0, 200),
  ariaLabel: el.getAttribute('aria-label'), title: el.getAttribute('title'),
  href: el.getAttribute('href'), action: el.getAttribute('action'),
  formAction: el.getAttribute('formaction'), dataUrl: el.getAttribute('data-url'),
  textoPadre: (el.parentElement?.innerText || '').slice(0, 200),
})`

async function main() {
  const disp = await sesionDisponible(ENDPOINT_CDP)
  if (!disp.disponible) {
    console.error(`SESSION_REQUIRED: ${disp.motivo}\n`)
    console.error('Abrí el Chrome dedicado y entrá a Balanz a mano (ver la cabecera de este archivo).')
    process.exitCode = 2
    return
  }
  const { chromium } = await import('playwright')
  const browser = await chromium.connectOverCDP(ENDPOINT_CDP)
  const ctx = browser.contexts()[0]
  if (!ctx) throw new SesionRequerida('el navegador no tiene contextos')
  const page = ctx.pages()[0] || await ctx.newPage()
  const mapa = []

  try {
    for (const ruta of RUTAS) {
      const url = `${ORIGEN_BALANZ}${ruta}`
      const v = evaluarNavegacion(url)
      if (!v.permitido) { mapa.push({ ruta, estado: 'bloqueada', motivo: v.motivo }); continue }
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
      if (await page.locator('input[type="password"]').count().catch(() => 0)) {
        console.error('SESSION_REQUIRED: hay un campo de contraseña en pantalla. No se automatiza el login.')
        process.exitCode = 2
        return
      }
      await page.waitForTimeout(1500)

      // LAZY LOADING: se baja hasta el final para que carguen las filas diferidas. Bajar la página no
      // es interactuar con un control — no dispara nada, y es la única forma de ver la tabla entera.
      let alto = 0
      for (let i = 0; i < 8; i += 1) {
        const nuevo = await page.evaluate('document.body.scrollHeight')
        if (nuevo === alto) break
        alto = nuevo
        await page.evaluate('window.scrollTo(0, document.body.scrollHeight)')
        await page.waitForTimeout(700)
      }

      const estructura = await page.evaluate(MAPEAR)
      const controles = await page.locator('a, button, input[type=submit], form')
        .evaluateAll(`(els) => els.slice(0, 400).map(${EXTRAER_CONTROL})`).catch(() => [])
      const veredictos = controles.map((el) => ({ el, v: evaluarElemento(el) }))
      mapa.push({
        ruta, estado: 'ok', ...estructura,
        controles: {
          total: veredictos.length,
          permitidos: veredictos.filter((x) => x.v.permitido).length,
          bloqueados: veredictos.filter((x) => !x.v.permitido).length,
          // Sólo la etiqueta y 60 caracteres: alcanza para auditar, no reconstruye la pantalla.
          ejemplos_bloqueados: veredictos.filter((x) => !x.v.permitido).slice(0, 10)
            .map((x) => ({ texto: String(x.el.texto || '').slice(0, 60), motivo: x.v.motivo })),
        },
      })
    }
  } finally {
    await browser.close().catch(() => {})
  }

  if (JSON_OUT) { console.log(JSON.stringify(mapa, null, 2)); return }
  for (const p of mapa) {
    console.log(`\n═══ ${p.ruta} — ${p.estado}${p.motivo ? ` (${p.motivo})` : ''}`)
    if (p.estado !== 'ok') continue
    console.log(`  título: ${p.titulo}`)
    if (p.tabs?.length) console.log(`  tabs: ${p.tabs.join(' · ')}`)
    for (const t of p.tablas) {
      console.log(`  tabla #${t.i}: ${t.filas} filas · columnas: ${t.cabecera.join(' | ') || '(sin th)'}`)
      for (const m of t.muestra) console.log(`      ${m.join(' | ').slice(0, 160)}`)
    }
    if (!p.tablas.length) console.log(`  (sin tablas) encabezados: ${p.encabezados.map((h) => h.texto).slice(0, 8).join(' · ')}`)
    console.log(`  controles: ${p.controles.permitidos} permitidos · ${p.controles.bloqueados} BLOQUEADOS`)
    for (const b of p.controles.ejemplos_bloqueados) console.log(`      ⛔ "${b.texto}" — ${b.motivo}`)
  }
  console.log('\nCero clics. Cero operaciones. Sólo navegación por URL y lectura del DOM.')
}

main().catch((e) => { console.error(`[explorar] ${e.message}`); process.exitCode = 1 })
