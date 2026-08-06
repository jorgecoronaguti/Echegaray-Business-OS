// UBICAR LAS COLUMNAS DE "COMPRAS" POR SU ENCABEZADO, NUNCA POR SU LETRA.
//
// POR QUÉ EXISTE (23/07). "Cargas Sociales" mostraba SEIS MESES de #VALUE! en el cuadro de lo
// PAGADO. La causa: sus fórmulas apuntaban a la columna de fecha de Compras por su letra, y el día
// que se agregó o borró una columna en Compras esa referencia se convirtió en `#REF!`. Peor: nadie
// se enteró, porque el bloque no tenía dueño —ningún script lo reescribía— así que el error quedó
// congelado en la pestaña.
//
// La letra de una columna es una posición; el encabezado es su NOMBRE. El dueño edita Compras a
// mano: las posiciones se mueven, los nombres no. Esta lógica ya existía suelta dentro de
// proveedores-materiales-pestana.mjs; acá queda en un solo lugar para que cualquier generador que
// referencie Compras herede la misma protección.

/** Índice 0 → letra de columna ('A', 'Z', 'AA'…). */
export const letra = (i) => { let s = ''; for (let n = i; n >= 0; n = Math.floor(n / 26) - 1) s = String.fromCharCode(65 + (n % 26)) + s; return s }

/**
 * NÚCLEO PURO: resuelve nombres de encabezado a índices y letras.
 *
 * @param {any[]} encabezado  la fila de encabezados tal como se leyó (Compras!A3:BZ3)
 * @param {Record<string,string>} nombres  clave interna → nombre exacto del encabezado
 * @returns {{col:Record<string,string>, idx:Record<string,number>, faltan:string[]}}
 *          `col` trae la LETRA (para las fórmulas), `idx` el índice (para el JS) y `faltan` los
 *          nombres que no aparecieron — que es lo que hay que gritar, no completar con un default.
 */
export function resolverColumnas(encabezado = [], nombres = {}) {
  const norm = (s) => String(s ?? '').trim().toLowerCase()
  const col = {}; const idx = {}; const faltan = []
  for (const [clave, nombre] of Object.entries(nombres)) {
    const i = encabezado.findIndex((c) => norm(c) === norm(nombre))
    if (i < 0) { faltan.push(nombre); continue }
    idx[clave] = i
    col[clave] = letra(i)
  }
  return { col, idx, faltan }
}

/**
 * `resolverColumnas` PERO FALLANDO CERRADO, con los nombres que faltan adentro del mensaje.
 *
 * La diferencia no es de estilo: `resolverColumnas` devuelve `faltan` y sigue, y un llamador que no
 * lo mire va a leer `f[undefined]` — que en JS no es un error, es `undefined`, y produce movimientos
 * plausibles y equivocados. Todo extractor del libro pasa por acá justamente para no poder hacer eso.
 *
 * @param {any[]} encabezado
 * @param {Record<string,string>} nombres
 * @param {string} fuente el nombre de la pestaña, para que el error diga dónde mirar
 * @returns {Record<string,number>} sólo los índices: el que falla ya rompió
 */
export function columnasObligatorias(encabezado, nombres, fuente) {
  const { idx, faltan } = resolverColumnas(encabezado, nombres)
  if (faltan.length) {
    throw new Error(`libro-extractores(${fuente}): faltan columnas en el encabezado: ${faltan.join(' · ')}. `
      + 'Leer por posición produciría movimientos plausibles y equivocados — no extraigo.')
  }
  return idx
}

/**
 * NÚCLEO PURO: un rango abierto de Compras a partir de una letra ya resuelta.
 * La fila 4 es la primera de datos: las 3 de arriba son título, agrupador y encabezado.
 */
export const rango = (l, fila0 = 4) => `Compras!$${l}$${fila0}:$${l}`
