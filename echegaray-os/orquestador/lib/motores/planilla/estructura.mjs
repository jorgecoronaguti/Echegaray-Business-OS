// LA ESTRUCTURA DE UNA PLANILLA: crear hoja · copiar hoja · borrar hoja · rangos con nombre ·
// crear workbook · duplicar template.
//
// Vive aparte de `motor.mjs` por tamaño (la regla del repo: ≤500 líneas por archivo) y porque son
// operaciones de otra naturaleza: las de `motor.mjs` mueven CONTENIDO por la API de valores, éstas
// mueven la FORMA por `spreadsheets.batchUpdate` y por Drive. Comparten la clase `Planilla` como
// contexto y por eso se escriben como funciones que la reciben, no como métodos sueltos.
//
// ═══ LO QUE TIENEN EN COMÚN LAS SEIS ═══
//
// Ninguna se da por hecha con la respuesta del batch. `addSheet` devuelve las propiedades de la
// hoja que dice haber creado; eso lo escribe quien escribió. La evidencia es la RELECTURA de los
// metadatos del archivo, que la escribe el destino. Es la misma regla que en las escrituras de
// valores, aplicada a la forma.

import { CODIGOS, fallar } from './errores.mjs'
import { citarHoja, dimensiones, formatearRango } from './direcciones.mjs'
import { FORMATOS, formatoDe, permite } from './formatos.mjs'

/** Crea una HOJA nueva. Si ya existe con ese nombre no la duplica: devuelve la que hay, para que
 *  llamar dos veces no deje "Resumen" y "Resumen (1)" — la forma más común de ensuciar un archivo. */
export async function crearHoja(planilla, titulo, { indice } = {}) {
  planilla._puedeEscribir('estructura')
  const existentes = await planilla.hojas()
  const ya = existentes.find((s) => s.title === titulo)
  if (ya) return { ok: true, yaExistia: true, titulo, sheetId: ya.sheetId, ancla: `${citarHoja(titulo)}!A1` }

  const props = { title: titulo, ...(Number.isInteger(indice) ? { index: indice } : {}) }
  const res = await planilla.google.spreadsheetBatchUpdate(planilla.fileId, [{ addSheet: { properties: props } }])
  planilla._siProtegido(res, titulo)
  const h = await planilla.hoja(titulo) // la evidencia es la relectura, no la respuesta del batch
  return { ok: true, yaExistia: false, titulo, sheetId: h.sheetId, ancla: `${citarHoja(titulo)}!A1` }
}

/**
 * COPIA una hoja dentro del MISMO archivo, con su contenido, sus fórmulas y su formato.
 *
 * Es `duplicateSheet` y no un leer-y-reescribir a propósito. Reescribir conserva los valores y
 * pierde el formato condicional, la validación de datos, los anchos, los gráficos y —lo peor— las
 * fórmulas relativas quedan apuntando a la hoja vieja. `duplicateSheet` reapunta las referencias
 * internas solo, que es exactamente lo que uno espera de "copiá esta hoja".
 */
export async function copiarHoja(planilla, origen, destino, { indice } = {}) {
  planilla._puedeEscribir('estructura')
  const src = await planilla.hoja(origen) // lanza HOJA_INEXISTENTE con la lista de las que sí están
  const existentes = await planilla.hojas()
  if (existentes.some((s) => s.title === destino)) {
    fallar(CODIGOS.RANGO_INVALIDO, `ya hay una hoja llamada "${destino}": elegí otro nombre o borrala primero`,
      { destino, existentes: existentes.map((s) => s.title) })
  }
  const res = await planilla.google.spreadsheetBatchUpdate(planilla.fileId, [{
    duplicateSheet: {
      sourceSheetId: src.sheetId,
      newSheetName: destino,
      ...(Number.isInteger(indice) ? { insertSheetIndex: indice } : {}),
    },
  }])
  planilla._siProtegido(res, destino)
  const h = await planilla.hoja(destino)
  return { ok: true, origen, destino, sheetId: h.sheetId, ancla: `${citarHoja(destino)}!A1` }
}

/** Borra una hoja y verifica que efectivamente ya no esté. Un `deleteSheet` que devuelve 200 sobre
 *  un sheetId que ya no existía también devuelve 200. */
export async function borrarHoja(planilla, titulo) {
  planilla._puedeEscribir('estructura')
  const h = await planilla.hoja(titulo)
  const res = await planilla.google.spreadsheetBatchUpdate(planilla.fileId, [{ deleteSheet: { sheetId: h.sheetId } }])
  planilla._siProtegido(res, titulo)
  const quedan = await planilla.hojas()
  if (quedan.some((s) => s.title === titulo)) {
    fallar(CODIGOS.ESCRITURA_NO_PERSISTIO, `pedí borrar "${titulo}" y al releer sigue estando`,
      { hoja: titulo, hojas: quedan.map((s) => s.title) })
  }
  return { ok: true, borrada: titulo }
}

/**
 * Publica un RANGO CON NOMBRE.
 *
 * Si el nombre ya existe lo REAPUNTA en vez de crear un segundo. La API deja convivir dos rangos
 * con el mismo nombre, y a partir de ahí toda fórmula que lo use apunta a uno de los dos sin que se
 * pueda saber a cuál. Un archivo así ya no se puede razonar.
 *
 * El nombre es la única ancla que sobrevive a que alguien inserte una fila arriba: por eso este
 * motor prefiere un nombre a una dirección fija para todo lo que se referencia desde otra parte.
 */
export async function definirRangoConNombre(planilla, nombre, ref) {
  planilla._puedeEscribir('estructura')
  const r = planilla._rango(ref)
  if (!r.hoja) fallar(CODIGOS.RANGO_INVALIDO, `"${ref}" no dice en qué hoja: un rango con nombre necesita hoja`, { ref })
  const h = await planilla.hoja(r.hoja)
  const rango = {
    sheetId: h.sheetId,
    startRowIndex: r.desde.fila,
    endRowIndex: r.hasta.fila + 1,
    startColumnIndex: r.desde.col,
    endColumnIndex: r.hasta.col + 1,
  }
  const ya = (await planilla.leerRangosConNombre()).find((n) => n.nombre === nombre)
  const req = ya
    ? { updateNamedRange: { namedRange: { namedRangeId: ya.id, name: nombre, range: rango }, fields: 'name,range' } }
    : { addNamedRange: { namedRange: { name: nombre, range: rango } } }

  const res = await planilla.google.spreadsheetBatchUpdate(planilla.fileId, [req])
  planilla._siProtegido(res, nombre)
  const ahora = (await planilla.leerRangosConNombre()).find((n) => n.nombre === nombre)
  if (!ahora) fallar(CODIGOS.ESCRITURA_NO_PERSISTIO, `definí "${nombre}" y no aparece al releer`, { nombre, ref })
  // Que exista no alcanza: tiene que apuntar A DONDE SE PIDIÓ. Un rango con nombre que quedó
  // apuntando a celdas vacías es peor que uno que no existe — no da error, da cero.
  const esperado = formatearRango(r)
  if (ahora.rango !== esperado) {
    fallar(CODIGOS.ESCRITURA_NO_PERSISTIO,
      `"${nombre}" quedó apuntando a ${ahora.rango} y pedí ${esperado}`,
      { nombre, esperado, real: ahora.rango })
  }
  return { ok: true, nombre, rango: ahora.rango, reapuntado: !!ya, celdas: dimensiones(r) }
}

// ─────────────────────── crear y duplicar un WORKBOOK ───────────────────────

/**
 * Crea una planilla nueva de Google Sheets y la abre.
 *
 * Nace en es-AR porque lo fija `createFile` (locale + zona horaria de San Juan). No es cosmético:
 * un archivo que nace en_US lee "05/08/2026" como 8 de mayo y rechaza una fórmula con `;`. Todo el
 * Drive de la empresa es es-AR, y un archivo que no lo sea es una bomba de tiempo silenciosa.
 *
 * @param {object} google cliente de `lib/google.mjs`
 * @param {string} nombre
 * @param {{carpetaId?:string, opciones?:object, abrir?:Function}} [o] `abrir` se inyecta desde
 *        `motor.mjs` para no crear un ciclo de imports entre los dos archivos.
 */
export async function crearPlanilla(google, nombre, { carpetaId, opciones, abrir } = {}) {
  const f = await google.createFile({
    name: nombre,
    mimeType: 'application/vnd.google-apps.spreadsheet',
    parents: carpetaId ? [carpetaId] : undefined,
  })
  if (!f?.id) fallar(CODIGOS.ESCRITURA_NO_PERSISTIO, `no se creó la planilla "${nombre}"`, { nombre, respuesta: f })
  return abrir(google, f.id, opciones)
}

/**
 * DUPLICAR UN TEMPLATE. Copia el ARCHIVO entero —fórmulas, formato, validaciones, rangos con
 * nombre, gráficos, tablas dinámicas— y devuelve la copia abierta.
 *
 * Es `files.copy` de Drive y no un leer-y-reescribir: reescribir un template conserva los valores y
 * pierde todo lo que lo hacía un template. Y el ORIGINAL NUNCA SE TOCA — si algo sale mal, se
 * descarta la copia y no pasó nada.
 */
export async function duplicarTemplate(google, templateId, nombre, { carpetaId, opciones, abrir } = {}) {
  const meta = await google.fileMeta(templateId)
  const formato = formatoDe(meta)
  if (formato !== FORMATOS.GOOGLE) {
    // Copiar un .xlsm en Drive SÍ conserva las macros: es una copia binaria y Drive no lo interpreta.
    // Lo que no se puede es OPERAR la copia después. Se avisa acá, antes de dejar en el Drive del
    // dueño un archivo nuevo que este motor no va a poder tocar.
    fallar(CODIGOS.FORMATO_NO_SOPORTADO,
      `"${meta.name}" es ${formato}: la copia saldría bien, pero este motor no puede escribir sobre ella después.`,
      { templateId, formato, alternativa: permite(formato, 'escribir')?.alternativa ?? null })
  }
  const copia = await google.copyFile(templateId, nombre, carpetaId ? [carpetaId] : undefined)
  if (!copia?.id) fallar(CODIGOS.ESCRITURA_NO_PERSISTIO, `no se copió "${meta.name}"`, { templateId, respuesta: copia })
  return abrir(google, copia.id, opciones)
}
