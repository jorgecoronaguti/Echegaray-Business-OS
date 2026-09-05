// DOCUMENTOS DEL CLIENTE — el papel de la relación, a un clic, sin salir del OS.
//
// ═══ QUÉ ES ESTA PANTALLA Y QUÉ NO ES ═══
//
// Es un ÍNDICE, no un repositorio. El contrato, el pliego y el presupuesto viven en Drive con sus
// permisos y su historial de versiones; acá vive la respuesta a «¿cuál de los 2.467 archivos del
// Drive es el contrato de ESTE cliente?». Por eso el nombre es un enlace y no un visor: el clic
// termina en Drive, que es donde el archivo es la verdad. NUNCA se copia un byte.
//
// ═══ CLASIFICAR ES LO QUE VUELVE ÚTIL UNA LISTA DE 214 VÍNCULOS ═══
//
// Sin el «para qué sirve», la pregunta se contesta abriéndolos de a uno. El vocabulario es cerrado
// —contrato, presupuesto, plano…— porque escrito a mano el mismo contrato entra como «contrato»,
// «Contrato» y «cto», y la clasificación deja de servir para buscar.
//
// «SIN CLASIFICAR» VA EN `warn` (Design Handoff V2). No es decoración: un archivo sin rol es un
// archivo que la búsqueda no va a encontrar nunca, y el ámbar es lo que hace que alguien lo
// clasifique. Es la definición de `warn` del sistema —*dato faltante que bloquea*—, no un error.
//
// ═══ POR QUÉ VINCULAR ES INLINE Y NO UN PANEL ═══
//
// Vincular es pegar una dirección y apretar un botón. Un panel lateral para dos campos convierte una
// acción de cuatro segundos en una interrupción, y la interrupción es lo que hace que nadie vincule
// nada y el índice quede vacío para siempre. Panel lateral es para edición compleja.

import Link from 'next/link'
import { Fragment } from 'react'
import { Nulo, Vacio } from '@/shared/components/ds'
import { Campo, CTRL, FormAccion, type AccionFormulario, type ResultadoAccion } from '@/shared/components/ui'
import { CAJA_CONTENIDO, ENCABEZADO, FILO_ELEGIDA, RotuloCol, V } from '@/shared/components/v2/patron'
import { IconoDocumento } from '@/shared/components/iconos'
import { urlDeDrive } from '@/features/obras/services/driveUrl'
import { fecha } from '@/features/obras/components/formato'
import { ROLES_DOCUMENTO, type DocumentoCliente } from '../types'
import { SelectRolDocumento } from './SelectRolDocumento'
import {
  AbrirAcciones, AccionesDocumento, LineaDeAccionesEnGrilla, NotaDeAccion,
} from './AccionesContacto'

// ═══ POR QUÉ EL RECORD MUESTRA OCHO Y NO SESENTA (19/08/2026) ═══
//
// Con las cinco solapas, Documentos era una pantalla entera y sesenta filas eran su contenido. En el
// record de una sola pantalla, sesenta filas empujan la actividad y las obras fuera de la vista: el
// bloque más lleno del cliente más cargado se comería el record de todos los demás. Se muestran los
// más recientes y el resto está a un clic, con el TOTAL dicho al lado — recortar en silencio sería
// el mismo defecto que omitir un evento sin contarlo.
//
// Más allá del tope grande la lista deja de ser un índice y hay que ir a Drive.
const TOPE = 8
const TOPE_TODO = 60

// ═══ LA GRILLA DEL HANDOFF, Y POR QUÉ ESTA LISTA DEJÓ DE SER UNA `<table>` ═══
//
// `minmax(250px,2fr) 180px 150px 110px 28px` con `gap:28px`
// (`CRM · Clientes · una pantalla.dc.html:171`). Una `<table>` no sabe decir `minmax()` ni `fr`:
// con anchos en `px` la columna del nombre no crece con la pantalla, que es justo la que tiene que
// crecer —el nombre del archivo es lo único que identifica la fila—. Además las otras dos caras de
// esta misma ficha (Obras, Presupuestos) ya son grillas del v2: tener dos sistemas de tabla en la
// misma pantalla era parte de lo que el dueño ve como «no hay exactitud».
//
// 250+180+150+110+28 + 4×28 = 830px útiles ⇒ 1223px de viewport con el costado puesto. Debajo de
// eso, las mismas cinco columnas con las pistas elásticas y la mitad del aire.
const COLS_DOCS
  = 'gap-[14px] grid-cols-[minmax(0,1.6fr)_minmax(0,120px)_minmax(0,1fr)_72px_28px]'
  + ' min-[1240px]:gap-[28px] min-[1240px]:grid-cols-[minmax(250px,2fr)_180px_150px_110px_28px]'

/** La sangría del handoff (`dc.html:171`, `padding-left:16px`). */
const SANGRIA = 16

export function BloqueDocumentos({
  documentos, carpetaDriveId, vincular, clasificar, desvincular, puedeEditar = true,
  todo = false, urlTodo, urlPoco, menuAbierto = null, urlMenuDe,
}: {
  documentos: DocumentoCliente[]
  carpetaDriveId: string | null
  vincular: AccionFormulario
  clasificar: (driveFileId: string) => AccionFormulario
  desvincular: (driveFileId: string) => Promise<ResultadoAccion>
  /** Abrir un documento del cliente es operativo. Vincularlo, clasificarlo o quitarlo, no. */
  puedeEditar?: boolean
  /** Viene de `?documentos=todo`. El despliegue es un estado de la DIRECCIÓN, compartible. */
  todo?: boolean
  urlTodo: string
  urlPoco: string
  /** El id del documento cuya línea de acciones está abierta. Uno a la vez: es un parámetro. */
  menuAbierto?: string | null
  /** La misma dirección con —o sin— la línea de acciones de un documento abierta. */
  urlMenuDe: (driveFileId: string | null) => string
}) {
  const tope = todo ? TOPE_TODO : TOPE
  const visibles = documentos.slice(0, tope)

  return (
    <div className="space-y-3" data-testid="documentos-cliente">
      <div className="flex flex-wrap items-center gap-3">
        {puedeEditar && <Vincular accion={vincular} />}
        {carpetaDriveId ? (
          <a
            href={`https://drive.google.com/drive/folders/${carpetaDriveId}`}
            target="_blank" rel="noreferrer"
            className="text-[12px] text-muted hover:underline"
          >Abrir la carpeta del cliente en Drive ↗</a>
        ) : (
          <Nulo className="text-[12px]">
            Sin carpeta de Drive vinculada. Se carga en Información. No se adivina por parecido de nombre.
          </Nulo>
        )}
      </div>

      {documentos.length === 0 ? (
        <Vacio>
          Todavía no hay ningún archivo vinculado. El archivo sigue viviendo en Drive: acá queda el
          vínculo, nunca una copia.
        </Vacio>
      ) : (
        <>
          <div data-testid="tabla-documentos-cliente">
            <div className={`grid ${COLS_DOCS}`} style={{ ...ENCABEZADO, gap: undefined, paddingLeft: SANGRIA }}>
              <RotuloCol>Archivo</RotuloCol>
              <RotuloCol>Para qué sirve</RotuloCol>
              <RotuloCol>Lo colgó</RotuloCol>
              <RotuloCol derecha>Modificado</RotuloCol>
              <RotuloCol />
            </div>

            {visibles.map((d) => {
              const menu = menuAbierto === d.drive_file_id
              return (
                <Fragment key={d.drive_file_id}>
                  <div
                    className={`grid items-center ${CAJA_CONTENIDO} ${COLS_DOCS} ${menu ? 'bg-surface-quiet' : 'hover:bg-[#F2F1ED]'}`}
                    style={{
                      minHeight: 42, paddingLeft: SANGRIA, borderBottom: `1px solid ${V.lineaFila}`,
                      // El filo amarillo dice «ésta es la fila abierta» y NO corre el contenido:
                      // `inset` no empuja, un borde real desalinearía la fila de su encabezado.
                      boxShadow: menu ? FILO_ELEGIDA : undefined,
                      paddingTop: 6, paddingBottom: 6,
                    }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                      <span style={{ display: 'flex', color: V.inerte, flexShrink: 0 }}>
                        <IconoDocumento className="h-[15px] w-[15px]" />
                      </span>
                      <span style={{ minWidth: 0 }}>
                        <a
                          href={urlDeDrive(d.drive_file_id, 'archivo')}
                          target="_blank" rel="noreferrer"
                          data-testid="documento-cliente-enlace"
                          className="block truncate hover:underline"
                          style={{ fontSize: '12.5px', fontWeight: 500, color: V.tinta }}
                        >
                          {/* Sin nombre se muestra el id: es feo y es la verdad. El índice de Drive
                              se rehace cada 4 horas y un archivo puede salir de él sin que el
                              vínculo deje de valer. Un rótulo inventado sería peor que feo. */}
                          {d.name ?? d.drive_file_id}
                        </a>
                        {/* La RUTA va en mono: es una ruta, y el handoff reserva la mono para
                            importes, fechas, CUIT y rutas. */}
                        {d.path && (
                          <span className="block truncate font-mono" style={{ fontSize: '11px', color: V.tenue }}>
                            {d.path}
                          </span>
                        )}
                      </span>
                    </span>

                    <span style={{ minWidth: 0, overflow: 'hidden' }}>
                      {puedeEditar ? (
                        <SelectRolDocumento
                          valor={d.rol}
                          opciones={ROLES_DOCUMENTO}
                          guardar={clasificar(d.drive_file_id)}
                          testid="rol-documento"
                        />
                      ) : d.rol ? (
                        <span className="truncate" style={{ fontSize: '12.5px', color: V.tintaSuave }}>{d.rol}</span>
                      ) : (
                        <span className="truncate" style={{ fontSize: '12.5px', color: V.warn }}>sin clasificar</span>
                      )}
                    </span>

                    {/* «Vinculado a mano» = una persona afirmó que este archivo es de este cliente.
                        «Por la carpeta» = lo dedujo el sincronizador por la ruta. Es la misma
                        distinción HECHO vs INFERENCIA que gobierna el resto del sistema, y va en la
                        tabla porque cambia cuánto vale lo que se está mirando. */}
                    <span className="truncate" style={{ fontSize: '12.5px', color: V.apagado }}>
                      {d.origen === 'manual' ? 'Vinculado a mano' : 'Por la carpeta'}
                    </span>

                    <span
                      className="truncate font-mono tabular-nums"
                      style={{ fontSize: '12px', color: V.tenue, textAlign: 'right' }}
                    >
                      {d.modified_time ? fecha(d.modified_time) : <Nulo>sin fecha</Nulo>}
                    </span>

                    <span style={{ display: 'flex', justifyContent: 'flex-end' }}>
                      {puedeEditar && (
                        <AbrirAcciones
                          href={urlMenuDe(menu ? null : d.drive_file_id)}
                          abierto={menu}
                          etiqueta="Acciones del documento"
                          testid="acciones-documento-cliente"
                        />
                      )}
                    </span>
                  </div>

                  {menu && puedeEditar && (
                    <LineaDeAccionesEnGrilla testid="acciones-documento-abierto">
                      <AccionesDocumento driveFileId={d.drive_file_id} desvincular={desvincular} />
                      {/* LA ACLARACIÓN VA AL LADO DE LA ACCIÓN, no en un `title`. «Quitar» sobre un
                          contrato se lee como «destruir» si nadie dice lo contrario, y el que duda
                          no lo aprieta: el índice se queda con vínculos viejos para siempre. */}
                      <NotaDeAccion>No borra el archivo: vive en Drive y sigue ahí.</NotaDeAccion>
                    </LineaDeAccionesEnGrilla>
                  )}
                </Fragment>
              )
            })}
          </div>
          <p className="text-[11px] text-faint" data-testid="pie-documentos-cliente">
            {documentos.length <= TOPE ? (
              `${documentos.length} archivo${documentos.length === 1 ? '' : 's'}. Viven en Drive: acá está el vínculo, nunca una copia.`
            ) : todo ? (
              <>
                Se muestran {visibles.length} de {documentos.length}
                {documentos.length > TOPE_TODO && '; el resto está en la carpeta de Drive'}.{' '}
                <Link href={urlPoco} className="text-ink underline underline-offset-2">Ver sólo los últimos</Link>.
              </>
            ) : (
              <>
                Se muestran los {TOPE} más recientes de {documentos.length}.{' '}
                <Link href={urlTodo} className="text-ink underline underline-offset-2" data-testid="ver-todos-documentos">Ver todo ({documentos.length}) →</Link>
              </>
            )}
          </p>
        </>
      )}
    </div>
  )
}

/** El alta, plegada: dos campos y un botón. */
function Vincular({ accion }: { accion: AccionFormulario }) {
  return (
    <details className="w-full min-w-0 rounded-card border border-line bg-surface sm:w-auto" data-testid="alta-documento">
      <summary className="cursor-pointer select-none px-3.5 py-2 text-[12.5px] text-ink">+ Vincular un archivo de Drive</summary>
      <div className="w-full border-t border-line p-3.5 sm:w-[440px]">
        <FormAccion accion={accion} testid="form-documento" enviar="Vincular" limpiarAlOk mensajeOk="Vinculado.">
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
            <Campo label="Dirección del archivo" ancho="sm:col-span-3" ayuda="La que da el botón Compartir de Drive. También sirve el id.">
              <input name="url" required maxLength={500} className={CTRL} placeholder="https://drive.google.com/file/d/…" />
            </Campo>
            <Campo label="Para qué sirve" ancho="sm:col-span-3" ayuda="Opcional. Se puede cambiar después desde la lista.">
              <select name="rol" defaultValue="" className={CTRL}>
                <option value="">sin clasificar</option>
                {ROLES_DOCUMENTO.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </Campo>
          </div>
        </FormAccion>
      </div>
    </details>
  )
}
