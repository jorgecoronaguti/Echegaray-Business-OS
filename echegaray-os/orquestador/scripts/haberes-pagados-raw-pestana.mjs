#!/usr/bin/env node
// _HABERES_PAGADOS_RAW — LOS PAGOS DE HABERES MARCADOS EN LA WEB, ADENTRO DEL SHEET.
//
// POR QUÉ EXISTE (02/10/2026). Lo que se marca en Administración › Liquidación de horas (lo pagado por
// banco y en efectivo, persona por persona) quedaba en Postgres y ningún paso lo bajaba al Flujo de Caja:
// los pasos de nómina leen JORNALES y la suben, no al revés. Ésta es la réplica — la misma vía que
// `_BANCO_RAW` y `_EFECTIVO_RAW`: el INSUMO adentro del archivo, para que una fórmula lo lea, nunca un
// total calculado acá y pegado. Cómo se arma cada pago (deltas, correcciones, migración) está en
// lib/haberes-pagados.mjs.
//
// ═══ QUIÉN LA LEE (02/10/2026) ═══
//
// CAJA y su anexo: los haberes pagados en efectivo desde el conteo y por banco después del corte del extracto,
// de las quincenas ≥ B2 (el corte, `CORTE_QUINCENA`, aprobado por el dueño). Las quincenas anteriores siguen
// saliendo de Nómina. Una quincena se lee de un lado o del otro, nunca de los dos: lib/caja-haberes-web.mjs.
// Los Cash Flow NO la leen: proyectan la quincena por Nómina (ver ese archivo).
//
// ENSAYO POR DEFECTO: imprime filas y totales y no toca el Sheet. Escribe sólo con `--aplicar` (el
// pipeline lo pasa); `--dry` gana sobre `--aplicar`.
//
//   node orquestador/scripts/haberes-pagados-raw-pestana.mjs              ← ensayo, sólo lectura
//   ORQ_CASHFLOW_ID=<copia> node orquestador/scripts/haberes-pagados-raw-pestana.mjs --aplicar

import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import * as E from '../lib/estilo-pestana.mjs'
import { escribirPreservando } from '../lib/preservar-anotaciones.mjs'
import { conColaMedidaLeida, avisoDeCola } from '../lib/cola-de-rango.mjs'
import { query } from '../lib/db.mjs'
import { instanteDelSello } from '../lib/caja-ancla-por-instante.mjs'
import { armarPagos, resumen, CORTE_QUINCENA } from '../lib/haberes-pagados.mjs'

const ID_REAL = '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const ID = process.env.ORQ_CASHFLOW_ID || ID_REAL
export const PESTAÑA = '_HABERES_PAGADOS_RAW'

/** Las columnas de la réplica. El orden es contrato: la fórmula que la enganche lo va a referenciar. */
export const COLUMNAS = [
  ['Fecha pago', 'fecha'], ['Fecha según', 'texto'], ['Quincena desde', 'fecha'], ['Quincena hasta', 'fecha'],
  ['Grupo', 'texto'], ['Persona', 'texto'], ['Medio', 'texto'], ['Sale de', 'texto'], ['Importe', 'monedaExacta'],
  ['Anotó', 'texto'], ['Anotado el', 'fechaHora'], ['Id', 'texto'],
]
export const COL = { fecha: 'A', segun: 'B', desde: 'C', hasta: 'D', grupo: 'E', persona: 'F', medio: 'G', saleDe: 'H', importe: 'I', anoto: 'J', instante: 'K', id: 'L' }
export const FILA0 = 4

/** ¿Escribe? Sólo con --aplicar y sin --dry. Todo lo demás es ensayo. */
export const modoAplicar = (argv) => argv.includes('--aplicar') && !argv.includes('--dry')

/** El instante como serial de Sheets, o vacío: sin default a `now()` (ver efectivo-raw-pestana.mjs). */
export function instante(t) {
  const d = t instanceof Date ? t : new Date(t ?? '')
  return Number.isFinite(d.getTime()) ? instanteDelSello(d) : ''
}

/** NÚCLEO PURO: una fila de la réplica. El importe va POSITIVO: es lo pagado, la fórmula lo resta. */
export function fila(p) {
  return [p.fecha, p.fechaSegun, String(p.desde ?? '').slice(0, 10), String(p.hasta ?? '').slice(0, 10), p.grupo,
    p.persona, p.medio, p.saleDe, p.importe, p.anoto, instante(p.instante), p.id]
}

/** NÚCLEO PURO: la grilla completa — título con el corte, nota, encabezados y datos. */
export function grilla(pagos, corte, desdeQuincena = CORTE_QUINCENA) {
  const r = resumen(pagos)
  const $ = (v) => v.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return [
    [`${PESTAÑA} — pagos de haberes marcados en la web (Liquidación de horas) · réplica del ${corte}`],
    // B2 ES EL PARÁMETRO QUE CITAN LAS FÓRMULAS DE CAJA (`HAB.corte`): fecha ISO que el Sheet guarda como fecha.
    ['CAJA lee desde la quincena', desdeQuincena,
      `${r.filas} pago(s) · banco ${$(r.banco)} · efectivo ${$(r.efectivo)}. La reescribe el agente desde la base: `
      + 'banco = deltas de pagado_banco (sin los cargadores); efectivo = liquidacion_pago_efectivo. Las quincenas '
      + 'anteriores a B2 CAJA las sigue leyendo de Nómina.'],
    COLUMNAS.map(([n]) => n),
    ...pagos.map(fila),
  ]
}

/** La lectura de la base. Sin la migración 20261002T1800 (42P01) las anotaciones son `null`, no un error. */
export async function leerInsumos(q = query) {
  const lineas = (await q(`
    select l.liquidacion_id, l.persona_id, l.pagado_banco, l.pagado_efectivo,
           q.desde::text desde, q.hasta::text hasta, q.grupo,
           coalesce(nullif(p.nombre_para_mostrar, ''), p.nombre_completo, l.persona_id::text) persona
      from public.liquidacion_linea l
      join public.liquidacion_quincena q on q.id = l.liquidacion_id
      left join public.personas p on p.id = l.persona_id
     where exists (select 1 from public.liquidacion_cambio c
                    where c.liquidacion_id = l.liquidacion_id and c.persona_id = l.persona_id
                      and c.tipo <> 'base' and c.columna in ('pagado_banco', 'pagado_efectivo'))`)).rows
  const cambios = (await q(`
    select c.id, c.liquidacion_id, c.persona_id, c.columna, c.tipo, c.origen, c.antes, c.despues, c.autor, c.en,
           (c.en at time zone 'America/Argentina/San_Juan')::date::text fecha_cambio
      from public.liquidacion_cambio c
     where c.tipo <> 'base' and c.columna in ('pagado_banco', 'pagado_efectivo')
     order by c.en, c.id`)).rows
  const nombres = new Map((await q(`select id, nombre from public.perfiles where nombre is not null`)).rows.map((r) => [r.id, r.nombre]))
  let anotaciones = null
  try {
    anotaciones = (await q(`
      select x.id, x.liquidacion_id, x.persona_id, x.fecha::text fecha, x.importe, x.origen, x.registrado_en,
             x.registrado_por, x.clave, x.nota, x.quincena_desde::text quincena_desde, q.hasta::text quincena_hasta,
             x.grupo, coalesce(nullif(p.nombre_para_mostrar, ''), p.nombre_completo, x.persona_id::text) persona
        from public.liquidacion_pago_efectivo x
        join public.liquidacion_quincena q on q.id = x.liquidacion_id
        left join public.personas p on p.id = x.persona_id
       where (x.quincena_desde >= $1::date or x.clave not like 'siembra:%')
         and not coalesce(p.es_prueba, false)
       order by x.fecha, x.id`, [CORTE_QUINCENA])).rows
  } catch (e) {
    if (e?.code !== '42P01') throw e
  }
  return { lineas, cambios, anotaciones, nombres }
}

async function escribir(google, gridRaw, n) {
  let meta = await google.getSheetMeta(ID)
  let hoja = meta.find((h) => h.title === PESTAÑA)
  if (!hoja) {
    // Oculta: es un insumo de fórmulas, no una pantalla. El guion bajo NO la oculta.
    await google.spreadsheetBatchUpdate(ID, [{ addSheet: { properties: { title: PESTAÑA, hidden: true, gridProperties: { rowCount: 60, columnCount: COLUMNAS.length + 1, frozenRowCount: 3 } } } }])
    meta = await google.getSheetMeta(ID)
    hoja = meta.find((h) => h.title === PESTAÑA)
    console.log(`  pestaña ${PESTAÑA} creada (oculta)`)
  }
  const alto = Math.max(n + FILA0 + 20, 60)
  if ((hoja.rows ?? 0) < alto) {
    await google.spreadsheetBatchUpdate(ID, [{ updateSheetProperties: { properties: { sheetId: hoja.sheetId, gridProperties: { rowCount: alto } }, fields: 'gridProperties.rowCount' } }])
  }
  // Un pago corregido a cero DESAPARECE: la cola de la corrida anterior se vacía con el centinela, como en
  // _EFECTIVO_RAW (es un espejo del que el OS es dueño entero: no hay nada anotado por una persona adentro).
  const cola = await conColaMedidaLeida(google, ID, PESTAÑA, gridRaw, { ancho: COLUMNAS.length, tope: 3000 })
  if (avisoDeCola(cola, PESTAÑA)) console.log(avisoDeCola(cola, PESTAÑA))
  await escribirPreservando(google, ID, PESTAÑA, cola.filas, { respetar: false, espejo: true, anchoHoja: Math.max(COLUMNAS.length, hoja.cols ?? COLUMNAS.length) })
  const rg = (r0, r1, c0, c1) => ({ sheetId: hoja.sheetId, startRowIndex: r0, endRowIndex: r1, startColumnIndex: c0, endColumnIndex: c1 })
  const reqs = [
    E.reset(hoja.sheetId, alto, COLUMNAS.length + 1),
    { repeatCell: { range: rg(0, 1, 0, COLUMNAS.length), cell: { userEnteredFormat: E.titulo() }, fields: 'userEnteredFormat' } },
    { repeatCell: { range: rg(1, 2, 0, COLUMNAS.length), cell: { userEnteredFormat: E.nota() }, fields: 'userEnteredFormat' } },
    // El parámetro del corte es una FECHA: con formato de texto la fórmula lo vería como texto y caería al 31/12/9999.
    { repeatCell: { range: rg(1, 2, 1, 2), cell: { userEnteredFormat: E.celda('fecha', { bold: true }) }, fields: 'userEnteredFormat' } },
    { repeatCell: { range: rg(2, 3, 0, COLUMNAS.length), cell: { userEnteredFormat: E.encabezado() }, fields: 'userEnteredFormat' } },
  ]
  COLUMNAS.forEach(([, unidad], j) => {
    reqs.push({ repeatCell: { range: rg(FILA0 - 1, alto, j, j + 1), cell: { userEnteredFormat: E.celda(unidad) }, fields: 'userEnteredFormat(numberFormat,textFormat,horizontalAlignment)' } })
  })
  await google.spreadsheetBatchUpdate(ID, reqs)
}

async function main() {
  const insumos = await leerInsumos()
  const { pagos, avisos } = armarPagos(insumos)
  const r = resumen(pagos)
  const destino = ID === ID_REAL ? 'SHEET REAL' : `copia ${ID}`
  console.log(`${PESTAÑA} · ${destino} · migración de la caja en efectivo: ${insumos.anotaciones ? 'aplicada' : 'NO aplicada (fecha = día del cambio)'}`)
  console.log(`${r.filas} pago(s) · banco ${r.banco.toFixed(2)} · efectivo ${r.efectivo.toFixed(2)}`)
  for (const q of r.porQuincena) console.log(`  ${q.quincena}: ${q.filas} fila(s) · banco ${q.banco.toFixed(2)} · efectivo ${q.efectivo.toFixed(2)}`)
  for (const a of avisos) console.log(`  ⚠ ${a}`)
  if (!modoAplicar(process.argv)) return console.log('ENSAYO: no escribí nada (escribe sólo con --aplicar).')

  const gridRaw = grilla(pagos, new Date().toISOString().slice(0, 16).replace('T', ' '))
  const google = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })
  await escribir(google, gridRaw, pagos.length)
  // VERIFICACIÓN POR EFECTO: la suma de Importe releída del Sheet = la suma armada desde la base.
  const v = await google.readSheetValues(ID, `${PESTAÑA}!${COL.importe}${FILA0}:${COL.importe}${FILA0 + pagos.length + 5}`, { render: 'UNFORMATTED_VALUE' })
  const leido = v.reduce((s, f) => s + (Number(f?.[0]) || 0), 0)
  const base = r.banco + r.efectivo
  console.log(`${PESTAÑA}: total leído del Sheet ${leido.toFixed(2)} · total de la base ${base.toFixed(2)}`)
  if (Math.abs(leido - base) > 0.005) { console.log('  ⚠ NO COINCIDEN'); process.exitCode = 1 }
  // EL CORTE TIENE QUE QUEDAR COMO FECHA: como texto, CAJA vuelve en silencio a leer todo de Nómina.
  const [[b2] = []] = await google.readSheetValues(ID, `${PESTAÑA}!B2`, { render: 'UNFORMATTED_VALUE' })
  console.log(`${PESTAÑA}!B2 (corte de quincena): ${b2} ${typeof b2 === 'number' ? '· fecha' : '⚠ NO ES FECHA'}`)
  if (typeof b2 !== 'number') process.exitCode = 1
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error('ERROR:', e.message); process.exit(1) })
}
