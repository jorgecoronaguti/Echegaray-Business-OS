// LEER UN DOCUMENTO COMO ESTRUCTURA, NO COMO TEXTO. PURO: entra el JSON que devuelve la Docs API,
// sale el mapa de secciones direccionables. No toca la red.
//
// ═══ QUÉ DELIMITA UNA SECCIÓN ═══
//
// El estilo del párrafo (`HEADING_1..3`), no una marca inventada por el OS. Un documento que una
// persona escribió a mano en Drive se lee igual que uno que generó el motor, y un título que el
// dueño cambió sigue delimitando su sección. Si la sección se delimitara con un texto centinela,
// bastaría que alguien lo borrase para que el motor dejara de encontrar dónde escribir — y una
// escritura que no encuentra su lugar es la que termina pisando el vecino.
//
// Una sección termina donde empieza el próximo título de NIVEL IGUAL O MENOR. O sea: actualizar
// «2 · Avance» reemplaza también sus subtítulos, que es lo que quiere decir «actualizá el avance».

import { idDeTitulo } from './documento-contrato.mjs'

const NIVEL = { HEADING_1: 1, HEADING_2: 2, HEADING_3: 3, TITLE: 0, SUBTITLE: 0 }

/** El texto de un párrafo del Doc (concatena sus textRun). PURA. */
export function textoDeParrafo(elemento) {
  const partes = elemento?.paragraph?.elements ?? []
  return partes.map((e) => e?.textRun?.content ?? '').join('')
}

/** El texto de una tabla, fila por fila. PURA. Sirve para verificar que una celda quedó escrita. */
export function textoDeTabla(elemento) {
  const filas = elemento?.table?.tableRows ?? []
  return filas.map((f) => (f.tableCells ?? []).map((c) => (c.content ?? []).map(textoDeParrafo).join('').trim()))
}

/** Todo el texto del cuerpo, párrafos y tablas, en orden. PURA. */
export function textoDelCuerpo(doc) {
  const out = []
  for (const el of doc?.body?.content ?? []) {
    if (el.paragraph) out.push(textoDeParrafo(el))
    else if (el.table) out.push(textoDeTabla(el).map((f) => f.join(' | ')).join('\n') + '\n')
  }
  return out.join('')
}

const finDelCuerpo = (doc) => {
  const c = doc?.body?.content ?? []
  return c.length ? (c[c.length - 1].endIndex ?? 1) : 1
}

/** Los encabezados del documento, en orden, con su nivel y sus índices. PURA. */
function encabezados(doc) {
  const out = []
  for (const el of doc?.body?.content ?? []) {
    const nombre = el?.paragraph?.paragraphStyle?.namedStyleType
    const nivel = NIVEL[nombre]
    if (!nivel) continue
    const titulo = textoDeParrafo(el).replace(/\s+$/, '')
    if (!titulo.trim()) continue
    out.push({ titulo, nivel, inicio: el.startIndex ?? 0, contenido_inicio: el.endIndex ?? 0 })
  }
  return out
}

/** Ids únicos y estables para una lista de títulos. PURA — misma regla que el contrato. */
function asignarIds(titulos) {
  const vistos = new Set()
  return titulos.map((t) => {
    let id = idDeTitulo(t)
    if (vistos.has(id)) { let n = 2; while (vistos.has(`${id}_${n}`)) n++; id = `${id}_${n}` }
    vistos.add(id)
    return id
  })
}

/**
 * EL MAPA DEL DOCUMENTO. PURA.
 * @param {object} doc respuesta de `google.getDoc(fileId)`
 * @returns {{file_id:string|null, titulo:string, secciones:Array, tablas:Array, fin:number, texto:string}}
 */
export function leerEstructura(doc) {
  const heads = encabezados(doc)
  const ids = asignarIds(heads.map((h) => h.titulo))
  const fin = finDelCuerpo(doc)
  const contenido = doc?.body?.content ?? []

  const secciones = heads.map((h, i) => {
    // El próximo título de nivel igual o menor cierra la sección; los subtítulos quedan adentro.
    const siguiente = heads.slice(i + 1).find((o) => o.nivel <= h.nivel)
    const hasta = siguiente ? siguiente.inicio : fin - 1
    const texto = contenido
      .filter((el) => (el.startIndex ?? 0) >= h.contenido_inicio && (el.endIndex ?? 0) <= hasta + 1)
      .map((el) => (el.paragraph ? textoDeParrafo(el) : textoDeTabla(el).map((f) => f.join(' | ')).join('\n')))
      .join('')
    return {
      id: ids[i],
      titulo: h.titulo,
      nivel: h.nivel,
      inicio: h.inicio,
      contenido_inicio: h.contenido_inicio,
      fin: hasta,
      texto: texto.replace(/\n+$/, ''),
    }
  })

  const tablas = contenido
    .map((el, i) => (el.table ? { posicion: i, inicio: el.startIndex, filas: el.table.tableRows?.length ?? 0, columnas: el.table.columns ?? 0 } : null))
    .filter(Boolean)

  return {
    file_id: doc?.documentId ?? null,
    titulo: doc?.title ?? '',
    secciones,
    tablas,
    fin,
    texto: textoDelCuerpo(doc),
  }
}

/** La sección con ese id, o `null`. PURA. */
export function seccionPorId(estructura, id) {
  return (estructura?.secciones ?? []).find((s) => s.id === String(id)) ?? null
}
