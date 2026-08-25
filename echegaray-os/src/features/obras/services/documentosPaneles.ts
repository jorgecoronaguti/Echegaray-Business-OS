// EL PANEL DERECHO DE DOCUMENTOS: «Requiere atención» y «Últimos cambios».
//
// ═══ LA REGLA DE ESTE ARCHIVO: SÓLO LO QUE LOS DATOS PRUEBAN ═══
//
// El canon dibuja cuatro avisos —«ART vencida», «Nómina vence el 31/08», «Plano eléctrico
// desactualizado», «Rev 3 cambió cantidades»—. Ninguno de los cuatro se puede calcular hoy:
// `obra_documento` tiene `obra_id, drive_file_id, rol, origen, tipo, mime_type, nombre, creado_en,
// creado_por, actividad_id`. **No hay vencimiento, no hay versión, no hay revisión.** Dibujar
// «ART vencida» con datos inventados sería exactamente la falla que las Reglas de Oro 1 y 2
// prohíben, y encima en el aviso que más rápido se cita en una reunión.
//
// Así que el panel muestra lo que SÍ es verificable contra las filas: cuántos papeles nadie
// clasificó, cuántos de ésos tienen una sugerencia lista para confirmar, y cuántos vínculos los
// dedujo el OS sin que una persona los afirmara. Es menos de lo que dibuja el canon y es la verdad.
// El resto queda declarado como pendiente del programa, no como hueco de esta pantalla.
//
// ═══ «DOCUMENTO SOLICITADO SIN ARCHIVO» NO APLICA ACÁ ═══
//
// La regla del repo —presente ⇒ archivo— vive en legajos, donde un documento se SOLICITA antes de
// existir. En `obra_documento` cada fila NACE de un archivo de Drive: no hay estado «solicitado»,
// así que no hay ningún faltante que detectar. Inventar una lista de papeles obligatorios por obra
// para poder mostrar faltantes sería fabricar el modelo de datos que justifica el aviso.

import type { DocumentoObra } from '../types'
import { SIN_CLASIFICAR, categoriaDeclarada } from './documentosCategoria.ts'
import { sugerirCategoria } from './documentosSugerencia.ts'

export interface AvisoDocumentos {
  clave: string
  titulo: string
  detalle: string
  n: number
  /** La categoría a la que lleva el aviso al tocarlo, o `null` si no lleva a ningún grupo. */
  vaA: string | null
  tono: 'warn' | 'nulo'
}

/**
 * LO QUE REQUIERE ATENCIÓN, calculado sobre las filas reales.
 *
 * Un aviso con `n === 0` NO se devuelve: la lista es trabajo pendiente, y «0 sin clasificar» no es
 * trabajo. El conteo en cero sí se muestra en el grupo y en el chip, donde significa otra cosa.
 */
export function requiereAtencion(documentos: DocumentoObra[]): AvisoDocumentos[] {
  const sinClasificar = documentos.filter((d) => categoriaDeclarada(d.rol) === SIN_CLASIFICAR)
  const conSugerencia = sinClasificar.filter((d) => sugerirCategoria(d.name, d.mime_type) !== null)
  // `origen` distingue HECHO de INFERENCIA: `confirmado` es una persona que afirmó que este archivo
  // es de esta obra. Los otros dos los dedujo el OS —por la ruta o por la carpeta— y nadie los
  // revisó todavía.
  const sinConfirmar = documentos.filter((d) => d.origen !== 'confirmado')

  const avisos: AvisoDocumentos[] = [
    {
      clave: 'sin-clasificar',
      titulo: `${sinClasificar.length} sin clasificar`,
      detalle: 'nadie dijo para qué sirven',
      n: sinClasificar.length,
      vaA: SIN_CLASIFICAR,
      tono: 'warn',
    },
    {
      clave: 'sugerencias',
      titulo: `${conSugerencia.length} con categoría sugerida`,
      detalle: 'un clic las confirma',
      n: conSugerencia.length,
      vaA: SIN_CLASIFICAR,
      tono: 'nulo',
    },
    {
      clave: 'sin-confirmar',
      titulo: `${sinConfirmar.length} sin confirmar`,
      detalle: 'el vínculo lo dedujo el OS, no lo afirmó una persona',
      n: sinConfirmar.length,
      vaA: null,
      tono: 'nulo',
    },
  ]
  return avisos.filter((a) => a.n > 0)
}

export interface CambioDocumento {
  driveFileId: string
  nombre: string
  /** ISO. Es `modified_time` de Drive, nunca `creado_en`: ver el comentario de abajo. */
  cuando: string
  categoria: string
}

/**
 * ÚLTIMOS CAMBIOS — por `modified_time`, que es cuándo cambió el ARCHIVO en Drive.
 *
 * NO se mezcla con `creado_en`, que es cuándo se creó el VÍNCULO en el OS. Son dos ventanas de
 * tiempo distintas (Regla de Oro 3): un contrato de mayo vinculado ayer aparecería como «cambio de
 * ayer» y quien lo lea va a creer que el contrato se tocó ayer. Un papel sin `modified_time` —el
 * archivo no está en el índice de Drive— **no aparece**: no se completa con la fecha del vínculo.
 */
export function ultimosCambios(documentos: DocumentoObra[], cuantos = 5): CambioDocumento[] {
  return documentos
    .filter((d): d is DocumentoObra & { modified_time: string } => Boolean(d.modified_time))
    .sort((a, b) => b.modified_time.localeCompare(a.modified_time))
    .slice(0, cuantos)
    .map((d) => ({
      driveFileId: d.drive_file_id,
      nombre: d.name ?? d.drive_file_id,
      cuando: d.modified_time,
      categoria: categoriaDeclarada(d.rol),
    }))
}
