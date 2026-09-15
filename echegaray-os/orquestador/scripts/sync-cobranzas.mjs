#!/usr/bin/env node
// SYNC de la pestaña "02_Cobranzas" del Sheet Flujo de Caja → public.cobranzas (ingresos/percibido).
// El Sheet es la fuente de verdad; esto es su espejo. Snapshot idempotente por origen='cobranzas_sheet',
// keyed por ID de fila. NO destructivo con otras tablas.
//   node orquestador/scripts/sync-cobranzas.mjs          ← reescribe la réplica
//   node orquestador/scripts/sync-cobranzas.mjs --dry    ← lee todo, NO escribe nada y compara con la réplica
//
// ═══ LOS IMPORTES SE GUARDAN EN PESOS, NO EN LA MONEDA DE LA CELDA (10/09/2026) ═══
//
// Hasta hoy el rango leído era `A5:R` —hasta la columna 18— y la columna "Moneda" del Sheet es la AA.
// La fila 62 de Quattropani dice `U$S 15.400` y se guardaba como $15.400: la cuenta corriente del
// cliente publicaba $23.273.434 menos de lo cobrado que la pestaña, sin una sola señal de error.
//
// Un espejo "fiel" celda a celda de un importe CON moneda es imposible en una columna sola: guardar
// 15.400 sin decir que son dólares no es fidelidad, es un dato falso (regla de oro 3, ventanas y
// unidades incompatibles). Las once caras que leen esta tabla —cuenta corriente, control
// administrativo, estado de empresa, reclamos, portal— suman `total_bruto` como pesos y ninguna sabe
// de monedas. Así que la columna se define en PESOS, con el mismo `TIPO_CAMBIO_USD` que usa la
// pestaña (misma función `valuarEnPesos`, una sola definición), y el importe NATIVO se conserva en
// `monto_neto_origen` / `total_bruto_origen` junto con `moneda` y `tipo_cambio`.
//
// ESAS CUATRO COLUMNAS PUEDEN NO EXISTIR TODAVÍA: la migración
// `20260910T1500_cobranzas_moneda.sql` está escrita y NO aplicada (nadie aplica migraciones desde un
// worktree). El sync mira el catálogo y, si no están, guarda igual los importes ya valuados y lo
// dice. El arreglo del defecto no espera a la migración; lo que espera es la trazabilidad.
//
// ═══ CADA CAMPO SALE DE SU RÓTULO, NO DE SU POSICIÓN (14/09/2026) ═══
//
// Se leía `r[12]` como total y `r[16]` como fecha de cobro. Con «Obra» insertada en H, la corrida
// siguiente habría borrado la tabla y la habría reinsertado con las retenciones como total y el mes
// como fecha — sin un solo error, porque el `delete` + `insert` no sabe qué columna es cuál. Ahora la
// fila 4 se lee una vez, cada campo se indexa por su rótulo, y un rótulo que falta aborta ANTES del
// delete. Los nombres de destino no cambian: `fecha_emision` sigue viniendo de «Fecha de Venta» y
// `fecha_venta` de «Fecha de Factura», que es lo que guardaba por posición (el cruce de nombres es
// viejo y no se corrige acá: cambiarlo cambia lo que leen las caras).
import { makeGoogleClient, READONLY_SCOPES, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { query, closePool } from '../lib/db.mjs'
import { CASHFLOW_ID, parseMonto, parseFecha } from '../lib/cash-briefing.mjs'
import { resolverCliente } from '../lib/portal/cobranzas-a-cliente.mjs'
import { leerTipoCambio } from '../lib/tipo-cambio.mjs'
import { valuarFilaCobranza, RANGO_COBRANZAS } from '../lib/cobranzas-contrato.mjs'
import { catalogosDeAsignacion } from '../lib/compras-obra-asignada.mjs'
import { catalogoDeDestinos, resolverCeldaObra } from '../lib/obra-destino.mjs'
import { exigirColumnas, leerColumnasCobranzas } from '../lib/cobranzas-columnas.mjs'

const DRY = process.argv.includes('--dry')

/** Las columnas que el sync lee, por clave de `COBRANZAS_OS`. `obra` es opcional. */
export const COLUMNAS_SYNC = Object.freeze([
  'id', 'categoria', 'fechaVenta', 'factura', 'comprobante', 'unidad', 'cliente', 'oc', 'concepto', 'neto',
  'iva', 'retenciones', 'total', 'formaCobro', 'estado', 'fechaFactura', 'fechaCobro', 'mesCobro', 'moneda', 'obra',
])

const iso = (d) => (d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : null)

/**
 * NÚCLEO PURO: una fila de la pestaña → el registro de `public.cobranzas`, o por qué no.
 * `null` = fila que no es una cobranza (sin ID o sin cliente: encabezados, vacías, subtotales).
 * @returns {null | {id:string, obra:string, motivo?:string, cobranza?:object}}
 */
export function filaACobranza(r, cols, tc) {
  const c = exigirColumnas(cols, COLUMNAS_SYNC.filter((k) => k !== 'obra'), 'filaACobranza')
  const en = (k) => r?.[c[k].indice]
  const txt = (k) => String(en(k) ?? '').trim() || null
  const id = String(en('id') ?? '').trim()
  const obra = String(en('cliente') ?? '').trim()
  if (!id || !obra) return null
  const nativos = {
    monto_neto: parseMonto(en('neto')) || null, iva: parseMonto(en('iva')) || null,
    retenciones: parseMonto(en('retenciones')) || null, total_bruto: parseMonto(en('total')) || null,
  }
  const v = valuarFilaCobranza(nativos, en('moneda'), tc)
  if (v.motivo) return { id, obra, motivo: v.motivo }
  return {
    id, obra,
    cobranza: {
      sheet_id: id, categoria: txt('categoria'), fecha_emision: iso(parseFecha(en('fechaVenta'))),
      factura: txt('factura'), numero_comprobante: txt('comprobante'), unidad: txt('unidad'), obra_cliente: obra,
      orden_compra: txt('oc'), concepto: txt('concepto'),
      monto_neto: v.importes.monto_neto, iva: v.importes.iva, retenciones: v.importes.retenciones,
      total_bruto: v.importes.total_bruto, forma_cobro: txt('formaCobro'), estado: txt('estado'),
      fecha_venta: iso(parseFecha(en('fechaFactura'))), fecha_cobro: iso(parseFecha(en('fechaCobro'))), mes_cobro: txt('mesCobro'),
      moneda: v.moneda, tipo_cambio: v.tipoCambio,
      monto_neto_origen: nativos.monto_neto, total_bruto_origen: nativos.total_bruto,
    },
  }
}

/**
 * NÚCLEO PURO: lo que cambiaría en la réplica. Compara por `sheet_id` y campo a campo; los importes
 * numéricamente (Postgres devuelve `numeric` como texto) y las fechas como YYYY-MM-DD.
 */
export function diferenciasConReplica(nuevas = [], replica = [], columnas = []) {
  const norm = (v) => (v instanceof Date ? iso(v) : v === undefined || v === '' ? null : v)
  const igual = (a, b) => {
    const [x, y] = [norm(a), norm(b)]
    if (x === null || y === null) return x === y
    const [nx, ny] = [Number(x), Number(y)]
    return Number.isFinite(nx) && Number.isFinite(ny) && typeof x !== 'boolean' ? Math.abs(nx - ny) < 0.005 : String(x) === String(y)
  }
  const porId = new Map(replica.map((f) => [String(f.sheet_id), f]))
  const ids = new Set(nuevas.map((f) => String(f.sheet_id)))
  const campos = []
  for (const n of nuevas) {
    const v = porId.get(String(n.sheet_id))
    if (!v) continue
    for (const k of columnas) if (!igual(n[k], v[k])) campos.push({ sheet_id: n.sheet_id, campo: k, sheet: n[k] ?? null, replica: norm(v[k]) })
  }
  const suma = (fs, k) => Math.round(fs.reduce((s, f) => s + (Number(f[k]) || 0), 0) * 100) / 100
  return {
    conteo: { sheet: nuevas.length, replica: replica.length },
    sumas: Object.fromEntries(['total_bruto', 'monto_neto'].map((k) => [k, { sheet: suma(nuevas, k), replica: suma(replica, k) }])),
    soloEnSheet: nuevas.filter((f) => !porId.has(String(f.sheet_id))).map((f) => f.sheet_id),
    soloEnReplica: replica.filter((f) => !ids.has(String(f.sheet_id))).map((f) => f.sheet_id),
    campos,
  }
}

/** El catálogo de obras para la columna «Obra», o por qué no se lee. */
async function catalogoObra(cols) {
  const { rows } = await query(
    `select count(*)::int n from information_schema.columns
      where table_schema='public' and table_name='cobranzas' and column_name in ('destino','obra_id','obra_celda')`)
  if (rows[0].n !== 3) { console.log('columna Obra: migración 20260915T0700 sin aplicar — no la leo'); return null }
  if (!cols.obra) { console.log('columna Obra: la pestaña todavía no tiene el encabezado «Obra»'); return null }
  const c = await catalogosDeAsignacion(query)
  return catalogoDeDestinos({ obras: c.canonicas, clienteAlias: c.clienteAlias })
}

/** ¿Están en la base las columnas de moneda? Ver la cabecera: la migración puede no estar aplicada. */
async function hayColumnasDeMoneda() {
  const { rows } = await query(
    `select column_name from information_schema.columns
      where table_schema='public' and table_name='cobranzas'
        and column_name in ('moneda','tipo_cambio','monto_neto_origen','total_bruto_origen')`)
  return rows.length === 4
}

/** Lo que la celda Obra de la fila dice, resuelto. Una celda que no se entiende se guarda sin destino y se nombra. */
function obraDeLaFila(celda, cat, fila, id, mal) {
  const r = resolverCeldaObra(celda, cat)
  if (r.error) mal.push(`fila ${fila} (ID ${id}): ${r.error}`)
  return { destino: r.destino, obra_id: r.obra_id, obra_celda: r.celda }
}

async function leerCobranzas(google) {
  // LOS RÓTULOS PRIMERO: si falta uno, la excepción sale acá, antes de tocar la tabla.
  const cols = await leerColumnasCobranzas(google, CASHFLOW_ID, COLUMNAS_SYNC)
  const rows = await google.readSheetValues(CASHFLOW_ID, RANGO_COBRANZAS).catch(() => [])
  const { tc, crudo } = await leerTipoCambio(google, CASHFLOW_ID)
  const cat = await catalogoObra(cols)
  const obraMal = []
  const cobranzas = []
  const sinValuar = []
  for (const [i, r] of rows.entries()) {
    const f = filaACobranza(r, cols, tc)
    if (!f) continue
    if (f.motivo) { sinValuar.push(`fila ${i + 5} (ID ${f.id}, ${f.obra}): ${f.motivo}`); continue }
    cobranzas.push({ ...f.cobranza, ...(cat ? obraDeLaFila(r?.[cols.obra.indice], cat, i + 5, f.id, obraMal) : {}) })
  }
  if (cat) {
    console.log(`columna Obra: ${cobranzas.filter((c) => c.obra_celda).length} filas la traen · ${obraMal.length} sin entender`)
    obraMal.slice(0, 10).forEach((m) => console.log(`  ⚠ ${m}`))
  }
  return { cobranzas, sinValuar, tc, crudo, conObra: Boolean(cat) }
}

async function compararConReplica(cobranzas, columnas) {
  const { rows } = await query(`select ${columnas.join(', ')} from public.cobranzas where origen='cobranzas_sheet'`)
  const d = diferenciasConReplica(cobranzas, rows, columnas)
  const orden = (fs) => [...fs].sort((a, b) => (Number(a.sheet_id) - Number(b.sheet_id)) || String(a.sheet_id).localeCompare(String(b.sheet_id)))
  const extremo = (fs) => (fs.length ? [fs[0], fs.at(-1)].map((f) => `ID ${f.sheet_id} ${f.obra_cliente} $${f.total_bruto} ${f.estado}`).join('  …  ') : '(vacía)')
  console.log(`\n--dry · COMPARACIÓN CON LA RÉPLICA (no escribí nada)`)
  console.log(`  filas        sheet ${d.conteo.sheet} · réplica ${d.conteo.replica}`)
  for (const [k, s] of Object.entries(d.sumas)) console.log(`  Σ ${k.padEnd(11)} sheet ${s.sheet} · réplica ${s.replica}`)
  console.log(`  primera/última sheet   ${extremo(orden(cobranzas))}`)
  console.log(`  primera/última réplica ${extremo(orden(rows))}`)
  console.log(`  sólo en el Sheet: ${d.soloEnSheet.join(', ') || '—'} · sólo en la réplica: ${d.soloEnReplica.join(', ') || '—'}`)
  console.log(`  campos distintos: ${d.campos.length}`)
  d.campos.slice(0, 15).forEach((c) => console.log(`    ID ${c.sheet_id} ${c.campo}: sheet=${JSON.stringify(c.sheet)} réplica=${JSON.stringify(c.replica)}`))
}

async function vincularClientes(cobranzas) {
  // ═══ A QUÉ CLIENTE PERTENECE CADA FILA (05/09/2026) ═══
  //
  // `cliente_id` existía desde la migración del CRM y este sync nunca la escribía: la vista
  // `cliente_cuenta_corriente` devolvía cero para todo el mundo. El vínculo se resuelve ACÁ y no en un
  // backfill porque más abajo hay un `delete`: cualquier cosa escrita aparte dura hasta la próxima
  // corrida. Y con `resolverCliente` de `lib/portal/`, el MISMO resolutor del portal: dos definiciones
  // de «de qué cliente es esta cobranza» es exactamente el problema que el OS tiene prohibido.
  const { rows: indice } = await query(
    `select a.alias, o.cliente_id
       from public.obra_alias a
       join public.obra_canonica o on o.id = a.obra_id
      where o.cliente_id is not null`,
  )
  const sinCliente = new Map()
  for (const c of cobranzas) {
    const r = resolverCliente(c.obra_cliente, indice)
    c.cliente_id = r.cliente_id
    if (!r.cliente_id) sinCliente.set(c.obra_cliente, r.motivo)
  }
  console.log(`clientes: ${cobranzas.filter((c) => c.cliente_id).length}/${cobranzas.length} filas vinculadas`)
  // Un rótulo sin cliente NO es un error: MACRO, LIRIO y ADDATO facturan y no tienen alias.
  for (const [rotulo, motivo] of sinCliente) console.log(`   sin cliente: «${rotulo}» — ${motivo}`)
}

async function main() {
  const google = makeGoogleClient({ config: loadConfig(), scopes: DRY ? READONLY_SCOPES : WRITE_SCOPES })
  const { cobranzas, sinValuar, crudo, conObra } = await leerCobranzas(google)
  // UNA FILA QUE NO SE PUDO VALUAR NO SE GUARDA EN LA MONEDA EQUIVOCADA — Y TAMPOCO SE SALTEA EN
  // SILENCIO. Se aborta la corrida entera: la tabla se borra y se reinserta completa, así que
  // continuar publicaría una réplica a la que le falta plata sin que ninguna cara pueda notarlo.
  if (sinValuar.length) {
    console.error(`no puedo valuar ${sinValuar.length} fila(s) — abortando sin tocar la tabla (TC leído: ${JSON.stringify(crudo)})`)
    sinValuar.forEach((m) => console.error(`   ${m}`))
    if (!DRY) {
      await query(
        `insert into public.integraciones (slug, nombre, estado, salud, notas)
         values ('cobranzas_sheet','Cobranzas (Flujo de Caja)','en_curso','degradada',$1)
         on conflict (slug) do update set salud='degradada', notas=excluded.notas`,
        [`sync abortado: ${sinValuar.length} fila(s) sin valuar. ${sinValuar[0]}`],
      )
    }
    await closePool(); process.exit(1)
  }
  if (!cobranzas.length) { console.error('no leí filas de Cobranzas — abortando (no toco la tabla)'); await closePool(); process.exit(1) }
  const enUsd = cobranzas.filter((c) => c.moneda === 'USD')
  if (enUsd.length) console.log(`moneda: ${enUsd.length} fila(s) en USD valuadas`)
  await vincularClientes(cobranzas)

  const conMoneda = await hayColumnasDeMoneda()
  if (!conMoneda) {
    console.log('columnas de moneda ausentes (migración 20260910T1500 sin aplicar):'
      + ' guardo los importes YA VALUADOS en pesos, sin la trazabilidad de la moneda nativa')
  }
  const columnas = ['sheet_id', 'categoria', 'fecha_emision', 'factura', 'numero_comprobante', 'unidad',
    'obra_cliente', 'orden_compra', 'concepto', 'monto_neto', 'iva', 'retenciones', 'total_bruto',
    'forma_cobro', 'estado', 'fecha_venta', 'fecha_cobro', 'mes_cobro', 'cliente_id',
    ...(conMoneda ? ['moneda', 'tipo_cambio', 'monto_neto_origen', 'total_bruto_origen'] : []),
    ...(conObra ? ['destino', 'obra_id', 'obra_celda'] : [])]
  if (DRY) { await compararConReplica(cobranzas, columnas); await closePool(); return }

  const sql = `insert into public.cobranzas (${columnas.join(', ')}, origen, sincronizado_en)`
    + ` values (${columnas.map((_, i) => `$${i + 1}`).join(',')},'cobranzas_sheet',now())`
  await query('begin')
  try {
    await query("delete from public.cobranzas where origen='cobranzas_sheet'")
    for (const c of cobranzas) await query(sql, columnas.map((k) => c[k] ?? null))
    await query('commit')
  } catch (e) { await query('rollback'); console.error('sync falló, ROLLBACK:', e.message); process.exit(1) }

  await query(
    `insert into public.integraciones (slug, nombre, estado, salud, ultimo_sync, notas)
     values ('cobranzas_sheet','Cobranzas (Flujo de Caja)','en_curso','ok',now(),$1)
     on conflict (slug) do update set estado='en_curso', salud='ok', ultimo_sync=now(), notas=excluded.notas`,
    [`Pestaña 02_Cobranzas espejada a public.cobranzas: ${cobranzas.length} cobranzas.`],
  )
  const { rows: est } = await query("select estado, count(*)::int n, round(sum(total_bruto)) t from public.cobranzas where origen='cobranzas_sheet' group by 1 order by t desc nulls last")
  console.log(`sincronizadas ${cobranzas.length} cobranzas → public.cobranzas. Por estado:`)
  est.forEach((r) => console.log(`  ${r.estado}: $${Number(r.t || 0).toLocaleString('es-AR')} (${r.n})`))
  await closePool()
}

// Un import no corre el sync: los núcleos puros de arriba se prueban sin tocar la base ni el Sheet.
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error(e); process.exit(1) })
}
