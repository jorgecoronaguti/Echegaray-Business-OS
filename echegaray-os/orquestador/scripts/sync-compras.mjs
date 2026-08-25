#!/usr/bin/env node
// LA PESTAÑA «COMPRAS» → POSTGRES. Una sola lectura del Sheet, dos proyecciones.
//
//   · `public.compra_sheet` — la pestaña ENTERA, fila por fila, columna por columna. Es lo que lee
//     la pantalla 24, y existe porque el dueño pidió (25/08/2026, textual) que «la sección compras
//     en app.ecsas replique toda la información que actualmente se concentra en pestaña Compras».
//   · `public.costos_obra` — la proyección de siempre (sólo lo que tiene obra y mueve plata), con su
//     regla de siempre, para no cambiarle el significado a una vista que ya está en producción.
//
// ═══ QUÉ CAMBIÓ Y POR QUÉ (25/08/2026) ═══
//
// 1. LAS COLUMNAS SE RESUELVEN POR SU RÓTULO. Antes se direccionaban por posición (`r[24]`) y el
//    comentario afirmaba que el índice 24 era «Fecha contable del pago». Hoy el 24 es «Tipo de
//    Costo» y dice «Directo»/«Indirecto»: se agregó una columna en el medio y la referencia se
//    corrió sola. No produjo un número malo de casualidad —`parseFecha('Indirecto')` es `null` y
//    caía al respaldo, que resultó ser el valor correcto— pero es exactamente el fósil que
//    `lib/compras-columnas.mjs` existe para impedir. Ahora la corrida ABORTA con el nombre del
//    rótulo que falta adentro del mensaje.
//
// 2. SE LEE SIN FORMATO. Con formato, el ID 0 se dibuja «—» (así entró a Postgres una compra real de
//    $54.043,44 con un guión por clave) y los importes vuelven como texto con puntos y comas —el
//    camino por el que un tique de $95.277,07 entró como $9.527.707. Sin formato, un importe es un
//    número y una fecha es un serial, y no hay nada que interpretar.
//
// 3. NO SE DESCARTAN FILAS. Antes se exigía obra e importe distinto de cero, y eso dejaba 8 filas
//    afuera de 882 — entre ellas una de $54.043,44 pagada. La pantalla decía «875» sobre un libro de
//    882: un control que no pudo mirar todo no puede afirmar que no hay nada más.
//
// Se corre en la VM por timer (`echegaray-compras-sync.timer`). No escribe NADA en el Sheet.
//   node orquestador/scripts/sync-compras.mjs [--dry]

import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { query, closePool } from '../lib/db.mjs'
import { CASHFLOW_ID } from '../lib/cash-briefing.mjs'
import { PRIMERA_FILA, claveDeCompra, contratoDeColumnas, filaACompra } from '../lib/compras-fila.mjs'

const DRY = process.argv.includes('--dry')

/** Las columnas de `compra_sheet` que se escriben, en orden. `fila` va primero: es la PK. */
const CAMPOS = [
  'fila', 'sheet_id', 'clave', 'categoria', 'fecha', 'mes', 'proveedor', 'modalidad', 'tipo',
  'comprobante', 'unidad_negocio', 'obra_texto', 'detalle_obra', 'concepto', 'importe', 'iva',
  'total', 'tipo_pago', 'fecha_prevista', 'pago_total_o_parcial', 'monto_pagado', 'monto_parcial_1',
  'fecha_prevista_2', 'monto_parcial_2', 'estado', 'tipo_costo', 'estado_pago', 'estado_carga',
  'fecha_caja', 'familia_material', 'sub_rubro', 'repetido', 'saldo_pendiente', 'cuit',
  'tramo_vencimiento', 'anulada',
]

/**
 * EL CENTINELA. Una lectura que devuelve mucho menos de lo que ya hay guardado no es «se borraron
 * filas»: es una lectura que falló a medias (una cuota de API, un rango mal armado, la pestaña
 * renombrada). Reescribir el espejo con eso BORRA el libro y deja el sistema afirmando que la
 * empresa compró menos. Se aborta y se avisa; recuperar se hace mirando, no corriendo el sync otra
 * vez. Ya pasó en este repo con otros generadores.
 */
const PISO = 0.8

/** Lee la pestaña entera —encabezado incluido— en UN viaje. */
async function leerPestana() {
  const google = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })
  const filas = await google.readSheetValues(CASHFLOW_ID, 'Compras!A3:BZ6000', { render: 'UNFORMATTED_VALUE' })
  if (!filas.length) throw new Error('no leí nada de Compras — no toco las tablas')
  const idx = contratoDeColumnas(filas[0])
  const compras = []
  for (const [i, f] of filas.slice(1).entries()) {
    const c = filaACompra(f, idx, i + PRIMERA_FILA)
    if (!c) continue
    c.clave = claveDeCompra(c)
    compras.push(c)
  }
  return compras
}

/** Reescribe el espejo entero dentro de una transacción. */
async function escribirEspejo(compras) {
  const cols = CAMPOS.join(', ')
  const marcas = CAMPOS.map((_, i) => `$${i + 1}`).join(',')
  await query('delete from public.compra_sheet')
  for (const c of compras) {
    await query(`insert into public.compra_sheet (${cols}) values (${marcas})`, CAMPOS.map((k) => c[k] ?? null))
  }
}

/**
 * LA PROYECCIÓN DE SIEMPRE, con la regla de siempre: sólo lo que tiene obra y mueve plata.
 *
 * `concepto` sigue siendo «detalle — concepto» pegados: es lo que ya consume la web de control de
 * obras, y separarlos acá sería cambiarle el dato a una pantalla que no lo pidió. En `compra_sheet`
 * viven separados, que es donde hacía falta.
 *
 * `fecha_pago` sale de «Fecha de caja» y, si no está, de la prevista. Verificado sobre las 882 filas
 * del 25/08: coincide con lo que la tabla tiene hoy en las 882 — el cambio saca el fósil sin mover
 * ningún valor.
 */
async function escribirCostosObra(compras) {
  const conObra = compras.filter((c) => c.obra_texto && (c.total || c.importe))
  await query("delete from public.costos_obra where origen='compras_sheet'")
  for (const c of conObra) {
    await query(
      `insert into public.costos_obra
        (obra_texto, unidad_negocio, proveedor, modalidad, tipo, comprobante, categoria, concepto,
         importe, iva, total, fecha, fecha_pago, mes, origen, referencia_externa, sincronizado_en)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'compras_sheet',$15, now())`,
      [c.obra_texto, c.unidad_negocio, c.proveedor, c.modalidad, c.tipo, c.comprobante, c.categoria,
        [c.detalle_obra, c.concepto].filter(Boolean).join(' — ') || null,
        c.importe || null, c.iva || null, c.total || c.importe,
        c.fecha, c.fecha_caja ?? c.fecha_prevista, c.mes,
        c.sheet_id === null ? String(c.fila) : String(c.sheet_id)],
    )
  }
  return conObra.length
}

async function main() {
  const compras = await leerPestana()
  const { rows: [previo] } = await query('select count(*)::int n from public.compra_sheet')
  if (previo.n && compras.length < previo.n * PISO) {
    console.error(`CENTINELA: leí ${compras.length} filas y el espejo tiene ${previo.n}. `
      + 'Una caída así es una lectura fallida, no una pestaña vaciada. NO toco nada.')
    await closePool(); process.exit(1)
  }

  const conClave = compras.filter((c) => c.clave).length
  const anuladas = compras.filter((c) => c.anulada).length
  if (DRY) {
    console.log(`[dry] ${compras.length} filas · ${conClave} con clave · ${anuladas} anuladas · `
      + `espejo actual ${previo.n}. No escribo nada.`)
    await closePool(); return
  }

  await query('begin')
  let enCostos = 0
  try {
    await escribirEspejo(compras)
    enCostos = await escribirCostosObra(compras)
    await query('commit')
  } catch (e) {
    await query('rollback')
    console.error('sync falló, ROLLBACK:', e.message)
    await closePool(); process.exit(1)
  }

  await query(
    `insert into public.integraciones (slug, nombre, estado, salud, ultimo_sync, notas)
     values ('compras_sheet','Compras (Flujo de Caja)','en_curso','ok',now(),$1)
     on conflict (slug) do update set estado='en_curso', salud='ok', ultimo_sync=now(), notas=excluded.notas`,
    [`Pestaña Compras espejada entera: ${compras.length} filas (${anuladas} anuladas), ${enCostos} con obra en costos_obra.`],
  ).catch(() => {})

  console.log(`espejo: ${compras.length} filas de Compras → compra_sheet (${conClave} con clave, ${anuladas} anuladas)`)
  console.log(`costos_obra: ${enCostos} con obra asignada`)
  await closePool()
}
main().catch(async (e) => { console.error('sync-compras falló:', e.message); await closePool().catch(() => {}); process.exit(1) })
