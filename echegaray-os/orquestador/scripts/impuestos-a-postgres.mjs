#!/usr/bin/env node
// LOS IMPUESTOS A POSTGRES — la fuente única que lee app.ecsas.com.ar/administracion/impuestos.
//
//   node orquestador/scripts/impuestos-a-postgres.mjs              ENSAYO: lee todo, muestra, no escribe
//   node orquestador/scripts/impuestos-a-postgres.mjs --aplicar    escribe (upsert + retiro de lo que ya no está)
//
// ═══ QUÉ LEE — Y QUE NO ESCRIBE NINGUNA DE SUS FUENTES ═══
//
//   ddjj_iva_pdf / ddjj_iibb_pdf   los PDF del archivo fiscal en Drive, con los lectores de la pestaña
//   f931_raw                       `_F931_RAW` del Flujo de Caja
//   cobranzas                      retenciones sufridas de la pestaña Cobranzas
//   arca                           `public.comprobantes_arca`, deduplicado antes de sumar
//   banco                          `public.banco_movimientos`
//   compras                        `public.compra_sheet` (la réplica de la pestaña Compras)
//   vep_pdf                        comprobantes de VEP en `<archivo fiscal>/<año>/931` — imputan por documento
//   ddjj_ganancias_pdf             la DDJJ anual de Ganancias (F.713) de la carpeta BALANCES
//
// Google se abre con scopes de SÓLO LECTURA: que este script no escriba el Sheet no depende de un `if`,
// depende del token. Tampoco corre ningún generador ni toca `comprobantes_arca`.
//
// La lógica vive en `lib/impuestos-registro*.mjs` y `lib/impuestos-escritura.mjs`, con tests. Acá sólo
// se lee, se orquesta y se escribe.

import { makeGoogleClient, READONLY_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { query, withTx, closePool } from '../lib/db.mjs'
import { leerIVA, leerIIBB, leerVepsF931, leerDDJJGanancias, COLUMNAS_FUENTES } from '../lib/impuestos-fuentes.mjs'
import { imputarPorVep, imputarDeclaradas } from '../lib/impuestos-vep.mjs'
import { leerColumnasCobranzas } from '../lib/cobranzas-columnas.mjs'
import { rangoFilas } from '../lib/columnas-por-encabezado.mjs'
import {
  obligacionesIvaDDJJ, obligacionesIibbDDJJ, obligacionesF931, libroPorPeriodo,
  obligacionesIvaCalculadas, obligacionesIibbEstimadas, obligacionesGananciasDDJJ,
} from '../lib/impuestos-registro.mjs'
import {
  pagosDelBanco, pagosDeCompras, pagosDeCobranzas, sinPagosRepetidos, creditosPorPeriodo, conEstadoDePago,
  obligacionesDeDebitosBancarios,
} from '../lib/impuestos-registro-pagos.mjs'
import { planDeEscritura, lectoresEfectivos, CLAVE } from '../lib/impuestos-escritura.mjs'
import { conPlanesF931, conVencimientoF931, estimacionesF931 } from '../lib/impuestos-planes-f931.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const APLICAR = process.argv.includes('--aplicar')
const iso = (d) => (d ? new Date(d).toISOString().slice(0, 10) : null)
const $ = (n) => (n === null || n === undefined ? '—' : `$${Math.round(n).toLocaleString('es-AR')}`)

/** Corre un lector y registra si leyó. Un lector que tira no tumba a los demás: queda `ok:false`. */
async function leer(estado, nombre, fn, contar = (x) => x.length) {
  try {
    const r = await fn()
    estado[nombre] = { ok: true, leidas: contar(r) }
    return r
  } catch (e) {
    estado[nombre] = { ok: false, error: String(e?.message ?? e).slice(0, 200) }
    console.error(`  ✖ ${nombre}: ${estado[nombre].error}`)
    return null
  }
}

export async function leerFuentes(google) {
  const estado = {}
  const ddjjIva = await leer(estado, 'ddjj_iva_pdf', () => leerIVA(google))
  const ddjjIibb = await leer(estado, 'ddjj_iibb_pdf', () => leerIIBB(google))
  const ddjjGanancias = await leer(estado, 'ddjj_ganancias_pdf', () => leerDDJJGanancias(google))
  const veps = await leer(estado, 'vep_pdf', () => leerVepsF931(google))
  const f931 = await leer(estado, 'f931_raw', () => google.readSheetValues(ID, '_F931_RAW!A4:F', { render: 'UNFORMATTED_VALUE' }))
  const cobranzas = await leer(estado, 'cobranzas', async () => {
    const cols = await leerColumnasCobranzas(google, ID, [...COLUMNAS_FUENTES, 'comprobante'])
    return { cols, filas: (await google.readSheetValues(ID, rangoFilas('Cobranzas', 5), { render: 'UNFORMATTED_VALUE' })) ?? [] }
  }, (r) => r.filas.length)
  const arca = await leer(estado, 'arca', async () => (await query(
    `select tipo_libro, tipo_comprobante, emisor_cuit, punto_venta, numero, imp_total, total_iva, neto_gravado, periodo,
            fecha_emision from public.comprobantes_arca where periodo >= '2026-01'`)).rows)
  const banco = await leer(estado, 'banco', async () => (await query(
    'select id, fecha, concepto, importe from public.banco_movimientos order by fecha, id')).rows)
  const compras = await leer(estado, 'compras', async () => (await query(
    `select fila, fecha, fecha_caja, proveedor, concepto, detalle_obra, total, monto_pagado, estado, estado_pago, anulada
       from public.compra_sheet where proveedor ~* '^\\s*(arca|afip)\\s*$'`)).rows)
  // LOS DOS CÁLCULOS NO LEEN NADA PROPIO: su fuente es ARCA, y su suerte la deciden sus insumos (DEPENDE).
  for (const l of ['arca_iva', 'arca_iibb']) estado[l] = estado.arca?.ok ? { ok: true, leidas: estado.arca.leidas } : { ok: false, error: 'arca no leyó' }
  // Los planes no leen nada propio: su cronograma son las filas de Compras y sus pagos, el extracto.
  estado.planes_f931 = estado.compras?.ok ? { ok: true, leidas: estado.compras.leidas } : { ok: false, error: 'compras no leyó' }
  const cargas = await leer(estado, 'cargas_pestana', () => google.readSheetValues(ID, "'Cargas Sociales'!A1:N120", { render: 'UNFORMATTED_VALUE' }))
  return { estado, ddjjIva, ddjjIibb, ddjjGanancias, veps, f931, cobranzas, arca, banco, compras, cargas }
}

/** Las filas de las dos tablas, a partir de lo leído. Sin E/S. */
export function construir(f) {
  const oblF931 = obligacionesF931(f.f931 ?? [])
  const totalesF931 = new Map(oblF931.map((o) => [o.periodo, o.determinado]))
  const deCompras = pagosDeCompras(f.compras ?? [], { f931: totalesF931 })
  // LA IMPUTACIÓN SUBE DE FUERZA EN ESTE ORDEN: importe (dentro de pagosDelBanco/Compras) → el comprobante
  // del VEP (documento) → lo que declaró el dueño, sólo para lo que siguió sin imputar.
  const pagosSinPlan = imputarDeclaradas(imputarPorVep(sinPagosRepetidos([
    ...pagosDelBanco(f.banco ?? [], { f931: totalesF931, cuotasPlan: deCompras.cuotasPlan }),
    ...deCompras.pagos,
    ...(f.cobranzas ? pagosDeCobranzas(f.cobranzas.filas, f.cobranzas.cols) : []),
  ]), f.veps ?? []))
  const libro = libroPorPeriodo(f.arca ?? [])
  const arcaAl = iso((f.arca ?? []).reduce((m, r) => (r.fecha_emision > m ? r.fecha_emision : m), null))
  const bancoAl = iso((f.banco ?? []).reduce((m, r) => (r.fecha > m ? r.fecha : m), null))
  // Los débitos de cuota se atan a su cuota ANTES de calcular créditos y estados: una cuota es un pago de
  // F931, y el período que el plan financia deja de figurar pendiente por el saldo que ya está en cuotas.
  const planes = conPlanesF931({ compras: f.compras ?? [], pagos: pagosSinPlan, obligaciones: oblF931,
    pagosCompletos: f.estado ? Boolean(f.estado.banco?.ok && f.estado.compras?.ok) : Boolean(f.banco && f.compras) })
  const pagos = planes.pagos
  const hoyMes = (f.hoy ?? new Date().toISOString()).slice(0, 7)
  const estimadas = estimacionesF931(f.cargas ?? [], { declarados: oblF931.map((o) => o.periodo), hasta: hoyMes })
  const obligaciones = conEstadoDePago([
    ...conVencimientoF931(planes.obligaciones),
    ...estimadas,
    ...obligacionesIvaDDJJ(f.ddjjIva ?? []),
    ...obligacionesIibbDDJJ(f.ddjjIibb ?? []),
    ...obligacionesGananciasDDJJ(f.ddjjGanancias ?? []),
    ...obligacionesIvaCalculadas({ libro, ddjjs: f.ddjjIva ?? [], creditos: creditosPorPeriodo(pagos, 'iva'), datosAl: arcaAl }),
    ...obligacionesIibbEstimadas({ libro, ddjjs: f.ddjjIibb ?? [], creditos: creditosPorPeriodo(pagos, 'iibb'), datosAl: arcaAl }),
    ...deCompras.obligaciones,
    ...obligacionesDeDebitosBancarios(pagos, { datosAl: bancoAl }),
  ], pagos)
  // HASTA DÓNDE LLEGA CADA FUENTE — lo que la pantalla publica como frescura. Una DDJJ cubre hasta el
  // fin de su período; ARCA y el banco, hasta su último movimiento. No es la hora de la corrida.
  const hasta = (lista) => lista.map((o) => o.datos_al).filter(Boolean).sort().at(-1) ?? null
  const datosAl = {
    arca: arcaAl, banco: bancoAl,
    ddjj_iva_pdf: hasta(obligaciones.filter((o) => o.lector === 'ddjj_iva_pdf')),
    ddjj_iibb_pdf: hasta(obligaciones.filter((o) => o.lector === 'ddjj_iibb_pdf')),
    ddjj_ganancias_pdf: hasta(obligaciones.filter((o) => o.lector === 'ddjj_ganancias_pdf')),
    f931_raw: hasta(obligaciones.filter((o) => o.lector === 'f931_raw')),
  }
  return { obligaciones, pagos, arcaAl, datosAl }
}

function informar({ obligaciones, pagos, arcaAl }, estado) {
  console.log('\nLECTORES')
  for (const [l, e] of Object.entries(estado)) console.log(`  ${e.ok ? '✓' : '✖'} ${l.padEnd(14)} ${e.ok ? `${e.leidas} leídas` : e.error}`)
  console.log(`\nOBLIGACIONES (${obligaciones.length}) · ARCA al ${arcaAl ?? '—'}`)
  for (const o of [...obligaciones].sort((a, b) => `${a.impuesto}${a.periodo}`.localeCompare(`${b.impuesto}${b.periodo}`))) {
    console.log(`  ${o.impuesto.padEnd(17)} ${o.periodo} ${o.concepto.slice(0, 12).padEnd(12)} ${o.fuente.padEnd(13)} ${o.estado.padEnd(10)}`
      + ` det ${$(o.determinado).padStart(13)} cred ${$(o.creditos).padStart(12)} a pagar ${$(o.a_pagar).padStart(12)} a favor ${$(o.saldo_a_favor).padStart(12)}`
      + ` vence ${o.vencimiento ?? '—'}${o.vencimiento_confianza === 'supuesto' ? '?' : ''}`)
  }
  const grupos = new Map()
  for (const p of pagos) {
    const k = `${p.impuesto ?? 'SIN IMPUTAR'} · ${p.tipo} · ${p.imputacion}`
    const g = grupos.get(k) ?? { n: 0, total: 0 }
    grupos.set(k, { n: g.n + 1, total: g.total + p.importe })
  }
  console.log(`\nPAGOS Y CRÉDITOS (${pagos.length})`)
  for (const [k, g] of [...grupos].sort()) console.log(`  ${k.padEnd(50)} ${String(g.n).padStart(4)}  ${$(g.total).padStart(14)}`)
  for (const p of pagos.filter((x) => x.imputacion === 'sin_imputar')) console.log(`    sin imputar: ${p.fecha} ${$(p.importe).padStart(12)} ${p.descripcion ?? ''}`.slice(0, 150))
}

const COLS_OBL = ['impuesto', 'periodo', 'concepto', 'fuente', 'lector', 'estado', 'vencimiento', 'vencimiento_confianza', 'determinado',
  'base_imponible', 'creditos', 'saldo_favor_anterior', 'a_pagar', 'saldo_a_favor', 'presentada_el', 'comprobante', 'documento', 'datos_al', 'detalle']
const COLS_PAGO = ['impuesto', 'periodo', 'concepto', 'tipo', 'fecha', 'importe', 'fuente', 'lector', 'imputacion', 'referencia',
  'contraparte', 'descripcion', 'detalle']

/** Upsert de un lote por su clave natural. Sólo reescribe la fila si algo cambió: una corrida igual no avisa. */
async function upsert(cx, tabla, cols, conflicto, filas) {
  for (let i = 0; i < filas.length; i += 200) {
    const lote = filas.slice(i, i + 200)
    const valores = lote.map((_, j) => `(${cols.map((__, k) => `$${j * cols.length + k + 1}`).join(',')})`).join(',')
    const params = lote.flatMap((f) => cols.map((c) => (c === 'detalle' ? JSON.stringify(f[c] ?? {}) : f[c] ?? null)))
    const set = cols.filter((c) => !conflicto.includes(c)).map((c) => `${c} = excluded.${c}`).join(', ')
    const distinto = cols.filter((c) => !conflicto.includes(c)).map((c) => `t.${c} is distinct from excluded.${c}`).join(' or ')
    await cx.query(`insert into public.${tabla} as t (${cols.join(',')}) values ${valores}
      on conflict (${conflicto.join(',')}) do update set ${set}, sincronizado_en = now() where ${distinto}`, params)
  }
}

async function escribir(construido, estado) {
  const lectores = Object.fromEntries(Object.entries(lectoresEfectivos(estado))
    .map(([l, e]) => [l, { ...e, datos_al: construido.datosAl[l] ?? null }]))
  const ex = async (sql) => (await query(sql)).rows
  const oblEx = (await ex('select impuesto, periodo, concepto, fuente, lector from public.impuesto_obligacion')).map((o) => ({ clave: CLAVE.obligacion(o), lector: o.lector }))
  const pagEx = (await ex('select fuente, referencia, lector from public.impuesto_pago')).map((p) => ({ clave: CLAVE.pago(p), lector: p.lector }))
  const pO = planDeEscritura({ tabla: 'obligacion', lectores, nuevas: construido.obligaciones, existentes: oblEx })
  const pP = planDeEscritura({ tabla: 'pago', lectores, nuevas: construido.pagos, existentes: pagEx })
  for (const r of [...pO.retenidos, ...pP.retenidos]) console.log(`  ✋ ${r.lector}: ${r.motivo}`)
  await withTx(async (cx) => {
    await cx.query("set local lock_timeout = '5s'")
    await upsert(cx, 'impuesto_obligacion', COLS_OBL, ['impuesto', 'periodo', 'concepto', 'fuente'], pO.upsert)
    await upsert(cx, 'impuesto_pago', COLS_PAGO, ['fuente', 'referencia'], pP.upsert)
    if (pO.borrar.length) await cx.query("delete from public.impuesto_obligacion where impuesto||'|'||periodo||'|'||concepto||'|'||fuente = any($1)", [pO.borrar])
    if (pP.borrar.length) await cx.query("delete from public.impuesto_pago where fuente||'|'||referencia = any($1)", [pP.borrar])
    await cx.query('insert into public.impuesto_sincronizacion (lectores, escritas, borradas) values ($1, $2, $3)',
      [JSON.stringify(lectores), pO.upsert.length + pP.upsert.length, pO.borrar.length + pP.borrar.length])
  })
  console.log(`\n✓ escrito: ${pO.upsert.length} obligaciones y ${pP.upsert.length} pagos evaluados (upsert) · borradas ${pO.borrar.length} + ${pP.borrar.length}`)
  const v = (await ex(`select (select count(*) from public.impuesto_obligacion)::int o, (select count(*) from public.impuesto_pago)::int p,
    (select count(*) from public.impuesto_posicion)::int v`))[0]
  console.log(`  leído en la base: ${v.o} obligaciones · ${v.p} pagos · ${v.v} filas vigentes en impuesto_posicion`)
}

async function main() {
  const google = makeGoogleClient({ config: loadConfig(), scopes: READONLY_SCOPES })
  const fuentes = await leerFuentes(google)
  const construido = construir(fuentes)
  informar(construido, lectoresEfectivos(fuentes.estado))
  if (!APLICAR) { console.log('\nENSAYO: no se escribió nada. Con --aplicar se escribe.'); return }
  await escribir(construido, fuentes.estado)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main()
    .then(() => closePool().then(() => process.exit(0)))
    .catch((e) => { console.error('ERROR:', e.message); closePool().finally(() => process.exit(1)) })
}
