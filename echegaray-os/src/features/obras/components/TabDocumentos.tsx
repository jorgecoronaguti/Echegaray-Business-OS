// DOCUMENTOS DE LA OBRA — el papel que la obra necesita, a un clic, sin salir del OS.
//
// ═══ QUÉ ES ESTA PANTALLA Y QUÉ NO ES ═══
//
// Es un ÍNDICE, no un repositorio. El contrato, los planos y el presupuesto viven en Drive con sus
// permisos y su historial de versiones; acá vive la respuesta a "¿cuál de los 2.467 archivos del
// Drive es el contrato de ESTA obra?", que hoy sólo está en la cabeza de alguien. Por eso el nombre
// es un enlace y no un visor: el clic termina en Drive, que es donde el archivo es la verdad.
//
// ═══ POR QUÉ VINCULAR ES INLINE Y NO UN PANEL ═══
//
// Vincular es pegar una dirección y apretar un botón. Un panel lateral para dos campos convierte
// una acción de cuatro segundos en una interrupción, y la interrupción es lo que hace que nadie
// vincule nada y el índice quede vacío para siempre. Panel lateral es para edición compleja.
//
// ═══ LA COLUMNA RELACIÓN ═══
//
// «Confirmado» = una persona afirmó que este archivo es de esta obra. «Inferido» = lo dedujo el OS
// por la ruta del archivo. Es la misma distinción HECHO vs INFERENCIA que gobierna todo el resto
// del sistema, y va en la tabla y no en un tooltip porque cambia cuánto vale lo que se está mirando.
// Ninguno de los dos lleva color: no son un problema ni un logro, son el nivel de certeza.

import { BotonAccion, Callout, Campo, CTRL, FormAccion, type AccionFormulario, type ResultadoAccion } from '@/shared/components/ui'
import type { DocumentoObra, TipoDrive } from '../types'
import { etiquetaDeTipo, urlDeDrive } from '../services/driveUrl'

/** El formulario de alta, plegado. Dos: uno por tipo, porque un id pelado no dice cuál es. */
function Vincular({
  tipo, accion, testid,
}: {
  tipo: TipoDrive
  accion: AccionFormulario
  testid: string
}) {
  const esCarpeta = tipo === 'carpeta'
  return (
    // `w-full sm:w-auto`: en el teléfono los dos ocupan el ancho; en pantalla grande el recuadro se
    // encoge hasta el texto cuando está cerrado —dos botones, no dos barras vacías— y lo estira el
    // panel de adentro cuando se abre. Sin estado de cliente: lo resuelve `<details>` con el ancho.
    <details className="w-full min-w-0 rounded-xl border border-line bg-white sm:w-auto" data-testid={testid}>
      <summary className="cursor-pointer select-none px-3.5 py-2 text-[13px] text-ink">
        + Vincular {esCarpeta ? 'carpeta' : 'archivo'}
      </summary>
      <div className="w-full border-t border-line p-3.5 sm:w-[440px]">
        <FormAccion accion={accion} testid={`${testid}-form`} enviar="Vincular" limpiarAlOk mensajeOk="Vinculado.">
          {/* El tipo viaja en el formulario y el `obra_id` NO: uno es una preferencia de quien
              carga, el otro decide sobre qué obra se escribe. */}
          <input type="hidden" name="tipo" value={tipo} />
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
            <Campo
              label={esCarpeta ? 'Enlace de la carpeta' : 'Enlace del archivo'}
              ancho="sm:col-span-3"
              ayuda="El que da el botón Compartir de Drive. También sirve el id."
            >
              <input
                name="enlace"
                required
                maxLength={500}
                placeholder={esCarpeta
                  ? 'https://drive.google.com/drive/folders/…'
                  : 'https://drive.google.com/file/d/…'}
                className={CTRL}
              />
            </Campo>
            <Campo
              label="Nombre"
              ancho="sm:col-span-2"
              ayuda="Sólo si el archivo no está en el índice de Drive."
            >
              <input name="nombre" maxLength={300} className={CTRL} />
            </Campo>
            <Campo label="Qué es" ayuda="Contrato, plano, acta…">
              <input name="rol" maxLength={120} className={CTRL} />
            </Campo>
          </div>
        </FormAccion>
      </div>
    </details>
  )
}

export function TabDocumentos({
  documentos, carpetaDriveId, vincular, desvincular,
}: {
  documentos: DocumentoObra[]
  /** `obra_canonica.drive_carpeta_id`. Null en las ocho obras de hoy: nadie la declaró todavía. */
  carpetaDriveId: string | null
  vincular: AccionFormulario
  desvincular: (driveFileId: string) => Promise<ResultadoAccion>
}) {
  return (
    <div className="space-y-3">
      <div className="flex flex-col items-start gap-2 sm:flex-row">
        <Vincular tipo="archivo" accion={vincular} testid="vincular-archivo" />
        <Vincular tipo="carpeta" accion={vincular} testid="vincular-carpeta" />
      </div>

      {documentos.length === 0 ? (
        <Callout tono="neutral">
          Todavía no hay ningún documento vinculado a esta obra.
        </Callout>
      ) : (
        // `overflow-x-auto` con `min-w` en la tabla: el que desborda en 390px es este recuadro, no
        // la página. Mismo recurso que las tablas de Personal y Economía.
        <div className="overflow-x-auto rounded-xl border border-line bg-white">
          <table data-testid="tabla-documentos" className="w-full min-w-[520px] text-left">
            <thead>
              <tr className="border-b border-line text-[10px] uppercase tracking-wide text-faint">
                <th className="px-4 py-2.5 font-medium">Nombre</th>
                <th className="px-3 py-2.5 font-medium">Tipo</th>
                <th className="px-3 py-2.5 font-medium">Relación</th>
                <th className="px-3 py-2.5 text-right font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {documentos.map((d) => (
                <tr key={d.drive_file_id} className="border-b border-line/60 last:border-0">
                  <td className="max-w-[280px] px-4 py-2.5">
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
                    {d.rol && <span className="block truncate text-[11px] text-faint">{d.rol}</span>}
                    {d.path && <span className="block truncate text-[11px] text-faint">{d.path}</span>}
                  </td>
                  <td className="px-3 py-2.5 text-[12px] text-muted">
                    {etiquetaDeTipo(d.tipo, d.mime_type, d.name)}
                  </td>
                  <td className="px-3 py-2.5 text-[12px] text-muted">
                    {d.origen === 'confirmado' ? 'Confirmado' : 'Inferido'}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <BotonAccion
                      accion={desvincular}
                      args={[d.drive_file_id]}
                      testid="desvincular-documento"
                      tono="peligro"
                    >
                      Quitar
                    </BotonAccion>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {carpetaDriveId ? (
        <a
          href={`https://drive.google.com/drive/folders/${carpetaDriveId}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 text-[12px] text-muted hover:underline"
        >
          Abrir la carpeta de la obra en Drive ↗
        </a>
      ) : (
        <p className="text-[12px] text-faint">
          Esta obra no tiene declarada su carpeta de Drive. Se carga en Resumen › Editar la obra.
        </p>
      )}
    </div>
  )
}
