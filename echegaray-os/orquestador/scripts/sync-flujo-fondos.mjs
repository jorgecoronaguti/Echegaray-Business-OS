#!/usr/bin/env node
// EL FLUJO DE FONDOS → POSTGRES. La materialización que la página de analíticas va a consumir.
//
// ═══ QUÉ LEE Y POR QUÉ ESO ═══
//
// Lee `_MOVIMIENTOS` — el libro canónico, una fila por movimiento ya clasificado y deduplicado — y
// NO los cuadros `Cash Flow Mensual` / `Cash Flow Semanal`. Los cuadros son OUTPUTS: cada celda es un
// SUMPRODUCT sobre este mismo libro. Copiar el resultado sería tener dos verdades el día que la
// definición cambie. Los períodos se calculan acá con `terminosDeMedida`, la MISMA función que arma
// las fórmulas de la hoja (ver lib/flujo-persistencia.mjs).
//
// ═══ POR QUÉ LEE LA PESTAÑA Y NO REUSA LA MEMORIA DEL GENERADOR ═══
//
// Porque no dicen lo mismo, y el archivo tiene razón: las columnas C y H de las filas de Compras son
// fórmulas vivas, así que un pago que el dueño marcó hace un minuto está en la celda y no en la
// memoria del generador que corrió antes. Por eso se lee con `UNFORMATTED_VALUE`, que devuelve el
// RESULTADO de la fórmula y no su texto.
//
// ═══ SI EL SHEET NO ESTÁ AL DÍA, LA BASE NO SE TOCA ═══
//
// El runner del pipeline sigue con el paso siguiente aunque uno falle, así que la protección no puede
// venir del orden: la pone este script. Si `_MOVIMIENTOS` no existe, o volvió vacía, o toda fila es
// ilegible, no se escribe NADA y se sale en verde con el aviso. Media foto es peor que ninguna: la
// pantalla la dibujaría igual, sin decir que le falta la mitad.
//
// ═══ Y SI LA MIGRACIÓN TODAVÍA NO SE APLICÓ, TAMPOCO ROMPE ═══
//
// Una migración vive en el repositorio antes de estar aplicada. Un paso del pipeline que explota
// porque una tabla no existe deja el servicio en rojo y —peor— la frescura del Cash Flow, que sólo se
// registra si nadie falló, deja de registrarse. Se degrada con aviso.
//
//   node orquestador/scripts/sync-flujo-fondos.mjs [--dry]

import { makeGoogleClient } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { query, withTx, closePool } from '../lib/db.mjs'
import { NOMBRES_VISTA } from '../lib/cash-flow-meses.mjs'
import { LIBRO } from '../lib/libro-sumas.mjs'
import {
  libroDesdeLaPestana, filasDeMovimiento, filasDePeriodo, filasDeAsimetria,
  firmaDelLibro, resumenDeCorrida, fechaDeSerial, iso, corridasAPodar, CORRIDAS_CON_DETALLE,
} from '../lib/flujo-persistencia.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const DRY = process.argv.includes('--dry')
/** Cuántas filas por sentencia. Un jsonb de miles de filas entra igual; el tope acota la memoria. */
const LOTE = 2000

const pesos = (n) => (n < 0 ? '-' : '') + '$' + Math.abs(Math.round(n)).toLocaleString('es-AR')

/** ¿Existe ya la tabla? Es la pregunta que separa "la migración no se aplicó" de "hay un error". */
async function tablasListas() {
  const { rows } = await query("select to_regclass('public.flujo_corrida') as t")
  return Boolean(rows[0]?.t)
}

/**
 * LOS SALDOS DEL MENSUAL, POR SUS RANGOS CON NOMBRE.
 *
 * `CF_MESES`, `CF_INICIO` y `CF_CIERRE` existen exactamente para esto: la vista los publica para que
 * un consumidor lea sus cifras sin conocer su geometría (`caja-anexo-controles.mjs` ya los usa así).
 * El saldo NO es un flujo del libro — es un stock anclado en el saldo declarado de CAJA y encadenado
 * mes a mes— así que es lo único de esta corrida que no se puede recalcular desde `_MOVIMIENTOS`.
 *
 * Si los nombres no existen todavía (arranque en frío), devuelve el mapa vacío y los saldos entran
 * NULL. Un 0 se leería como "la empresa cerró el mes sin plata", que es una afirmación que nadie hizo.
 */
async function saldosDelMensual(google) {
  const leer = (nombre) => google.readSheetValues(ID, nombre, { render: 'UNFORMATTED_VALUE' }).catch(() => null)
  const [meses, inicio, cierre] = await Promise.all(
    [NOMBRES_VISTA.meses, NOMBRES_VISTA.inicio, NOMBRES_VISTA.cierre].map(leer))
  const fila = (v) => (v?.[0] ?? [])
  const serials = fila(meses)
  const saldos = new Map()
  const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
  serials.forEach((s, j) => {
    if (!Number.isFinite(s)) return
    saldos.set(iso(fechaDeSerial(s)), { inicio: num(fila(inicio)[j]), cierre: num(fila(cierre)[j]) })
  })
  // EL AÑO DEL EJERCICIO SALE DEL PROPIO CUADRO y no de una constante copiada: así la base cubre
  // exactamente los meses que cubre la pestaña, incluso el 1° de enero del año que viene.
  const anio = Number.isFinite(serials[0]) ? fechaDeSerial(serials[0]).getUTCFullYear() : null
  return { saldos, anio }
}

/** El rectángulo del libro, leído entero con el RESULTADO de las fórmulas vivas. */
async function leerLibro(google) {
  const ultima = LIBRO.col.cliente
  return google.readSheetValues(ID, `${LIBRO.pestana}!A1:${ultima}`, { render: 'UNFORMATTED_VALUE' })
    .catch(() => null)
}

const COLS_MOV = ['clave', 'fecha', 'fecha_serial', 'signo', 'importe', 'moneda', 'importe_origen',
  'tipo_cambio', 'concepto', 'rubro', 'actividad', 'estado', 'instrumento', 'contraparte', 'cuit',
  'comprobante', 'obra', 'cliente', 'origen_pestana', 'origen_fila']
const TIPOS_MOV = ['text', 'date', 'int', 'smallint', 'numeric', 'text', 'numeric', 'numeric', 'text',
  'text', 'text', 'text', 'text', 'text', 'text', 'text', 'text', 'text', 'text', 'int']

/** El `x(col tipo, …)` de un `jsonb_to_recordset`. Los nombres y los tipos viajan juntos o no sirven. */
const recordset = (cols, tipos) => cols.map((c, i) => `${c} ${tipos[i]}`).join(', ')

/**
 * ESCRITURA IDEMPOTENTE POR CORRIDA. `on conflict` sobre la clave del libro: correr dos veces la
 * misma corrida deja exactamente las mismas filas. Sin eso, un reintento duplicaría el año entero.
 */
async function escribirMovimientos(cli, corridaId, filas) {
  const set = COLS_MOV.filter((c) => c !== 'clave').map((c) => `${c} = excluded.${c}`).join(', ')
  for (let i = 0; i < filas.length; i += LOTE) {
    await cli.query(
      `insert into public.flujo_movimiento (corrida_id, ${COLS_MOV.join(', ')})
       select $1, x.* from jsonb_to_recordset($2::jsonb) as x(${recordset(COLS_MOV, TIPOS_MOV)})
       on conflict (corrida_id, clave) do update set ${set}`,
      [corridaId, JSON.stringify(filas.slice(i, i + LOTE))])
  }
}

const COLS_PER = ['granularidad', 'periodo_inicio', 'periodo_fin', 'nivel', 'rubro', 'ingreso_real',
  'ingreso_proyectado', 'egreso_real', 'egreso_proyectado', 'resultado', 'saldo_inicio', 'saldo_cierre']
const TIPOS_PER = ['text', 'date', 'date', 'text', 'text', 'numeric', 'numeric', 'numeric', 'numeric',
  'numeric', 'numeric', 'numeric']

async function escribirPeriodos(cli, corridaId, filas) {
  const set = COLS_PER.slice(3).map((c) => `${c} = excluded.${c}`).join(', ')
  await cli.query(
    `insert into public.flujo_periodo (corrida_id, ${COLS_PER.join(', ')})
     select $1, x.* from jsonb_to_recordset($2::jsonb) as x(${recordset(COLS_PER, TIPOS_PER)})
     on conflict (corrida_id, granularidad, periodo_inicio, coalesce(rubro, '')) do update set ${set}`,
    [corridaId, JSON.stringify(filas)])
}

const COLS_ASI = ['tipo', 'periodo_inicio', 'jornales', 'material_estimado', 'ratio', 'nomina',
  'ingreso_proyectado', 'cobertura', 'faltante']
const TIPOS_ASI = ['text', 'date', 'numeric', 'numeric', 'numeric', 'numeric', 'numeric', 'numeric', 'numeric']

async function escribirAsimetria(cli, corridaId, filas) {
  if (!filas.length) return
  const set = COLS_ASI.slice(2).map((c) => `${c} = excluded.${c}`).join(', ')
  await cli.query(
    `insert into public.flujo_asimetria (corrida_id, ${COLS_ASI.join(', ')})
     select $1, x.* from jsonb_to_recordset($2::jsonb) as x(${recordset(COLS_ASI, TIPOS_ASI)})
     on conflict (corrida_id, tipo, periodo_inicio) do update set ${set}`,
    [corridaId, JSON.stringify(filas)])
}

/**
 * LA CORRIDA VIGENTE. Se apaga la anterior y se enciende la nueva EN LA MISMA TRANSACCIÓN: la base
 * tiene un índice único parcial sobre `vigente`, así que dos fotos vigentes son imposibles — pero
 * fuera de transacción quedaría una ventana con NINGUNA, y la pantalla mostraría vacío.
 */
async function abrirCorrida(cli, { firma, corte, resumen }) {
  await cli.query('update public.flujo_corrida set vigente = false where vigente')
  const { rows } = await cli.query(
    `insert into public.flujo_corrida
       (corte_serial, firma, movimientos, neto, neto_real, neto_pendiente, fuente, vigente)
     values ($1, $2, $3, $4, $5, $6, $7, true) returning id`,
    [corte, firma, resumen.movimientos, resumen.neto, resumen.neto_real, resumen.neto_pendiente,
      `${LIBRO.pestana} del Sheet Flujo de Caja (${ID})`])
  return rows[0].id
}

/**
 * LA VERIFICACIÓN ES DEL EFECTO, NO DEL INTENTO: se releen los totales DESDE la base y se comparan
 * contra los que se calcularon en memoria. Un `insert` que no lanzó no prueba que las filas estén.
 */
async function verificar(cli, corridaId, resumen) {
  const { rows } = await cli.query(
    'select count(*)::int as n, coalesce(sum(signo * importe), 0)::numeric as neto '
    + 'from public.flujo_movimiento where corrida_id = $1', [corridaId])
  const leido = { n: rows[0].n, neto: Number(rows[0].neto) }
  const cierra = leido.n === resumen.movimientos && Math.abs(leido.neto - resumen.neto) < 1
  return { cierra, leido }
}

async function main() {
  if (!await tablasListas()) {
    console.log('⚠ public.flujo_corrida todavía no existe: la migración 20260903T0500 no está aplicada. '
      + 'No escribo nada — el paso no falla para no tumbar la frescura del Cash Flow.')
    return
  }
  // SIN `scopes`: el cliente nace de SOLO LECTURA. Este paso corre DESPUÉS de que el Sheet quedó
  // escrito y no tiene ningún motivo para poder tocarlo — y un proceso que no puede escribir es la
  // única garantía real de que no va a escribir. Es el mismo criterio del centinela del conteo.
  const google = makeGoogleClient({ config: loadConfig() })
  const valores = await leerLibro(google)
  if (!valores || valores.length < 2) {
    console.log(`⚠ ${LIBRO.pestana} no existe o volvió vacía: NO toco la base. `
      + 'Media foto es peor que ninguna — la pantalla la dibujaría igual sin decir que le falta la mitad.')
    return
  }
  const { libro, problemas } = libroDesdeLaPestana(valores)
  for (const p of problemas.slice(0, 10)) console.log(`  ⚠ ${p}`)
  if (problemas.length > 10) console.log(`  ⚠ … y ${problemas.length - 10} fila(s) ilegible(s) más`)
  if (!libro.length) {
    console.log(`⚠ ninguna de las ${valores.length - 1} filas de ${LIBRO.pestana} es legible: NO toco la base.`)
    return
  }

  const { saldos, anio } = await saldosDelMensual(google)
  const ejercicio = anio ?? Number(process.env.ORQ_CF_ANIO || 2026)
  if (!anio) console.log(`  ⚠ ${NOMBRES_VISTA.meses} no existe todavía: uso el ejercicio ${ejercicio} y los saldos van NULL.`)

  const movimientos = filasDeMovimiento(libro)
  const firma = firmaDelLibro(movimientos)
  const resumen = resumenDeCorrida(libro)
  const meses = filasDePeriodo(libro, { granularidad: 'mes', anio: ejercicio, saldos })
  const semanas = filasDePeriodo(libro, { granularidad: 'semana', anio: ejercicio })
  const asimetria = filasDeAsimetria(meses)
  const corte = Math.max(...libro.map((m) => m.fecha))

  console.log(`FLUJO DE FONDOS → POSTGRES · ejercicio ${ejercicio} · firma ${firma.slice(0, 12)}`)
  console.log(`  ${String(resumen.movimientos).padStart(5)} movimiento(s) · neto ${pesos(resumen.neto)} `
    + `(real ${pesos(resumen.neto_real)} · pendiente ${pesos(resumen.neto_pendiente)})`)
  console.log(`  ${String(meses.length).padStart(5)} fila(s) mensuales · ${semanas.length} semanales · `
    + `${asimetria.length} hallazgo(s) de asimetría`)
  if (DRY) { console.log('\n--dry: no escribí nada.'); return }

  // LA FOTO QUE NO CAMBIÓ NO NACE DE NUEVO. El pipeline corre cada dos horas; sin esto, un año de
  // corridas idénticas vuelve la tabla del detalle inconsultable. Se le corre la fecha a la vigente.
  const { rows: yaEsta } = await query(
    'select id from public.flujo_corrida where vigente and firma = $1', [firma])
  if (yaEsta.length) {
    await query('update public.flujo_corrida set corrida_en = now() where id = $1', [yaEsta[0].id])
    console.log(`\n✓ el libro no cambió desde la corrida vigente (${yaEsta[0].id}): no creo una foto nueva.`)
    return
  }

  const { corridaId, control } = await withTx(async (cli) => {
    const id = await abrirCorrida(cli, { firma, corte, resumen })
    await escribirMovimientos(cli, id, movimientos)
    await escribirPeriodos(cli, id, [...meses, ...semanas])
    await escribirAsimetria(cli, id, asimetria)
    return { corridaId: id, control: await verificar(cli, id, resumen) }
  })

  console.log(`\nQUEDÓ ESCRITO en la corrida ${corridaId}`)
  console.log(`  releído de la base : ${control.leido.n} fila(s) · neto ${pesos(control.leido.neto)}`)
  console.log(`  calculado en memoria: ${resumen.movimientos} fila(s) · neto ${pesos(resumen.neto)}`)
  if (!control.cierra) {
    console.log('  ✗ NO CIERRAN: la escritura no aterrizó entera. NO uses esta corrida.')
    process.exitCode = 1
    return
  }
  console.log('  ✓ la base y la memoria dicen lo mismo')
  await podar()
}

/**
 * LA PODA DEL DETALLE. La cabecera de cada corrida —su firma y sus totales de control— se conserva
 * PARA SIEMPRE: es la serie histórica de "qué decíamos y cuánto daba", y es una fila chica. Lo que se
 * poda es el detalle fino de las corridas viejas, que es lo que pesa (1.235 filas de período por
 * corrida, más una por movimiento).
 *
 * Va DESPUÉS de la verificación y fuera de la transacción a propósito: si podar falla, la corrida
 * nueva ya está escrita y verificada. Al revés, un error de mantenimiento tiraría abajo la foto del
 * día — que es cambiar un problema de disco por uno de datos.
 */
async function podar() {
  const { rows } = await query(
    'select id, vigente from public.flujo_corrida order by corrida_en desc')
  const ids = corridasAPodar(rows, { retener: CORRIDAS_CON_DETALLE })
  if (!ids.length) return
  await query('delete from public.flujo_movimiento where corrida_id = any($1::uuid[])', [ids])
  await query('delete from public.flujo_periodo where corrida_id = any($1::uuid[])', [ids])
  await query('delete from public.flujo_asimetria where corrida_id = any($1::uuid[])', [ids])
  console.log(`  · podado el detalle de ${ids.length} corrida(s) vieja(s); sus totales de control quedan.`)
}

main().then(() => closePool()).catch(async (e) => {
  console.error('sync-flujo-fondos falló:', e?.message ?? e)
  await closePool()
  process.exit(1)
})
