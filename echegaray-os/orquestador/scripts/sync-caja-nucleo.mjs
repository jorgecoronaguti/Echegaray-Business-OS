#!/usr/bin/env node
// REPLICA AL NÚCLEO LAS DOS FUENTES DE CAJA QUE VIVÍAN SÓLO EN EL SHEET.
//
// POR QUÉ (20/07). Contrastando el núcleo contra la planilla, el núcleo daba $60.402.163 MENOS en el
// año. $53.637.487 son estas dos cosas:
//   · los JORNALES, que el cash flow toma de la planilla real de quincenas ($185.505.626) y no de
//     Compras, donde están tipeados a mano como estimación ($144.848.022) — o sea que el núcleo
//     subestimaba el egreso más grande de la empresa en $40,7M;
//   · los CHEQUES Y LA TARJETA SIN FACTURA ($12.979.883), pagos que salen del banco y cuya factura
//     nadie cargó, así que ninguna consulta al núcleo los veía.
//
// EL CRUCE SE HACE ACÁ Y NO EN SQL, a propósito. Decidir si un cheque ya está contemplado exige
// normalizar el número de comprobante de los dos lados ("0001-000036" y "1-36" son el mismo), y esa
// función ya existe en lib/cheques-cobertura.mjs y es la que usa el Sheet. Reimplementarla en SQL
// sería una segunda definición del cruce — y el cruce es justamente lo que decide si un pago está
// contemplado o si está duplicado.
//
//   node orquestador/scripts/sync-caja-nucleo.mjs [--dry]

import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { query, closePool } from '../lib/db.mjs'
import { parseMonto, parseFecha } from '../lib/cash-briefing.mjs'
import { normComprobante, esLlaveUtil } from '../lib/cheques-cobertura.mjs'
import { hallarPestana } from '../lib/sheet-pestanas.mjs'
// Las columnas del cuadro las declara el módulo que las ESCRIBE. Ver COL_REGISTRO.
import { COL_REGISTRO, COL_PROYECCION } from '../lib/nomina-sync.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const DRY = process.argv.includes('--dry')
const iso = (d) => (d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : null)
const ars = (n) => '$' + Math.round(n).toLocaleString('es-AR')

/**
 * NÚCLEO PURO: las quincenas, reales y proyectadas, leídas POR RANGO CON NOMBRE.
 *
 * ═══ ESTABA FOSILIZADO, Y SE PODÍA MEDIR CUÁNTO (31/07) ═══
 *
 * Esta función leía las filas 3–16 (real) y 24–33 (proyección) ESCRITAS A MANO. El rediseño del 23/07
 * movió las quincenas reales a la fila 60 y la proyección a la 18. Consecuencia medida en la base el
 * 31/07, once días después:
 *
 *   · `public.jornal_quincena` tenía CUATRO filas —Nov 1-15, Nov 16-30, Dic 1-15, Dic 16-31— por
 *     $28.213.222, y CERO quincenas reales. El Sheet dice 14 reales por $114.260.361 y 10 proyectadas
 *     por $69.912.410. O sea que la web y el motor financiero veían el 15% de los jornales del año, y
 *     ninguna quincena pagada.
 *   · No dio un solo error. Las filas 3–16 del layout nuevo son el hero y los títulos: `parseMonto`
 *     de una celda vacía devuelve 0, la fila se saltea, y el script termina diciendo "OK".
 *
 * Es exactamente el modo de falla que los rangos con nombre existen para eliminar, y que la fórmula
 * del cash flow ya había arreglado el 23/07 — este script se quedó atrás porque nadie lo miró.
 *
 * AHORA LA GEOMETRÍA LA DICE LA PESTAÑA. Los seis rangos los publica jornales-pestana.mjs y se mueven
 * con ella. Si un rango no existe, esto FALLA RUIDOSAMENTE en vez de escribir un universo incompleto:
 * un núcleo con el 15% de los jornales es peor que un núcleo que avisa que no pudo sincronizar.
 *
 * EL ANCLA ES EL RANGO CON NOMBRE, LAS COLUMNAS SON UNA DECLARACIÓN COMPARTIDA. Las FILAS —lo que se
 * fosilizó— salen de `JORNALES_REAL_HASTA` / `JORNALES_PROY_HASTA`, que la pestaña mueve sola. Las
 * COLUMNAS salen de `COL_REGISTRO` / `COL_PROYECCION` en lib/nomina-sync.mjs, el mismo módulo que las
 * ESCRIBE: una sola definición, imposible de desincronizar.
 *
 * @param {{real:any[][], proyeccion:any[][]}} bloques las filas de cada bloque, ya recortadas
 */
export function leerJornales({ real = [], proyeccion = [] } = {}) {
  const out = []
  const armar = (filas, clase, C, extras) => {
    for (const f of filas) {
      const h = parseFecha(f?.[C.hasta])
      const t = parseMonto(f?.[C.total])
      if (!h || !t) continue
      // LA FECHA DE CAJA ES LA DE PAGO, CON FALLBACK A HASTA. Es la misma regla que la fórmula del
      // cash flow: si la celda de pago está vacía la quincena no desaparece, vale su cierre.
      const p = parseFecha(f?.[C.pago]) ?? h
      out.push({
        desde: iso(parseFecha(f?.[C.desde])) ?? iso(h), hasta: iso(h), fecha_pago: iso(p), clase,
        total: t, ...extras(f),
      })
    }
  }
  armar(real, 'real', COL_REGISTRO, (f) => ({
    dias_habiles: Number(f?.[COL_REGISTRO.dias]) || null,
    personas: Number(f?.[COL_REGISTRO.personas]) || null,
    hs_reales: parseMonto(f?.[COL_REGISTRO.hs_reales]) || null,
    banco: parseMonto(f?.[COL_REGISTRO.banco]),
    adelanto: parseMonto(f?.[COL_REGISTRO.adelanto]),
    total_recibo: parseMonto(f?.[COL_REGISTRO.total_recibo]),
  }))
  armar(proyeccion, 'proyeccion', COL_PROYECCION, () => ({
    dias_habiles: null, personas: null, hs_reales: null, banco: null, adelanto: null, total_recibo: null,
  }))
  return out
}

/** Los dos rangos con nombre que anclan los bloques. Sin ellos esta sincronización NO escribe. */
export const ANCLAS = { real: 'JORNALES_REAL_HASTA', proyeccion: 'JORNALES_PROY_HASTA' }

async function main() {
  const google = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })
  const hojas = await google.getSheetMeta(ID)
  const tabCheques = hallarPestana(hojas, 'Cheques Emitidos').title
  const tabTarjeta = hallarPestana(hojas, 'Tarjeta').title
  const tabJornales = hallarPestana(hojas, 'Jornales').title

  // ── LOS BLOQUES, UBICADOS POR SU RANGO CON NOMBRE ──
  // Si el ancla no está, se corta acá. Escribir con la geometría equivocada fue el defecto: dejó la
  // base con cero quincenas reales durante once días sin dar un error.
  const nombrados = new Map((await google.getNamedRanges(ID)).map((r) => [r.name, r.range]))
  const bloque = (clave) => {
    const r = nombrados.get(ANCLAS[clave])
    if (!r || r.startRowIndex == null) {
      throw new Error(`falta el rango con nombre ${ANCLAS[clave]} en "${tabJornales}": corré primero jornales-pestana.mjs. No sincronizo con filas adivinadas.`)
    }
    return { desde: r.startRowIndex + 1, hasta: r.endRowIndex }
  }
  const bReal = bloque('real'), bProy = bloque('proyeccion')
  const [filasReal, filasProy] = await Promise.all([
    google.readSheetValues(ID, `${tabJornales}!A${bReal.desde}:M${bReal.hasta}`),
    google.readSheetValues(ID, `${tabJornales}!A${bProy.desde}:M${bProy.hasta}`),
  ])
  console.log(`bloques por rango con nombre: real filas ${bReal.desde}–${bReal.hasta} · proyección ${bProy.desde}–${bProy.hasta}`)

  const jornales = leerJornales({ real: filasReal, proyeccion: filasProy })
  const real = jornales.filter((j) => j.clase === 'real').reduce((s, j) => s + j.total, 0)
  const proy = jornales.filter((j) => j.clase === 'proyeccion').reduce((s, j) => s + j.total, 0)
  console.log(`JORNALES  ${jornales.length} quincenas · real ${ars(real)} · proyectado ${ars(proy)} · total ${ars(real + proy)}`)
  // CUÁNTAS QUINCENAS CAMBIAN DE MES POR LA FECHA DE PAGO. Es el número que explica por qué la web y
  // el Sheet pueden discrepar mes a mes aunque el total del año coincida.
  const cambian = jornales.filter((j) => j.fecha_pago.slice(0, 7) !== j.hasta.slice(0, 7))
  if (cambian.length) {
    console.log(`  ${cambian.length} quincena(s) se pagan en un mes distinto al de su cierre — ${ars(cambian.reduce((s, j) => s + j.total, 0))} que la caja mueve de mes:`)
    for (const j of cambian) console.log(`    ${j.desde}→${j.hasta} se paga ${j.fecha_pago} · ${ars(j.total)}`)
  }

  // Las claves de comprobante que SÍ están en Compras. Misma normalización que usa el Sheet.
  const compras = await google.readSheetValues(ID, 'Compras!A4:O940')
  const enCompras = new Set(
    compras.filter((f) => parseMonto(f?.[14]) !== 0).map((f) => normComprobante(f?.[7])).filter(esLlaveUtil),
  )

  const instrumentos = []
  for (const f of await google.readSheetValues(ID, `${tabCheques}!A2:L400`)) {
    const monto = parseMonto(f?.[5])
    if (!monto) continue
    const k = normComprobante(f?.[7])
    instrumentos.push({
      tipo: 'cheque', numero: String(f?.[1] ?? '').trim() || null, proveedor: f?.[4] ?? null, monto,
      comprobante: String(f?.[7] ?? '').trim() || null,
      comprobante_norm: esLlaveUtil(k) ? k : null,
      factura_en_compras: esLlaveUtil(k) && enCompras.has(k),
      fecha_pago: iso(parseFecha(f?.[8])), debitado: String(f?.[10] ?? '').trim().toUpperCase() === 'SI',
      unidad_negocio: f?.[11] ?? null, origen: 'cheques_sheet',
    })
  }
  for (const f of await google.readSheetValues(ID, `${tabTarjeta}!A3:K400`)) {
    const monto = parseMonto(f?.[4])
    if (!monto) continue
    const k = normComprobante(f?.[6])
    instrumentos.push({
      tipo: 'tarjeta', numero: null, proveedor: f?.[2] ?? null, monto,
      comprobante: String(f?.[6] ?? '').trim() || null,
      comprobante_norm: esLlaveUtil(k) ? k : null,
      factura_en_compras: esLlaveUtil(k) && enCompras.has(k),
      fecha_pago: iso(parseFecha(f?.[7])), debitado: String(f?.[9] ?? '').trim().toUpperCase() === 'SI',
      unidad_negocio: f?.[10] ?? null, origen: 'tarjeta_sheet',
    })
  }
  const sinFactura = instrumentos.filter((i) => !i.factura_en_compras && i.comprobante_norm)
  console.log(`INSTRUMENTOS  ${instrumentos.length} · con factura en Compras ${instrumentos.filter((i) => i.factura_en_compras).length}`)
  console.log(`  sin factura CONFIRMADO (tienen N° y no está): ${sinFactura.length} · ${ars(sinFactura.reduce((s, i) => s + i.monto, 0))}`)
  console.log(`  sin N° de comprobante (no se puede saber): ${instrumentos.filter((i) => !i.comprobante_norm).length}`)
  if (DRY) return console.log('\n--dry: no escribí nada.')

  // Se reemplaza el universo entero de cada origen: el Sheet manda y una fila borrada allá tiene que
  // desaparecer acá. Con upsert quedarían fantasmas que nadie vuelve a mirar.
  await query('delete from public.jornal_quincena where origen = $1', ['jornales_sheet'])
  for (const j of jornales) {
    await query(
      `insert into public.jornal_quincena
         (desde, hasta, fecha_pago, clase, personas, dias_habiles, hs_reales, banco, adelanto, total_recibo, total)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       on conflict (desde, hasta, clase) do update set
         total = excluded.total, fecha_pago = excluded.fecha_pago, sincronizado_en = now()`,
      [j.desde, j.hasta, j.fecha_pago, j.clase, j.personas, j.dias_habiles, j.hs_reales, j.banco, j.adelanto, j.total_recibo, j.total],
    )
  }
  await query("delete from public.instrumento_pago where origen in ('cheques_sheet','tarjeta_sheet')")
  for (const i of instrumentos) {
    await query(
      `insert into public.instrumento_pago
         (tipo, numero, proveedor, monto, comprobante, comprobante_norm, factura_en_compras, fecha_pago, debitado, unidad_negocio, origen)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       on conflict do nothing`,
      [i.tipo, i.numero, i.proveedor, i.monto, i.comprobante, i.comprobante_norm, i.factura_en_compras,
        i.fecha_pago, i.debitado, i.unidad_negocio, i.origen],
    )
  }
  const { rows: [r] } = await query(
    `select (select round(sum(total)) from public.jornal_quincena)                                       as jornales,
            (select round(sum(monto)) from public.instrumento_pago
              where not factura_en_compras and comprobante_norm is not null)                             as sin_factura`)
  console.log(`\nEN EL NÚCLEO: jornales ${ars(Number(r.jornales))} · instrumentos sin factura ${ars(Number(r.sin_factura))}`)
  await closePool()
}

main().catch((e) => { console.error('ERROR:', e.message); process.exit(1) })
