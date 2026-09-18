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
import { PESTANAS, rangoFilas } from '../lib/columnas-por-encabezado.mjs'
import { esCostoDeObra } from '../lib/compras-costo-de-obra.mjs'
import { asignadorConColumnaObra, asignadorDeCompras, catalogosDeAsignacion, planDeAsignacion, VIA } from '../lib/compras-obra-asignada.mjs'
import { catalogoDeDestinos, proyectarObraDeFila } from '../lib/obra-destino.mjs'
import { ahoraDeLaBase, leerLoDecididoEnLaApp, mismoConjunto, superponerLoDecidido } from '../lib/compras-superposicion.mjs'
import { columnasSinRefrescar, columnasVivasDeCompraSheet, porQueNoEscribo } from '../lib/compras-espejo-columnas.mjs'
import { planDeReconciliacion, proveedorPorArchivo } from '../lib/comprobantes/reconciliar-adjuntos.mjs'
import { avisarSiCambio, fotografiar, lineaDeAviso } from '../lib/espejo-aviso.mjs'

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
/** La columna Obra, por encabezado (Compras L / Cobranzas H), proyectada. Sólo se escriben si la migración 20260915T0700 está aplicada. */
const CAMPOS_OBRA = ['destino', 'obra_id', 'obra_celda', 'obra_inconsistencia']

/**
 * ¿Está aplicada `20260915T0700_obra_por_fila`? Sin ella las columnas no existen y la vía
 * `obra_de_la_fila` la rechaza el CHECK: escribirla abortaría el espejo entero cada hora. Sin la
 * migración el sync hace exactamente lo de antes y lo dice.
 */
async function hayObraPorFila(q) {
  const { rows } = await q(
    `select count(*)::int n from information_schema.columns
      where table_schema='public' and table_name='compra_sheet' and column_name = any($1)`, [CAMPOS_OBRA])
  return rows[0].n === CAMPOS_OBRA.length
}

// ═══ LO QUE LA APP DECIDIÓ Y EL SHEET TODAVÍA NO TIENE SE LEE ADENTRO DE LA TRANSACCIÓN (18/09/2026) ═══
//
// Antes se leían acá, sueltas, dos consultas (`cambiosPendientes`, `pagosPendientes`), ANTES de abrir
// la transacción y sólo lo `pendiente`/`procesando`. Tres formas de pisar al dueño, todas medidas en
// el código: la cola de pagos entraba a la superposición de OBRA (un pago en vuelo dejaba la obra en
// «total»); un cambio que el worker aplicó mientras el sync leía el Sheet no estaba en ningún lado; y
// un cambio creado entre esa lectura y el commit se perdía del espejo hasta la corrida siguiente.
// La regla de qué cuenta vive en `lib/compras-superposicion.mjs`; acá sólo queda CUÁNDO se lee: con
// el lock tomado, y una segunda vez después de escribir (ver `main`).

/**
 * UN PEDIDO QUE EL SHEET YA CONTRADIJO NO PUEDE APLICARSE NUNCA MÁS: se cierra con el detalle adentro.
 *
 * El bisturí lo iba a rechazar igual cuando el worker lo tomara (`celda_cambio`). Cerrarlo acá evita
 * que la pantalla muestre «pendiente de Sheet» durante horas por algo que no va a aterrizar, y deja
 * escrito QUÉ dice el Sheet ahora — que es lo que necesita quien tenga que volver a decidir.
 */
async function declararConflictos(q, conflictos) {
  for (const c of conflictos) {
    await q(`update public.compra_obra_cambio set estado = 'rechazado', motivo = $2
              where id = $1 and estado in ('pendiente','procesando')`,
      [c.id, `conflicto: ${c.detalle}`])
    console.log(`  ⚠ pago de la fila ${c.fila} descartado — ${c.detalle}`)
  }
}

/** Destino y obra de cada fila, con las inconsistencias contadas para el log. */
function proyectarObras(compras, cat) {
  const inconsistentes = []
  for (const c of compras) {
    Object.assign(c, proyectarObraDeFila(c, cat))
    if (c.obra_inconsistencia) inconsistentes.push(`fila ${c.fila}: ${c.obra_inconsistencia}`)
  }
  return inconsistentes
}

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
  const filas = await google.readSheetValues(CASHFLOW_ID, rangoFilas('Compras', PESTANAS.Compras.filaEncabezado, 6000), { render: 'UNFORMATTED_VALUE' })
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

/**
 * Reescribe el espejo entero dentro de una transacción — POR UPSERT, NO POR `delete` + `insert` (18/09/2026).
 *
 * Las RPC de la app (`compra_obra_asignar`, `compra_pago_registrar`) hacen `select … from compra_sheet
 * where fila = $1 for update` y, si no encuentran la fila, contestan «esa fila ya no está en Compras».
 * Con `delete` + `insert`, durante los ~2 s de esta transacción la fila NO ESTÁ: una RPC que llega en ese
 * momento espera el commit, vuelve a evaluar sobre una fila borrada y falla. Con upsert la fila existe
 * siempre; la RPC espera el lock de fila, relee la versión recién escrita y sigue. Las filas que la
 * pestaña ya no trae se borran aparte, por diferencia.
 */
async function escribirEspejo(db, compras, conObra) {
  const campos = conObra ? [...CAMPOS, ...CAMPOS_OBRA] : CAMPOS
  const cols = campos.join(', ')
  const set = campos.filter((k) => k !== 'fila').map((k) => `${k} = excluded.${k}`).join(', ')
  for (const grupo of lotes(compras, LOTE)) {
    const { sql, params } = insertPorLote('public.compra_sheet', cols, (c) => campos.map((k) => c[k] ?? null), grupo)
    await db.query(`${sql} on conflict (fila) do update set ${set}, sincronizado_en = now()`, params)
  }
  await db.query('delete from public.compra_sheet where not (fila = any($1::int[]))', [compras.map((c) => Number(c.fila))])
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
async function escribirCostosObra(db, compras, obraPorFila) {
  const conObra = compras.filter(esCostoDeObra)
  await db.query("delete from public.costos_obra where origen='compras_sheet'")
  // `destino` y `obra_id` salen de la columna Obra de la fila (null = la fila no la trae). El costo
  // POR OBRA sigue saliendo de `compra_obra_asignada`, que ya prefiere la fila: esto es para quien lea
  // estructura (P&L) sin volver a parsear el texto.
  const cols = `obra_texto, unidad_negocio, proveedor, modalidad, tipo, comprobante, categoria, concepto,
         importe, iva, total, fecha, fecha_pago, mes, referencia_externa${obraPorFila ? ', destino, obra_id' : ''}, origen, sincronizado_en`
  const valores = (c) => [
    c.obra_texto, c.unidad_negocio, c.proveedor, c.modalidad, c.tipo, c.comprobante, c.categoria,
    [c.detalle_obra, c.concepto].filter(Boolean).join(' — ') || null,
    c.importe || null, c.iva || null, c.total ?? c.importe,
    c.fecha, c.fecha_caja ?? c.fecha_prevista, c.mes,
    c.sheet_id === null ? String(c.fila) : String(c.sheet_id),
    ...(obraPorFila ? [c.destino ?? null, c.obra_id ?? null] : []),
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
/**
 * A QUÉ OBRA VA CADA COMPRA, EN LA MISMA TRANSACCIÓN QUE `costos_obra` (13/09/2026).
 *
 * `costos_obra` guarda la columna J (el cliente) y la ficha atribuía por ahí: las compras de SF -
 * Pisos Industriales caían en la obra madre cerrada. La regla (`lib/compras-obra-asignada.mjs`) lee la
 * K con el resolutor de JORNALES y deja `obra_id` null cuando no hay evidencia. Se reescribe junto con
 * `costos_obra` porque sale del MISMO conjunto de filas: si una se escribiera y la otra no, habría
 * pesos sin asignación y la identidad «obras + sin obra = Compras del cliente» dejaría de cerrar.
 */
/** El asignador de siempre y, con la migración aplicada, la columna Obra de la fila por delante. */
function asignadorDelSync(catalogos, obraPorFila) {
  const base = asignadorDeCompras(catalogos)
  if (!obraPorFila) return base
  return asignadorConColumnaObra(base, catalogoDeDestinos({ obras: catalogos.canonicas, clienteAlias: catalogos.clienteAlias }))
}

async function escribirAsignacion(db, compras, asignar) {
  const plan = planDeAsignacion(compras, asignar)
  await db.query('delete from public.compra_obra_asignada')
  const cols = 'referencia, fila, sheet_id, cliente, obra_id, via, porque, sincronizado_en'
  const valores = (p) => [p.referencia, p.fila, p.sheet_id, p.cliente, p.obra_id, p.via, p.porque]
  for (const grupo of lotes(plan, LOTE)) {
    const { sql, params } = insertPorLote('public.compra_obra_asignada', cols, valores, grupo, ', now()')
    await db.query(sql, params)
  }
  return plan
}

/** Una línea para el log: cuántas filas fueron a una obra y cuántas quedaron sin obra, con su plata. */
function resumenDeAsignacion(plan) {
  const cuenta = (via) => plan.filter((p) => p.via === via).length
  const conObra = plan.filter((p) => p.obra_id).length
  return `${plan.length} filas · ${conObra} con obra · ${cuenta(VIA.SIN_OBRA)} de un cliente sin obra asignada · `
    + `${cuenta(VIA.NO_CLIENTE)} de estructura`
}

async function reconciliarAdjuntos(db, compras) {
  const { rows: adjuntos } = await db.query(
    'select id, origen_file_id, compra_clave, fila_compras, vinculado_por, lectura from public.compra_adjunto')
  const { rows: fajos } = await db.query('select items, filas from comunicacion.comprobante_fajos')
  const proveedores = proveedorPorArchivo(fajos)
  const plan = planDeReconciliacion(
    adjuntos.map((a) => ({ ...a, proveedor_leido: proveedores.get(String(a.origen_file_id)) ?? null })),
    compras)
  for (const r of plan.refrescar) {
    await db.query('update public.compra_adjunto set fila_compras=$2 where id=$1', [r.id, r.fila])
  }
  for (const r of plan.reasignar) {
    // `match_numero` y no `registro`: la identidad se resolvió por CÁLCULO, no porque el bot lo
    // haya visto. La pantalla muestra esa diferencia y tiene que poder seguir mostrándola.
    await db.query(
      `update public.compra_adjunto
          set compra_clave=$2, fila_compras=$3,
              vinculado_por = case when vinculado_por='match_manual' then vinculado_por else 'match_numero' end,
              confianza     = case when vinculado_por='match_manual' then confianza else 0.9 end,
              vinculado_at  = now()
        where id=$1`, [r.id, r.clave, r.fila])
  }
  return plan
}

/**
 * Lo leído del Sheet más lo que la app decidió, con las obras proyectadas: la corrida lista para escribir.
 * Es una función porque se ejecuta más de una vez por corrida (ver la segunda vuelta en `main`).
 */
function prepararCorrida(leidas, decidido, { obraPorFila, catalogos }) {
  const s = superponerLoDecidido(leidas, { pagos: decidido.pagos, obras: obraPorFila ? decidido.obras : [] })
  let inconsistentes = []
  if (obraPorFila) {
    inconsistentes = proyectarObras(s.compras, catalogoDeDestinos({ obras: catalogos.canonicas, clienteAlias: catalogos.clienteAlias }))
  }
  return { compras: s.compras, conflictos: s.conflictos, superpuestos: s.superpuestos, obras: s.obras, inconsistentes }
}

function contarCorrida(r, decidido, obraPorFila) {
  if (decidido.pagos.length) {
    console.log(`pagos en cola: ${decidido.pagos.length} · ${r.superpuestos} superpuesto(s) · ${r.conflictos.length} en conflicto`)
  }
  if (obraPorFila) {
    console.log(`columna Obra: ${r.compras.filter((c) => c.obra_celda).length} filas la traen · ${r.obras} elegida(s) en la app sin bajar al Sheet · ${r.inconsistentes.length} inconsistentes`)
    for (const m of r.inconsistentes.slice(0, 15)) console.log(`  ⚠ ${m}`)
  } else {
    console.log('columna Obra: migración 20260915T0700 sin aplicar — la ignoro y asigno como antes')
  }
}

/** Hasta cuántas veces se vuelve a leer la cola de la app dentro de la misma transacción. */
const VUELTAS = 3

async function main() {
  const obraPorFila = await hayObraPorFila(query)
  // EL FRENO DEL UPSERT: una columna viva que el espejo no escriba se quedaría con el valor de la
  // corrida anterior bajo un número de fila que pudo cambiar de compra. Se pregunta a la base, no a
  // las migraciones, y se aborta nombrando las columnas. Ver `lib/compras-espejo-columnas.mjs`.
  const sinRefrescar = columnasSinRefrescar(
    await columnasVivasDeCompraSheet(query), obraPorFila ? [...CAMPOS, ...CAMPOS_OBRA] : CAMPOS)
  if (sinRefrescar.length) {
    console.error(porQueNoEscribo(sinRefrescar))
    await closePool(); process.exit(1)
  }
  const catalogos = await catalogosDeAsignacion(query)
  // EL INSTANTE EN QUE SE EMPIEZA A LEER EL SHEET, según el reloj de POSTGRES: es el mismo que escribe
  // `aplicado_at`. Todo cambio que el worker aplique desde acá puede no estar en lo leído, y la
  // superposición lo incluye (`cuentaParaSuperponer`).
  const desde = await ahoraDeLaBase(query)
  const leidas = await leerPestana()
  const asignar = asignadorDelSync(catalogos, obraPorFila)
  const { rows: [previo] } = await query('select count(*)::int n from public.compra_sheet')
  if (previo.n && leidas.length < previo.n * PISO) {
    console.error(`CENTINELA: leí ${leidas.length} filas y el espejo tiene ${previo.n}. `
      + 'Una caída así es una lectura fallida, no una pestaña vaciada. NO toco nada.')
    await closePool(); process.exit(1)
  }

  const conClave = leidas.filter((c) => c.clave).length
  const anuladas = leidas.filter((c) => c.anulada).length
  if (DRY) {
    const decidido = await leerLoDecididoEnLaApp(query, { desde })
    const r = prepararCorrida(leidas, decidido, { obraPorFila, catalogos })
    contarCorrida(r, decidido, obraPorFila)
    for (const c of r.conflictos) console.log(`  [dry] ⚠ pago de la fila ${c.fila} — ${c.detalle}`)
    console.log(`[dry] ${r.compras.length} filas · ${conClave} con clave · ${anuladas} anuladas · `
      + `espejo actual ${previo.n}. No escribo nada.`)
    const plan = planDeAsignacion(r.compras, asignar)
    console.log(`[dry] asignación: ${resumenDeAsignacion(plan)}`)
    await closePool(); return
  }

  // UNA SOLA CONEXIÓN. `query('begin')` sobre el pool abría la transacción en una conexión y el
  // delete + insert caían en otras: no había transacción y el «ROLLBACK» del log era mentira
  // (08/09/2026, 15:13: `duplicate key value violates unique constraint "compra_sheet_pkey"` con el
  // espejo íntegro). `withTx` entrega el cliente y las dos escrituras viajan con él.
  let enCostos = 0
  let plan = null
  let asignacion = null
  let aviso = null
  let compras = leidas
  let vueltas = 0
  try {
    enCostos = await withTx(async (db) => {
      const q = (sql, params) => db.query(sql, params)
      // ═══ DOS CORRIDAS NO SE PISAN (08/09/2026) ═══
      //
      // Desde que la carga por chat dispara el espejo apenas escribe en el Sheet, el timer y el
      // disparo pueden solaparse. Dos transacciones concurrentes ven cada una el estado previo y las
      // dos escriben; la segunda moría con `duplicate key value violates unique constraint
      // "compra_sheet_pkey"` (08/09 a las 15:13). El lock de transacción las serializa —la segunda
      // espera y arranca cuando la primera ya commiteó— y se suelta solo en el commit o el rollback.
      await db.query("select pg_advisory_xact_lock(hashtext('sync-compras'))")
      // EL AVISO EN VIVO, SÓLO SI EL CONTENIDO CAMBIÓ (17/09/2026). La foto va DESPUÉS del lock: tomada
      // antes, compararía contra lo que la corrida concurrente ya reemplazó. Ver lib/espejo-aviso.mjs.
      await fotografiar(db, 'public.compra_sheet')
      // ═══ LA SEGUNDA VUELTA (18/09/2026) ═══
      //
      // Lo que la app decidió se lee ACÁ, con el lock tomado, y se vuelve a leer después de escribir.
      // Una RPC que commiteó entre la primera lectura y la escritura ya está en la segunda; una RPC
      // que todavía no commiteó tiene que tomar `for update` sobre una fila que el upsert ya tocó,
      // así que espera este commit y relee la versión nueva. Con eso no queda ventana en la que un
      // sync deje el espejo sin lo que una persona acaba de elegir. Si la segunda lectura no trae nada
      // nuevo —lo normal—, no se escribe dos veces.
      let ids = null
      let n = 0
      for (let v = 0; v < VUELTAS; v++) {
        const decidido = await leerLoDecididoEnLaApp(q, { desde })
        if (ids && mismoConjunto(ids, decidido.ids)) break
        ids = decidido.ids
        vueltas += 1
        const r = prepararCorrida(leidas, decidido, { obraPorFila, catalogos })
        if (vueltas === 1) contarCorrida(r, decidido, obraPorFila)
        else console.log(`vuelta ${vueltas}: la app decidió algo mientras se escribía (${decidido.ids.length} cambio(s) cuentan) — reescribo`)
        compras = r.compras
        // Si el Sheet contradice un pago pedido, gana el Sheet y se declara con el detalle adentro.
        await declararConflictos(q, r.conflictos)
        await escribirEspejo(db, compras, obraPorFila)
        n = await escribirCostosObra(db, compras, obraPorFila)
        asignacion = await escribirAsignacion(db, compras, asignar)
        plan = await reconciliarAdjuntos(db, compras)
      }
      aviso = await avisarSiCambio(db, { tabla: 'public.compra_sheet', clave: 'fila' })
      return n
    })
  } catch (e) {
    console.error('sync falló, ROLLBACK:', e.message)
    await closePool(); process.exit(1)
  }
  console.log(`compra_obra_asignada: ${resumenDeAsignacion(asignacion ?? [])}${vueltas > 1 ? ` · ${vueltas} vueltas` : ''}`)
  if (aviso) console.log(lineaDeAviso(aviso))

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
