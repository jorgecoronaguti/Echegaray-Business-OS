// OBRAS → `public.obra_economia_sheet`: contratado, costo MO, costo materiales y margen POR OBRA,
// leídos con las MISMAS funciones que publican la pestaña OBRAS y persistidos para que la web
// (Clientes) los lea de Postgres y no de una segunda definición.
//
//   node orquestador/scripts/obras-economia-sync.mjs            # dry: muestra lo que escribiría
//   node orquestador/scripts/obras-economia-sync.mjs --aplicar  # upsert idempotente
//
// SÓLO LEE el Sheet (Cobranzas y el tipo de cambio). El contrato sale de `contratoDeObra` sobre la
// misma lectura de Cobranzas que hace `obras-pestana.mjs` (`leerContratos`); los costos, de
// `obra_egreso_proyectado`, que es la fuente que la columna «Costo proyectado» de OBRAS SUMA vía la
// réplica `_OBRAS_RAW`. No se lee la pestaña OBRAS: es un derivado, y leer un derivado para volver a
// persistirlo es la segunda definición que este script viene a evitar.
//
// SI LA MIGRACIÓN NO ESTÁ APLICADA, el script lo dice y sale en 0: corre dentro del pipeline del
// Flujo de Caja y un rojo acá dejaría de sellar la frescura del Cash Flow entero por una tabla que
// el dueño todavía no creó. Es un aviso ruidoso, no un silencio.
//
// ═══ QUÉ FILA DE COBRANZAS ES DE QUÉ OBRA: LA IMPUTACIÓN CANÓNICA, NO UN `needle` PROPIO ═══
//
// Hasta el 10/09/2026 este script elegía las filas de cada obra buscando el nombre de la obra dentro
// del Concepto o de la Orden de Compra —el espejo de la fórmula SUMIFS que publica la pestaña—. La
// fila 46 de Messina («ACTUALIZACION DE PRECIOS OC 02-00000279», $3.583.956) pertenece a BSA por su
// orden 00002-00001984 y no dice «BSA» en ninguna columna: el contratado la dejaba afuera
// ($14.120.243,40) mientras el cobrado —que sale de `obra_cobranza`, o sea de la imputación— la
// incluía. La misma obra, medida sobre dos universos, y la diferencia invisible.
//
// Ahora las filas salen de `cobro_por_obra`, la definición canónica (`orquestador/datos/
// definiciones.json`): la regla pura vive en `cobranza-obra.mjs`, la SQL equivalente en
// `public.cobranza_imputacion`, y `cobranza-obra.pg.test.mjs` corre las dos sobre las mismas filas.
// El contratado de BSA pasa a $17.704.199,40 con sus cuatro filas.
//
// LA VENTANA ES LA DE OBRAS. La suma viva se acota por FECHA DE VENTA al `ANO` del rótulo de la
// pestaña, igual que `enElAno()` de obras-grilla: sin eso, la fila 3 de San Francisco ($15.000.000
// vendidos el 15/12/2025) entraba entera acá y en ninguna celda de la pestaña. El CONTRATO
// DECLARADO no se acota —un papel no tiene período— exactamente como hace la columna D.

import { makeGoogleClient } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { query, withTx, closePool } from '../lib/db.mjs'
import { OBRAS_FUTURAS } from '../lib/obras-datos.mjs'
import { ANO } from '../lib/obras-grilla.mjs'
import { leerTipoCambio } from '../lib/tipo-cambio.mjs'
import { indiceDeLetra, refsReales } from './obras-pestana.mjs'
import { contratoDeObra } from '../lib/cobranzas-contrato.mjs'
import { filaEconomia, totalesDeOrdenes, ventaViva, ORIGEN } from '../lib/obras-economia.mjs'
import { cargarDiccionarios, imputarFilas } from '../lib/cobranza-obra-diccionario.mjs'
import { resolverCliente } from '../lib/portal/cobranzas-a-cliente.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const APLICAR = process.argv.includes('--aplicar')
export const TABLA = 'public.obra_economia_sheet'
export const ORIGEN_FUENTE = 'sheet:Cobranzas+obra_egreso_proyectado'

/** El mapeo clave interna → obra canónica lo declara `obra_egreso_proyectado`: no se inventa acá. */
async function mapaCanonico() {
  const r = await query(`select distinct obra_clave, obra_canonica_id from public.obra_egreso_proyectado
                         where obra_clave is not null and obra_canonica_id is not null`)
  return new Map(r.rows.map((x) => [x.obra_clave, x.obra_canonica_id]))
}

async function costosPorObra() {
  const r = await query(`select obra_clave, tipo, sum(monto)::numeric monto from public.obra_egreso_proyectado
                         where obra_clave is not null group by 1, 2`)
  // MISMO CRITERIO QUE OBRAS: si la obra tiene plan cargado, un tipo sin filas es $0 (BSA no tiene
  // materiales y la I de OBRAS publica 0). Sin ninguna fila, los dos van en null: no se sabe.
  const m = new Map()
  for (const x of r.rows) {
    const c = m.get(x.obra_clave) ?? { mo: 0, material: 0 }
    if (x.tipo === 'mano_de_obra') c.mo = Number(x.monto)
    if (x.tipo === 'material') c.material = Number(x.monto)
    m.set(x.obra_clave, c)
  }
  return m
}

/** Ejecuta y devuelve filas: la forma que espera `cargarDiccionarios`. */
const filasDe = async (sql, params) => (await query(sql, params)).rows

/** ¿Existe esta columna en la base? La migración puede estar escrita y sin aplicar. */
async function hayColumna(tabla, columna) {
  const r = await query(
    `select 1 from information_schema.columns
      where table_schema='public' and table_name=$1 and column_name=$2`, [tabla, columna])
  return r.rowCount > 0
}

/**
 * LAS ÓRDENES DE COMPRA DE CADA OBRA VIVA — el papel que respalda (o desmiente) el contratado.
 *
 * Las de una obra FUSIONADA cuentan para su destino: es la misma obra con otro nombre. Lo que las
 * separa no es la fusión sino la FECHA, y eso lo decide `totalesDeOrdenes` con la ventana del año.
 */
async function ordenesPorObra() {
  const conNeto = await hayColumna('cliente_orden', 'importe_es_neto')
  const r = await query(`select coalesce(o.fusionada_en, co.obra_id) obra_viva, co.numero, co.fecha,
                                co.importe, ${conNeto ? 'co.importe_es_neto' : 'false as importe_es_neto'}
                           from public.cliente_orden co
                           join public.obra_canonica o on o.id = co.obra_id
                          where co.tipo = 'orden_compra' and co.eliminado_en is null`)
  const m = new Map()
  for (const x of r.rows) {
    if (!m.has(x.obra_viva)) m.set(x.obra_viva, [])
    m.get(x.obra_viva).push({
      numero: x.numero,
      fecha: x.fecha instanceof Date ? x.fecha.toISOString().slice(0, 10) : x.fecha,
      importe: Number(x.importe),
      importeEsNeto: x.importe_es_neto === true,
    })
  }
  return { porObra: m, conNeto }
}

/** El índice alias → cliente, el MISMO que usa `sync-cobranzas.mjs` para vincular cada fila. */
async function indiceDeClientes() {
  const { rows } = await query(`select a.alias, o.cliente_id
                                  from public.obra_alias a
                                  join public.obra_canonica o on o.id = a.obra_id
                                 where o.cliente_id is not null`)
  const cache = new Map()
  return (etiqueta) => {
    if (!cache.has(etiqueta)) cache.set(etiqueta, resolverCliente(etiqueta, rows).cliente_id ?? null)
    return cache.get(etiqueta)
  }
}

export async function armarFilas({ google }) {
  const refs = await refsReales(google)
  const datos = await google.readSheetValues(ID, `${refs.cob.hoja}!A${refs.cob.desde}:${refs.cob.moneda}`,
    { render: 'UNFORMATTED_VALUE' }) ?? []
  const { tc } = await leerTipoCambio(google, ID)
  const cols = {
    cliente: indiceDeLetra(refs.cob.cliente), concepto: indiceDeLetra(refs.cob.concepto),
    oc: indiceDeLetra(refs.cob.oc), neto: indiceDeLetra(refs.cob.neto),
    estado: indiceDeLetra(refs.cob.estado), moneda: indiceDeLetra(refs.cob.moneda),
    fechaVenta: indiceDeLetra(refs.cob.fechaVenta),
  }
  const [canonico, costos, dicc, clienteDe, oc] = await Promise.all([
    mapaCanonico(), costosPorObra(), cargarDiccionarios(filasDe), indiceDeClientes(), ordenesPorObra(),
  ])
  const imputacion = imputarFilas(datos, cols, { ...dicc, clienteDe })
  // UNA IMPUTACIÓN VACÍA NO ES «NINGUNA OBRA COBRÓ»: ES QUE NO SE PUDO MIRAR. Sin este corte, un
  // diccionario que no cargó publicaría las nueve obras en `contratado = null` de una corrida a otra,
  // y el pipeline seguiría en verde. Es el mismo verde falso del barrido que no encuentra archivos.
  if (datos.length && !imputacion.imputadas) {
    throw new Error(`leí ${datos.length} filas de Cobranzas y NINGUNA se imputó a una obra:`
      + ' el diccionario (cliente_orden / obra_alias) no cargó. No escribo nada.')
  }
  const filas = []
  const sinCanonica = []
  for (const o of OBRAS_FUTURAS) {
    const obraCanonicaId = canonico.get(o.clave) ?? null
    if (!obraCanonicaId) { sinCanonica.push(o.clave); continue }
    const imputadas = imputacion.porObra.get(obraCanonicaId) ?? []
    // El CONTRATO DECLARADO se lee sin ventana (un papel no tiene período) y la SUMA VIVA con la
    // ventana del año — las dos mitades de la columna D de OBRAS, cada una con su criterio.
    const contrato = contratoDeObra(datos, cols, { imputadas }, refs.cob.desde)
    const viva = ventaViva(datos, cols, { imputadas, anio: ANO }, tc)
    filas.push(filaEconomia(o, contrato, costos.get(o.clave) ?? {}, {
      ventaViva: viva.pesos, tc, obraCanonicaId,
      oc: totalesDeOrdenes(oc.porObra.get(obraCanonicaId) ?? [], ANO),
    }))
  }
  return { filas, sinCanonica, tc, imputacion, conNeto: oc.conNeto }
}

async function tablaExiste() {
  const r = await query(`select to_regclass($1) t`, [TABLA])
  return Boolean(r.rows[0]?.t)
}

/** Las columnas que la migración 20260910T2355 agrega. Sin ella aplicada, se escribe lo de antes. */
const COLUMNAS_NUEVAS = ['referencia', 'nota', 'oc_civa_ventana', 'oc_civa_historico',
  'oc_n_ventana', 'oc_n_historico']

/**
 * EL TIPO DE CAMBIO QUE USÓ ESTA CORRIDA, REPLICADO A POSTGRES.
 *
 * `public.obra_economia_cartera` valúa los contratos en dólares con `tc_vigente()` en vez de leer un
 * peso congelado, y para eso el TC tiene que existir en la base: hasta hoy vivía SÓLO en el rango
 * `TIPO_CAMBIO_USD` del Sheet y la web no tenía cómo verlo. Una fila por día, con su fuente escrita.
 */
async function replicarTipoCambio(tc) {
  if (!Number.isFinite(tc) || tc <= 0) return false
  if (!(await hayColumna('tipo_cambio', 'tc'))) return false
  await query(`insert into public.tipo_cambio (fecha, tc, fuente) values (current_date, $1, $2)
               on conflict (fecha) do update set tc = excluded.tc, fuente = excluded.fuente`,
  [tc, 'Sheet Flujo de Caja · rango TIPO_CAMBIO_USD (obras-economia-sync)'])
  return true
}

async function main() {
  const google = makeGoogleClient({ config: loadConfig() })
  const { filas, sinCanonica, tc, imputacion, conNeto } = await armarFilas({ google })
  console.log(`tipo de cambio: ${tc ?? 'SIN LEER'} · ${filas.length} obras con obra canónica · ${sinCanonica.length} sin vínculo${sinCanonica.length ? ` (${sinCanonica.join(', ')})` : ''}`)
  console.log(`imputación: ${imputacion.imputadas} filas de Cobranzas con obra · ${imputacion.sinObra} sin obra`
    + `${conNeto ? '' : ' · cliente_orden.importe_es_neto AUSENTE: toda OC se toma con IVA'}`)
  for (const f of filas) {
    console.log(`  ${f.obra_canonica_id.padEnd(32)} contratado ${fmt(f.contratado)} [${f.origen ?? 'sin dato'}]`
      + ` · MO ${fmt(f.costo_mo)} · MAT ${fmt(f.costo_materiales)} · margen ${fmt(f.margen)}`
      + `${f.referencia ? ` · ${f.referencia}` : ''}${f.nota ? ` · ⚠ ${f.nota}` : ''}`)
  }
  if (!(await tablaExiste())) {
    console.log(`\n⚠ ${TABLA} NO EXISTE: la migración 20260908T1800_obra_economia_sheet.sql está sin aplicar. No escribo nada.`)
    return
  }
  if (!APLICAR) { console.log('\n--aplicar para escribir. No escribí nada.'); return }
  const extras = []
  for (const c of COLUMNAS_NUEVAS) if (await hayColumna('obra_economia_sheet', c)) extras.push(c)
  if (extras.length !== COLUMNAS_NUEVAS.length) {
    console.log(`⚠ migración 20260910T2355 sin aplicar: no persisto ${COLUMNAS_NUEVAS.filter((c) => !extras.includes(c)).join(', ')}`)
    // EL CHECK VIEJO NO CONOCE `oc-cliente` Y EL INSERT FALLARÍA ENTERO. Se degrada a la marca que
    // esas obras tenían ayer —`suma-viva`, que es débil pero no es falsa— en vez de tumbar el
    // pipeline del Flujo de Caja por una migración que el dueño todavía no aplicó. Se dice obra por
    // obra: un degradado silencioso sería peor que el rojo que se está evitando.
    for (const f of filas.filter((x) => x.origen === ORIGEN.ocCliente)) {
      console.log(`  ↓ ${f.obra_canonica_id}: «${f.referencia}» no se puede publicar todavía; va como suma-viva`)
      f.origen = ORIGEN.sumaViva
    }
  }
  const columnas = ['obra_canonica_id', 'obra_clave', 'contratado', 'contratado_usd', 'costo_mo',
    'costo_materiales', 'margen', 'plazo_desde', 'plazo_hasta', 'origen', ...extras,
    'origen_fuente', 'leido_en']
  const leidoEn = new Date().toISOString()
  await withTx(async (c) => {
    for (const f of filas) {
      const valores = columnas.map((k) => (k === 'origen_fuente' ? ORIGEN_FUENTE : k === 'leido_en' ? leidoEn : f[k] ?? null))
      await c.query(`insert into ${TABLA} (${columnas.join(', ')})
        values (${columnas.map((_, i) => `$${i + 1}`).join(',')})
        on conflict (obra_canonica_id) do update set `
        + columnas.filter((k) => k !== 'obra_canonica_id').map((k) => `${k} = excluded.${k}`).join(', '),
      valores)
    }
  })
  const tcReplicado = await replicarTipoCambio(tc)
  if (!tcReplicado) console.log('⚠ no repliqué el tipo de cambio: sin TC leído o sin tabla public.tipo_cambio')
  // LA EVIDENCIA ES EL DATO LEÍDO EN SU DESTINO, no el INSERT que respondió que sí.
  const r = await query(`select count(*)::int n, sum(contratado)::numeric contratado from ${TABLA} where leido_en = $1`, [leidoEn])
  console.log(`\nescrito y releído: ${r.rows[0].n} filas · contratado total ${fmt(Number(r.rows[0].contratado))}`)
  if (r.rows[0].n !== filas.length) throw new Error(`escribí ${filas.length} y releí ${r.rows[0].n}`)
}

const fmt = (n) => (n === null || n === undefined ? '—' : `$${Math.round(n).toLocaleString('es-AR')}`)

if (import.meta.url === `file://${process.argv[1]}`) {
  main()
    .catch((e) => { console.error('ERROR:', e.message); process.exitCode = 1 })
    .finally(() => closePool().catch(() => {}))
}
