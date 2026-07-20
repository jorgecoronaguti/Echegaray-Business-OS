// SINCRONIZAR NÓMINA — mantiene vivo lo que en el Sheet NO puede ser una fórmula.
//
// REGLA DEL DUEÑO (20/07): "siempre hacerlo vía OS, y que quede un agente encargado de ir
// actualizando el trabajo si lo que se hizo en el Sheet es manual".
//
// Casi todo lo que armamos se actualiza solo porque son fórmulas. Dos cosas NO pueden serlo, y son
// justamente las que se pudren en silencio:
//
//  1. LAS CARGAS SOCIALES DECLARADAS. Salen de los PDF de las DDJJ F931 en Drive. Un PDF no se
//     puede referenciar desde una celda: los valores se escriben. Cuando el contador sube el F931
//     de julio, la pestaña sigue mostrando hasta junio y nadie se entera.
//  2. LOS LÍMITES DE CADA QUINCENA en el cuadro de jornales. Son rangos de filas (AA7:AA33) del
//     espejo _J_OBREROS. Cuando se carga una quincena nueva, el bloque aparece en filas que ninguna
//     fórmula existente cubre: el total del año queda corto sin dar ningún error.
//
// Esta capacidad recalcula las dos cosas desde la fuente real y reescribe SOLO esos dos bloques.
// Es idempotente: si no cambió nada, reescribe lo mismo. No toca ninguna fórmula ni Compras.

import { cargasSocialesDeclaradas } from './cargas-sociales.mjs'

/**
 * NÚCLEO PURO: detecta los bloques de quincena en la grilla del espejo de jornales.
 * Un bloque arranca donde la columna A vale 1 (el nº de orden del obrero reinicia en cada quincena)
 * y termina en la última fila consecutiva con nº de orden. La ETIQUETA de la quincena es la celda
 * de fecha que está en la fila de arriba — se referencia, no se copia.
 * @param {Array<Array>} filas valores de _J_OBREROS desde la fila 1
 * @returns {Array<{inicio:number, fin:number, filaFecha:number}>} filas en base 1
 */
export function detectarQuincenas(filas = []) {
  const col = (r, i) => String(r?.[i] ?? '').trim()
  const bloques = []
  for (let i = 0; i < filas.length; i++) {
    if (col(filas[i], 0) !== '1') continue
    let fin = i
    while (fin < filas.length && /^\d+$/.test(col(filas[fin], 0))) fin++
    // `i` es índice base 0 → fila base 1 = i+1. La fila de fechas es la inmediata anterior.
    bloques.push({ inicio: i + 1, fin, filaFecha: i })
  }
  return bloques
}

/** Las filas del cuadro de quincenas, todas como fórmula. PURA. */
export function filasQuincenas(bloques, hoja = '_J_OBREROS') {
  return bloques.map((b) => [
    { f: `=${hoja}!F${b.filaFecha}` },
    { f: `=CONTAR(${hoja}!A${b.inicio}:A${b.fin})` },
    { f: `=SUMA(${hoja}!V${b.inicio}:V${b.fin})` },
    { f: `=SUMA(${hoja}!X${b.inicio}:X${b.fin})`, estilo: 'moneda' },
    { f: `=SUMA(${hoja}!Y${b.inicio}:Y${b.fin})`, estilo: 'moneda' },
    { f: `=SUMA(${hoja}!Z${b.inicio}:Z${b.fin})`, estilo: 'moneda' },
    { f: `=SUMA(${hoja}!AA${b.inicio}:AA${b.fin})`, estilo: 'moneda_negrita' },
  ])
}

/** Compara lo que hay contra lo que debería haber. PURA. Sirve para no reescribir al pepe. */
export function hayCambio(bloquesNuevos = [], quincenasEnSheet = 0) {
  return bloquesNuevos.length !== quincenasEnSheet
}

const $ = (v) => `$${Math.round(Number(v) || 0).toLocaleString('es-AR')}`

/** Texto del resultado de la sincronización. PURO. */
export function formatSync(r) {
  if (!r || r.error) return `No pude sincronizar: ${r?.error ?? 'sin datos'}`
  const L = ['SINCRONIZACIÓN DE NÓMINA', '']
  L.push(`  DDJJ F931 leídas: ${r.ddjj_meses} mes(es) · ${$(r.ddjj_total)} declarados`)
  if (r.ddjj_nuevos?.length) L.push(`  ✚ DDJJ NUEVAS desde la última corrida: ${r.ddjj_nuevos.join(', ')}`)
  if (r.ddjj_faltantes?.length) L.push(`  ⚠ Meses sin DDJJ en Drive: ${r.ddjj_faltantes.join(', ')}`)
  L.push(`  Quincenas de jornales: ${r.quincenas}`)
  if (r.quincenas_nuevas) L.push(`  ✚ ${r.quincenas_nuevas} quincena(s) nueva(s) incorporada(s) al cuadro`)
  L.push('')
  L.push(r.escribio ? '  Las dos pestañas quedaron actualizadas.' : '  Nada cambió: no hizo falta reescribir.')
  return L.join('\n')
}

/**
 * Refresca los dos bloques que no son fórmula. `escribir:false` = solo informa qué cambiaría.
 */
export async function sincronizarNomina(google, {
  file_id, folder_ddjj, anio, tab_cargas = 'Nómina y Cargas Sociales',
  tab_quincenas = 'Jornales por Quincena', escribir = true,
} = {}) {
  if (!google?.readSheetValues) return { error: 'no hay una cuenta de Google autorizada' }
  if (!file_id) return { error: 'falta file_id del Flujo de Caja' }

  // ── 1. DDJJ F931 ──
  const ddjj = folder_ddjj ? await cargasSocialesDeclaradas(google, { folder_id: folder_ddjj, anio }) : null
  if (ddjj?.error) return { error: `DDJJ: ${ddjj.error}` }

  // Qué meses ya estaban escritos en la pestaña (fila de encabezado del bloque 1).
  let yaEscritos = []
  try {
    const enc = await google.readSheetValues(file_id, `${tab_cargas}!B6:N6`)
    yaEscritos = (enc?.[0] ?? []).map((c) => String(c ?? '').trim()).filter((c) => /^\d{4}-\d{2}$/.test(c))
  } catch { /* si la pestaña no existe todavía, todos los meses son nuevos */ }
  const nuevos = (ddjj?.meses ?? []).map((m) => m.periodo).filter((p) => !yaEscritos.includes(p))

  // ── 2. Quincenas de jornales ──
  const grid = await google.readSheetValues(file_id, '_J_OBREROS!A1:AC990')
  const bloques = detectarQuincenas(grid ?? [])
  let quincenasEnSheet = 0
  try {
    const q = await google.readSheetValues(file_id, `${tab_quincenas}!A5:A200`)
    quincenasEnSheet = (q ?? []).filter((r) => String(r?.[0] ?? '').trim()).length - 1 // menos la fila TOTAL
  } catch { /* pestaña nueva */ }

  const cambio = nuevos.length > 0 || hayCambio(bloques, quincenasEnSheet)
  const base = {
    ddjj_meses: ddjj?.meses?.length ?? 0,
    ddjj_total: (ddjj?.meses ?? []).reduce((a, m) => a + m.total, 0),
    ddjj_nuevos: nuevos,
    ddjj_faltantes: ddjj?.faltantes ?? [],
    quincenas: bloques.length,
    quincenas_nuevas: Math.max(0, bloques.length - Math.max(0, quincenasEnSheet)),
    escribio: false,
  }
  if (!escribir || !cambio) return base

  // Se devuelve el spec de filas para que la tool lo escriba con el renderizador. Este módulo no
  // escribe: así se puede probar en seco y el llamador decide.
  return { ...base, escribio: true, spec_quincenas: filasQuincenas(bloques), ddjj: ddjj?.meses ?? [] }
}
