// UNA LETRA FIJA DE UNA PESTAÑA QUE NO SE CORRE CON LA INSERCIÓN DE «OBRA» — declarada, no escondida.
//
// ═══ POR QUÉ EXISTE (14/09/2026) ═══
//
// La inserción de «Obra» corre Compras desde la L y Cobranzas desde la H. El guardián
// (`columnas-fijas.test.mjs`) cuenta las letras peladas de los archivos que nombran esas pestañas, y
// en esos mismos archivos viven letras de OTRAS pestañas que el OS genera con su propio layout
// (`Cheques Emitidos`, `_BANCO_RAW`, `_CRUCE_ARCA`, `_ARCA_RAW`): ésas no se mueven y resolverlas por
// rótulo sería inventar un encabezado que no existe.
//
// La diferencia entre las dos no puede quedar en la cabeza de quien lee: se escribe. Esta función es la
// declaración, y además la hace cumplir — pedirle una letra de Compras o Cobranzas es un error con el
// nombre del resolvedor adentro, porque ésa es exactamente la letra que se corre.

/** Las pestañas cuyas columnas se corren: sus letras salen del rótulo, nunca de acá. */
const SE_CORREN = new Set(['compras', 'cobranzas', '02_cobranzas'])

/**
 * La letra de una columna de una pestaña que NO es Compras ni Cobranzas.
 * @param {string} pestana el nombre de la pestaña dueña de la columna
 * @param {string} letra la letra, tal como la usa la fórmula
 * @returns {string} la misma letra
 */
export function letraDeOtraPestana(pestana, letra) {
  const p = String(pestana ?? '').replace(/^'|'$/g, '').trim().toLowerCase()
  if (!p) throw new Error('letraDeOtraPestana: falta la pestaña — sin ella no se sabe si la letra se corre')
  if (SE_CORREN.has(p)) {
    throw new Error(`letraDeOtraPestana: las columnas de «${pestana}» se corren con la inserción de «Obra» — resolvela por su rótulo (columnas-por-encabezado.mjs)`)
  }
  if (!/^[A-Z]{1,3}$/.test(String(letra ?? ''))) throw new Error(`letraDeOtraPestana: «${letra}» no es una letra de columna`)
  return letra
}
