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

/**
 * Las filas del cuadro de quincenas, TODAS fórmula. PURA.
 *
 * Tiene que devolver EXACTAMENTE las 11 columnas que hoy tiene la pestaña, en su orden:
 *   Desde · Hasta · Días hábiles · Personas · Hs correspondientes · Hs reales · Banco ·
 *   Adelanto · Total recibo · TOTAL QUINCENA · Σ $/hora del plantel
 * Antes devolvía 7 columnas de un layout anterior. Nunca se notó porque sólo escribe cuando algo
 * cambia y nada había cambiado — pero la primera quincena nueva habría reescrito el cuadro con las
 * columnas corridas. Un agente que "no escribe todavía" no está probado: está esperando.
 *
 * NO EMITE "Se paga el" A PROPÓSITO. Esa columna la INTERCALA `jornales-pestana.mjs` después de Hasta
 * (es su único consumidor), porque tiene que preservar una fecha que el dueño haya escrito a mano y eso
 * requiere leer la pestaña. Si esta función también la emitiera, la columna saldría DOS VECES y todo el
 * registro quedaría corrido una a la derecha respecto de su encabezado — medido en el dry del 31/07.
 * Las fórmulas de acá SÍ referencian el layout final (D = días hábiles, E = personas), que ya cuenta
 * con la columna intercalada.
 *
 * @param {Array} bloques salida de detectarQuincenas
 * @param {number} filaInicio primera fila del cuerpo en la pestaña (las fórmulas se autorreferencian)
 */
/**
 * LAS COLUMNAS DEL CUADRO DE QUINCENAS, DECLARADAS UNA SOLA VEZ.
 *
 * POR QUÉ EXISTE (31/07). El generador escribía estas columnas y `sync-caja-nucleo.mjs` las leía con
 * los índices tipeados aparte. El rediseño del 23/07 movió el cuadro y el lector siguió leyendo los
 * índices viejos: la base terminó con CERO quincenas reales y nadie se enteró, porque leer una celda
 * vacía no es un error. Un layout con dos definiciones se desincroniza; con una, no puede.
 *
 * Los índices son 0-based, relativos a la columna A de la pestaña.
 */
export const COL_REGISTRO = {
  desde: 0, hasta: 1, pago: 2, dias: 3, personas: 4, hs_previstas: 5, hs_reales: 6,
  banco: 7, adelanto: 8, total_recibo: 9, total: 10, sigma_hora: 11, estado: 12,
}
/** Ídem para el bloque de proyección (§1), que tiene menos columnas y otro orden. */
export const COL_PROYECCION = {
  desde: 0, hasta: 1, pago: 2, dias: 3, personas: 4, valores_hoy: 5, ajuste: 6, total: 7,
}

export function filasQuincenas(bloques, filaInicio = 6, hoja = '_J_OBREROS') {
  const H = `'${hoja}'`
  return bloques.map((b, i) => {
    const r = filaInicio + i
    const ff = b.filaFecha
    return [
      { f: `=${H}!F${ff}` },
      // HASTA = el ÚLTIMO día cargado de la fila de fechas.
      // No sirve INDEX(rango, COUNTA(rango)): eso da el enésimo, y las filas de fecha TIENEN huecos
      // (feriados, días sin cuadrilla). Medido en el bloque del 16/3: COUNTA da 12 pero el último
      // día está en la posición 14 → la celda quedaba VACÍA. Hay que buscar la POSICIÓN del último
      // no vacío, no contar cuántos hay.
      { f: `=IFERROR(INDEX(${H}!F${ff}:U${ff},SUMPRODUCT(MAX((${H}!F${ff}:U${ff}<>"")*(COLUMN(${H}!F${ff}:U${ff})-COLUMN(${H}!F${ff})+1)))),"")` },
      { f: `=COUNTA(${H}!F${ff}:U${ff})` },
      { f: `=COUNT(${H}!A${b.inicio}:A${b.fin})` },
      // D = días hábiles, E = personas. Eran C y D hasta el 31/07: entró "Se paga el" en la columna C
      // y todo el registro corrió una a la derecha. Quien inserte otra columna tiene que corregir acá:
      // esta fórmula la escribe el generador, así que el desfase NO daría error, daría un número.
      { f: `=D${r}*E${r}*'Parámetros'!$B$43` },
      { f: `=SUM(${H}!V${b.inicio}:V${b.fin})` },
      { f: `=SUM(${H}!X${b.inicio}:X${b.fin})`, estilo: 'moneda' },
      { f: `=SUM(${H}!Y${b.inicio}:Y${b.fin})`, estilo: 'moneda' },
      { f: `=SUM(${H}!Z${b.inicio}:Z${b.fin})`, estilo: 'moneda' },
      { f: `=SUM(${H}!AA${b.inicio}:AA${b.fin})`, estilo: 'moneda_negrita' },
      // Σ DEL JORNAL POR HORA DE TODO EL PLANTEL de esa quincena (columna W de JORNALES, el valor
      // hora REAL de cada persona según su categoría UOCRA). Es la base correcta para proyectar:
      // antes se usaba "total ÷ horas", que es un promedio inventado y cambia con el ausentismo.
      // Comprobado: Σ($/hora) × horas por persona reproduce el total real de la quincena.
      { f: `=SUM(${H}!W${b.inicio}:W${b.fin})`, estilo: 'moneda' },
    ]
  })
}

/** Compara lo que hay contra lo que debería haber. PURA. Sirve para no reescribir al pepe. */
export function hayCambio(bloquesNuevos = [], quincenasEnSheet = 0) {
  return bloquesNuevos.length !== quincenasEnSheet
}

/**
 * NÚCLEO PURO: cuántas filas ocupa HOY el cuerpo del cuadro, y en qué fila está el TOTAL.
 *
 * No se puede contar "celdas no vacías de la columna A": debajo del cuadro viven el bloque POR
 * CLIENTE y el de PROYECCIÓN, y contarlos daba 30 quincenas donde hay 14 — el agente habría creído
 * que cambió algo en cada corrida y reescrito de más. El cuerpo termina donde dice TOTAL.
 * @param {Array<Array>} colA valores de la columna A desde `filaInicio`
 * @param {number} filaInicio
 */
export function cuerpoDelCuadro(colA = [], filaInicio = 6) {
  const i = colA.findIndex((r) => /^total/i.test(String(r?.[0] ?? '').trim()))
  const filas = i >= 0 ? i : colA.filter((r) => String(r?.[0] ?? '').trim()).length
  return { filas, filaTotal: filaInicio + filas }
}

/**
 * NÚCLEO PURO: DÓNDE está el cuadro. La columna A completa desde la fila 1.
 *
 * Antes la fila de inicio estaba clavada en 6. El 20/07 el dueño borró tres filas de arriba, el
 * cuadro pasó a arrancar en la 3, y el agente escribió igual en la 6: duplicó tres quincenas y dejó
 * el total corto en $3.011.996. Un agente que escribe en una posición fija rompe la planilla la
 * primera vez que alguien la reordena — y reordenarla es normal.
 *
 * El ancla es el encabezado "Desde", que es lo que define el cuadro.
 * @param {Array<Array>} colA valores de A1:A200
 */
export function ubicarCuadro(colA = []) {
  const txt = (r) => String(r?.[0] ?? '').trim()
  const enc = colA.findIndex((r) => /^desde$/i.test(txt(r)))
  if (enc < 0) return { encontrado: false, filaInicio: null, filas: 0, filaTotal: null }
  const filaInicio = enc + 2                       // +1 por base 1, +1 para pasar el encabezado
  const cuerpo = cuerpoDelCuadro(colA.slice(enc + 1), filaInicio)
  return { encontrado: true, filaInicio, ...cuerpo }
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
  file_id, folder_ddjj, anio, tab_cargas = 'Cargas Sociales',
  tab_quincenas = 'Jornales por Quincena', escribir = true, forzar = false,
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
  let ubic = { encontrado: false, filaInicio: 6, filas: 0, filaTotal: 6 }
  try {
    const q = await google.readSheetValues(file_id, `${tab_quincenas}!A1:A200`)
    ubic = ubicarCuadro(q ?? [])
  } catch { /* pestaña nueva */ }
  // Si no aparece el encabezado "Desde", NO se escribe a ciegas: se avisa. Escribir en una posición
  // adivinada es exactamente lo que rompió la pestaña el 20/07.
  if (!ubic.encontrado && escribir) {
    return { error: `no encontré el encabezado "Desde" en ${tab_quincenas}: no voy a escribir en una fila adivinada` }
  }
  const FILA_INICIO = ubic.filaInicio ?? 6
  const cuerpo = { filas: ubic.filas, filaTotal: ubic.filaTotal ?? FILA_INICIO }
  const quincenasEnSheet = cuerpo.filas

  // `forzar` existe porque el Sheet lo edita gente: si alguien mueve, borra o pega filas, el cuadro
  // puede estar mal aunque la CANTIDAD de quincenas coincida — y entonces la comparación por cantidad
  // dice "no cambió nada" y el error queda. Es el botón de reparar.
  const cambio = forzar || nuevos.length > 0 || hayCambio(bloques, quincenasEnSheet)
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

  // Se devuelve el spec de filas para que la tool lo escriba. Este módulo no escribe: así se puede
  // probar en seco y el llamador decide.
  //
  // `insertar_filas` importa: si entró una quincena nueva, hay que INSERTAR la fila antes de
  // escribir, no pisar la fila TOTAL. Al insertar, Google reajusta solo el SUM del total y los
  // rangos del bloque por cliente y de la proyección — por eso insertar es lo correcto y sobrescribir
  // sería destruir el cuadro.
  return {
    ...base,
    escribio: true,
    fila_inicio: FILA_INICIO,
    fila_total: cuerpo.filaTotal,
    insertar_filas: Math.max(0, bloques.length - cuerpo.filas),
    spec_quincenas: filasQuincenas(bloques, FILA_INICIO),
    ddjj: ddjj?.meses ?? [],
  }
}
