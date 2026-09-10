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
import { query, closePool, withTx } from '../lib/db.mjs'
import { CASHFLOW_ID } from '../lib/cash-briefing.mjs'
import { PRIMERA_FILA, claveDeCompra, contratoDeColumnas, filaACompra } from '../lib/compras-fila.mjs'
import { planDeReconciliacion } from '../lib/comprobantes/reconciliar-adjuntos.mjs'

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

/**
 * FILAS POR LOTE, NO DE A UNA (08/09/2026).
 *
 * Con un `insert` por fila, el sync tardaba **1 minuto 41 segundos** medido contra producción (932
 * filas de `compra_sheet` + 923 de `costos_obra` = 1.855 viajes de ida y vuelta a Supabase, con
 * 1,7 s de CPU: el 98% del tiempo era latencia de red). Ese minuto y medio es lo que separaba «el
 * bot cargó» de «la app lo muestra», y no hay forma de llamar tiempo real a eso.
 *
 * Agrupadas de a `LOTE`, son 3 sentencias en vez de 1.855. El tope duro de Postgres son 65.535
 * parámetros por sentencia: con 36 columnas entran 1.820 filas, así que 400 deja margen de sobra
 * aunque la pestaña triplique su tamaño.
 */
const LOTE = 400

/** Parte un array en grupos de `n`. */
function lotes(arr, n) {
  const out = []
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n))
  return out
}

/**
 * Un `insert ... values (...),(...),(...)` con los parámetros numerados corridos.
 * `extra` son las columnas literales que van iguales en todas las filas (`origen`, `now()`).
 */
function insertPorLote(tabla, columnas, valoresDeFila, grupo, extraSql = '') {
  const params = []
  const tuplas = grupo.map((c) => {
    const base = params.length
    const v = valoresDeFila(c)
    params.push(...v)
    return `(${v.map((_, i) => `$${base + i + 1}`).join(',')}${extraSql})`
  })
  return { sql: `insert into ${tabla} (${columnas}) values ${tuplas.join(',')}`, params }
}

/** Reescribe el espejo entero dentro de una transacción. */
async function escribirEspejo(db, compras) {
  const cols = CAMPOS.join(', ')
  await db.query('delete from public.compra_sheet')
  for (const grupo of lotes(compras, LOTE)) {
    const { sql, params } = insertPorLote('public.compra_sheet', cols, (c) => CAMPOS.map((k) => c[k] ?? null), grupo)
    await db.query(sql, params)
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
async function escribirCostosObra(db, compras) {
  const conObra = compras.filter((c) => c.obra_texto && (c.total || c.importe))
  await db.query("delete from public.costos_obra where origen='compras_sheet'")
  const cols = `obra_texto, unidad_negocio, proveedor, modalidad, tipo, comprobante, categoria, concepto,
         importe, iva, total, fecha, fecha_pago, mes, referencia_externa, origen, sincronizado_en`
  const valores = (c) => [
    c.obra_texto, c.unidad_negocio, c.proveedor, c.modalidad, c.tipo, c.comprobante, c.categoria,
    [c.detalle_obra, c.concepto].filter(Boolean).join(' — ') || null,
    c.importe || null, c.iva || null, c.total || c.importe,
    c.fecha, c.fecha_caja ?? c.fecha_prevista, c.mes,
    c.sheet_id === null ? String(c.fila) : String(c.sheet_id),
  ]
  for (const grupo of lotes(conObra, LOTE)) {
    const { sql, params } = insertPorLote('public.costos_obra', cols, valores, grupo, ",'compras_sheet', now()")
    await db.query(sql, params)
  }
  return conObra.length
}

/**
 * EL PAPEL VUELVE A SU FILA, EN LA MISMA TRANSACCIÓN QUE REESCRIBE EL ESPEJO (10/09/2026).
 *
 * La clave de una compra no es estable: es `c:<cuit>|<numero>` cuando la fila trae CUIT y
 * `p:<proveedor>|<numero>` cuando no. La columna «CUIT (OS)» la resuelve el directorio de
 * proveedores, así que la MISMA fila cambia de clave sin que nadie la toque y el adjunto vinculado
 * ayer queda huérfano hoy — la compra sale «sin comprobante» con el archivo guardado. Medidos el
 * 10/09 sobre la base viva: 5 de 194.
 *
 * Reconciliar acá y no en la pantalla es lo que impide que el vínculo envejezca: se recalcula junto
 * con lo único que lo hace envejecer. La regla («el número y el tipo coinciden siempre; la identidad
 * se afloja sólo si el proveedor la confirma») vive en `clave-conciliada.mjs` y no se reimplementa.
 * Un adjunto que no empata con exactamente UNA fila se deja como está y se cuenta.
 */
async function reconciliarAdjuntos(db, compras) {
  const { rows: adjuntos } = await db.query(
    'select id, compra_clave, fila_compras, vinculado_por, lectura from public.compra_adjunto')
  const plan = planDeReconciliacion(adjuntos, compras)
  for (const r of plan.refrescar) {
    await db.query('update public.compra_adjunto set fila_compras=$2 where id=$1', [r.id, r.fila])
  }
  for (const r of plan.reasignar) {
    // `match_numero` y no `registro`: la identidad se resolvió por CÁLCULO, no porque el bot lo
    // haya visto. La pantalla muestra esa diferencia y tiene que poder seguir mostrándola.
    await db.query(
      `update public.compra_adjunto
          set compra_clave=$2, fila_compras=$3, vinculado_por='match_numero', confianza=0.9, vinculado_at=now()
        where id=$1 and vinculado_por <> 'match_manual'`, [r.id, r.clave, r.fila])
  }
  return plan
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

  // UNA SOLA CONEXIÓN. `query('begin')` sobre el pool abría la transacción en una conexión y el
  // delete + insert caían en otras: no había transacción y el «ROLLBACK» del log era mentira
  // (08/09/2026, 15:13: `duplicate key value violates unique constraint "compra_sheet_pkey"` con el
  // espejo íntegro). `withTx` entrega el cliente y las dos escrituras viajan con él.
  let enCostos = 0
  let plan = null
  try {
    enCostos = await withTx(async (db) => {
      // ═══ DOS CORRIDAS NO SE PISAN (08/09/2026) ═══
      //
      // Desde que la carga por chat dispara el espejo apenas escribe en el Sheet, el timer y el
      // disparo pueden solaparse. El `delete + insert` es atómico adentro de la transacción, pero
      // dos transacciones concurrentes ven cada una el estado previo y las dos insertan: la segunda
      // muere con `duplicate key value violates unique constraint "compra_sheet_pkey"` (es
      // exactamente el error que apareció el 08/09 a las 15:13). El lock de transacción las
      // serializa —la segunda espera y arranca cuando la primera ya commiteó— y se suelta solo en
      // el commit o el rollback: no hay forma de dejarlo tomado.
      await db.query("select pg_advisory_xact_lock(hashtext('sync-compras'))")
      await escribirEspejo(db, compras)
      const n = await escribirCostosObra(db, compras)
      plan = await reconciliarAdjuntos(db, compras)
      return n
    })
  } catch (e) {
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
  if (plan) {
    console.log(`adjuntos: ${plan.reasignar.length} reconciliados · ${plan.refrescar.length} renglón al día · `
      + `${plan.colgados.length} sin fila que sea ese comprobante · ${plan.sinClave} sin clave (a asignar a mano)`)
    for (const c of plan.colgados.slice(0, 10)) console.log(`  colgado: ${c.compra_clave} — ${c.motivo}`)
  }
  await closePool()
}
main().catch(async (e) => { console.error('sync-compras falló:', e.message); await closePool().catch(() => {}); process.exit(1) })
