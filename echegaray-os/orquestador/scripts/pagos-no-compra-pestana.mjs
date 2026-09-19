#!/usr/bin/env node
// _PAGOS_NO_COMPRA_RAW — crear la pestaña si no existe y AGREGAR pagos. Nunca borra. Ver lib/pagos-no-compra.mjs.
//
//   node orquestador/scripts/pagos-no-compra-pestana.mjs --file pagos.json           → plan, no escribe
//   node orquestador/scripts/pagos-no-compra-pestana.mjs --file pagos.json --aplicar → escribe y relee
//   node orquestador/scripts/pagos-no-compra-pestana.mjs --aplicar                   → sólo crea la pestaña
//
// `pagos.json`: [{ "fecha": "2026-09-09", "concepto": "…", "rubro": "Dirección · retiro", "persona": "Rodrigo Echegaray",
//                 "importe": 1000000, "medio": "Transferencia", "periodo": "2026-08", "referencia": "17283120", "origen": "…" }]
//
// ESCRIBE SÓLO EN FILAS VACÍAS (`soloFilasVacias`): el destino se relee y se confirma vacío antes de cada
// escritura. La pestaña se crea oculta —es carga, no vista—, con título, nota y encabezado, y los pagos
// van debajo de la última fila con dato. Lo que ya está no se toca ni se reordena.

import { readFileSync } from 'node:fs'
import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import * as E from '../lib/estilo-pestana.mjs'
import { tomarSnapshot } from '../lib/sheet-snapshot.mjs'
import {
  PESTANA_PAGOS_NC, COLUMNAS_PAGOS_NC, FILA0_PAGOS_NC, RUBROS_PAGOS_NC, planDeAltaNC, filaPagoNC, pagoDeFila, clavePagoNC,
  enComprasTambien, aIso,
} from '../lib/pagos-no-compra.mjs'
import { leerColumnasRetiros } from '../lib/direccion-retiros.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const APLICAR = process.argv.includes('--aplicar')
const iFile = process.argv.indexOf('--file')
const ARCHIVO = iFile > 0 ? process.argv[iFile + 1] : null
const $ = (n) => `$${Number(n ?? 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`

const CABECERA = [
  [`${PESTANA_PAGOS_NC} — pagos que salen de la caja SIN factura ni fila en Compras (retiros de Dirección, SAC en efectivo, gremiales viejos)`],
  ['Carga fila por fila, nunca se borra. Fecha = fecha real del débito · Período = el mes de la obligación que paga (YYYY-MM) · Referencia banco = la del extracto. '
    + `Rubros: ${Object.values(RUBROS_PAGOS_NC).join(' · ')}. El bloque de Dirección de «Jornales por Quincena» suma por rubro y período.`],
  COLUMNAS_PAGOS_NC.map(([n]) => n),
]

async function main() {
  const google = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })
  const nuevos = ARCHIVO ? JSON.parse(readFileSync(ARCHIVO, 'utf8')) : []
  let meta = await google.getSheetMeta(ID)
  let hoja = meta.find((h) => h.title === PESTANA_PAGOS_NC)
  const ANCHO = COLUMNAS_PAGOS_NC.length
  if (!hoja) {
    console.log(`la pestaña ${PESTANA_PAGOS_NC} no existe: se crea oculta, con título, nota y encabezado.`)
    if (APLICAR) {
      await google.spreadsheetBatchUpdate(ID, [{ addSheet: { properties: { title: PESTANA_PAGOS_NC, hidden: true, gridProperties: { rowCount: 400, columnCount: ANCHO + 1, frozenRowCount: 3 } } } }], { espejo: true })
      meta = await google.getSheetMeta(ID)
      hoja = meta.find((h) => h.title === PESTANA_PAGOS_NC)
      const r = await google.batchUpdateValues(ID, [{ range: `'${PESTANA_PAGOS_NC}'!A1:${String.fromCharCode(64 + ANCHO)}3`, values: CABECERA }], { soloFilasVacias: true })
      if (r?.protegido) throw new Error(`la guarda frenó la cabecera: ${r.motivo ?? JSON.stringify(r)}`)
      const rg = (r0, r1, c0, c1) => ({ sheetId: hoja.sheetId, startRowIndex: r0, endRowIndex: r1, startColumnIndex: c0, endColumnIndex: c1 })
      const reqs = [
        E.reset(hoja.sheetId, 400, ANCHO + 1),
        { repeatCell: { range: rg(0, 1, 0, ANCHO), cell: { userEnteredFormat: E.titulo() }, fields: 'userEnteredFormat' } },
        { repeatCell: { range: rg(1, 2, 0, ANCHO), cell: { userEnteredFormat: E.nota() }, fields: 'userEnteredFormat' } },
        { repeatCell: { range: rg(2, 3, 0, ANCHO), cell: { userEnteredFormat: E.encabezado() }, fields: 'userEnteredFormat' } },
      ]
      COLUMNAS_PAGOS_NC.forEach(([, unidad], j) => {
        reqs.push({ repeatCell: { range: rg(FILA0_PAGOS_NC - 1, 400, j, j + 1), cell: { userEnteredFormat: E.celda(unidad) }, fields: 'userEnteredFormat(numberFormat,textFormat,horizontalAlignment)' } })
        reqs.push({ updateDimensionProperties: { range: { sheetId: hoja.sheetId, dimension: 'COLUMNS', startIndex: j, endIndex: j + 1 }, properties: { pixelSize: j === 1 || j === 8 ? 300 : E.ANCHO.numero }, fields: 'pixelSize' } })
      })
      await google.spreadsheetBatchUpdate(ID, reqs, { espejo: true })
      console.log(`  ✓ ${PESTANA_PAGOS_NC} creada (oculta)`)
    }
  }
  const leidas = hoja ? await google.readSheetValues(ID, `'${PESTANA_PAGOS_NC}'!A1:${String.fromCharCode(64 + ANCHO)}400`, { render: 'UNFORMATTED_VALUE' }) : CABECERA
  const plan = planDeAltaNC(leidas, nuevos)
  if (!plan.rotulosOk) { console.error('el encabezado de la pestaña no es el esperado: no escribo.'); process.exitCode = 1; return }
  console.log(`${plan.existentes.length} pago(s) ya cargado(s) · primera fila libre ${plan.primeraLibre}`)
  for (const r of plan.rechazados) console.log(`  ✗ rechazado ${JSON.stringify(r.pago).slice(0, 80)}: ${r.motivos.join(' · ')}`)
  for (const y of plan.yaEstaban) console.log(`  = ya estaba ${y.clave}: ${y.pago.fecha} ${y.pago.persona} ${$(y.pago.importe)}`)
  for (const p of plan.altas) console.log(`  + ${p.fecha} · ${p.rubro} · ${p.persona} · ${$(p.importe)} · período ${p.periodo} · ref ${p.referencia}`)
  if (plan.rechazados.length) process.exitCode = 1

  // EL CRUCE CONTRA COMPRAS: un pago que ya está allá no entra acá (se sumaría dos veces).
  const CARGAR_IGUAL = process.argv.includes('--cargar-igual')
  if (plan.altas.length) {
    const cols = await leerColumnasRetiros(google, ID)
    const leer = async (k) => (await google.readSheetValues(ID, `'Compras'!${cols[k].letra}4:${cols[k].letra}`, { render: 'UNFORMATTED_VALUE' })) ?? []
    const [personas, importes, fechas] = await Promise.all([leer('persona'), leer('importe'), leer('fechaCaja')])
    const compras = personas.map((f, i) => ({
      fila: i + 4, persona: f?.[0], importe: Number(importes[i]?.[0]), fecha: aIso(fechas[i]?.[0]),
    })).filter((c) => c.persona && Number.isFinite(c.importe))
    const choques = enComprasTambien(plan.altas, compras)
    for (const c of choques) console.log(`  ⚠ probable duplicado en Compras (fila ${c.filas.join(', ')}): ${c.pago.fecha} ${c.pago.persona} ${$(c.pago.importe)}`)
    if (choques.length && !CARGAR_IGUAL) {
      const fuera = new Set(choques.map((c) => c.pago))
      plan.altas = plan.altas.filter((p) => !fuera.has(p))
      console.log(`  ${choques.length} pago(s) no se cargan. Si ya los miraste y no son el mismo, repetilo con --cargar-igual.`)
      process.exitCode = 1
    }
  }
  if (!plan.altas.length) { console.log('nada que agregar.'); return }
  if (!APLICAR) { console.log(`\n— en seco: ${plan.altas.length} fila(s) se agregarían. Repetilo con --aplicar.`); return }

  if (plan.existentes.length) {
    const snap = await tomarSnapshot({ google, fileId: ID, pestana: PESTANA_PAGOS_NC, tool: 'pagos-no-compra-pestana', directive: `agregar ${plan.altas.length} pago(s)` })
    console.log(`snapshot → ${snap ?? 'no se pudo'}`)
  }
  const r0 = plan.primeraLibre
  const r1 = r0 + plan.altas.length - 1
  const res = await google.batchUpdateValues(ID,
    [{ range: `'${PESTANA_PAGOS_NC}'!A${r0}:${String.fromCharCode(64 + ANCHO)}${r1}`, values: plan.altas.map(filaPagoNC) }],
    { soloFilasVacias: true })
  if (res?.protegido) { console.error(`la guarda frenó la escritura: ${res.motivo ?? JSON.stringify(res)}`); process.exitCode = 1; return }

  // RELECTURA: cada pago agregado, leído de vuelta por su clave.
  const despues = await google.readSheetValues(ID, `'${PESTANA_PAGOS_NC}'!A${r0}:${String.fromCharCode(64 + ANCHO)}${r1}`, { render: 'UNFORMATTED_VALUE' })
  const leidos = (despues ?? []).map(pagoDeFila).filter(Boolean)
  let ok = true
  for (const p of plan.altas) {
    const l = leidos.find((x) => clavePagoNC(x) === clavePagoNC(p))
    const bien = l && Math.abs(l.importe - Number(p.importe)) < 0.005 && l.fecha === p.fecha && l.periodo === p.periodo
    ok &&= Boolean(bien)
    console.log(`  ${bien ? '✓' : '✗'} ${clavePagoNC(p)} ${bien ? `leído en la fila ${r0 + leidos.indexOf(l)}: ${l.fecha} ${l.persona} ${$(l.importe)} período ${l.periodo}` : 'NO se leyó como se escribió'}`)
  }
  if (!ok) process.exitCode = 1
}

main().catch((e) => { console.error(e.message ?? e); process.exit(1) })
