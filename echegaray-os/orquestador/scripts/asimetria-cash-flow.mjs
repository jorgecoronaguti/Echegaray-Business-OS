#!/usr/bin/env node
// ¿EL CUADRO PROYECTA LA OBRA, O SÓLO LA CUADRILLA? — sin escribir una sola celda.
//
// Lee "Cash Flow Mensual" y reporta los meses donde se proyecta nómina y no se proyecta ni obra ni
// cobro. El criterio, su justificación y sus límites viven en `lib/cash-flow-asimetria.mjs`, que es
// puro y está probado; acá sólo está la lectura y la impresión.
//
// ═══ POR QUÉ NO ES UN PASO DEL GENERADOR ═══
//
// Podría correr dentro de `cash-flow-vistas.mjs` como corre el cuadre. No va ahí porque no es un
// control de CONSISTENCIA del cuadro —el cuadro está bien armado, suma lo que tiene que sumar— sino
// una lectura sobre lo que le FALTA al libro. Un paso del generador que falla por eso frenaría la
// escritura de una pestaña correcta hasta que alguien cargue obra, y el generador no puede esperar
// una decisión comercial.
//
// ═══ LÍMITE DECLARADO: ESTO NO DICE SI FALTA VENDER O SI NO HAY OBRA VENDIDA ═══
//
// Las dos cosas se dibujan exactamente igual en el cuadro. Este control mide la asimetría y su
// magnitud; si noviembre está vacío porque nadie cargó la obra o porque de verdad no hay obra para
// noviembre lo sabe el dueño, no el Sheet. Tampoco valida los importes: los toma como los publica la
// pestaña, que es la misma información que produce — un control validado contra su propia fuente sólo
// puede detectar una incoherencia interna, nunca un error de carga.
//
// Salida 0 si no hay hallazgos, 1 si los hay. LEE; nunca escribe.
//
//   node orquestador/scripts/asimetria-cash-flow.mjs
//   node orquestador/scripts/asimetria-cash-flow.mjs --cobertura=1.2
//   node orquestador/scripts/asimetria-cash-flow.mjs --ayuda

import { pathToFileURL } from 'node:url'
import { makeGoogleClient } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { ref as refPestana } from '../lib/partir-pestana.mjs'
import { letra } from '../lib/cash-flow-matriz.mjs'
import { grillaMeses } from '../lib/cash-flow-meses.mjs'
import { asimetriaDeLaProyeccion, mesesDesdeLaPestana } from '../lib/cash-flow-asimetria.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const AÑO = Number(process.env.ORQ_CF_ANIO || 2026)
// LECTURA Y NADA MÁS, TAMBIÉN EN EL PERMISO: el token que se emite no alcanza para escribir aunque el
// código quisiera. Mismo criterio que `auditar-cuadre-cash-flow.mjs`.
const SCOPES_LECTURA = ['https://www.googleapis.com/auth/spreadsheets.readonly']

const arg = (n, def) => {
  const m = process.argv.find((a) => a.startsWith(`--${n}=`))
  return m ? m.slice(n.length + 3) : def
}
const bandera = (n) => process.argv.includes(`--${n}`)
const peso = (n) => `$${Math.round(n).toLocaleString('es-AR')}`
const pct = (f) => `${Math.round(f * 100)}%`

/**
 * LA AYUDA EXISTE PARA PODER PROBAR EL PUNTO DE ENTRADA SIN SALIR A LA RED.
 *
 * Sin ella, "probar que el script arranca" significa autenticar contra Google y leer el archivo real
 * en CADA corrida de la suite. Un test que sale a la red no es un test: es una dependencia.
 */
const AYUDA = `
asimetria-cash-flow — los meses donde el cuadro proyecta la cuadrilla y no la obra.

  --cobertura=<n>   fracción de la nómina que el cobro proyectado tiene que cubrir (default 1)
  --ayuda           esto

Lee "Cash Flow Mensual" con permiso de sólo lectura. No escribe nada.
Salida 0 si no hay hallazgos, 1 si los hay.
`

/** Las líneas del informe. PURA — se separa de la impresión para poder mirarla sin red. */
export function informe(r) {
  const out = []
  out.push(r.ratio
    ? `referencia del propio cuadro: ${peso(r.ratio.materiales)} de material por ${peso(r.ratio.jornales)} `
      + `de jornales en ${r.ratio.meses} mes(es) reales → ${r.ratio.valor.toFixed(2)} de material por peso de jornal`
    : 'sin meses reales con jornales: no hay ratio observado, y no se inventa uno')
  for (const h of r.hallazgos) {
    if (h.tipo === 'obra-sin-material') {
      const est = h.materialEstimado === null
        ? '(sin ratio no se estima el faltante)'
        : `— al ratio observado le faltarían ~${peso(h.materialEstimado)} de material [ESTIMACIÓN]`
      out.push(`  ✗ ${h.mes}: ${peso(h.jornales)} de jornales proyectados y $0 de material ${est}`)
    } else {
      out.push(`  ✗ ${h.mes}: el cobro proyectado (${peso(h.ingreso)}) cubre el ${pct(h.cobertura)} `
        + `de la nómina proyectada (${peso(h.nomina)}) — faltan ${peso(h.faltante)}`)
    }
  }
  if (r.ok) out.push('✓ ningún mes proyecta nómina sin obra ni cobro.')
  else {
    out.push('')
    out.push(`⛔ ${r.hallazgos.length} hallazgo(s). El cierre del año que publica el cuadro es un PISO:`)
    if (r.total.materialFaltante !== null) out.push(`   material no proyectado ~${peso(r.total.materialFaltante)} [ESTIMACIÓN]`)
    out.push(`   cobro que falta para cubrir la nómina ${peso(r.total.cobroFaltante)} [CÁLCULO]`)
    out.push('   No dice si falta cargar la venta o si no hay obra vendida: eso lo sabe el dueño.')
  }
  return out
}

async function main() {
  if (bandera('ayuda')) { console.log(AYUDA.trim()); return }
  const coberturaMinima = Number(arg('cobertura', '1'))
  if (!Number.isFinite(coberturaMinima) || coberturaMinima <= 0) {
    throw new Error(`--cobertura tiene que ser un número mayor que cero, llegó "${arg('cobertura', '')}"`)
  }

  const google = makeGoogleClient({ config: loadConfig(), scopes: SCOPES_LECTURA })
  // El `meta` sale del MISMO código que escribió la pestaña: las filas se calculan, no se cuentan.
  const { meta } = grillaMeses({ anio: AÑO, refs: {} })
  const fp = meta.footprint
  // UNFORMATTED_VALUE: los importes tienen que llegar como números. Un "$ 22.049.666" obligaría a
  // adivinar el separador decimal, y adivinarlo mal da un faltante inventado.
  const valores = await google.readSheetValues(ID,
    `${refPestana(meta.pestana)}!A1:${letra(fp.cols - 1)}${fp.filas}`, { render: 'UNFORMATTED_VALUE' })

  const { meses, problemas } = mesesDesdeLaPestana(valores, meta)
  for (const p of problemas) console.error(`⚠ ${p}`)
  const r = asimetriaDeLaProyeccion(meses, { coberturaMinima })
  for (const l of informe(r)) console.log(l)
  if (!r.ok || problemas.length) process.exitCode = 1
}

// `pathToFileURL` y no `new URL(import.meta.url).pathname`: esa forma no decodifica los espacios de la
// ruta, así que el script importado desde un directorio con espacios se ejecutaba solo.
const ejecutadoDirecto = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (ejecutadoDirecto) main().catch((e) => { console.error(`⛔ ${e.message}`); process.exitCode = 1 })
