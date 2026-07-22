// NUNCA BORRAR LO QUE ESCRIBE EL DUEÑO. Es una regla absoluta, no una preferencia.
//
// POR QUÉ EXISTE (22/07). El dueño, tres veces y cada vez más firme: "no me borres lo anotado",
// "nunca se debe borrar lo anotado", y al final: **"nunca podes borrar nada de lo q yo escribo"**.
// Anota a mano en las pestañas —notas, columnas propias, marcas de trabajo— y los generadores del OS
// hacían `clearValues` sobre un rango entero y reescribían encima. Cada regeneración (y el worker
// corre solo, 24×7) le borraba el trabajo. Tuvo que restaurar por historial de versiones.
//
// ═══ LA REGLA, EN UNA LÍNEA ═══
//
//     Gana el generador donde TIENE contenido; donde el generador deja VACÍO, se conserva lo que había.
//
// Así una anotación sobrevive esté en la columna o la fila que esté, sin que el generador tenga que
// adivinar dónde escribe el dueño. Y se elimina el `clearValues`: no se limpia, se FUSIONA.
//
// ═══ EL COSTO, DECLARADO ═══
//
// Si un bloque generado se ACHICA (menos filas que la vez anterior), sus filas viejas ya no se borran:
// quedan como "contenido preexistente". Es el precio de la regla, y es el lado correcto para
// equivocarse — mejor una fila vieja visible que una anotación del dueño destruida. `sobrantes()`
// las detecta para poder avisarlas en vez de borrarlas a ciegas.

/** ¿La celda tiene algo? Vacío, null y undefined son "no tiene". El 0 y el texto "0" SÍ tienen. */
export function tiene(v) {
  return v !== undefined && v !== null && String(v) !== ''
}

/**
 * NÚCLEO PURO: fusiona la grilla que genera el OS con la que ya está en la pestaña.
 *
 * @param {any[][]} generado  lo que el generador quiere escribir
 * @param {any[][]} existente lo que la pestaña tiene hoy (leído con render FORMULA, para no degradar
 *                            una fórmula preservada a número pegado)
 * @returns {any[][]} la grilla a escribir: nunca vacía una celda que tenía contenido
 */
export function fusionar(generado = [], existente = []) {
  const filas = Math.max(generado.length, existente.length)
  const out = []
  for (let i = 0; i < filas; i++) {
    const g = generado[i] || []
    const e = existente[i] || []
    const cols = Math.max(g.length, e.length)
    const fila = []
    for (let j = 0; j < cols; j++) fila.push(tiene(g[j]) ? g[j] : (tiene(e[j]) ? e[j] : ''))
    out.push(fila)
  }
  return out
}

/** Índice 0 → letra de columna ('A', 'Z', 'AA'…). */
export function letraCol(i) {
  let s = ''
  for (let n = i; n >= 0; n = Math.floor(n / 26) - 1) s = String.fromCharCode(65 + (n % 26)) + s
  return s
}

/**
 * ESCRIBE UNA GRILLA SIN BORRAR NADA DE LO QUE ESCRIBIÓ UNA PERSONA.
 *
 * Reemplaza el par `clearValues(...)` + `batchUpdateValues(...)` que usaban todos los generadores.
 * Lee lo que hay (con las fórmulas intactas), fusiona y escribe. NO limpia: lo que está fuera de la
 * grilla —más abajo, más a la derecha— ni se lee ni se toca.
 *
 * @param {object} google cliente de google.mjs
 * @param {string} fileId
 * @param {string} ref    referencia de la pestaña, ya citada si tiene espacios (ej. "'Cheques Emitidos'")
 * @param {any[][]} grid  lo que el generador quiere escribir
 * @param {{fila0?:number, col0?:number, anchoHoja?:number}} opts fila/columna inicial (1-based / 0-based) y
 *        ancho real de la hoja, para capturar lo que la persona anotó a la derecha de la tabla
 * @returns {Promise<{conservadas:{fila:number,col:number,valor:any}[]}>}
 */
export async function escribirPreservando(google, fileId, ref, grid, { fila0 = 1, col0 = 0, anchoHoja } = {}) {
  const alto = grid.length
  if (!alto) return { conservadas: [] }
  const ancho = Math.max(...grid.map((f) => (f || []).length), 1)
  const anchoLeer = Math.max(ancho, anchoHoja ?? ancho)
  const desde = `${letraCol(col0)}${fila0}`
  const hasta = `${letraCol(col0 + anchoLeer - 1)}${fila0 + alto - 1}`
  const previo = await google.readSheetValues(fileId, `${ref}!${desde}:${hasta}`, { render: 'FORMULA' })
  const fusion = fusionar(grid, previo)
  await google.batchUpdateValues(fileId, [{ range: `${ref}!${desde}`, values: fusion }])
  return { conservadas: sobrantes(grid, previo) }
}

/**
 * NÚCLEO PURO: las celdas que quedaron en la pestaña y el generador ya no produce.
 *
 * NO se borran —esa es la regla— pero se informan: casi siempre son anotaciones del dueño (bien), y
 * a veces son restos de un bloque que se achicó (hay que mirarlos). Sin esta lista, la diferencia
 * entre "una nota" y "una fila vieja que engaña" no la ve nadie.
 *
 * @returns {{fila:number, col:number, valor:any}[]} 1-based, listo para nombrar celdas
 */
export function sobrantes(generado = [], existente = []) {
  const out = []
  for (let i = 0; i < existente.length; i++) {
    const g = generado[i] || []
    const e = existente[i] || []
    for (let j = 0; j < e.length; j++) {
      if (tiene(e[j]) && !tiene(g[j])) out.push({ fila: i + 1, col: j + 1, valor: e[j] })
    }
  }
  return out
}
