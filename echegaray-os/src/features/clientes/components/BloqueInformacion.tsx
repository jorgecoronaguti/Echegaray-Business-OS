// INFORMACIÓN — las propiedades del cliente: quién es y cómo se lo contacta.
//
// Es la columna de la derecha del record y en el teléfono es lo primero que se lee. Antes era la
// primera de cinco solapas; el dueño pidió el record entero en una sola pantalla, así que dejó de
// ser un destino al que se navega y pasó a ser el panel que siempre está ahí, al lado de todo lo
// demás. Nada de lo que decía dejó de decirse.
//
// ═══ SIN TARJETAS POR DATO ═══
//
// Ocho recuadros con un dato adentro no informan más que ocho renglones: informan menos, porque el
// ojo tiene que saltar de caja en caja para comparar. La edición vive plegada abajo —abierta
// permanentemente, un formulario compite con lo que se vino a leer— y se abre desde `[Editar]`, que
// está arriba del todo, junto al nombre, y viaja en la URL (`?editar=1`).
//
// «sin cargar» NUNCA se dibuja como un problema: no hay rojo ni naranja. Que falte el teléfono de un
// cliente es un dato que falta, no un desvío.

import { BotonAccion, Callout, Campo, CTRL, FormAccion, type AccionFormulario, type ResultadoAccion } from '@/shared/components/ui'
import type { ClientePanel, Responsable } from '../types'
import { CamposCliente } from './CamposCliente'
import { oFalta, Propiedad } from './Bloque'

export function BloqueInformacion({
  cliente, responsables, editar, vincularCarpeta, archivar, puedeEditar = true, edicionAbierta = false,
}: {
  cliente: ClientePanel
  responsables: Responsable[]
  editar: AccionFormulario
  vincularCarpeta: AccionFormulario
  archivar: (clienteId: string, activo: boolean) => Promise<ResultadoAccion>
  /** El nivel Obras CONSULTA la ficha; administrar el maestro es de Administración. No se dibuja un
   *  formulario que la base va a rechazar: un botón que falla es peor que un botón que no está. */
  puedeEditar?: boolean
  /** Viene de `?editar=1`, o sea del `[Editar]` de la cabecera. La edición es un ESTADO DE LA
   *  DIRECCIÓN y no del navegador: así se puede compartir «corregile el CUIT a éste» y el botón
   *  «atrás» cierra el formulario, que es lo que el navegador ya sabe hacer. */
  edicionAbierta?: boolean
}) {
  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-line bg-white px-4 py-2" data-testid="cliente-informacion">
        <dl className="divide-y divide-line/60">
          <Propiedad rotulo="Nombre comercial">{cliente.nombre_comercial}</Propiedad>
          {/* «sin cargar» y no el nombre comercial repetido: la razón social vacía es un dato que
              falta, y repetir el otro campo lo escondería haciéndolo parecer completo. */}
          <Propiedad rotulo="Razón social">{oFalta(cliente.razon_social)}</Propiedad>
          <Propiedad rotulo="CUIT"><span className="tabular-nums">{oFalta(cliente.cuit)}</span></Propiedad>
          <Propiedad rotulo="Dirección">{oFalta(cliente.direccion)}</Propiedad>
          <Propiedad rotulo="Teléfono"><span className="tabular-nums">{oFalta(cliente.telefono)}</span></Propiedad>
          <Propiedad rotulo="Email">
            {cliente.email
              ? <a href={`mailto:${cliente.email}`} className="break-all text-ink underline underline-offset-2">{cliente.email}</a>
              : <span className="text-faint">sin cargar</span>}
          </Propiedad>
          <Propiedad rotulo="Responsable interno">{oFalta(cliente.responsable_nombre)}</Propiedad>
          <Propiedad rotulo="Estado">{cliente.activo ? 'Activo' : 'Archivado'}</Propiedad>
          <Propiedad rotulo="Carpeta en Drive">
            {cliente.drive_carpeta_id
              ? <a href={`https://drive.google.com/drive/folders/${cliente.drive_carpeta_id}`}
                   target="_blank" rel="noreferrer" className="text-ink underline underline-offset-2">Abrir ↗</a>
              : <span className="text-faint">sin vincular</span>}
          </Propiedad>
          {/* El identificador NO se edita: es la URL del cliente y lo que apuntan los enlaces que
              alguien ya compartió. Corregir la razón social no puede romper una dirección. */}
          <Propiedad rotulo="Identificador">{cliente.slug ?? '—'}</Propiedad>
        </dl>
        {cliente.notas && (
          <p className="border-t border-line py-2.5 text-[12px] leading-relaxed text-muted">{cliente.notas}</p>
        )}
      </div>

      {puedeEditar && <Administrar
        cliente={cliente} responsables={responsables} editar={editar}
        vincularCarpeta={vincularCarpeta} archivar={archivar} edicionAbierta={edicionAbierta}
      />}
    </div>
  )
}

/** Lo que sólo puede hacer Administración: corregir la ficha, colgar la carpeta y archivar. Va
 *  aparte para que el panel de lectura se lea de un vistazo sin tres formularios abajo. */
function Administrar({
  cliente, responsables, editar, vincularCarpeta, archivar, edicionAbierta,
}: {
  cliente: ClientePanel
  responsables: Responsable[]
  editar: AccionFormulario
  vincularCarpeta: AccionFormulario
  archivar: (clienteId: string, activo: boolean) => Promise<ResultadoAccion>
  edicionAbierta: boolean
}) {
  return (
    <>
      <details className="rounded-xl border border-line bg-white" data-testid="editar-cliente" open={edicionAbierta}>
        <summary className="cursor-pointer px-4 py-2.5 text-[13px] font-medium text-ink">Editar la ficha</summary>
        <div className="border-t border-line p-4">
          <FormAccion accion={editar} testid="form-editar-cliente" enviar="Guardar" mensajeOk="Ficha guardada.">
            <CamposCliente cliente={cliente} responsables={responsables} />
          </FormAccion>
        </div>
      </details>

      <details className="rounded-xl border border-line bg-white" data-testid="carpeta-drive">
        <summary className="cursor-pointer px-4 py-2.5 text-[13px] font-medium text-ink">
          Vincular la carpeta de Drive
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
        <h3 className="mb-1 text-[13px] font-semibold text-ink">
          {cliente.activo ? 'Archivar el cliente' : 'Reactivar el cliente'}
        </h3>
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

      {!responsables.length && (
        <Callout tono="info">
          No hay personas del OS para elegir como responsable. Se cargan con el acceso de cada uno.
        </Callout>
      )}
    </>
  )
}
