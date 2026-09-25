// DOCUMENTOS DE LA OBRA — lo que se dibuja, derivado de los datos (diseño ERP Obras 14 · M17, 23/09/2026).
//
// Módulo PURO, sin alias `@/`, para `node --test`. Decide los textos de cada fila del índice, de los
// papeles del cliente y de los dos bloques de abajo; el componente sólo dibuja. NULL nunca es 0.

import type { DocumentoObra } from '../types/index.ts'
import { CATEGORIAS, SIN_CLASIFICAR, categoriaDeclarada } from './documentosCategoria.ts'
import { diaMesAnio } from './operacionCanon.ts'

/** Cómo se lee cada origen (columna «Relación» del 14). Un mapa: un cuarto origen no puede caer en «Inferido». */
export const RELACION: Record<DocumentoObra['origen'], string> = {
  confirmado: 'Confirmado', carpeta_drive: 'Carpeta de Drive', inferido: 'Inferido',
}

/** «PDF · 02 Planos/Estructura» · «Foto · raíz de la carpeta» · «Hoja de cálculo». */
export function sublineaArchivo(tipoEtiqueta: string, path: string | null, prefijo = '', nombre: string | null = null): string {
  if (path == null) return tipoEtiqueta
  const p = rutaCorta(path, prefijo, nombre)
  return p === '' ? `${tipoEtiqueta} · raíz de la carpeta` : `${tipoEtiqueta} · ${p}`
}

const tramos = (p: string) => p.trim().replace(/^\/+|\/+$/g, '').split('/').filter(Boolean)

/**
 * La carpeta que tienen en común todas las rutas de la obra: la carpeta de la obra en Drive
 * («administracion/PRESUPUESTOS - CLIENTES/FRANCO QUATTROPANI»). Se descuenta de cada ruta.
 */
export function prefijoComun(paths: readonly (string | null)[]): string {
  const listas = paths.filter((p): p is string => p != null && p.trim() !== '').map(tramos)
  if (listas.length < 2) return ''
  const base: string[] = []
  for (let i = 0; i < listas[0].length; i++) {
    const t = listas[0][i]
    if (listas.every((l) => l[i] === t)) base.push(t); else break
  }
  return base.join('/')
}

/**
 * 14: la ruta RELATIVA a la carpeta de la obra, corta («02 Planos/Estructura»), no la entera
 * («administracion/PRESUPUESTOS - CLIENTES/FRANCO QUATTR…»). Más de dos niveles: «…/» + los dos últimos.
 */
export function rutaCorta(path: string, prefijo = '', nombre: string | null = null): string {
  let t = tramos(path)
  // El índice guarda la ruta CON el archivo al final («COTIZACION INTERNA/Cotizacion Final.xlsm»): la
  // sublínea dice la carpeta, el nombre ya está arriba.
  if (nombre && t.length > 0 && t[t.length - 1] === nombre.trim()) t = t.slice(0, -1)
  const pre = tramos(prefijo)
  if (pre.length && pre.every((x, i) => t[i] === x)) t = t.slice(pre.length)
  if (t.length > 2) return `…/${t.slice(-2).join('/')}`
  return t.join('/')
}

/**
 * La columna «Actividad» del 14: el nombre cuando cuelga de una; «la obra» para el contrato, que es
 * de la obra entera y no de una actividad; «sin asignar» para el resto.
 */
export function actividadDelPapel(d: Pick<DocumentoObra, 'actividad_id' | 'rol'>, nombreDe: (id: string) => string | null): { texto: string; asignada: boolean } {
  if (d.actividad_id) return { texto: nombreDe(d.actividad_id) ?? 'actividad fuera de la lista', asignada: true }
  if (categoriaDeclarada(d.rol) === CATEGORIAS.CONTRATO) return { texto: 'la obra', asignada: false }
  return { texto: 'sin asignar', asignada: false }
}

/** El resumen a la derecha de la cabecera de un grupo: «2 sin confirmar» (warn) · «4 confirmados» · «7 para clasificar». */
export function resumenGrupo(categoria: string, docs: Pick<DocumentoObra, 'origen'>[]): { texto: string; alerta: boolean } | null {
  if (docs.length === 0) return null
  if (categoria === SIN_CLASIFICAR) return { texto: `${docs.length} para clasificar`, alerta: true }
  const sinConfirmar = docs.filter((d) => d.origen !== 'confirmado').length
  return sinConfirmar > 0 ? { texto: `${sinConfirmar} sin confirmar`, alerta: true } : { texto: `${docs.length} confirmados`, alerta: false }
}

/** «Requiere atención» del aside (14): dos números y la línea que dice que no hay columna de vencimientos. */
export function requiereAtencion(docs: Pick<DocumentoObra, 'origen' | 'rol'>[]) {
  return {
    sinClasificar: docs.filter((d) => categoriaDeclarada(d.rol) === SIN_CLASIFICAR).length,
    sinConfirmar: docs.filter((d) => d.origen !== 'confirmado').length,
  }
}

/** «Últimos cambios»: `dd/mm · nombre`, por `modified_time` de Drive (nunca `creado_en`: es otra ventana). */
export function ultimosCambios(docs: Pick<DocumentoObra, 'drive_file_id' | 'name' | 'modified_time'>[], cuantos = 3) {
  return docs
    .filter((d): d is typeof d & { modified_time: string } => Boolean(d.modified_time))
    .sort((a, b) => b.modified_time.localeCompare(a.modified_time))
    .slice(0, cuantos)
    .map((d) => ({ id: d.drive_file_id, fecha: `${d.modified_time.slice(8, 10)}/${d.modified_time.slice(5, 7)}`, nombre: d.name ?? d.drive_file_id }))
}

// ═══ PAPELES DEL CLIENTE ═══

export type ClaseOrden = 'oc' | 'op'

/** «Orden de compra» · «Orden de pago». */
export const ROTULO_ORDEN: Record<ClaseOrden, string> = { oc: 'Orden de compra', op: 'Orden de pago' }

/** «OC 2266» · «OP 5146» · «OC s/n». */
export function numeroOrden(clase: ClaseOrden, numeroCorto: string | null): string {
  return `${clase.toUpperCase()} ${numeroCorto ?? 's/n'}`
}

/** «· retención 5146 adjunta» sólo cuando la OP trae su comprobante. */
export function retencionAdjunta(numeroCorto: string | null, nRetenciones: number): string | null {
  if (nRetenciones === 0) return null
  return `· retención ${numeroCorto ?? 's/n'} adjunta`
}

/** «PDF en Drive» cuando la copia está subida; «PDF en el OS» cuando se abre por el proxy. */
export const dondeVive = (driveFileId: string | null): string => (driveFileId ? 'PDF en Drive' : 'PDF en el OS')

/** La fecha entera del papel, o «sin fecha». */
export const fechaPapel = (iso: string | null): string => diaMesAnio(iso) ?? 'sin fecha'

// ═══ EN LA CARPETA DE DRIVE ═══

/** «61 archivos · 38 vinculados · del catálogo, no de Drive en vivo». */
export function metaCarpeta(nArchivos: number, nVinculados: number, truncado: boolean): string {
  const base = `${nArchivos}${truncado ? '+' : ''} archivos · ${nVinculados} vinculados · del catálogo, no de Drive en vivo`
  return base
}

/** Cuántos archivos de la carpeta están vinculados a la obra (por `drive_file_id`). */
export function contarVinculados(archivos: { drive_file_id: string }[], docs: { drive_file_id: string }[]): number {
  const ids = new Set(docs.map((d) => d.drive_file_id))
  return archivos.filter((a) => ids.has(a.drive_file_id)).length
}

/** El pie del M17: «Drive: vinculada · 61 archivos» o «Drive: sin vincular». */
export function pieDriveTelefono(carpetaDriveId: string | null, nArchivos: number | null): { estado: string; resto: string | null } {
  if (!carpetaDriveId) return { estado: 'sin vincular', resto: null }
  return { estado: 'vinculada', resto: nArchivos == null ? null : `${nArchivos} archivos` }
}
