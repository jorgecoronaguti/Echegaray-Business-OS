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
// ═══ POR QUÉ VINCULAR ES INLINE Y NO UN PANEL ═══
//
// Vincular es pegar una dirección y apretar un botón. Un panel lateral para dos campos convierte una
// acción de cuatro segundos en una interrupción, y la interrupción es lo que hace que nadie vincule
// nada y el índice quede vacío para siempre. Panel lateral es para edición compleja.

import Link from 'next/link'
import { BotonAccion, Callout, Campo, CTRL, FormAccion, type AccionFormulario, type ResultadoAccion } from '@/shared/components/ui'
import { etiquetaDeTipo, urlDeDrive } from '@/features/obras/services/driveUrl'
import { ROLES_DOCUMENTO, type DocumentoCliente } from '../types'
import { SelectRolDocumento } from './SelectRolDocumento'

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

export function BloqueDocumentos({
  documentos, carpetaDriveId, vincular, clasificar, desvincular, puedeEditar = true,
  todo = false, urlTodo, urlPoco,
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
}) {
  const tope = todo ? TOPE_TODO : TOPE
  const visibles = documentos.slice(0, tope)

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        {puedeEditar && <Vincular accion={vincular} />}
        {carpetaDriveId ? (
          <a
            href={`https://drive.google.com/drive/folders/${carpetaDriveId}`}
            target="_blank" rel="noreferrer"
            className="text-[12px] text-muted hover:underline"
          >Abrir la carpeta del cliente en Drive ↗</a>
        ) : (
          <span className="text-[12px] text-faint">
            Sin carpeta de Drive vinculada. Se carga en Información. No se adivina por parecido de nombre.
          </span>
        )}
      </div>

      {documentos.length === 0 ? (
        <Callout tono="neutral">
          Todavía no hay ningún archivo vinculado. El archivo sigue viviendo en Drive: acá queda el
          vínculo, nunca una copia.
        </Callout>
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-line bg-white">
            <table data-testid="tabla-documentos-cliente" className="w-full min-w-[680px] text-left">
              <thead>
                <tr className="border-b border-line text-[10px] uppercase tracking-wide text-faint">
                  <th className="px-4 py-2.5 font-medium">Nombre</th>
                  <th className="px-3 py-2.5 font-medium">Tipo</th>
                  <th className="px-3 py-2.5 font-medium">Para qué sirve</th>
                  <th className="px-3 py-2.5 font-medium">Relación</th>
                  <th className="px-3 py-2.5 text-right font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {visibles.map((d) => (
                  <tr key={d.drive_file_id} className="border-b border-line/60 last:border-0">
                    <td className="max-w-[280px] px-4 py-2.5">
                      <a
                        href={urlDeDrive(d.drive_file_id, 'archivo')}
                        target="_blank" rel="noreferrer"
                        data-testid="documento-cliente-enlace"
                        className="block truncate text-[13px] text-ink hover:underline"
                      >
                        {/* Sin nombre se muestra el id: es feo y es la verdad. El índice de Drive se
                            rehace cada 4 horas y un archivo puede salir de él sin que el vínculo
                            deje de valer. Un rótulo inventado sería peor que feo. */}
                        {d.name ?? d.drive_file_id}
                      </a>
                      {d.path && <span className="block truncate text-[11px] text-faint">{d.path}</span>}
                    </td>
                    <td className="px-3 py-2.5 text-[12px] text-muted">
                      {etiquetaDeTipo('archivo', d.mime_type, d.name)}
                    </td>
                    <td className="px-3 py-2.5">
                      {puedeEditar ? (
                        <SelectRolDocumento
                          valor={d.rol}
                          opciones={ROLES_DOCUMENTO}
                          guardar={clasificar(d.drive_file_id)}
                          testid="rol-documento"
                        />
                      ) : (
                        <span className="text-[12px] text-muted">{d.rol ?? 'sin clasificar'}</span>
                      )}
                    </td>
                    {/* «Vinculado a mano» = una persona afirmó que este archivo es de este cliente.
                        «Por la carpeta» = lo dedujo el sincronizador por la ruta. Es la misma
                        distinción HECHO vs INFERENCIA que gobierna el resto del sistema, y va en la
                        tabla porque cambia cuánto vale lo que se está mirando. Sin color: no es un
                        problema ni un logro. */}
                    <td className="px-3 py-2.5 text-[12px] text-muted">
                      {d.origen === 'manual' ? 'Vinculado a mano' : 'Por la carpeta'}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      {puedeEditar && (
                        <BotonAccion
                          accion={desvincular} args={[d.drive_file_id]}
                          testid="desvincular-documento-cliente" tono="peligro"
                        >Quitar</BotonAccion>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
                <Link href={urlTodo} className="text-ink underline underline-offset-2" data-testid="ver-todos-documentos">Ver todos</Link>.
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
    <details className="w-full min-w-0 rounded-xl border border-line bg-white sm:w-auto" data-testid="alta-documento">
      <summary className="cursor-pointer select-none px-3.5 py-2 text-[13px] text-ink">+ Vincular un archivo de Drive</summary>
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
