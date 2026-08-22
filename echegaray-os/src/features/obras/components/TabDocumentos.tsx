// DOCUMENTOS DE LA OBRA — el papel que la obra necesita, a un clic, sin salir del OS.
//
// ═══ LA FORMA LA FIJA EL HANDOFF APROBADO (design/screens/obras.md §1g) ═══
//
//   Carpeta de Drive de la obra + `Vincular documento` + primaria `Abrir carpeta`.
//   Tabla: Nombre | Tipo | Relación | Actividad | Fecha. Sin clasificar en `warn`; sin actividad
//   en `faint`. Los archivos NO SE COPIAN: se vinculan.
//
// Eran N tablas, una por categoría, cada una en su caja. Ahora es UNA tabla con la categoría como
// columna «Tipo» y las filas ordenadas por esa misma categoría: la agrupación se sigue leyendo —
// el orden es el del ciclo de vida de la obra, con «Sin clasificar» al final— sin cobrar un
// encabezado y un borde por cada grupo.
//
// ═══ QUÉ ES ESTA PANTALLA Y QUÉ NO ES ═══
//
// Es un ÍNDICE, no un repositorio. El contrato, los planos y el presupuesto viven en Drive con sus
// permisos y su historial de versiones; acá vive la respuesta a "¿cuál de los 2.467 archivos del
// Drive es el contrato de ESTA obra?", que hoy sólo está en la cabeza de alguien. Por eso el nombre
// es un enlace y no un visor: el clic termina en Drive, que es donde el archivo es la verdad.
//
// ═══ LA COLUMNA RELACIÓN ═══
//
// «Confirmado» = una persona afirmó que este archivo es de esta obra. «Inferido» = lo dedujo el OS
// por la ruta del archivo. Es la misma distinción HECHO vs INFERENCIA que gobierna todo el resto
// del sistema, y va en la tabla y no en un tooltip porque cambia cuánto vale lo que se está mirando.
// Ninguno de los dos lleva color: no son un problema ni un logro, son el nivel de certeza.

import {
  BotonAccion, FormAccion, type AccionFormulario, type ResultadoAccion,
} from '@/shared/components/ui'
import {
  BotonEnlace, CAMPO, Campo, Nulo, Tabla, Td, Th, THead, Tr, Vacio,
} from '@/shared/components/ds'
import type { Actividad, DocumentoObra, TipoDrive } from '../types'
import { AsignarActividad } from './AsignarActividad'
import { etiquetaDeTipo, urlDeDrive } from '../services/driveUrl'
import { CATEGORIAS_SUGERIDAS, SIN_CLASIFICAR, porCategoria } from '../services/documentosCategoria'
import { fecha as fmtFecha } from './formato'

/** Cómo se lee cada origen. Un mapa y no un ternario: el día que se agregue un cuarto, el ternario
 *  lo dibujaría como «Inferido» sin que nadie lo note. */
const ORIGEN: Record<DocumentoObra['origen'], string> = {
  confirmado: 'Confirmado',
  carpeta_drive: 'Carpeta de Drive',
  inferido: 'Inferido',
}

/**
 * El alta, plegada. Hay DOS y no una: el handoff dibuja un solo «Vincular documento», pero un id de
 * Drive pelado no dice si es un archivo o una carpeta, y abrir un id de carpeta como archivo da 404
 * (ver `driveUrl.ts`). Preguntar cuál es al elegir el formulario cuesta un clic; adivinarlo cuesta
 * un vínculo roto que nadie descubre hasta tres semanas después.
 */
function Vincular({
  tipo, accion, testid,
}: {
  tipo: TipoDrive
  accion: AccionFormulario
  testid: string
}) {
  const esCarpeta = tipo === 'carpeta'
  return (
    <details className="w-full min-w-0 sm:w-auto" data-testid={testid}>
      <summary className="cursor-pointer select-none text-[12.5px] text-muted hover:text-ink">
        Vincular {esCarpeta ? 'carpeta' : 'documento'}
      </summary>
      <div className="mt-3 w-full border-t border-[#EFEEEA] pt-3.5 sm:w-[440px]">
        <FormAccion accion={accion} testid={`${testid}-form`} enviar="Vincular" limpiarAlOk mensajeOk="Vinculado.">
          {/* El tipo viaja en el formulario y el `obra_id` NO: uno es una preferencia de quien
              carga, el otro decide sobre qué obra se escribe. */}
          <input type="hidden" name="tipo" value={tipo} />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Campo
              rotulo={esCarpeta ? 'Enlace de la carpeta' : 'Enlace del archivo'}
              className="sm:col-span-3"
              ayuda="El que da el botón Compartir de Drive. También sirve el id."
            >
              <input
                name="enlace"
                required
                maxLength={500}
                placeholder={esCarpeta
                  ? 'https://drive.google.com/drive/folders/…'
                  : 'https://drive.google.com/file/d/…'}
                className={CAMPO}
              />
            </Campo>
            <Campo rotulo="Nombre" className="sm:col-span-2" ayuda="Sólo si el archivo no está en el índice de Drive.">
              <input name="nombre" maxLength={300} className={CAMPO} />
            </Campo>
            <Campo rotulo="Qué es" ayuda="Contrato, plano, acta…">
              <input name="rol" maxLength={120} list="categorias-documento-obra" className={CAMPO} />
              <datalist id="categorias-documento-obra">
                {CATEGORIAS_SUGERIDAS.map((c) => <option key={c} value={c} />)}
              </datalist>
            </Campo>
          </div>
        </FormAccion>
      </div>
    </details>
  )
}

export function TabDocumentos({
  documentos, carpetaDriveId, vincular, desvincular, actividades = [], asignarActividad,
}: {
  documentos: DocumentoObra[]
  /** El cronograma vivo, para poder decir de qué actividad es un papel. Sin él no se dibuja el
   *  desplegable: uno vacío es peor que no tenerlo. */
  actividades?: Actividad[]
  asignarActividad?: (driveFileId: string, actividadId: string) => Promise<ResultadoAccion>
  /** `obra_canonica.drive_carpeta_id`. Null en las ocho obras de hoy: nadie la declaró todavía. */
  carpetaDriveId: string | null
  vincular: AccionFormulario
  desvincular: (driveFileId: string) => Promise<ResultadoAccion>
}) {
  const asignar = actividades.length > 0 ? asignarActividad : undefined
  // El orden de las categorías se conserva —es el del ciclo de vida de la obra, con «Sin
  // clasificar» al final— y se aplana: la agrupación es el ORDEN, no N tablas.
  const filas = porCategoria(documentos).flatMap((g) => g.docs.map((d) => ({ categoria: g.categoria, d })))

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        <span className="text-[13px] text-muted">
          Carpeta de la obra en Drive:{' '}
          {carpetaDriveId
            ? <span className="text-ink">vinculada</span>
            : <Nulo>sin vincular · se carga en Resumen › Editar la obra</Nulo>}
        </span>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-3 sm:ml-auto">
          <Vincular tipo="archivo" accion={vincular} testid="vincular-archivo" />
          <Vincular tipo="carpeta" accion={vincular} testid="vincular-carpeta" />
          {/* LA PRIMARIA DE LA PANTALLA. Sólo existe cuando hay carpeta declarada: un botón que
              lleva a ningún lado es peor que no tener botón. */}
          {carpetaDriveId && (
            <BotonEnlace
              href={`https://drive.google.com/drive/folders/${carpetaDriveId}`}
              variante="primaria"
              target="_blank"
              rel="noreferrer"
              data-testid="abrir-carpeta-obra"
            >
              Abrir carpeta
            </BotonEnlace>
          )}
        </div>
      </div>

      {filas.length === 0 ? (
        <Vacio>
          Todavía no hay ningún documento vinculado a esta obra. Se vincula pegando el enlace que da
          el botón Compartir de Drive.
        </Vacio>
      ) : (
        <>
          <Tabla testid="tabla-documentos" minWidth={900}>
            <THead>
              <Th>Nombre</Th><Th>Tipo</Th><Th>Relación</Th>
              {asignar && <Th>Actividad</Th>}
              <Th num>Fecha</Th><Th num />
            </THead>
            <tbody>
              {filas.map(({ categoria, d }) => (
                <Tr key={d.drive_file_id} className="group" {...{ 'data-testid': 'fila-documento-obra' }}>
                  <Td fuerte className="max-w-[320px]">
                    <a
                      href={urlDeDrive(d.drive_file_id, d.tipo)}
                      target="_blank"
                      rel="noreferrer"
                      data-testid="documento-enlace"
                      className="block truncate text-[13px] text-ink hover:underline"
                    >
                      {/* Sin nombre se muestra el id: es feo y es la verdad. Un rótulo inventado
                          sería peor que feo. */}
                      {d.name ?? d.drive_file_id}
                    </a>
                    <span className="block truncate text-[11px] text-faint">
                      {etiquetaDeTipo(d.tipo, d.mime_type, d.name)}
                      {d.path ? ` · ${d.path}` : ''}
                    </span>
                  </Td>
                  {/* TIPO ES LO QUE UNA PERSONA DECLARÓ que es el papel, no su formato: el formato
                      va bajo el nombre. Lo que nadie clasificó se marca en `warn` porque es trabajo
                      pendiente, no una característica del archivo. */}
                  <Td className={categoria === SIN_CLASIFICAR ? 'text-warn' : ''}>
                    {categoria === SIN_CLASIFICAR ? 'sin clasificar' : categoria}
                  </Td>
                  {/* TRES ORÍGENES Y NO DOS: «carpeta de Drive» es evidencia dura —el archivo vive
                      adentro de la carpeta que declara la obra— pero ninguna persona lo afirmó.
                      Llamarlo «Confirmado» borraría justo lo que hay que poder revisar. */}
                  <Td>{ORIGEN[d.origen] ?? 'Inferido'}</Td>
                  {asignar && (
                    <Td>
                      <AsignarActividad
                        driveFileId={d.drive_file_id}
                        actual={d.actividad_id}
                        actividades={actividades}
                        asignar={asignar}
                      />
                    </Td>
                  )}
                  <Td num className="whitespace-nowrap text-muted">
                    {d.modified_time ? fmtFecha(d.modified_time) : <Nulo>sin fecha</Nulo>}
                  </Td>
                  <Td num>
                    {/* Cortar el vínculo aparece al apoyar el mouse: es la acción menos frecuente
                        de la fila y no compite con el nombre del papel. */}
                    <span className="opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                      <BotonAccion
                        accion={desvincular}
                        args={[d.drive_file_id]}
                        testid="desvincular-documento"
                        tono="peligro"
                      >
                        Quitar
                      </BotonAccion>
                    </span>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Tabla>
          <p className="text-[11.5px] leading-relaxed text-faint">
            Los papeles se leen de Drive: acá se clasifican y se cuelgan de la actividad que los usa.
            Nada se copia — quitar un documento corta el vínculo, no borra el archivo.
          </p>
        </>
      )}
    </div>
  )
}
