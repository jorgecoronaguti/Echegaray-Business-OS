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
  buscarPestanaAutenticada, llegoADestino, leerTablaCotizaciones, leerTarjetasDeFondos,
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
  // NO se abre una pestaña nueva: Balanz guarda la sesión en `sessionStorage`, que es por pestaña, y
  // una pestaña nueva nace deslogueada. Se usa la del dueño y se le devuelve la URL al terminar.
  const page = buscarPestanaAutenticada(ctx.pages())
  if (!page) {
    console.error('SESSION_REQUIRED: no hay ninguna pestaña de Balanz con sesión iniciada.')
    console.error('Abrí el Chrome dedicado, entrá a Balanz a mano y dejá esa pestaña abierta.')
    process.exitCode = 2
    await browser.close().catch(() => {})
    return
  }
  const urlOriginal = page.url()
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
      // Balanz redirige a /app/home cualquier ruta que no existe, SIN error: hay que verificar que
      // se llegó, o se mapea la portada creyendo que es la pantalla pedida.
      if (!llegoADestino(url, page.url())) {
        mapa.push({ ruta, estado: 'no_existe', motivo: `redirigió a ${page.url()}` })
        continue
      }

      // LAZY LOADING: bajar la página no es interactuar con un control —no dispara nada— y es la
      // única forma de ver la tabla entera.
      const vueltas = await cargarTodo(page)

      const estructura = await page.evaluate(estructuraDePagina)
      const tabla = await page.evaluate(leerTablaCotizaciones).catch(() => null)
      const tarjetas = await page.evaluate(leerTarjetasDeFondos).catch(() => [])
      const controles = await controlesDePagina(page)
      const veredictos = controles.map((el) => ({ el, v: evaluarElemento(el) }))
      mapa.push({
        ruta, estado: 'ok', ...estructura, tabla, tarjetas, vueltas_de_carga: vueltas,
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
    // La pestaña es del dueño: se le devuelve donde estaba, no se cierra.
    if (urlOriginal && page.url() !== urlOriginal) {
      await page.goto(urlOriginal, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {})
    }
    await browser.close().catch(() => {})
  }

  if (JSON_OUT) { console.log(JSON.stringify(mapa, null, 2)); return }
  for (const p of mapa) {
    console.log(`\n═══ ${p.ruta} — ${p.estado}${p.motivo ? ` (${p.motivo})` : ''}`)
    if (p.estado !== 'ok') continue
    console.log(`  título: ${p.titulo}`)
    if (p.tabs?.length) console.log(`  tabs: ${p.tabs.join(' · ')}`)
    if (p.tabla?.filas?.length) {
      console.log(`  TABLA: ${p.tabla.filas.length} filas (${p.vueltas_de_carga} vueltas de carga) · columnas: ${p.tabla.cabecera.join(' | ')}`)
      for (const m of p.tabla.filas.slice(0, 2)) console.log(`      ${m.join(' | ').replace(/\n/g, '⏎').slice(0, 150)}`)
    }
    if (p.tarjetas?.length) {
      console.log(`  TARJETAS: ${p.tarjetas.length}`)
      for (const f of p.tarjetas.slice(0, 3)) {
        console.log(`      ${f.nombre} · ${f.moneda_texto} · rescate ${f.plazo_rescate_texto} · tipo ${f.tipo} · tna ${f.tna_texto ?? '(no declarada)'} · anual ${f.variaciones?.anual ?? '-'}`)
      }
    }
    if (!p.tabla?.filas?.length && !p.tarjetas?.length) console.log('  (sin tabla ni tarjetas)')
    console.log(`  controles: ${p.controles.permitidos} permitidos · ${p.controles.bloqueados} BLOQUEADOS`)
    for (const b of p.controles.ejemplos_bloqueados) console.log(`      ⛔ "${b.texto}" — ${b.motivo}`)
  }
  console.log('\nCero clics. Cero operaciones. Sólo navegación por URL y lectura del DOM.')
}

main().catch((e) => { console.error(`[explorar] ${e.message}`); process.exitCode = 1 })
