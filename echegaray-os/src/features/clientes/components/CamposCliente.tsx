// LOS CAMPOS DE UN CLIENTE — los mismos para el alta y para la edición.
//
// Los `name` son contrato con `clienteSchema` de `services/actions.ts`. El CUIT se manda como se
// escriba —con guiones o sin ellos—: la acción se queda con los 11 dígitos, porque un CUIT anotado
// de dos formas distintas deja de servir para cruzar contra ARCA, que es para lo único que existe
// esa columna.

import { Campo, CTRL } from '@/shared/components/ui'
import type { ClientePanel } from '../types'

const v = (x: string | null | undefined) => x ?? ''

export function CamposCliente({ cliente }: { cliente?: ClientePanel }) {
  return (
    <div className="grid grid-cols-2 gap-2.5">
      <Campo label="Razón social" ancho="col-span-2">
        <input name="nombre" defaultValue={v(cliente?.nombre)} required minLength={2} maxLength={160} className={CTRL} />
      </Campo>
      <Campo label="CUIT" ayuda="11 dígitos. Con guiones o sin ellos.">
        <input name="cuit" defaultValue={v(cliente?.cuit)} maxLength={16} className={CTRL} placeholder="30-12345678-9" />
      </Campo>
      <Campo label="Carpeta de Drive" ayuda="El id de la carpeta. Para pegar la URL entera hay un campo aparte.">
        <input name="drive_carpeta_id" defaultValue={v(cliente?.drive_carpeta_id)} maxLength={80} className={CTRL} />
      </Campo>
      <Campo label="Notas" ancho="col-span-2">
        <textarea name="notas" defaultValue={v(cliente?.notas)} maxLength={1000} rows={2} className={CTRL} />
      </Campo>
    </div>
  )
}
