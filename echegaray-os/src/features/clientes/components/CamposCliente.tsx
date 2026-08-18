// LOS CAMPOS DE UN CLIENTE — los mismos para el alta y para la edición.
//
// Uno solo, no dos: si se separaran, el alta y la edición terminarían aceptando cosas distintas y el
// desvío entre las dos se descubriría el día que un dato cargado no se pueda corregir.
//
// Los `name` son contrato con `clienteSchema` de `services/actions.ts`. El CUIT se manda como se
// escriba —con guiones o sin ellos—: la acción se queda con los 11 dígitos, porque un CUIT anotado
// de dos formas distintas deja de servir para cruzar contra ARCA, que es para lo único que existe
// esa columna.
//
// EL RESPONSABLE ES UNA LISTA, NO UN CAMPO DE TEXTO. Sale de las personas del OS. Escrito a mano,
// «Rodrigo», «R. Echegaray» y «rodri» serían tres responsables y la pregunta «¿de quién es este
// cliente?» dejaría de tener respuesta. El límite es real y está declarado abajo: sólo se puede
// elegir a alguien que tenga perfil en el OS.

import { Campo, CTRL } from '@/shared/components/ui'
import type { ClientePanel, Responsable } from '../types'

const v = (x: string | null | undefined) => x ?? ''

export function CamposCliente({
  cliente, responsables = [],
}: {
  cliente?: ClientePanel
  responsables?: Responsable[]
}) {
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
      <Campo label="Razón social" ancho="col-span-2 sm:col-span-3">
        <input name="nombre" defaultValue={v(cliente?.nombre)} required minLength={2} maxLength={160} className={CTRL} />
      </Campo>
      <Campo label="CUIT" ancho="col-span-2 sm:col-span-1" ayuda="11 dígitos. Con guiones o sin ellos.">
        <input name="cuit" defaultValue={v(cliente?.cuit)} maxLength={16} className={CTRL} placeholder="30-12345678-9" />
      </Campo>

      <Campo label="Dirección" ancho="col-span-2 sm:col-span-4">
        <input name="direccion" defaultValue={v(cliente?.direccion)} maxLength={300} className={CTRL} />
      </Campo>
      <Campo label="Teléfono" ancho="col-span-2">
        <input name="telefono" defaultValue={v(cliente?.telefono)} maxLength={60} className={CTRL} />
      </Campo>
      <Campo label="Email" ancho="col-span-2">
        <input type="email" name="email" defaultValue={v(cliente?.email)} maxLength={160} className={CTRL} />
      </Campo>

      <Campo
        label="Responsable interno"
        ancho="col-span-2"
        ayuda={responsables.length ? 'Quién de la empresa lo atiende.' : 'Todavía no hay personas cargadas en el OS.'}
      >
        <select name="responsable_id" defaultValue={v(cliente?.responsable_id)} className={CTRL}>
          <option value="">sin asignar</option>
          {responsables.map((r) => (
            <option key={r.id} value={r.id}>{r.nombre}</option>
          ))}
        </select>
      </Campo>
      <Campo label="Carpeta de Drive" ancho="col-span-2" ayuda="El id. Para pegar la URL entera hay un campo aparte.">
        <input name="drive_carpeta_id" defaultValue={v(cliente?.drive_carpeta_id)} maxLength={80} className={CTRL} />
      </Campo>

      <Campo label="Notas" ancho="col-span-2 sm:col-span-4">
        <textarea name="notas" defaultValue={v(cliente?.notas)} maxLength={1000} rows={2} className={CTRL} />
      </Campo>
    </div>
  )
}
