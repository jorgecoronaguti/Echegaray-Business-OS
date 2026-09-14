// LAS COTIZACIONES QUE ESTÁN COMO ARCHIVOS EN DRIVE, EN LA SOLAPA PRESUPUESTOS (dueño, 14/09/2026).
//
// «Mostrarlas en Presupuestos». Hasta hoy la solapa listaba sólo los presupuestos armados en el módulo
// (`cotizacion_cascada`); las cotizaciones de años de trabajo viven como Excel y PDF en la carpeta del
// cliente y se veían sólo en Documentos, mezcladas con planos y OC.
//
// ═══ UNA SOLA DEFINICIÓN DE «COTIZACIÓN» ═══
//
// Qué archivo es una cotización lo decide `categoriaDePapel`, la MISMA regla que clasifica la cara
// Documentos. Si esta lista tuviera su propio patrón, un archivo podría ser cotización en Presupuestos
// y «otro» en Documentos. Pura: la lectura de la carpeta es `getArchivosDeEntidad`, paginada.

import { categoriaDePapel } from './papelesDeObra.ts'
import type { ArchivoDeCarpeta } from '@/features/documentos/services/carpetaDeEntidad'

export interface CotizacionDeDrive {
  id: string
  nombre: string
  /** Dónde está dentro de la carpeta del cliente (`ADICIONAL/`), vacío si está en la raíz. */
  subcarpeta: string
  /** ISO de la última modificación en Drive, o null. */
  fecha: string | null
  href: string | null
  /** El texto que la hizo cotización: «nombre: «presupuesto»». Trazabilidad bajo demanda (title). */
  porque: string | null
}

/** Las cotizaciones de la carpeta del cliente, de la más nueva a la más vieja. Sin papelera ni ausentes. */
export function cotizacionesDeDrive(archivos: readonly ArchivoDeCarpeta[]): CotizacionDeDrive[] {
  return archivos
    .filter((a) => !a.trashed && !a.ausente_en_drive)
    .map((a) => ({ a, c: categoriaDePapel({ nombre: a.name, ruta: a.path ?? '' }) }))
    .filter(({ c }) => c.categoria === 'cotizacion')
    .map(({ a, c }) => ({
      id: a.drive_file_id,
      nombre: a.name,
      subcarpeta: a.subcarpeta,
      fecha: a.modified_time,
      href: a.web_view_link,
      porque: c.porque,
    }))
    .sort((x, y) => String(y.fecha ?? '').localeCompare(String(x.fecha ?? '')))
}
