#!/usr/bin/env node
// DEVUELVE A TODO EL SHEET EL FORMATO QUE HABÍA ESTABLECIDO EL DUEÑO. SÓLO FORMATO: NINGÚN VALOR.
//
// ═══ POR QUÉ (02/08) ═══
//
// El dueño: *"TODAS LAS PESTAÑAS QUE NO SON DE ACOPIO DE DATOS; TODAS TENÉS QUE VOLVER A LO QUE TENÍA
// DE FORMATO YO"* y *"rompiste cash flows, ambos. Rompiste Proveedores, CAJA, Estructura, Recurrentes,
// revisá TODAS"*. La causa está en `timeout-que-mata-al-escritor`: systemd mataba al generador a los
// 10 minutos, A MITAD DE ESCRITURA, cada 2 horas.
//
// `restaurar-formato-caja.mjs` hacía esto para UNA pestaña tomando una revisión del propio Sheet. Ya
// no alcanza: Drive podó el historial y **no queda ninguna revisión anterior al daño** (la más vieja
// que sobrevive es del 02/08 11:00, que es una corrida del OS partida al medio).
//
// ═══ DE DÓNDE SALE "SU" FORMATO ═══
//
// De un .xlsx cualquiera, que se pasa por `--desde`. La fuente que se usó el 02/08 es la copia que él
// mismo sacó del Sheet —"ZZ COPIA VALIDACION direccion 01-08"— cuya **revisión 1 es suya, del 01/08
// 15:16**, anterior a las 10 corridas que se partieron al medio. Es el único estado pre-daño del libro
// completo, con formato, que sobrevive en ningún lado.
//
// ═══ LAS TRES REGLAS QUE NO SE NEGOCIAN ═══
//
// 1. SÓLO FORMATO. `fields` acotado a lo que el extractor sabe leer. Los VALORES no se tocan nunca:
//    entre su copia y hoy entraron movimientos del banco, comprobantes y ediciones suyas, y todo eso
//    es más nuevo que la copia. Restaurar valores sería retroceder la empresa un día y medio.
// 2. SE ANCLA EN EL RÓTULO, NUNCA EN LA POSICIÓN. Entre su copia y hoy las filas se movieron. Aplicar
//    por número de fila le pone a cada una el formato de otra — el defecto que este repo ya pagó cinco
//    veces. Lo que no encuentra su rótulo se INFORMA, no se adivina.
// 3. LO QUE NO ESTABA EN SU VERSIÓN CONSERVA EL FORMATO DE HOY. Una fila nueva no tiene formato suyo
//    que devolverle; inventarle uno sería fabricar.
//
// Las pestañas de ACOPIO DE DATOS (prefijo `_`: los espejos _BANCO_RAW, _ARCA_RAW, _J_OBREROS…) quedan
// afuera por pedido explícito: son réplicas byte a byte de una fuente externa, sin formato del dueño.
//
//   node orquestador/scripts/restaurar-formato-sheet.mjs --desde copia.xlsx              (mira, no toca)
//   ORQ_SHEETS_DESCONGELAR="motivo" … --desde copia.xlsx --aplicar
//   … --pestana CAJA        una sola      · … --destino <fileId>   probar contra una copia

import { execFileSync } from 'node:child_process'
import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { emparejarPorRotulo } from '../lib/formato-por-rotulo.mjs'

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : d }
const ID = arg('destino', process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8')
const DESDE = arg('desde')
const SOLO = arg('pestana')
const APLICAR = process.argv.includes('--aplicar')
// `--modo posicion`: aplica el formato del origen a LAS MISMAS coordenadas. Sólo vale para MARCHA
// ATRÁS —cuando el .xlsx de origen es una exportación del mismo documento minutos antes—, porque ahí
// las filas no se movieron y mapear por posición es exacto en vez de ser el defecto de siempre.
const MODO_FORZADO = arg('modo')

// Lo que el extractor sabe recuperar del xlsx. Lo que no está acá NO se toca: pisar el formato entero
// con lo que uno pudo leer es la forma elegante de perder lo que no se leyó (bordes, condicionales…).
const CAMPOS = 'userEnteredFormat(numberFormat,textFormat,backgroundColor,horizontalAlignment,verticalAlignment,wrapStrategy)'

/** ¿Es una pestaña de ACOPIO DE DATOS? Los espejos del OS no llevan formato del dueño. */
export const esAcopio = (t) => String(t).startsWith('_')

/**
 * NÚCLEO PURO: ¿qué tan bien se emparejó?
 *
 * El denominador son las filas de SU versión QUE TIENEN RÓTULO. Medirlo contra el total era medir mal:
 * una fila en blanco o una fila de datos (donde la columna A trae una fecha o un nombre de proveedor,
 * no un rótulo estable) no puede emparejar por definición, y arrastraba la nota para abajo. Con el
 * denominador corregido, Compras pasó de "85%" a 100% y CAJA de 78% a 98%.
 *
 * A partir de la nota se elige el MODO (ver el encabezado de `modoDe`).
 */
export function calidad(pares, filasOrigen) {
  const conRotulo = filasOrigen.filter((f) => String(f.rotulo ?? '').trim()).length
  if (!conRotulo) return { pct: 0, conRotulo: 0 }
  return { pct: Math.round((pares.length / conRotulo) * 100), conRotulo }
}

/**
 * NÚCLEO PURO: cómo devolverle el formato a esta pestaña.
 *
 * · `rotulo` (≥ 90%): sus filas se reconocen una a una. Se devuelve TODO su formato, fila por fila.
 * · `columna` (< 90%): el contenido cambió tanto que ya no hay fila que emparejar —Proveedores es una
 *   cuenta corriente que el generador rehacía cada 2 horas, y en la columna A hay nombres de
 *   proveedores, no rótulos—. Mapear filas ahí sería repartir estilos al azar. Se devuelve lo que SÍ
 *   está bien definido en una tabla: el ENCABEZADO completo (que no se mueve) y, en el cuerpo, el
 *   formato de número y la alineación de cada COLUMNA.
 *
 *   En el cuerpo NO se tocan colores ni tipografía a propósito: es donde él marca celdas a mano, y su
 *   regla de oro es que lo que él modifica no se toca. Repintar la columna entera se las borraría.
 */
export function modoDe(pct) {
  return pct >= 90 ? 'rotulo' : 'columna'
}

/** NÚCLEO PURO: el formato más frecuente de cada columna en el cuerpo de la tabla (moda). */
export function formatoModalPorColumna(filas, desdeFila) {
  const conteo = new Map()
  for (const f of filas) {
    if (f.fila < desdeFila) continue
    for (const c of f.celdas) {
      if (!conteo.has(c.col)) conteo.set(c.col, new Map())
      const m = conteo.get(c.col)
      const k = JSON.stringify(c.fmt)
      m.set(k, (m.get(k) ?? 0) + 1)
    }
  }
  const salida = []
  for (const [col, m] of conteo) {
    let mejor = null; let n = 0
    for (const [k, v] of m) if (v > n) { n = v; mejor = k }
    // Una moda que aparece una sola vez no es una moda: no describe a la columna.
    if (mejor && n >= 3) salida.push({ col, fmt: JSON.parse(mejor), veces: n })
  }
  return salida.sort((a, b) => a.col - b.col)
}

async function restaurar(google, hojas, pestana, filasSuyas, anchos, congeladas) {
  const hoja = hojas.find((h) => h.title === pestana)
  if (!hoja) return { pestana, salteada: 'no existe hoy' }

  const vivo = await google.readSheetValues(ID, `'${pestana}'!A1:A1000`)
  const rotulosVivos = (vivo ?? []).map((f) => String(f?.[0] ?? '').trim())
  const { pares, sinDestino, sinOrigen } = emparejarPorRotulo(filasSuyas, rotulosVivos)
  const cal = calidad(pares, filasSuyas)
  const modo = MODO_FORZADO || modoDe(cal.pct)
  const movidas = pares.filter((p) => p.filaOrigen !== p.filaDestino).length

  const reqs = []
  let celdas = 0
  if (modo === 'posicion') {
    // MARCHA ATRÁS. El origen es una exportación de ESTE mismo documento, así que la fila 37 del
    // origen ES la fila 37 de hoy. No se empareja por rótulo: se devuelve cada celda a su lugar.
    for (const f of filasSuyas) {
      for (const c of f.celdas) {
        celdas++
        reqs.push({
          repeatCell: {
            range: { sheetId: hoja.sheetId, startRowIndex: f.fila - 1, endRowIndex: f.fila, startColumnIndex: c.col, endColumnIndex: c.col + 1 },
            cell: { userEnteredFormat: c.fmt },
            fields: CAMPOS,
          },
        })
      }
    }
  } else if (modo === 'rotulo') {
    for (const p of pares) {
      for (const c of p.celdas) {
        celdas++
        reqs.push({
          repeatCell: {
            range: { sheetId: hoja.sheetId, startRowIndex: p.filaDestino - 1, endRowIndex: p.filaDestino, startColumnIndex: c.col, endColumnIndex: c.col + 1 },
            cell: { userEnteredFormat: c.fmt },
            fields: CAMPOS,
          },
        })
      }
    }
  } else {
    // MODO COLUMNA. El encabezado (hasta la última fila congelada, o 4 si no hay) va completo y por
    // posición: en una tabla el encabezado no se mueve. El cuerpo recibe, por columna, sólo el formato
    // de número y la alineación — nunca color ni tipografía, que es donde él marca celdas a mano.
    const finEncabezado = congeladas || 4
    for (const f of filasSuyas) {
      if (f.fila > finEncabezado) continue
      for (const c of f.celdas) {
        celdas++
        reqs.push({
          repeatCell: {
            range: { sheetId: hoja.sheetId, startRowIndex: f.fila - 1, endRowIndex: f.fila, startColumnIndex: c.col, endColumnIndex: c.col + 1 },
            cell: { userEnteredFormat: c.fmt },
            fields: CAMPOS,
          },
        })
      }
    }
    const ultimaFilaHoy = rotulosVivos.length || 1
    for (const m of formatoModalPorColumna(filasSuyas, finEncabezado + 1)) {
      const fmt = {}
      if (m.fmt.numberFormat) fmt.numberFormat = m.fmt.numberFormat
      if (m.fmt.horizontalAlignment) fmt.horizontalAlignment = m.fmt.horizontalAlignment
      if (!Object.keys(fmt).length) continue
      celdas++
      reqs.push({
        repeatCell: {
          range: { sheetId: hoja.sheetId, startRowIndex: finEncabezado, endRowIndex: ultimaFilaHoy, startColumnIndex: m.col, endColumnIndex: m.col + 1 },
          cell: { userEnteredFormat: fmt },
          fields: 'userEnteredFormat(numberFormat,horizontalAlignment)',
        },
      })
    }
  }

  const info = { pestana, modo, pares: pares.length, deTotal: cal.conRotulo, celdas, movidas, sinDestino: sinDestino.length, sinOrigen: sinOrigen.length, pct: cal.pct }
  if (!APLICAR) return info
  for (const a of anchos) {
    reqs.push({ updateDimensionProperties: { range: { sheetId: hoja.sheetId, dimension: 'COLUMNS', startIndex: a.col, endIndex: a.col + 1 }, properties: { pixelSize: a.px }, fields: 'pixelSize' } })
  }
  if (congeladas) reqs.push({ updateSheetProperties: { properties: { sheetId: hoja.sheetId, gridProperties: { frozenRowCount: congeladas } }, fields: 'gridProperties.frozenRowCount' } })

  // De a tandas: un batch de miles de repeatCell da 400 por tamaño de payload.
  const TANDA = 400
  let escritos = 0
  for (let i = 0; i < reqs.length; i += TANDA) {
    const r = await google.spreadsheetBatchUpdate(ID, reqs.slice(i, i + TANDA), { yaGuardado: true })
    if (r?.congelado) return { ...info, salteada: 'la escritura de Sheets está CONGELADA (ver congelador-sheets.mjs)' }
    escritos += reqs.slice(i, i + TANDA).length
  }
  return { ...info, escritos }
}

async function main() {
  if (!DESDE) throw new Error('falta --desde <archivo.xlsx> con el formato del dueño')
  const google = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })
  const hojas = await google.getSheetMeta(ID)
  const py = new URL('./extraer-formato-xlsx.py', import.meta.url).pathname

  const objetivo = hojas.map((h) => h.title).filter((t) => !esAcopio(t)).filter((t) => !SOLO || t === SOLO)
  console.log(`fuente: ${DESDE}`)
  console.log(`destino: ${ID}`)
  console.log(`pestañas a revisar: ${objetivo.length} (las de acopio de datos, prefijo _, quedan afuera)\n`)

  const resumen = []
  for (const pestana of objetivo) {
    let suyo
    try {
      suyo = JSON.parse(execFileSync('python3', [py, DESDE, pestana], { maxBuffer: 1 << 28 }).toString())
    } catch (e) { resumen.push({ pestana, salteada: `no pude leerla de tu versión: ${String(e.message).slice(0, 60)}` }); continue }
    if (suyo.error) { resumen.push({ pestana, salteada: suyo.error }); continue }
    resumen.push(await restaurar(google, hojas, pestana, suyo.filas, suyo.anchos, suyo.congeladas))
  }

  console.log('PESTAÑA'.padEnd(24) + 'rótulos'.padStart(11) + 'modo'.padStart(9) + 'celdas'.padStart(8) + 'movidas'.padStart(8) + '   estado')
  console.log('-'.repeat(100))
  for (const r of resumen) {
    const izq = r.pestana.padEnd(24) + `${r.pares ?? 0}/${r.deTotal ?? 0}`.padStart(11) + String(r.modo ?? '-').padStart(9) + String(r.celdas ?? 0).padStart(8) + String(r.movidas ?? 0).padStart(8)
    if (r.salteada) console.log(`${izq}   ⚠ SALTEADA — ${r.salteada}`)
    else if (r.escritos != null) console.log(`${izq}   ✓ ${r.escritos} cambio(s) aplicados`)
    else console.log(`${izq}   · ${r.pct}% (simulación)`)
  }
  const aplicadas = resumen.filter((r) => r.escritos)
  if (APLICAR && aplicadas.length) {
    const { sellarFormato } = await import('../lib/firma-formato.mjs')
    for (const r of aplicadas) await sellarFormato(google, ID, r.pestana).catch(() => {})
    console.log(`\n🔏 formato sellado en ${aplicadas.length} pestaña(s): el OS toma el TUYO como referencia.`)
    console.log('   LOS VALORES NO SE TOCARON EN NINGUNA.')
  } else if (!APLICAR) {
    console.log('\n(simulación: no se escribió nada. Agregá --aplicar)')
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().then(() => process.exit(0)).catch((e) => { console.error('ERROR:', e.message); process.exit(1) })
}
