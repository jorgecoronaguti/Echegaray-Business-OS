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

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const DRY = process.argv.includes('--dry')
const iso = (d) => (d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : null)
const ars = (n) => '$' + Math.round(n).toLocaleString('es-AR')

/**
 * Las quincenas, reales y proyectadas.
 *
 * LOS DOS BLOQUES Y POR QUÉ EL CORTE ESTÁ DONDE ESTÁ. El bloque real llega hasta la fila 16
 * (quincena 16/7–30/7, ya liquidada). El bloque de proyección arranca en la fila 23, pero esa fila
 * es la quincena EN CURSO (16/7–31/7) y se saltea: su equivalente ya está en el bloque real y
 * contarla dos veces sumaría $7.417.358 que nadie va a pagar de nuevo. Es el mismo corte que hace la
 * fórmula del cash flow, y tiene que seguir siendo el mismo o las dos caras dejan de coincidir.
 */
function leerJornales(filas) {
  const out = []
  // A=Desde, B=Hasta, C=Días, D=Personas, F=Hs reales, G=Banco, H=Adelanto, I=Recibo, J=TOTAL.
  for (let i = 2; i <= 15; i++) {
    const f = filas[i]
    const hasta = parseFecha(f?.[1])
    const total = parseMonto(f?.[9])
    if (!hasta || !total) continue
    out.push({
      desde: iso(parseFecha(f?.[0])) ?? iso(hasta), hasta: iso(hasta), clase: 'real',
      dias_habiles: Number(f?.[2]) || null, personas: Number(f?.[3]) || null,
      hs_reales: parseMonto(f?.[5]) || null, banco: parseMonto(f?.[6]),
      adelanto: parseMonto(f?.[7]), total_recibo: parseMonto(f?.[8]), total,
    })
  }
  // Proyección: A=Desde, B=Hasta, C=Días, D=Personas, G=TOTAL PROYECTADO. Desde la fila 24.
  for (let i = 23; i <= 32; i++) {
    const f = filas[i]
    const hasta = parseFecha(f?.[1])
    const total = parseMonto(f?.[6])
    if (!hasta || !total) continue
    out.push({
      desde: iso(parseFecha(f?.[0])) ?? iso(hasta), hasta: iso(hasta), clase: 'proyeccion',
      dias_habiles: Number(f?.[2]) || null, personas: Number(f?.[3]) || null,
      hs_reales: null, banco: null, adelanto: null, total_recibo: null, total,
    })
  }
  return out
}

async function main() {
  const google = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })
  const hojas = await google.getSheetMeta(ID)
  const tabCheques = hallarPestana(hojas, 'Cheques').title
  const tabTarjeta = hallarPestana(hojas, 'Tarjeta').title
  const tabJornales = hallarPestana(hojas, 'Jornales').title

  const jornales = leerJornales(await google.readSheetValues(ID, `${tabJornales}!A1:L40`))
  const real = jornales.filter((j) => j.clase === 'real').reduce((s, j) => s + j.total, 0)
  const proy = jornales.filter((j) => j.clase === 'proyeccion').reduce((s, j) => s + j.total, 0)
  console.log(`JORNALES  ${jornales.length} quincenas · real ${ars(real)} · proyectado ${ars(proy)} · total ${ars(real + proy)}`)

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
         (desde, hasta, clase, personas, dias_habiles, hs_reales, banco, adelanto, total_recibo, total)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       on conflict (desde, hasta, clase) do update set total = excluded.total, sincronizado_en = now()`,
      [j.desde, j.hasta, j.clase, j.personas, j.dias_habiles, j.hs_reales, j.banco, j.adelanto, j.total_recibo, j.total],
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
