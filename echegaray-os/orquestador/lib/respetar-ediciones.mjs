// REVISAR LO QUE LA PERSONA EDITÓ **ANTES** DE ESCRIBIR, Y ADAPTARSE A SU CAMBIO.
//
// POR QUÉ EXISTE (23/07). El dueño amplió la regla que ya existía: no alcanza con no borrar lo que
// él escribe. Textual: *"si yo decido una modificación en algún texto, eliminación, reencuadre —
// revisar antes de cambiar algo, respetarla y adaptar la modificación a esto"*.
//
// La diferencia con lo que ya había ([[preservar-anotaciones]]) es grande y hay que verla:
//
//   PRESERVAR protege lo que el generador NO escribe: una columna nueva, una nota al margen. Si el
//   generador escribe un rótulo, gana el generador, siempre.
//
//   RESPETAR protege lo que el generador SÍ escribe pero la persona CAMBIÓ. Si el dueño reescribe
//   "Deuda previsional en cuotas" como "Plan de pago ARCA", o vacía una fila, o mueve un texto, la
//   próxima corrida se lo pisaba sin enterarse. Y como el agente corre cada dos horas, su edición
//   duraba menos de un turno.
//
// ═══ CÓMO SE SABE QUE LO CAMBIÓ UNA PERSONA ═══
//
// No se puede saber mirando el Sheet: un texto distinto puede venir de una persona o de una versión
// anterior del propio generador. La única forma honesta es que el generador RECUERDE lo que escribió
// la última vez. Si hoy la celda dice algo distinto de eso, la cambió alguien más.
//
//     lo que escribí la vez pasada  ==  lo que hay hoy   →  nadie la tocó   →  escribo lo nuevo
//     lo que escribí la vez pasada  !=  lo que hay hoy   →  LA TOCÓ UNA PERSONA  →  respeto lo suyo
//
// ═══ QUÉ ALCANZA, Y POR QUÉ NO MÁS ═══
//
// SÓLO LOS RÓTULOS DE TEXTO. Un importe y una fórmula son la respuesta que la pestaña calcula: si el
// dueño escribe un número a mano encima de un cálculo, eso no es una decisión de redacción, es un
// dato pisado — y para eso ya existe columnas-calculadas.mjs, que lo devuelve a su fórmula y avisa.
// Respetar un número pisado sería congelar un cuadro en un valor que dejó de actualizarse.

import { query } from './db.mjs'
import { VACIO } from './preservar-anotaciones.mjs'

/**
 * Postgres RECHAZA el byte nulo en un texto, y una celda de Sheets puede traerlo (llega de un pegado
 * desde otro programa). Sin esto, una sola celda sucia hacía fallar el guardado ENTERO del registro
 * y la regla dejaba de funcionar en silencio para toda la pestaña.
 */
const limpio = (s) => String(s).replace(/\u0000/g, '')

/**
 * El apóstrofo inicial de Sheets NO es parte del valor: es la marca de "esto entra como texto"
 * (`'ene-26` para que no lo parsee como fecha). Se escribe con él y se lee sin él, así que sin
 * normalizarlo TODOS los encabezados de mes parecían editados por una persona en cada corrida — y
 * la regla los habría congelado, que es justo lo contrario de lo que tiene que hacer.
 */
const sinApostrofo = (s) => String(s ?? '').replace(/^'/, '')

/** ¿Es un rótulo? Texto, no fórmula, no número. Es lo único que esta regla protege. */
export function esRotulo(v) {
  if (typeof v !== 'string') return false
  // El centinela de "esta celda es mía y va vacía" no es un rótulo: es plomería del generador.
  if (v === VACIO) return false
  const t = v.trim()
  if (!t || t.startsWith('=')) return false
  // Un texto que es sólo un número escrito ("1.234", "12%") es un dato, no un rótulo.
  return !/^[-$\s\d.,%]+$/.test(t)
}

const clave = (fila, col) => `${fila}:${col}`

/**
 * NÚCLEO PURO: aplica las ediciones de la persona sobre la grilla que el generador quiere escribir.
 *
 * @param {any[][]} generado  lo que el generador escribiría hoy
 * @param {any[][]} actual    lo que hay hoy en la pestaña
 * @param {Map<string,string>} registro  lo que el generador escribió la última vez, por "fila:col"
 * @returns {{grid:any[][], respetadas:{fila:number,col:number,mio:string,suyo:string}[]}}
 */
export function respetarEdiciones(generado = [], actual = [], registro = new Map()) {
  const respetadas = []
  const grid = generado.map((f, i) => (f || []).map((celda, j) => {
    if (!esRotulo(celda)) return celda
    const anterior = registro.get(clave(i + 1, j + 1))
    // Sin memoria de la vez pasada no se puede distinguir una edición de una versión vieja del
    // propio generador. Ante la duda, escribe: es la primera corrida y todavía no hay nada que
    // respetar. La memoria se guarda al final de ESTA corrida.
    if (anterior === undefined) return celda
    const hoy = String(actual?.[i]?.[j] ?? '')
    if (sinApostrofo(hoy) === sinApostrofo(anterior)) return celda   // nadie lo tocó
    if (sinApostrofo(hoy).trim() === sinApostrofo(celda).trim()) return celda // ya dice lo mismo
    // LO CAMBIÓ UNA PERSONA. Incluye el caso de que lo haya VACIADO: una eliminación también es una
    // decisión, y la regla la nombra explícitamente.
    respetadas.push({ fila: i + 1, col: j + 1, mio: String(celda), suyo: hoy })
    return hoy
  }))
  return { grid, respetadas }
}

/** Crea la tabla del registro si todavía no está. Barata y idempotente. */
async function asegurarTabla() {
  await query(`
    create table if not exists public.sheet_rotulos (
      file_id    text not null,
      pestana    text not null,
      fila       int  not null,
      col        int  not null,
      valor      text not null,
      escrito_en timestamptz not null default now(),
      primary key (file_id, pestana, fila, col)
    )`)
}

/** Lo que este generador escribió la última vez en esta pestaña. */
export async function leerRegistro(fileId, pestana) {
  await asegurarTabla()
  const r = await query('select fila, col, valor from public.sheet_rotulos where file_id = $1 and pestana = $2', [fileId, pestana])
  return new Map(r.rows.map((x) => [clave(x.fila, x.col), x.valor]))
}

/**
 * Guarda lo que el generador acaba de escribir, para poder detectar la próxima edición.
 *
 * Se guarda lo que QUEDÓ escrito (después de respetar), no lo que el generador quería: si no, la
 * corrida siguiente volvería a ver una diferencia y el aviso se repetiría para siempre.
 */
export async function guardarRegistro(fileId, pestana, grid) {
  await asegurarTabla()
  const filas = []
  grid.forEach((f, i) => (f || []).forEach((c, j) => { if (esRotulo(c)) filas.push([i + 1, j + 1, limpio(c)]) }))
  await query('delete from public.sheet_rotulos where file_id = $1 and pestana = $2', [fileId, pestana])
  if (!filas.length) return 0
  // Un solo INSERT con todos los valores: una pestaña tiene cientos de rótulos y cientos de viajes
  // a la base por corrida, cada dos horas, no se justifican.
  const vals = filas.map((_, k) => `($1,$2,$${k * 3 + 3},$${k * 3 + 4},$${k * 3 + 5})`).join(',')
  await query(`insert into public.sheet_rotulos (file_id, pestana, fila, col, valor) values ${vals}`,
    [fileId, pestana, ...filas.flat()])
  return filas.length
}

/**
 * El ciclo completo, para que un generador lo use en una línea.
 *
 *   const { grid, respetadas } = await conEdicionesRespetadas(fileId, pestana, filas, actual)
 *   … escribir grid …
 *   await guardarRegistro(fileId, pestana, grid)
 */
export async function conEdicionesRespetadas(fileId, pestana, generado, actual) {
  const registro = await leerRegistro(fileId, pestana).catch(() => new Map())
  return respetarEdiciones(generado, actual, registro)
}
