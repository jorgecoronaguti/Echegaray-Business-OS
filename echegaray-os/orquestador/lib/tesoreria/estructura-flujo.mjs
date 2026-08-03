// ¿ESTE LIBRO ES UN FLUJO DE FONDOS? — la guarda que hay que pasar antes de leerle un peso.
//
// ═══ POR QUÉ EXISTE ═══
//
// El lector del Flujo de Caja no lee "una planilla": lee una ESTRUCTURA. Pide `Caja`, `Cobranzas`,
// `Compras` y `Cheques Emitidos`, cada una con sus filas de encabezado en su lugar. Eso estuvo bien
// mientras el libro era uno solo y estaba fijo en el código.
//
// Desde que se puede indicar cuál analizar, aparece un riesgo nuevo y peor que un error: apuntarlo a
// un libro con otra forma **no falla**. `readSheetValues(...).catch(() => [])` devuelve vacío, los
// parsers devuelven cero, y el agente informa "caja $0, sin movimientos" con la misma cara con la que
// informaría un dato real. Un cero por falta de estructura es indistinguible de un cero verdadero.
//
// Así que antes de leer un peso se verifica la forma, y si no está, se para. Negarse a contestar es
// la respuesta correcta cuando la alternativa es contestar cualquier cosa.
//
// ═══ LO QUE ESTA GUARDA NO HACE ═══
//
// No valida que los NÚMEROS tengan sentido — eso lo hacen los controles de coherencia de la posición.
// Sólo contesta si el libro tiene la forma que este lector sabe leer.

/** Las pestañas sin las cuales el cálculo no significa nada. Son las que el lector abre de verdad. */
export const PESTANAS_REQUERIDAS = ['Caja', 'Cobranzas', 'Compras', 'Cheques Emitidos']

/**
 * Un Sheet se puede nombrar por ID o pegando la URL entera. El dueño va a pegar la URL: obligarlo a
 * extraer el ID a mano es la clase de fricción que hace que la capacidad no se use.
 */
export function idDeSheet(entrada) {
  const t = String(entrada ?? '').trim()
  if (!t) return null
  const m = t.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)
  if (m) return m[1]
  // Un ID suelto: son largos y sin espacios ni barras. Si tiene pinta de otra cosa, no se adivina.
  if (/^[a-zA-Z0-9-_]{20,}$/.test(t)) return t
  return null
}

/** Compara sin tildes, sin mayúsculas y sin espacios de más: los rótulos reales no vienen prolijos. */
const plano = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

/**
 * Verifica que el libro tenga las pestañas que este lector necesita.
 *
 * @returns {Promise<{ok:boolean, motivo?:string, faltantes?:string[], titulo?:string}>}
 *   Nunca lanza: no poder mirar el libro es un resultado, no una excepción.
 */
export async function verificarEstructuraFlujo(google, spreadsheetId) {
  if (!spreadsheetId) return { ok: false, motivo: 'no se indicó ningún Sheet' }
  let hojas
  try {
    // `getSheetMeta` ya existe en el cliente del OS y devuelve [{sheetId, title, rows, cols}]. No se
    // agrega un método nuevo para esto: una capacidad, una fuente.
    hojas = (await google.getSheetMeta(spreadsheetId)).map((h) => h?.title).filter(Boolean)
  } catch (e) {
    const msg = String(e?.message ?? e)
    // "No lo encuentro" y "no tengo permiso" piden cosas distintas de una persona.
    if (/not found|404/i.test(msg)) return { ok: false, motivo: 'no encontré ese Sheet: revisá el enlace' }
    if (/permission|403/i.test(msg)) return { ok: false, motivo: 'no tengo permiso para abrir ese Sheet: compartímelo con el usuario del OS' }
    return { ok: false, motivo: `no pude abrir ese Sheet: ${msg.slice(0, 120)}` }
  }

  const presentes = new Set(hojas.map(plano))
  const faltantes = PESTANAS_REQUERIDAS.filter((p) => !presentes.has(plano(p)))
  if (faltantes.length) {
    return {
      ok: false,
      faltantes,
      // El motivo dice qué falta Y por qué importa: sin eso, el dueño lee "no se puede" y no sabe si
      // es un problema del Sheet o del OS.
      motivo: `ese libro no tiene la estructura del Flujo de Fondos — le faltan: ${faltantes.join(', ')}. `
        + 'Sin esas pestañas el cálculo daría cero y parecería un dato real, así que no lo hago.',
    }
  }
  return { ok: true, pestanas: hojas.length }
}

export const VERSION = '1.0.0'
