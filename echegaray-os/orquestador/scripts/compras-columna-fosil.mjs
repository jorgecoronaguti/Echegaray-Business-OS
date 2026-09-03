#!/usr/bin/env node
// `Compras!AG · Orden de pago (OS)` ES UNA COLUMNA FÓSIL — este script lo PRUEBA y prepara el borrado.
//
// ═══ QUÉ ES ═══
//
// `AG` y `AH` tienen el MISMO encabezado. `AH` está viva: cuenta el orden de pago con
// `COUNTIFS($AD…;$AJ…)`, o sea contra "Fecha de caja" y "¿Proveedor comercial?". `AG` hace la misma
// cuenta contra `$AC` y `$AI` — las columnas que ocupaban esos lugares ANTES del corrimiento del
// 14/08. Hoy `$AC` es "Rubro de caja" (texto), así que su `ISNUMBER($AC…)` es falso en las 1.136
// filas y la columna entera dibuja vacío. No está rota: está fosilizada.
//
// ═══ POR QUÉ EL BORRADO NO VA EN EL MISMO PASO QUE TODO LO DEMÁS ═══
//
// Borrar una columna es la operación más destructiva que existe sobre una planilla, y ésta es la
// pestaña donde el dueño tipea todos los días. Además CORRE todo lo que está a su derecha, y el
// cargador de comprobantes (`lib/carga-comprobantes.mjs`) direcciona `AH`, `AI` y `AJ` POR LETRA, no
// por encabezado: borrar `AG` sin mover esas constantes haría que el cargador escriba la orden de
// pago en la columna de al lado, en silencio y sobre filas nuevas.
//
// Por eso este script FALLA CERRADO: audita siempre, y `--aplicar` se niega mientras el código siga
// apuntando a las letras viejas, diciendo exactamente qué constante hay que mover. El orden seguro es
// (1) mover las letras en el código, (2) correr esto con `--aplicar`, en la misma ventana.
//
//   node orquestador/scripts/compras-columna-fosil.mjs             → audita y no toca nada
//   node orquestador/scripts/compras-columna-fosil.mjs --aplicar   → borra la columna y verifica

import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { abortaPorGeometria } from '../lib/propiedad-estructura.mjs'
import { loadConfig } from '../lib/config.mjs'
import { COL as COL_CARGADOR, GRUPOS_FORMULA } from '../lib/carga-comprobantes.mjs'
import { referenciaAColumna } from '../lib/compras-valores.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const APLICAR = process.argv.includes('--aplicar')
const PESTANA = 'Compras'
const FOSIL = 'AG'
const ROTULO_FOSIL = 'Orden de pago (OS)'

const idx = (l) => String(l).toUpperCase().split('').reduce((n, c) => n * 26 + (c.charCodeAt(0) - 64), 0) - 1
const letra = (n) => { let s = ''; for (let i = n; i >= 0; i = Math.floor(i / 26) - 1) s = String.fromCharCode(65 + (i % 26)) + s; return s }

/**
 * QUÉ ENCABEZADO TIENE QUE DECIR CADA LETRA QUE EL CÓDIGO DIRECCIONA A MANO.
 *
 * Sólo las que están A LA DERECHA de la fósil: son las únicas que un borrado puede correr. El
 * cargador de comprobantes las nombra por letra, así que el contrato "esta letra es esta columna" no
 * vive en ningún lado — se escribe acá para poder verificarlo en vez de suponerlo.
 */
const ESPERA = Object.freeze({ ordenPago: ROTULO_FOSIL, ordenSinFecha: 'Orden sin fecha (OS)', comercial: '¿Proveedor comercial? (OS)' })

/** Las letras que el código direcciona a mano a la derecha de la fósil, con quién las nombra. */
function letrasDelCodigo() {
  const out = new Map()
  for (const k of Object.keys(ESPERA)) out.set(COL_CARGADOR[k], `COL.${k}`)
  for (const [a, b] of GRUPOS_FORMULA) {
    for (const l of [a, b]) {
      if (idx(l) < idx(FOSIL)) continue
      out.set(l, `${out.get(l) ?? ''} GRUPOS_FORMULA`.trim())
    }
  }
  return out
}

/**
 * ¿Las letras del código dicen lo que tienen que decir, sobre este encabezado?
 *
 * `corrido` aplica el desplazamiento que produciría el borrado: la letra L pasa a contener lo que
 * hoy contiene la de al lado. Sirve para preguntar las dos cosas con el mismo código — si el código
 * está en el layout de HOY, o si ya está migrado al de DESPUÉS.
 */
function alineado(encabezado, { corrido = false } = {}) {
  const rotulo = (i) => String(encabezado[i] ?? '').trim()
  const roto = []
  for (const [k, esperado] of Object.entries(ESPERA)) {
    const i = idx(COL_CARGADOR[k]) + (corrido ? 1 : 0)
    if (rotulo(i) !== esperado) roto.push({ quien: `COL.${k}`, letra: COL_CARGADOR[k], dice: rotulo(i), esperado })
  }
  return roto
}

/** Cualquier fórmula del libro que referencie la columna fósil. El detector y su test viven en lib. */
function referenciasAFosil(formulas = [], propia = false) {
  const hits = []
  formulas.forEach((fila, i) => (fila || []).forEach((c, j) => {
    if (referenciaAColumna(c, FOSIL, { propia })) hits.push(`${letra(j)}${i + 1}: ${String(c).slice(0, 100)}`)
  }))
  return hits
}

async function main() {
  const google = makeGoogleClient({ config: loadConfig(), scopes: APLICAR ? WRITE_SCOPES : undefined })
  const meta = await google.getSheetMeta(ID)
  const hoja = meta.find((s) => s.title === PESTANA)
  if (!hoja) throw new Error(`no encontré la pestaña ${PESTANA}: no borro a ciegas`)

  const encabezado = (await google.readSheetValues(ID, `${PESTANA}!A3:BZ3`))[0] || []
  const c = idx(FOSIL)
  console.log(`${PESTANA} · ${hoja.rows}×${hoja.cols} · ${FOSIL}3 = "${encabezado[c] ?? ''}" · ${letra(c + 1)}3 = "${encabezado[c + 1] ?? ''}"`)
  if (String(encabezado[c] ?? '').trim() !== ROTULO_FOSIL || String(encabezado[c + 1] ?? '').trim() !== ROTULO_FOSIL) {
    throw new Error(`esperaba "${ROTULO_FOSIL}" duplicado en ${FOSIL}/${letra(c + 1)}. Las columnas se movieron: no borro nada.`)
  }

  // ── PRUEBA 1: la columna tiene fórmulas y NINGUNA dibuja nada.
  //
  // SE CUENTAN LAS FÓRMULAS PRIMERO, y no es un adorno: un rango vacío devuelve cero filas, así que
  // "0 valores" leído solo es indistinguible de "no leí nada" — el modo en que un control se felicita
  // sin haber mirado. La cuenta de fórmulas prueba que el rango existe y cuántas filas tiene.
  const rangoFosil = `${PESTANA}!${FOSIL}4:${FOSIL}${hoja.rows}`
  const formulas = (await google.readSheetValues(ID, rangoFosil, { render: 'FORMULA' }))
    .filter((f) => String(f?.[0] ?? '').startsWith('='))
  const vistos = await google.readSheetValues(ID, rangoFosil, { render: 'FORMATTED_VALUE' })
  const conValor = vistos.map((f, i) => [i + 4, String(f?.[0] ?? '').trim()]).filter(([, v]) => v)
  const vecina = await google.readSheetValues(ID, `${PESTANA}!${letra(c + 1)}4:${letra(c + 1)}${hoja.rows}`, { render: 'FORMATTED_VALUE' })
  const conValorVecina = vecina.filter((f) => String(f?.[0] ?? '').trim()).length
  console.log(`\n1 · ${FOSIL} tiene ${formulas.length} fórmula(s) y dibuja ${conValor.length} valor(es)`
    + ` · su gemela ${letra(c + 1)} dibuja ${conValorVecina}`)
  if (conValor.length) console.log(`    ${conValor.slice(0, 5).map(([f, v]) => `${FOSIL}${f}="${v}"`).join(' ')}`)
  if (!formulas.length) throw new Error(`no leí una sola fórmula en ${FOSIL}: no doy por fósil una columna que no pude leer`)

  // ── PRUEBA 2: nadie la lee, ni en esta pestaña ni en ninguna otra del libro.
  console.log('\n2 · ¿alguien la referencia?')
  let lectores = 0
  for (const h of meta) {
    // EL RANGO SE ACOTA A LA GRILLA REAL de cada pestaña: pedir más allá de las columnas asignadas
    // hace fallar la API, y una pestaña que no se pudo leer cuenta como lector (abajo). Con un
    // `CZ` fijo, "CAJA" quedaba ilegible y bloqueaba el borrado por una causa falsa.
    const rango = `'${h.title}'!A1:${letra(Math.max((h.cols ?? 26) - 1, 0))}${Math.min(h.rows ?? 1000, 2000)}`
    const f = await google.readSheetValues(ID, rango, { render: 'FORMULA' }).catch(() => null)
    if (!f) { console.log(`    ${h.title.padEnd(26)} no pude leerla — CUENTA COMO LECTOR`); lectores++; continue }
    const hits = referenciasAFosil(f, h.title === PESTANA)
    if (!hits.length) continue
    lectores += hits.length
    console.log(`    ${h.title.padEnd(26)} ${hits.length}\n      ${hits.slice(0, 5).join('\n      ')}`)
  }
  console.log(`    ${lectores} referencia(s) en todo el libro`)

  // ── PRUEBA 3: el código ya tiene que estar apuntando al layout de DESPUÉS.
  //
  // Son dos preguntas y no una. Si el código está alineado con el encabezado de HOY, borrar lo
  // desalinea: hay que mover las letras primero. Si ya está alineado con el de DESPUÉS, el cargador
  // está apuntando mal AHORA mismo y el borrado es lo que lo repara — por eso las dos cosas tienen
  // que caer en la misma ventana y no en dos días distintos.
  const hoy = alineado(encabezado)
  const luego = alineado(encabezado, { corrido: true })
  console.log(`\n3 · el código apunta ${hoy.length ? '' : 'AL LAYOUT DE HOY (hay que moverlo antes de borrar)'}`
    + `${!hoy.length || luego.length ? '' : ' / '}${luego.length ? '' : 'AL LAYOUT DE DESPUÉS (listo para borrar)'}`)
  for (const r of luego) {
    console.log(`    ${r.quien.padEnd(28)} ${r.letra} tendría que quedar en "${r.esperado}" y quedaría en "${r.dice}"`)
  }
  if (!hoy.length) {
    console.log('    mové estas constantes UNA letra a la izquierda en lib/carga-comprobantes.mjs y volvé:')
    for (const k of Object.keys(ESPERA)) console.log(`      COL.${k}: '${COL_CARGADOR[k]}' → '${letra(idx(COL_CARGADOR[k]) - 1)}'`)
    for (const [a, b] of GRUPOS_FORMULA.filter(([x]) => idx(x) >= idx(FOSIL))) {
      console.log(`      GRUPOS_FORMULA ['${a}','${b}'] → ['${letra(idx(a) - 1)}','${letra(idx(b) - 1)}']`)
    }
  }

  const puede = !conValor.length && !lectores && !luego.length
  console.log(`\n${puede ? '✓ es una fósil y se puede borrar' : '✖ NO se puede borrar todavía'}`)
  if (!APLICAR) { console.log('(sin --aplicar: no toqué nada)'); return }
  if (!puede) {
    console.error('\nno borro: hay que resolver los puntos en rojo primero. El orden seguro es mover las'
      + ' letras del código y recién después correr esto.')
    process.exit(1)
  }

  const r = await google.spreadsheetBatchUpdate(ID, [{ deleteDimension: {
    range: { sheetId: hoja.sheetId, dimension: 'COLUMNS', startIndex: c, endIndex: c + 1 },
  } }])
  if (r?.congelado) return console.log('🧊 el freno de mano está puesto: no borré nada.')
  if (r?.protegido) return console.log('🔒 la guarda descartó todo: la pestaña está candada.')
  // Borrar una columna corre TODAS las de la derecha: si la guarda lo frenó porque hay contenido tuyo
  // en el tramo, las letras del código siguen donde estaban y nadie puede asumir lo contrario.
  const corte = abortaPorGeometria(r)
  if (corte.aborta) {
    console.error(`⛔ no borré la columna: ${corte.motivo}.`)
    process.exitCode = 1
    return
  }

  // ── LA EVIDENCIA ES DEL EFECTO: se relee el encabezado y se cuenta lo que quedó.
  const despues = (await google.readSheetValues(ID, `${PESTANA}!A3:BZ3`))[0] || []
  const repetido = despues.filter((v) => String(v ?? '').trim() === ROTULO_FOSIL).length
  const grilla = (await google.getSheetMeta(ID)).find((s) => s.title === PESTANA)
  const mal = []
  if (repetido !== 1) mal.push(`el encabezado "${ROTULO_FOSIL}" aparece ${repetido} vez/veces y tiene que aparecer 1`)
  if (grilla.cols !== hoja.cols - 1) mal.push(`la grilla quedó en ${grilla.cols} columnas y esperaba ${hoja.cols - 1}`)
  for (const r of alineado(despues)) mal.push(`${r.quien} apunta a ${r.letra}, que dice "${r.dice}" y tenía que decir "${r.esperado}"`)
  for (const [l, quien] of letrasDelCodigo()) {
    if (!String(despues[idx(l)] ?? '').trim()) mal.push(`${quien} apunta a ${l}, que quedó sin encabezado`)
  }
  console.log(`\nDESPUÉS  ${grilla.cols} columnas · "${ROTULO_FOSIL}" ${repetido} vez`)
  if (mal.length) { for (const m of mal) console.error(`✖ ${m}`); process.exitCode = 1 }
  else console.log('✓ la fósil se fue y todas las letras que el código direcciona siguen diciendo lo mismo')
}

main().catch((e) => { console.error('ERROR:', e.message ?? e); process.exit(1) })
