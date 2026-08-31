// EL CONTRATO DE UN DOCUMENTO. Lo que se puede pedir, y nada más.
//
// ═══ UN DOCUMENTO NO ES UN STRING ═══
//
// `createDoc(nombre, texto)` ya existía y alcanza para dejar una nota en Drive. No alcanza para lo
// que pide el negocio: actualizar la sección «Avance del mes» de un informe sin tocar el resto,
// completar los datos del cliente en un contrato, o saber si el certificado tiene la sección que
// el pliego exige. Todo eso necesita que el documento tenga PARTES CON NOMBRE, y un string no las
// tiene: obliga a buscar por texto, y el texto cambia.
//
// Por eso la unidad es la SECCIÓN, y cada sección tiene un `id` estable que no es su título.
//
// ═══ LA MISMA FRONTERA QUE EN SLIDES ═══
//
// Acá no hay un solo campo de fuente, tamaño, color, margen ni posición, y es a propósito: es lo
// que hace que el décimo informe se vea como el primero. Si falta una forma de decir algo, se
// agrega un TIPO DE BLOQUE, no un parámetro de formato.

import { z } from 'zod'

const texto = (max) => z.string().trim().min(1).max(max)
const opcional = (max) => z.string().trim().max(max).optional().nullable()

/** El `id` de una sección: estable, en minúsculas, sin acentos. PURA. */
export function idDeTitulo(titulo) {
  return String(titulo ?? '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
    .slice(0, 60) || 'seccion'
}

const Parrafo = z.object({ tipo: z.literal('parrafo'), texto: texto(4000) })
const Lista = z.object({ tipo: z.literal('lista'), items: z.array(texto(600)).min(1).max(60), numerada: z.boolean().optional() })
const Tabla = z.object({
  tipo: z.literal('tabla'),
  columnas: z.array(texto(60)).min(1).max(8),
  filas: z.array(z.array(z.string().max(300))).min(1).max(200),
})
/** Ficha de pares clave/valor: los datos del cliente, la obra, el comprobante. */
const Datos = z.object({
  tipo: z.literal('datos'),
  pares: z.array(z.object({ clave: texto(60), valor: z.string().trim().max(400) })).min(1).max(40),
})

export const Bloque = z.discriminatedUnion('tipo', [Parrafo, Lista, Tabla, Datos])

// EL `id` NO SE PIDE: SE DERIVA DEL TÍTULO, SIEMPRE.
//
// Un Google Doc no guarda ids de sección: guarda párrafos con estilo. Cuando el documento se relee,
// lo único que hay para nombrar una sección es su título. Si acá se pudiera declarar un id
// arbitrario, la estructura en memoria diría «ejecutado» y el documento releído diría
// «ejecutado_en_el_periodo» — y `actualizarSeccion('ejecutado')` fallaría contra el documento que
// este mismo motor acaba de escribir. Pasó, en la primera corrida viva.
export const Seccion = z.object({
  titulo: texto(140),
  nivel: z.number().int().min(1).max(3).default(1),
  bloques: z.array(Bloque).max(60).default([]),
})

export const Documento = z.object({
  titulo: texto(200),
  subtitulo: opcional(300),
  secciones: z.array(Seccion).min(1).max(60),
})

/** Todas las filas de una tabla tienen el ancho de su encabezado. Un `undefined` en una celda no
 *  da error en la API: da una tabla corrida un lugar, que se lee como un dato mal puesto. */
function tablasCuadradas(doc) {
  const malas = []
  doc.secciones.forEach((s, i) => {
    s.bloques.forEach((b, j) => {
      if (b.tipo !== 'tabla') return
      const mal = b.filas.filter((f) => f.length !== b.columnas.length).length
      if (mal) malas.push(`secciones.${i}.bloques.${j}: ${mal} fila(s) no tienen ${b.columnas.length} celdas`)
    })
  })
  return malas
}

/**
 * VALIDA Y NORMALIZA. Devuelve `{ok:true, doc}` con los `id` completados y únicos, o
 * `{ok:false, errores}` en castellano llano. PURA — 0 llamadas a nada.
 */
export function validarDocumento(entrada) {
  const r = Documento.safeParse(entrada)
  if (!r.success) {
    return { ok: false, errores: r.error.issues.slice(0, 12).map((i) => `${i.path.join('.') || '(raíz)'}: ${i.message}`) }
  }
  const vistos = new Set()
  const secciones = r.data.secciones.map((s) => {
    // Un choque de ids NO se resuelve pisando: se numera, porque dos secciones con el mismo id
    // hacen que «actualizá la sección X» toque cualquiera de las dos. Es la MISMA regla que aplica
    // `documento-estructura.mjs` al releer, y por eso los ids coinciden a los dos lados.
    let id = idDeTitulo(s.titulo)
    if (vistos.has(id)) { let n = 2; while (vistos.has(`${id}_${n}`)) n++; id = `${id}_${n}` }
    vistos.add(id)
    return { ...s, id }
  })
  const doc = { ...r.data, secciones }
  const malas = tablasCuadradas(doc)
  if (malas.length) return { ok: false, errores: malas }
  return { ok: true, doc }
}

/** Las variables `{{clave}}` que quedaron sin resolver en un texto. PURA. */
export function variablesPendientes(texto) {
  return [...new Set(String(texto ?? '').match(/\{\{\s*[a-zA-Z0-9_.]+\s*\}\}/g) || [])]
    .map((v) => v.replace(/[{}\s]/g, ''))
}
