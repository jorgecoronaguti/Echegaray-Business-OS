#!/usr/bin/env node
// ¿LA FECHA CON LA QUE CADA MOVIMIENTO APARECE EN EL SHEET ES LA DEL EXTRACTO?
//
// SÓLO LEE. No escribe una celda. Se puede correr contra el Sheet real sin riesgo.
//
// ═══ EL PEDIDO (17/08/2026, el dueño textual) ═══
//
// *"imagino q dejarás todas las fechas en orden de acuerdo al extracto en todo el sheet, eso tb es
// actualizar todo"*.
//
// ═══ POR QUÉ NO TIENE `--aplicar`, Y NO ES UNA ETAPA PENDIENTE ═══
//
// Medido con `valueRenderOption=FORMULA` sobre el archivo vivo, los tres destinos posibles están
// cerrados y cada uno por un motivo distinto:
//
//   · `Compras!AD` — "Fecha de caja", que es LA columna que lee el libro y las fórmulas de CAJA — no
//     se tipea: es UNA `ARRAYFORMULA` en AD4 que derrama sobre las 897 filas y sale de `Compras!Q`.
//     Escribir una celda del derrame lo parte, y escribir AD4 borra la columna entera.
//   · `Compras!Q` — "Fecha PREVISTA de pago (día)" — es el origen de esa derivada, y en 386 de 897
//     filas es una fórmula (`=C5`, la fecha de la factura). Pegarle la fecha del banco haría dos
//     cosas prohibidas a la vez: convertir una fórmula en un número pegado, y guardar un HECHO en la
//     columna que el archivo declara PREVISIÓN.
//   · `Cheques Emitidos` está CANDADA por el dueño. No se toca ni con `--forzar-candado`.
//
// LA CORRECCIÓN DE FONDO ES ESTRUCTURAL Y LA DECIDE EL DUEÑO: hoy el archivo usa la fecha PREVISTA
// como si fuera la fecha de caja. Mientras "cuándo pensaba pagar" y "cuándo salió la plata" sean la
// misma celda, no hay dónde escribir la segunda sin destruir la primera. Lo que falta es una columna
// «Fecha real de pago (banco)» en Compras y que la `ARRAYFORMULA` de AD la prefiera cuando exista.
//
// Mientras tanto esto produce la EVIDENCIA para que él corrija fila por fila, con la fila física de
// cada lado. El criterio de emparejamiento vive en `lib/fechas-contra-extracto.mjs`, probado en frío.
//
//   node orquestador/scripts/fechas-vs-extracto.mjs

import { makeGoogleClient } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { NAT } from '../lib/banco-santander.mjs'
import { isoDeSerial } from '../lib/libro-extractores-fechas.mjs'
import {
  cruzarFechas, corregibles, resumen, VEREDICTO_FECHA, HOLGURA_FECHA,
} from '../lib/fechas-contra-extracto.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'

/** La primera fila de datos de cada pestaña. Su encabezado está una fila más arriba. */
export const FILA0 = Object.freeze({ banco: 4, compras: 4, cheques: 8, cobranzas: 5 })

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const pesos = (n) => `$${Math.round(Math.abs(Number(n) || 0)).toLocaleString('es-AR')}`
const dia = (s) => (num(s) === null ? '—' : isoDeSerial(s))

/**
 * NÚCLEO PURO: los movimientos del extracto en la forma que pide el cruce, filtrados por naturaleza.
 *
 * `lado` decide si se miran los débitos o los créditos: una cobranza se prueba contra lo que ENTRÓ, y
 * cruzarla contra los débitos daría "sin testigo" sobre el 100% de las filas sin un solo error.
 *
 * @param {Array<Array>} filas `_BANCO_RAW` entera
 * @param {{lado:'sale'|'entra', naturalezas?:string[]}} f
 */
export function movimientosDelBanco(filas = [], { lado = 'sale', naturalezas = null } = {}) {
  const out = []
  for (let i = FILA0.banco - 1; i < filas.length; i++) {
    const f = filas[i] ?? []
    const fecha = num(f[0])
    const importe = num(f[2])
    if (fecha === null || importe === null || importe === 0) continue
    if (lado === 'sale' ? importe > 0 : importe < 0) continue
    const nat = String(f[5] ?? '').trim()
    if (naturalezas && !naturalezas.includes(nat)) continue
    out.push({ fecha, importe: Math.abs(importe), naturaleza: nat, concepto: String(f[1] ?? ''), fila: i + 1 })
  }
  return out
}

/** NÚCLEO PURO: la ventana que cubre el extracto. Se DERIVA del dato: un corte tipeado se queda viejo. */
export function ventanaDelExtracto(movs = []) {
  if (!movs.length) return null
  return { desde: Math.min(...movs.map((m) => m.fecha)), hasta: Math.max(...movs.map((m) => m.fecha)) }
}

/** Lee un rango con UNFORMATTED_VALUE: una fecha formateada llega como texto y no compara. */
const leer = (g, rango) => g.readSheetValues(ID, rango, { render: 'UNFORMATTED_VALUE' })

/**
 * LAS FILAS DE UNA PESTAÑA EN LA FORMA QUE PIDE EL CRUCE.
 *
 * `id` lleva la CELDA exacta (`Compras!AD566`) porque el destinatario de este informe es una persona
 * que va a ir a mirarla: un índice de array no sirve para nada del otro lado de la pantalla.
 */
function normalizar(filas, { pestana, colFecha, colImporte, fila0, etiqueta, incluir }) {
  const out = []
  filas.forEach((f, i) => {
    if (incluir && !incluir(f)) return
    out.push({
      id: `${pestana}!${colFecha}${i + fila0}`,
      fecha: num(f[colIdx(colFecha)]),
      importe: num(f[colIdx(colImporte)]),
      que: etiqueta(f),
    })
  })
  return out
}

/** El índice 0-based de una letra de columna A1 (soporta AA..AZ, que es lo que usa Compras). */
export function colIdx(letra) {
  return String(letra).toUpperCase().split('').reduce((a, c) => a * 26 + (c.charCodeAt(0) - 64), 0) - 1
}

function imprimir(titulo, veredictos, nota = '') {
  const r = resumen(veredictos)
  const linea = (v) => `${String(r[v]?.filas ?? 0).padStart(4)} filas ${pesos(r[v]?.monto ?? 0).padStart(16)}  ${v}`
  console.log(`\n════ ${titulo} ════`)
  if (nota) console.log(`  ${nota}`)
  for (const v of Object.values(VEREDICTO_FECHA)) if (r[v]) console.log(`  ${linea(v)}`)
  const mirar = veredictos.filter((x) => x.veredicto === VEREDICTO_FECHA.corregir || x.veredicto === VEREDICTO_FECHA.lejos)
  if (!mirar.length) return
  console.log(`\n  FECHAS CORRIDAS — la planilla dice una cosa y el banco otra (holgura ${HOLGURA_FECHA} días):`)
  for (const x of mirar.sort((a, b) => Math.abs(b.importe) - Math.abs(a.importe))) {
    const marca = x.veredicto === VEREDICTO_FECHA.corregir ? '→' : '▲'
    console.log(`    ${marca} ${x.id.padEnd(22)} ${pesos(x.importe).padStart(14)}  dice ${dia(x.fecha)} · el banco ${dia(x.fechaBanco)} `
      + `(${x.dias > 0 ? '+' : ''}${x.dias}d, _BANCO_RAW f${x.filaBanco})  ${x.que}`)
  }
  console.log(`    → ${corregibles(veredictos).length} son inequívocas (uno de cada lado, dentro de la holgura). `
    + '▲ el resto se REPORTA: a esa distancia, una coincidencia de importe es una casualidad posible.')
}

async function main() {
  const google = makeGoogleClient({ config: loadConfig() })
  const banco = await leer(google, '_BANCO_RAW!A1:F600')
  const debitos = movimientosDelBanco(banco, { lado: 'sale' })
  const creditos = movimientosDelBanco(banco, { lado: 'entra' })
  const ventana = ventanaDelExtracto([...debitos, ...creditos])
  if (!ventana) throw new Error('_BANCO_RAW no tiene movimientos: sin extracto no hay nada contra qué comparar')
  console.log(`EXTRACTO: ${debitos.length + creditos.length} movimientos · ${dia(ventana.desde)} → ${dia(ventana.hasta)}`)
  console.log('EL EXTRACTO NO TRAE EL NÚMERO DEL CHEQUE (el concepto es «Cheque debitado», sin un dígito),')
  console.log('así que el único identificador posible es el IMPORTE y la regla es UNO DE CADA LADO.')

  // ── COMPRAS ─────────────────────────────────────────────────────────────────────────────────────
  const compras = (await leer(google, 'Compras!A4:AD900')).filter((f) => String(f?.[4] ?? '').trim())
  const porBanco = normalizar(compras, {
    pestana: 'Compras', colFecha: 'AD', colImporte: 'O', fila0: FILA0.compras,
    incluir: (f) => ['Transferencia', 'Débito'].includes(String(f[colIdx('P')] ?? '').trim()),
    etiqueta: (f) => `${String(f[colIdx('E')] ?? '').slice(0, 24)} ${String(f[colIdx('H')] ?? '').slice(0, 14)}`,
  })
  imprimir('Compras · "Fecha de caja" (AD) — sólo Transferencia y Débito', cruzarFechas(porBanco, debitos, { ventana }),
    'AD es una ARRAYFORMULA sobre Q ("Fecha PREVISTA de pago"): la corrección va a Q, y 386 de sus celdas son fórmulas.')

  // ── CHEQUES EMITIDOS ────────────────────────────────────────────────────────────────────────────
  const cheques = (await leer(google, 'Cheques Emitidos!A8:M400')).filter((f) => String(f?.[0] ?? '').trim())
  const deCheques = normalizar(cheques, {
    pestana: 'Cheques Emitidos', colFecha: 'I', colImporte: 'F', fila0: FILA0.cheques,
    etiqueta: (f) => `${f[0]} N°${f[1]} ${String(f[4] ?? '').slice(0, 22)} · DEBITADO=${f[colIdx('K')] ?? '—'}`,
  })
  imprimir('Cheques Emitidos · "fecha de pago" (I) vs el débito', cruzarFechas(deCheques, debitos, { ventana }),
    'PESTAÑA CANDADA POR EL DUEÑO: acá no se escribe nada, ni con --forzar-candado. Se reporta.')

  // ── COBRANZAS ───────────────────────────────────────────────────────────────────────────────────
  const cobranzas = (await leer(google, 'Cobranzas!A5:Q400')).filter((f) => String(f?.[6] ?? '').trim())
  const deCobranzas = normalizar(cobranzas, {
    pestana: 'Cobranzas', colFecha: 'Q', colImporte: 'M', fila0: FILA0.cobranzas,
    incluir: (f) => String(f[colIdx('N')] ?? '').trim() === 'Transferencia',
    etiqueta: (f) => `${String(f[colIdx('G')] ?? '').slice(0, 22)} ${String(f[colIdx('E')] ?? '').slice(0, 14)}`,
  })
  imprimir('Cobranzas · "Fecha cobro" (Q) vs el crédito', cruzarFechas(deCobranzas, creditos, { ventana }),
    'La columna M es el TOTAL NETO DE RETENCIONES y el banco acredita otra cosa: por eso casi nada cruza.')

  // ── EL CONTROL QUE NO SALE DE LA MISMA FUENTE ───────────────────────────────────────────────────
  //
  // Las tres tablas de arriba preguntan "¿la planilla acierta la fecha?". Ésta pregunta al revés:
  // ¿hay plata que el banco movió y que NINGUNA fila del registro explica? Un cruce que sólo mira
  // desde la planilla no puede ver lo que a la planilla le falta.
  const importesChq = new Set(cheques.map((f) => Math.round(Math.abs(Number(f[colIdx('F')])) * 100)).filter(Boolean))
  const huerfanos = debitos.filter((d) => d.naturaleza === NAT.cheques && !importesChq.has(Math.round(d.importe * 100)))
  console.log('\n════ CONTROL · débitos de cheque que el registro NO explica ════')
  if (!huerfanos.length) console.log('  ninguno: todo débito de cheque del extracto tiene una fila con ese importe.')
  for (const d of huerfanos) {
    console.log(`  ▲ ${dia(d.fecha)} ${pesos(d.importe).padStart(14)} «${d.concepto}» (_BANCO_RAW f${d.fila})`)
  }
  console.log('\nNADA DE ESTO SE ESCRIBIÓ. Ver el encabezado de este archivo: los tres destinos están cerrados.')
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  main().catch((e) => { console.error(e.message); process.exitCode = 1 })
}
