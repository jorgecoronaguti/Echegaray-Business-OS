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

import {
  sesionDisponible, ENDPOINT_CDP, ORIGEN_BALANZ, SesionRequerida,
  estructuraDePagina, controlesDePagina, cargarTodo, verificarSesion,
} from '../lib/tesoreria/balanz-navegador.mjs'
import { evaluarNavegacion, evaluarElemento } from '../lib/tesoreria/balanz-denylist.mjs'
import { RUTAS_INFORMATIVAS } from '../lib/tesoreria/ciclo.mjs'

const args = process.argv.slice(2)
const JSON_OUT = args.includes('--json')
const rutas = args.filter((a) => a.startsWith('/'))
const RUTAS = rutas.length ? rutas : RUTAS_INFORMATIVAS

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
  const page = await ctx.newPage() // pestaña propia: no se le toca la del dueño
  const mapa = []

  try {
    for (const ruta of RUTAS) {
      const url = `${ORIGEN_BALANZ}${ruta}`
      const v = evaluarNavegacion(url)
      if (!v.permitido) { mapa.push({ ruta, estado: 'bloqueada', motivo: v.motivo }); continue }
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
      // Mismo chequeo que el ciclo: dominio + sesión. Si vencio, se para.
      try { await verificarSesion(page) } catch (e) {
        console.error(`${e.message}\nNo se automatiza el login: entrá a mano en el Chrome dedicado.`)
        process.exitCode = 2
        return
      }
      await page.waitForTimeout(1500)

      // LAZY LOADING: bajar la página no es interactuar con un control —no dispara nada— y es la
      // única forma de ver la tabla entera.
      await cargarTodo(page)

      const estructura = await page.evaluate(estructuraDePagina)
      const controles = await controlesDePagina(page)
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
    await page.close().catch(() => {})
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
