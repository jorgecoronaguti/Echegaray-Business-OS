// DOCUMENTOS DE LA OBRA — el papel que la obra necesita, a un clic (diseño ERP Obras 14 · M17).
//
// ═══ TODO NUEVO (mandato del dueño, 23/09/2026) ═══
//
// Escritorio (14), de arriba abajo con `gap 26`: «Papeles del cliente» · el índice (banda de chips
// con buscador, grupos por para qué sirven, aside «Requiere atención» / «Últimos cambios») · los dos
// bloques del pie («Subidos desde acá» · «En la carpeta de Drive»). Teléfono (M17): papeles del
// cliente · pastillas · la lista · el pie «Drive: vinculada · N archivos» con «Subir documento».
//
// Las acciones de la cabecera («Vincular documento» · «Vincular carpeta» · «Abrir carpeta») las pone la
// página en `CabeceraDeObra` (`AccionesDocumentos`); `?vincular=archivo|carpeta` abre acá el formulario.
//
// ES UN ÍNDICE, NO UN REPOSITORIO: el archivo es la verdad en Drive; acá vive cuál de los 2.467
// archivos es el contrato de ESTA obra. Sin `'use client'`: los hijos con estado ya son cliente.

import type { AccionFormulario, ResultadoAccion } from '@/shared/components/ui'
import type { OrdenDetallada } from '@/features/clientes/services/ordenesCliente'
import type { Subidos } from '@/features/documentos/services/documentosSubidosService'
import type { ArchivosDeEntidad } from '@/features/documentos/services/carpetaDeEntidadService'
import type { Actividad, DocumentoObra, TipoDrive } from '../types'
import { PapelesDelCliente } from './documentos/PapelesDelCliente'
import { IndiceDocumentos } from './documentos/IndiceDocumentos'
import { BloquesInferiores } from './documentos/BloquesInferiores'
import { FormVincular } from './documentos/FormVincular'

export function TabDocumentos({
  obraId, documentos, carpetaDriveId, vincular, desvincular, actividades = [], asignarActividad, clasificar,
  ordenes = null, veEconomia = false, subidos = null, archivosDrive = null, vincularAbierto = null,
}: {
  obraId: string
  documentos: DocumentoObra[]
  /** `null` = no se pudieron leer, y eso NO se dibuja como «no hay ninguna». */
  ordenes?: OrdenDetallada[] | null
  /** El importe de una OC es el precio de venta de la obra: nace en false. */
  veEconomia?: boolean
  /** Sin actividades no se ofrece asignar: un desplegable vacío es peor que no tenerlo. */
  actividades?: Actividad[]
  asignarActividad?: (driveFileId: string, actividadId: string) => Promise<ResultadoAccion>
  /** `obra_canonica.drive_carpeta_id`. Null cuando nadie la declaró todavía. */
  carpetaDriveId: string | null
  vincular: AccionFormulario
  desvincular: (driveFileId: string) => Promise<ResultadoAccion>
  clasificar?: (driveFileId: string, categoria: string) => Promise<ResultadoAccion>
  /** Lo subido desde la ficha (`entidad_documento`). `null` = no se leyó. */
  subidos?: Subidos | null
  /** Lo que está en la carpeta de Drive según el catálogo. `null` = no se leyó. */
  archivosDrive?: ArchivosDeEntidad | null
  /** `?vincular=archivo|carpeta`: el formulario abierto arriba del índice. */
  vincularAbierto?: TipoDrive | null
}) {
  return (
    // El cuerpo del 14: `padding 22px 30px 32px` (el marco de la página pone 20 por lado y 24 abajo);
    // 16 por lado en el teléfono.
    <div className="-mx-1 flex flex-col gap-[14px] pt-0.5 md:mx-0 md:gap-[26px] md:px-2.5 md:pb-2 md:pt-2" data-testid="tab-documentos">
      {vincularAbierto && <FormVincular tipo={vincularAbierto} accion={vincular} />}
      <PapelesDelCliente ordenes={ordenes} veEconomia={veEconomia} />
      <IndiceDocumentos documentos={documentos} actividades={actividades}
        asignar={actividades.length > 0 ? asignarActividad : undefined} clasificar={clasificar} desvincular={desvincular} />
      <BloquesInferiores obraId={obraId} subidos={subidos} archivos={archivosDrive} documentos={documentos} carpetaDriveId={carpetaDriveId} />
    </div>
  )
}
