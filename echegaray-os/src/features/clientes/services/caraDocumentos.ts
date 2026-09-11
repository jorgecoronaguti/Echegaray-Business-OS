// LA CARA DOCUMENTOS DE LA FICHA — UNA estructura, no cinco bloques apilados.
//
// Dueño (11/09/2026 17:50): «el crm dice documentos de drive (0) y está pésimo eso, arreglar» ·
// «no se entiende nada realmente la UX de esa sección documentos».
//
// ═══ QUÉ HABÍA ═══
//
// Cinco bloques de primer nivel, todos con el mismo peso visual y ninguno explicando su relación con
// los otros: los papeles por tipo del OS, un rótulo «Documentos de Drive · N» que podía decir 0 con
// 226 archivos abajo, los vínculos manuales, los documentos subidos y el índice de la carpeta del
// cliente. El mismo PDF podía estar en tres.
//
// ═══ QUÉ HAY ═══
//
// UN árbol: OBRA MAYOR → sus ADICIONALES → CATEGORÍA → ARCHIVO. Y al final, sólo si tienen algo,
// tres secciones que dicen QUÉ LES FALTA: los papeles sin obra, los vínculos hechos a mano y los
// archivos de la carpeta del cliente que ninguna obra reclama.
//
// ═══ UN ARCHIVO NO SE DIBUJA DOS VECES ═══
//
// La clave de identidad es el `drive_file_id`, y cuando no hay, el id del papel del OS. El mismo PDF
// llega por DOS caminos —`obra_papel_drive` lo ve en la carpeta y `cliente_orden` lo tiene atado
// como OC— y GANA EL DEL OS: trae el número de orden y el importe, que es lo que el dueño busca
// cuando abre esta cara. El de Drive se descarta ANTES de contar, así que el número de la solapa y
// las filas no pueden discrepar.

import type { DocumentoCliente } from '../types/index.ts'
import type { PapelesDelCliente } from './papelesCliente.ts'
import { hrefDelPapel, urlDriveDelPapel } from './papelesCliente.ts'
import {
  CATEGORIAS, categoriaDePapel, type Categoria, type PapelesDeUnaObra,
} from './papelesDeObra.ts'

/** De dónde salió el archivo. Cambia la marca de la fila, no su lugar. */
export type FuenteDelArchivo = 'drive' | 'os'

export interface ArchivoDeLaCara {
  /** La identidad para no dibujarlo dos veces: el id de Drive, o el del papel del OS si no está. */
  clave: string
  nombre: string
  href: string
  /** ISO. `null` = la fuente no la publica. */
  fecha: string | null
  tamano: number | null
  fuente: FuenteDelArchivo
  categoria: Categoria
  /** El texto que sostiene la clasificación. `null` = «Otros», que no inventa motivo. */
  porque: string | null
  /** Es el papel del que sale el precio contratado de la obra (`obra_contrato`). */
  aceptada: boolean
  /** Con qué evidencia se ató a la obra. */
  via: string | null
}

export interface GrupoDeLaCara {
  clave: Categoria
  rotulo: string
  archivos: ArchivoDeLaCara[]
}

export interface ObraDeLaCara {
  obra_id: string
  nombre: string
  nivel: 0 | 1
  esAdicional: boolean
  huerfano: boolean
  /** `false` = el OS no sabe qué carpeta de Drive es de este trabajo. NO es «no tiene papeles». */
  tieneCarpeta: boolean
  /** El enlace para abrir la carpeta en Drive. `null` = no hay carpeta vinculada. */
  carpetaHref: string | null
  total: number
  grupos: GrupoDeLaCara[]
}

export interface CaraDocumentos {
  obras: ObraDeLaCara[]
  /** Papeles del OS que no se pudieron atribuir a ninguna obra. Es trabajo pendiente, se muestra. */
  sinObra: GrupoDeLaCara[]
  nSinObra: number
  /** Vínculos manuales (`cliente_documento`) que no salieron por ningún otro camino. */
  vinculados: DocumentoCliente[]
  /** Archivos de la carpeta del CLIENTE que ninguna obra reclama. */
  carpetaDelCliente: ArchivoDeLaCara[]
  /** TODO lo que se dibuja. Es el número de la solapa: el N y las filas no pueden discrepar. */
  total: number
}

const ROTULO = new Map(CATEGORIAS.map((c) => [c.clave, c.rotulo]))

/** Agrupa por categoría respetando el orden canónico, y tira las categorías vacías. */
function agrupar(archivos: ArchivoDeLaCara[]): GrupoDeLaCara[] {
  const grupos: GrupoDeLaCara[] = []
  for (const { clave, rotulo } of CATEGORIAS) {
    const suyos = archivos.filter((a) => a.categoria === clave)
    if (suyos.length) grupos.push({ clave, rotulo, archivos: suyos })
  }
  return grupos
}

/** Un papel del OS —una OC, una OP— con la forma de la fila. */
function deOrden(o: {
  clave: string; numeroCorto: string | null; clase: 'oc' | 'op'; fecha: string | null
  archivoId: string; driveFileId?: string | null
}): ArchivoDeLaCara {
  // EL NOMBRE NO LLEVA LA FECHA: la fila tiene su propia columna de fecha, y repetirla adentro del
  // nombre es la mezcla de diseño que el dueño ya marcó una vez. Tampoco se importa el formateador
  // de `@/shared`: `node --test` no resuelve el alias y este archivo tiene que poder probarse solo.
  const nombre = `${o.clase === 'oc' ? 'OC' : 'OP'} ${o.numeroCorto ?? 's/n'}`
  return {
    clave: o.driveFileId ?? `os:${o.archivoId}`,
    nombre,
    href: hrefDelPapel({ driveFileId: o.driveFileId, archivoId: o.archivoId }),
    fecha: o.fecha,
    tamano: null,
    fuente: 'os',
    categoria: 'oc',
    porque: `papel del OS: orden de ${o.clase === 'oc' ? 'compra' : 'pago'}`,
    aceptada: false,
    via: null,
  }
}

/**
 * LA CARA ENTERA, armada una vez.
 *
 * `papelesObra` ya viene agrupado por `papelesPorObra()`; acá se le suman los papeles del OS de la
 * misma obra y se descartan los duplicados. El orden de las obras lo decide quien llama
 * (`jerarquiaDeObras`), que es el mismo que dibuja la lista de Trabajos.
 */
export function armarCaraDocumentos({
  filas, papelesObra, papelesCliente, documentos, archivosDelCliente, carpetas,
}: {
  filas: { obra_id: string; nombre: string; nivel: 0 | 1; esAdicional: boolean; huerfano: boolean }[]
  papelesObra: Map<string, PapelesDeUnaObra>
  papelesCliente: PapelesDelCliente | null
  documentos: DocumentoCliente[]
  archivosDelCliente: {
    drive_file_id: string; name: string | null; path: string | null
    size_bytes: number | null; modified_time: string | null; web_view_link: string | null
  }[]
  /** obra_id → enlace de su carpeta en Drive. */
  carpetas: Map<string, string | null>
}): CaraDocumentos {
  /** Todo lo ya dibujado, para que nada salga dos veces. */
  const dibujados = new Set<string>()

  const obras: ObraDeLaCara[] = filas.map((f) => {
    const delOs: ArchivoDeLaCara[] = []
    const resumen = papelesCliente?.porObra.get(f.obra_id)
    // LOS PAPELES DEL OS PRIMERO: si el mismo PDF está también en la carpeta, gana éste, que trae el
    // número de la orden.
    for (const o of [...(resumen?.oc ?? []), ...(resumen?.op ?? [])]) {
      const fila = deOrden(o)
      if (dibujados.has(fila.clave)) continue
      dibujados.add(fila.clave)
      if (o.driveFileId) dibujados.add(o.driveFileId)
      delOs.push(fila)
    }

    const deDrive: ArchivoDeLaCara[] = []
    for (const p of papelesObra.get(f.obra_id)?.grupos.flatMap((g) => g.papeles) ?? []) {
      if (dibujados.has(p.drive_file_id)) continue
      dibujados.add(p.drive_file_id)
      deDrive.push({
        clave: p.drive_file_id,
        nombre: p.nombre,
        href: p.web_view_link ?? urlDriveDelPapel(p.drive_file_id),
        fecha: p.modified_time,
        tamano: p.size_bytes,
        fuente: 'drive',
        categoria: p.categoria,
        porque: p.porque,
        aceptada: p.aceptada,
        via: p.via,
      })
    }

    const todos = [...delOs, ...deDrive]
    return {
      obra_id: f.obra_id,
      nombre: f.nombre,
      nivel: f.nivel,
      esAdicional: f.esAdicional,
      huerfano: f.huerfano,
      tieneCarpeta: papelesObra.get(f.obra_id)?.tieneCarpeta ?? false,
      carpetaHref: carpetas.get(f.obra_id) ?? null,
      total: todos.length,
      grupos: agrupar(todos),
    }
  })

  // LO QUE NO LLEGÓ A NINGUNA OBRA. Se muestra igual: es trabajo pendiente de atribución, y
  // esconderlo es cómo una OP de $15 M deja de existir para el que mira esta pantalla.
  const sueltos: ArchivoDeLaCara[] = []
  for (const o of [...(papelesCliente?.sinObra.oc ?? []), ...(papelesCliente?.sinObra.op ?? [])]) {
    const fila = deOrden(o)
    if (dibujados.has(fila.clave)) continue
    dibujados.add(fila.clave)
    if (o.driveFileId) dibujados.add(o.driveFileId)
    sueltos.push(fila)
  }

  // LOS VÍNCULOS HECHOS A MANO que no salieron por ningún otro camino.
  const vinculados = documentos.filter((d) => {
    if (dibujados.has(d.drive_file_id)) return false
    dibujados.add(d.drive_file_id)
    return true
  })

  // LA CARPETA DEL CLIENTE: lo que ninguna obra reclama.
  const carpetaDelCliente: ArchivoDeLaCara[] = []
  for (const a of archivosDelCliente ?? []) {
    if (dibujados.has(a.drive_file_id)) continue
    dibujados.add(a.drive_file_id)
    const nombre = a.name ?? a.drive_file_id
    const { categoria, porque } = categoriaDePapel({ nombre, ruta: a.path ?? '' })
    carpetaDelCliente.push({
      clave: a.drive_file_id,
      nombre,
      href: a.web_view_link ?? urlDriveDelPapel(a.drive_file_id),
      fecha: a.modified_time,
      tamano: a.size_bytes,
      fuente: 'drive',
      categoria,
      porque,
      aceptada: false,
      via: null,
    })
  }

  return {
    obras,
    sinObra: agrupar(sueltos),
    nSinObra: sueltos.length,
    vinculados,
    carpetaDelCliente,
    total: obras.reduce((a, o) => a + o.total, 0) + sueltos.length + vinculados.length
      + carpetaDelCliente.length,
  }
}

export { ROTULO as ROTULO_DE_CATEGORIA }
