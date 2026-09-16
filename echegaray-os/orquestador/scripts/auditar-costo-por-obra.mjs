#!/usr/bin/env node
// ¿EL COSTO QUE app.ecsas.com.ar PUBLICA POR OBRA ES EL QUE DICE LA PESTAÑA? — MA, SUB y MO, al detalle.
//
// Pedido del dueño (15/09/2026): «revisión de MO, MA, SUB en cada obra que aparece en
// app.ecsas.com.ar, al detalle; no puede fallar nunca eso». Encontró a mano un subcontrato de PEDRO
// TELLO colgado de Quattropani que era de Pisos Industriales, y un «Galpón 5» imputado a SF - PISOS
// INDUSTRIALES. Ninguno de los dos cambia un total general: sólo cambian de obra. Por eso este
// script no se conforma con cuadrar sumas y cruza además el TEXTO de cada fila contra su columna L.
//
// SÓLO LECTURA. No escribe en la base, no escribe en el Sheet, no aplica ninguna corrección: cada
// hallazgo trae la que correspondería y la firma el dueño.
//
//   node orquestador/scripts/auditar-costo-por-obra.mjs [--json] [--uid <perfil>] [--sin-sheet]
//
// Sale con código 1 si hay al menos un hallazgo.
//
// ═══ POR QUÉ SE IMPERSONA A DIRECCIÓN ═══
//
// `costo_mo_quincena` es SECURITY DEFINER y devuelve CERO FILAS si la sesión no pasa
// `liquida_sueldos() or ve_economia()`. Corrido como `postgres` —sin JWT— la mano de obra de toda
// obra da null y la auditoría publicaría un verde falso. Se abre una transacción con `set local role
// authenticated` y los claims de un perfil de Dirección real, se lee, y se cierra sin escribir.

import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { withTx, closePool } from '../lib/db.mjs'
import { CASHFLOW_ID } from '../lib/cash-briefing.mjs'
import { PRIMERA_FILA, contratoDeColumnas, filaACompra } from '../lib/compras-fila.mjs'
import { PESTANAS, rangoFilas } from '../lib/columnas-por-encabezado.mjs'
import * as Q from '../lib/auditoria-costo-por-obra-sql.mjs'
import { mayores, pesos, resumen, totalesPorDestino } from '../lib/auditoria-costo-por-obra.mjs'
import * as H from '../lib/auditoria-costo-por-obra-hallazgos.mjs'

const arg = (n, d = null) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : d }
const JSON_OUT = process.argv.includes('--json')
const SIN_SHEET = process.argv.includes('--sin-sheet')
const $ = (n) => (n == null ? '—' : Math.round(Number(n)).toLocaleString('es-AR'))

/** La pestaña viva, leída POR ENCABEZADO y sin formato. La única lectura de red del script. */
async function leerPestana() {
  const google = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })
  const filas = await google.readSheetValues(
    CASHFLOW_ID, rangoFilas('Compras', PESTANAS.Compras.filaEncabezado, 6000), { render: 'UNFORMATTED_VALUE' })
  if (!filas.length) throw new Error('no leí nada de Compras')
  const idx = contratoDeColumnas(filas[0])
  return filas.slice(1)
    .map((f, i) => filaACompra(f, idx, i + PRIMERA_FILA))
    .filter(Boolean)
}

/**
 * TODA LA BASE, EN UNA SOLA TRANSACCIÓN `REPEATABLE READ`. No es prolijidad: es corrección.
 *
 * La primera versión leía `compra_sheet`, `costos_obra` y la RPC en conexiones distintas. El timer de
 * `sync-compras` borra y reescribe `costos_obra` entero dentro de SU transacción, y una corrida que
 * cayó encima publicó ocho obras con hasta $12,6 M de diferencia entre el espejo y la RPC —hallazgos
 * que no existían dos minutos antes ni dos minutos después—. Una auditoría que inventa desvíos
 * cuando el sistema está sano es peor que ninguna: enseña a no creerle.
 *
 * `repeatable read` fija un único instante para todo el informe. Las lecturas sin rol van primero
 * porque `set local role authenticated` ya no se puede deshacer dentro de la transacción.
 */
async function leerTodo() {
  return withTx(async (db) => {
    await db.query('set transaction isolation level repeatable read')
    const { rows: [{ hoy }] } = await db.query("select to_char(current_date, 'YYYY-MM-DD') hoy")
    const uno = async (sql, params) => (await db.query(sql, params)).rows
    const base = {
      filas: await uno(Q.FILAS), obras: await uno(Q.OBRAS), hh: await uno(Q.HH_POR_OBRA),
      cierre: await uno(Q.HH_DESPUES_DEL_CIERRE), fusionada: await uno(Q.HH_EN_OBRA_FUSIONADA),
      subcontratos: await uno(Q.SUBCONTRATOS), clientes: await uno(Q.CLIENTES),
      destinos: await uno(Q.DESTINOS_DEL_ESPEJO),
      vieja: new Map((await uno('select obra_id, costo_real, n_comprobantes from public.obra_costo_real')).map((r) => [r.obra_id, r])),
      viva: new Map((await uno(Q.RECUENTO_POR_OBRA, [true])).map((r) => [r.obra_id, r])),
      declarado: new Map((await uno(Q.RECUENTO_POR_OBRA, [false])).map((r) => [r.obra_id, r])),
    }
    return { hoy, base, direccion: await comoDireccion(db, base) }
  })
}

/**
 * LO QUE SÓLO SE VE CON LOS OJOS DE LA PANTALLA, en la MISMA transacción.
 *
 * `costo_mo_quincena` es SECURITY DEFINER y devuelve CERO FILAS si la sesión no pasa
 * `liquida_sueldos() or ve_economia()`. Corrido como `postgres` —sin JWT— la mano de obra de toda
 * obra da null y la auditoría publicaría un verde falso.
 */
async function comoDireccion(db, base) {
  const ids = base.obras.map((o) => o.id)
  const cids = base.clientes.map((c) => c.cliente_id)
  const uid = arg('--uid') ?? (await db.query(
    "select id from public.perfiles where rol = 'direccion' and coalesce(es_prueba, false) = false order by id limit 1"
  )).rows[0]?.id
  if (!uid) throw new Error('no hay perfil de Dirección para impersonar y sin él la mano de obra da null')
  await db.query('set local role authenticated')
  await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: uid, role: 'authenticated' })])
  await db.query("select set_config('request.jwt.claim.sub', $1, true)", [uid])
  const { rows: [{ j }] } = await db.query('select public.costo_de_obras_a_la_fecha($1) j', [ids])
  const { rows: [{ k }] } = await db.query('select public.compras_sin_obra_de_clientes($1) k', [cids])
  const { rows: mo } = await db.query(`
    with q as (
      select g::date as desde
        from (select min(r.fecha) as primera from public.registros_hh r where r.fecha <= current_date) m
        cross join lateral generate_series(date_trunc('month', m.primera), current_date::timestamp, interval '1 day') g
       where extract(day from g) in (1, 16))
    select x.obra_canonica_id as obra_id, sum(x.costo_total) as costo_total, sum(x.horas) as horas,
           count(*) filter (where x.estado = 'falta_dato')::int as filas_sin_tarifa,
           max(x.sellado_en) as sellado_hasta
      from q cross join lateral public.costo_mo_quincena(q.desde, $1) x
     where x.obra_canonica_id is not null and x.estado <> 'falta_dato'
     group by 1`, [ids])
  const { rows: [{ rol }] } = await db.query('select public.current_rol() rol')
  return {
    rpc: new Map((j ?? []).map((r) => [r.obra_id, r])),
    sinObra: new Map((k ?? []).map((r) => [r.cliente_id, r])),
    mo: new Map(mo.map((r) => [r.obra_id, r])), uid, rol,
  }
}

/** Junta todos los hallazgos. Cada bloque es independiente: uno vacío no tapa a otro. */
function auditar({ filasSheet, base, direccion, hoy }) {
  const catalogo = H.catalogoDeObras(base.obras)
  const porCodigo = new Map(base.obras.map((o) => [o.codigo, o]))
  const porId = new Map(base.obras.map((o) => [o.id, o]))
  const sheetTot = filasSheet ? totalesPorDestino(filasSheet, sheetCtx(base, hoy)) : null
  const espejoTot = totalesPorDestino(base.filas, { hoy })
  return [
    ...(sheetTot ? H.espejoDesfasado(sheetTot, espejoTot) : []),
    ...H.asignacionDistintaDeLaColumna(base.filas),
    ...H.rpcVsRecuento(base.obras, direccion.rpc, base.viva),
    ...H.conciliacionPorObra(base.obras, base.filas, direccion.rpc, hoy),
    ...H.conciliacionSinObra(base.clientes, base.filas, direccion.sinObra, hoy),
    ...H.vistaViejaDiscrepa(base.obras, direccion.rpc, base.vieja),
    ...H.otraObraEnElTexto(base.filas, catalogo),
    ...H.clienteContradiceObra(base.filas, porCodigo),
    ...H.unidadContradiceDestino(base.filas),
    ...H.subcontratistaSinObra(base.filas),
    ...H.duplicados(base.filas),
    ...H.subcontratoSinRespaldo(base.subcontratos),
    ...H.moRpcVsQuincenas(base.obras, direccion.rpc, direccion.mo),
    ...H.hallazgosDeHH({ porObra: base.hh, despuesDelCierre: base.cierre, enObraFusionada: base.fusionada }, porId),
    ...H.porVencerDiscrepa(base.obras, base.filas, direccion.rpc, hoy),
    ...H.pagadoTotalNoCoincide(base.filas),
    ...H.filaSinDestino(base.filas),
    ...H.reglaMuerta(base.destinos),
  ]
}

/**
 * LA CLASIFICACIÓN DE SUBCONTRATO NO SE REIMPLEMENTA EN JS: SE TRAE.
 *
 * Quién es subcontratista lo decide `public.proveedores.rubro` con cuatro caminos de identidad (CUIT,
 * nombre, razón social, alias). Reescribir eso acá para poder partir la columna del Sheet sería
 * fabricar una segunda definición que el día que se despegue nadie va a notar. La fila del Sheet se
 * empareja con la del espejo por la MISMA referencia que usa `compra_obra_asignada`.
 */
function sheetCtx(base, hoy) {
  const sub = new Map(base.filas.map((f) => [String(f.sheet_id ?? f.fila), f.es_subcontrato === true]))
  return { hoy, esSubcontrato: (f) => sub.get(String(f.sheet_id ?? f.fila)) === true }
}

/** La tabla por obra: lo que el informe publica y lo que el dueño mira primero. */
function tablaPorObra({ base, direccion, sheetTot, hallazgos }) {
  const conHallazgo = new Set(hallazgos.map((x) => x.obra))
  return base.obras.map((o) => {
    const app = direccion.rpc.get(o.id); const pest = base.declarado.get(o.id)
    const sh = sheetTot?.get(o.codigo)
    const mo = direccion.mo.get(o.id)
    return {
      codigo: o.codigo, nombre: o.nombre, estado: o.estado,
      ma_sheet: sh ? sh.materiales : (pest ? Number(pest.materiales) : null),
      ma_app: app?.materiales == null ? null : Number(app.materiales),
      sub_sheet: sh ? sh.subcontratos : (pest ? Number(pest.subcontratos) : null),
      sub_app: app?.subcontratos == null ? null : Number(app.subcontratos),
      mo_app: app?.mano_obra == null ? null : Number(app.mano_obra),
      por_vencer: Number(app?.materiales_por_vencer ?? 0) + Number(app?.subcontratos_por_vencer ?? 0),
      horas: mo?.horas == null ? null : Number(mo.horas),
      ok: !conHallazgo.has(o.codigo),
    }
  })
}

function imprimir(informe) {
  const { tabla, hallazgos, corte } = informe
  console.log(`corte ${corte} · ${tabla.length} obras · ${hallazgos.length} hallazgos\n`)
  console.log(`${'obra'.padEnd(34)}${'MA Sheet'.padStart(13)}${'MA app'.padStart(13)}${'SUB Sheet'.padStart(12)}${'SUB app'.padStart(12)}${'MO app'.padStart(12)}${'por vencer'.padStart(12)}${'HH'.padStart(8)}  `)
  for (const r of tabla) {
    console.log(`${`${r.codigo} ${r.nombre}`.slice(0, 33).padEnd(34)}${$(r.ma_sheet).padStart(13)}${$(r.ma_app).padStart(13)}`
      + `${$(r.sub_sheet).padStart(12)}${$(r.sub_app).padStart(12)}${$(r.mo_app).padStart(12)}${$(r.por_vencer).padStart(12)}${$(r.horas).padStart(8)}  ${r.ok ? 'OK' : 'REVISAR'}`)
  }
  console.log('\nhallazgos por tipo:')
  for (const t of resumen(hallazgos)) console.log(`  ${t.tipo.padEnd(38)} ${String(t.n).padStart(4)}  ${$(t.importe).padStart(14)}`)
  console.log('\nlos 10 de mayor importe:')
  for (const x of mayores(hallazgos, 10)) {
    console.log(`  ${$(x.importe).padStart(14)}  ${x.tipo} · ${x.obra ?? '—'}${x.fila ? ` · fila ${x.fila}` : ''}`)
    console.log(`  ${''.padStart(14)}  ${x.detalle}`)
  }
}

async function main() {
  const { hoy, base, direccion } = await leerTodo()
  const filasSheet = SIN_SHEET ? null : await leerPestana()
  const hallazgos = auditar({ filasSheet, base, direccion, hoy })
  const sheetTot = filasSheet ? totalesPorDestino(filasSheet, sheetCtx(base, hoy)) : null
  const informe = {
    corte: hoy, sesion: { uid: direccion.uid, rol: direccion.rol }, leyo_el_sheet: !SIN_SHEET,
    tabla: tablaPorObra({ base, direccion, sheetTot, hallazgos }),
    resumen: resumen(hallazgos), mayores: mayores(hallazgos, 10), hallazgos,
    puentes: H.puentes(base.obras, base.filas, direccion.rpc, hoy),
    totales: {
      ma_app: pesos([...direccion.rpc.values()].reduce((a, r) => a + Number(r.materiales ?? 0), 0)),
      sub_app: pesos([...direccion.rpc.values()].reduce((a, r) => a + Number(r.subcontratos ?? 0), 0)),
      mo_app: pesos([...direccion.rpc.values()].reduce((a, r) => a + Number(r.mano_obra ?? 0), 0)),
    },
  }
  if (JSON_OUT) console.log(JSON.stringify(informe, null, 2)); else imprimir(informe)
  await closePool()
  if (hallazgos.length) process.exit(1)
}

main().catch(async (e) => {
  console.error('auditar-costo-por-obra falló:', e.message)
  await closePool().catch(() => {})
  process.exit(2)
})
