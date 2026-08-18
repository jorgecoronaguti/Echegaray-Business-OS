// INFORMACIÓN — quién es el cliente y cómo se lo contacta.
//
// Es la primera solapa porque el cliente ES la relación empresarial: entrar por sus obras lo
// convertía en una carpeta con obras adentro, que es exactamente lo que el dueño dijo que no es.
//
// ═══ SIN TARJETAS POR DATO ═══
//
// Ocho recuadros con un dato adentro no informan más que ocho renglones: informan menos, porque el
// ojo tiene que saltar de caja en caja para comparar. La ficha es una lista de pares rótulo/valor y
// la edición vive plegada abajo — abierta permanentemente, un formulario compite con lo que se vino
// a leer.
//
// «sin cargar» NUNCA se dibuja como un problema: no hay rojo ni naranja. Que falte el teléfono de un
// cliente es un dato que falta, no un desvío.

import type { ReactNode } from 'react'
import { BotonAccion, Callout, Campo, CTRL, FormAccion, type AccionFormulario, type ResultadoAccion } from '@/shared/components/ui'
import type { ClientePanel, Responsable } from '../types'
import { CamposCliente } from './CamposCliente'

function Renglon({ k, children }: { k: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-1">
      <dt className="shrink-0 text-faint">{k}</dt>
      <dd className="min-w-0 break-words text-right text-ink">{children}</dd>
    </div>
  )
}

const oFalta = (v: string | null): ReactNode =>
  v ?? <span className="text-faint">sin cargar</span>

export function TabInformacion({
  cliente, responsables, editar, vincularCarpeta, archivar, puedeEditar = true,
}: {
  cliente: ClientePanel
  responsables: Responsable[]
  editar: AccionFormulario
  vincularCarpeta: AccionFormulario
  archivar: (clienteId: string, activo: boolean) => Promise<ResultadoAccion>
  /** El nivel Obras CONSULTA la ficha; administrar el maestro es de Administración. No se dibuja un
   *  formulario que la base va a rechazar: un botón que falla es peor que un botón que no está. */
  puedeEditar?: boolean
}) {
  // ANCHO DE LECTURA, no ancho de pantalla. Una tabla usa los 1.400px porque tiene columnas que
  // comparar; una ficha de nueve renglones estirada a 1.400 deja el rótulo pegado a la izquierda y
  // el valor a la derecha con un metro de vacío en el medio, y hay que barrer la pantalla con la
  // vista para leer un teléfono. Angostar es la excepción y hay que pedirla: acá se pide.
  return (
    <div className="max-w-3xl space-y-4">
      <div className="rounded-lg border border-line bg-surface p-4" data-testid="cliente-informacion">
        <dl className="divide-y divide-line/60 text-[12px]">
          <Renglon k="Razón social">{cliente.nombre}</Renglon>
          <Renglon k="CUIT"><span className="tabular-nums">{oFalta(cliente.cuit)}</span></Renglon>
          <Renglon k="Dirección">{oFalta(cliente.direccion)}</Renglon>
          <Renglon k="Teléfono"><span className="tabular-nums">{oFalta(cliente.telefono)}</span></Renglon>
          <Renglon k="Email">
            {cliente.email
              ? <a href={`mailto:${cliente.email}`} className="text-ink underline underline-offset-2">{cliente.email}</a>
              : <span className="text-faint">sin cargar</span>}
          </Renglon>
          <Renglon k="Responsable interno">{oFalta(cliente.responsable_nombre)}</Renglon>
          <Renglon k="Estado">{cliente.activo ? 'Activo' : 'Archivado'}</Renglon>
          <Renglon k="Carpeta en Drive">
            {cliente.drive_carpeta_id
              ? <a href={`https://drive.google.com/drive/folders/${cliente.drive_carpeta_id}`}
                   target="_blank" rel="noreferrer" className="text-ink underline underline-offset-2">Abrir ↗</a>
              : <span className="text-faint">sin vincular</span>}
          </Renglon>
          {/* El identificador NO se edita: es la URL del cliente y lo que apuntan los enlaces que
              alguien ya compartió. Corregir la razón social no puede romper una dirección. */}
          <Renglon k="Identificador">{cliente.slug ?? '—'}</Renglon>
        </dl>
        {cliente.notas && <p className="mt-3 border-t border-line pt-3 text-[12px] leading-relaxed text-muted">{cliente.notas}</p>}
      </div>

      {puedeEditar && (<>
      <details className="rounded-lg border border-line bg-surface" data-testid="editar-cliente">
        <summary className="cursor-pointer px-4 py-2.5 text-[13px] font-medium text-ink">Editar la ficha</summary>
        <div className="border-t border-line p-4">
          <FormAccion accion={editar} testid="form-editar-cliente" enviar="Guardar" mensajeOk="Ficha guardada.">
            <CamposCliente cliente={cliente} responsables={responsables} />
          </FormAccion>
        </div>
      </details>

      <details className="rounded-lg border border-line bg-surface" data-testid="carpeta-drive">
        <summary className="cursor-pointer px-4 py-2.5 text-[13px] font-medium text-ink">
          Vincular la carpeta de Drive pegando la dirección
        </summary>
        <div className="border-t border-line p-4">
          <FormAccion accion={vincularCarpeta} testid="form-carpeta-drive" enviar="Vincular carpeta" limpiarAlOk mensajeOk="Carpeta vinculada.">
            <Campo label="Dirección de la carpeta" ayuda="La que da el botón Compartir de Drive. También sirve el id.">
              <input name="url" required maxLength={500} className={CTRL} placeholder="https://drive.google.com/drive/folders/…" />
            </Campo>
          </FormAccion>
        </div>
      </details>

      <div className="rounded-xl border border-line bg-white p-4">
        <h2 className="mb-1 text-[13px] font-semibold text-ink">
          {cliente.activo ? 'Archivar el cliente' : 'Reactivar el cliente'}
        </h2>
        <p className="mb-2.5 text-[12px] leading-relaxed text-muted">
          {cliente.activo
            ? 'Sale de la lista de clientes y de la operación diaria. Su historia —obras, costos, contactos, documentos— queda entera y esta página sigue abriendo por su dirección.'
            : 'Vuelve a la lista de clientes y a la operación diaria.'}
        </p>
        <BotonAccion
          accion={archivar}
          args={[cliente.cliente_id, !cliente.activo]}
          testid="archivar-cliente"
          tono={cliente.activo ? 'peligro' : 'neutral'}
        >{cliente.activo ? 'Archivar' : 'Reactivar'}</BotonAccion>
      </div>
      </>)}

      {puedeEditar && !responsables.length && (
        <Callout tono="info">
          No hay personas del OS para elegir como responsable. Se cargan con el acceso de cada uno.
        </Callout>
      )}
    </div>
  )
}
