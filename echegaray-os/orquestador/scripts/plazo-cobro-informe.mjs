#!/usr/bin/env node
// EL ANTES Y EL DESPUÉS DEL PLAZO DE COBRO, FILA POR FILA. SOLO LECTURA.
//
// Contesta las tres preguntas que decide el dueño: cuántas filas proyectan con un plazo REALMENTE
// pactado, cuántas siguen con un supuesto declarado, y cuántos días y cuántos pesos se corren las
// que estaban mal.
//
// NO ESCRIBE NADA. Ni el Sheet —Cobranzas es fuente y el contrato del área prohíbe tocarla— ni la
// base. Es la evidencia del efecto, no el efecto.
//
//   node orquestador/scripts/plazo-cobro-informe.mjs [--todas]

import { readFileSync } from 'node:fs'
import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { resolverPlazoDeCobro, fechaDeCobroProyectada, ORIGEN, CERTEZA } from '../lib/plazo-cobro.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const COBRADO = new Set(['Cobrado', 'Efectivo'])
const TODAS = process.argv.includes('--todas')
const $ = (v) => '$' + Math.round(Number(v) || 0).toLocaleString('es-AR')
const fecha = (serial) => (serial > 0 ? new Date(Date.UTC(1899, 11, 30) + serial * 86400000).toISOString().slice(0, 10) : '—')

/** OC leídas → el mapa que consume la cascada. Sólo entran las que el PDF sí declaró. */
export function mapaDeOcLeidas(doc) {
  const m = new Map()
  for (const o of doc?.ordenes ?? []) {
    if (o.estado !== 'leida' && o.estado !== 'condicion_sin_dias') continue
    m.set(o.orden_compra, { dias: o.dias, descripcion: o.descripcion, tipo: o.tipo, instrumento: o.instrumento, drive_file_id: o.drive_file_id })
  }
  return m
}

/** Las condiciones cargadas a mano. La tabla puede no estar aplicada todavía: eso NO es un error. */
async function condicionesCargadas() {
  try {
    const { query } = await import('../lib/db.mjs')
    const { rows } = await query(
      `select cliente, dias, instrumento, evidencia from public.condicion_cobro
        where orden_compra is null and cliente is not null and dias is not null`)
    return new Map(rows.map((r) => [r.cliente, { dias: r.dias, instrumento: r.instrumento, fuente: r.evidencia }]))
  } catch (e) {
    console.log(`  (sin capa manual: public.condicion_cobro no está disponible — ${String(e.message).slice(0, 60)})\n`)
    return new Map()
  }
}

async function main() {
  const g = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })
  const filas = await g.readSheetValues(ID, 'Cobranzas!A5:S200', { render: 'UNFORMATTED_VALUE' })
  const doc = JSON.parse(readFileSync(new URL('../datos/plazos-cobro-oc.json', import.meta.url).pathname, 'utf8'))
  const ocLeidas = mapaDeOcLeidas(doc)
  const condicionesCliente = await condicionesCargadas()

  const analizadas = []
  filas.forEach((r, i) => {
    const total = Number(r?.[12]) || 0
    if (!total) return
    const pendiente = !COBRADO.has(String(r?.[14] ?? '').trim())
    if (!pendiente && !TODAS) return
    const res = resolverPlazoDeCobro({ textoOrdenCompra: r?.[7], cliente: r?.[6], ocLeidas, condicionesCliente })
    const factura = Number(r?.[15]) || 0
    const actual = Number(r?.[16]) || 0
    const propuesta = fechaDeCobroProyectada(factura, res.dias)
    analizadas.push({ fila: 5 + i, cliente: String(r?.[6] ?? '').trim(), total, ...res, factura, actual, propuesta })
  })

  const por = (p) => analizadas.filter(p)
  const suma = (xs) => xs.reduce((a, x) => a + x.total, 0)
  const linea = (t, xs) => console.log(`  ${t.padEnd(46)} ${String(xs.length).padStart(3)} filas  ${$(suma(xs)).padStart(16)}`)

  console.log(`\n═══ PLAZO DE COBRO — ${TODAS ? 'TODAS' : 'PENDIENTES'} · lectura de OC del ${doc.leido_el} ═══\n`)
  console.log('ANTES — el plazo no salía de la OC en ninguna fila:')
  linea('constante global de 30 días (aging)', analizadas)
  console.log('\nDESPUÉS — de dónde sale el plazo de cada fila:')
  linea('PACTADO · leído de la orden de compra', por((a) => a.origen === ORIGEN.ORDEN_DE_COMPRA && a.certeza === CERTEZA.PACTADO))
  linea('PACTADO · condición cargada para el cliente', por((a) => a.origen === ORIGEN.CONDICION_CLIENTE))
  linea('FALTA_DATO · la OC no se mide en días', por((a) => a.certeza === CERTEZA.FALTA_DATO))
  linea('SUPUESTO · OC declarada pero sin PDF archivado', por((a) => a.certeza === CERTEZA.SUPUESTO && a.orden_compra))
  linea('SUPUESTO · la fila no declara orden de compra', por((a) => a.certeza === CERTEZA.SUPUESTO && !a.orden_compra))

  const disc = por((a) => a.discrepancia)
  if (disc.length) {
    console.log('\nEL TEXTO TIPEADO EN LA CELDA CONTRADICE A LA ORDEN DE COMPRA:')
    for (const a of disc) {
      console.log(`  fila ${a.fila} ${a.cliente} · ${$(a.total)} · tipeado ${a.discrepancia.tipeado_en_celda}d vs pactado ${a.discrepancia.pactado_en_oc}d` +
        ` → el cobro se corre ${a.discrepancia.dias_de_diferencia} días`)
      console.log(`     ${a.evidencia}`)
    }
  }

  const mueven = por((a) => a.propuesta && a.actual && a.propuesta !== a.actual)
  console.log('\nIMPACTO SOBRE LA FECHA PROYECTADA (sólo donde el plazo es PACTADO):')
  const pactadas = mueven.filter((a) => a.certeza === CERTEZA.PACTADO)
  linea('la fecha de cobro se mueve', pactadas)
  for (const a of pactadas.sort((x, y) => y.total - x.total)) {
    console.log(`  fila ${String(a.fila).padStart(3)} ${a.cliente.slice(0, 18).padEnd(18)} ${$(a.total).padStart(15)}  ${fecha(a.actual)} → ${fecha(a.propuesta)}  (${a.propuesta - a.actual > 0 ? '+' : ''}${a.propuesta - a.actual}d)`)
  }
  const dias = pactadas.reduce((a, x) => a + (x.propuesta - x.actual) * x.total, 0)
  if (suma(pactadas)) console.log(`\n  desplazamiento promedio ponderado por peso: ${(dias / suma(pactadas)).toFixed(1)} días`)

  console.log('\nLO QUE LE QUEDA AL DUEÑO:')
  const sinPdf = [...new Set(por((a) => a.certeza === CERTEZA.SUPUESTO && a.orden_compra).map((a) => a.orden_compra))]
  if (sinPdf.length) console.log(`  archivar en Drive las OC declaradas y no encontradas: ${sinPdf.join(', ')}`)
  const clientesSinOc = [...new Set(por((a) => a.certeza === CERTEZA.SUPUESTO && !a.orden_compra).map((a) => a.cliente))]
  if (clientesSinOc.length) console.log(`  declarar la condición de cobro de: ${clientesSinOc.join(' · ')}`)
  console.log()
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e); process.exitCode = 1 })
