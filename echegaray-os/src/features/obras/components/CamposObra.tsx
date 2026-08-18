// LOS CAMPOS DE UNA OBRA — los mismos para el alta y para la edición.
//
// Uno solo, y no dos copias, porque el alta y la edición escriben en las MISMAS columnas: si se
// separaran, un campo agregado en una quedaría faltando en la otra y la obra creada desde el cliente
// tendría menos datos que la editada desde su ficha, sin que nadie se entere.
//
// Los nombres de los `name` son contrato con `obraSchema` de `services/actions.ts`. Cambiar uno acá
// sin cambiarlo allá no rompe nada visible: el campo simplemente deja de guardarse.

import { Campo, CTRL } from '@/shared/components/ui'
import { ETAPAS, ETAPA_LABEL, type ObraPanel } from '../types'

const ESTADOS = ['activa', 'pausada', 'cerrada'] as const

const v = (x: string | number | null | undefined) => (x == null ? '' : String(x))

export function CamposObra({ obra, ubicacion }: { obra?: ObraPanel; ubicacion?: string | null }) {
  return (
    <div className="grid grid-cols-2 gap-2.5">
      <Campo label="Nombre de la obra" ancho="col-span-2">
        <input name="nombre" defaultValue={v(obra?.nombre)} required minLength={2} maxLength={120} className={CTRL} />
      </Campo>
      {/* La ubicación NO llega en `obra_panel`: la columna se agregó a `obra_canonica` y la vista
          nunca se rehizo. Se lee aparte, de la tabla. Si se tomara del panel, el campo se guardaría
          bien y volvería vacío en la recarga — el peor de los defectos, porque parece que anduvo. */}
      <Campo label="Ubicación" ancho="col-span-2">
        <input name="ubicacion" defaultValue={v(ubicacion)} maxLength={200} className={CTRL} placeholder="dónde queda" />
      </Campo>
      <Campo label="Jefe de obra">
        <input name="jefe_obra" defaultValue={v(obra?.jefe_obra)} maxLength={120} className={CTRL} />
      </Campo>
      <Campo label="Estado">
        <select name="estado" defaultValue={v(obra?.estado) || 'activa'} className={CTRL}>
          {ESTADOS.map((e) => <option key={e} value={e}>{e}</option>)}
        </select>
      </Campo>
      <Campo label="Etapa" ancho="col-span-2" ayuda="Sin declarar es una respuesta válida: no se elige una por defecto.">
        <select name="etapa" defaultValue={v(obra?.etapa)} className={CTRL}>
          <option value="">sin declarar</option>
          {ETAPAS.map((e) => <option key={e} value={e}>{ETAPA_LABEL[e]}</option>)}
        </select>
      </Campo>
      <Campo label="Inicio previsto"><input type="date" name="fecha_inicio_plan" defaultValue={v(obra?.fecha_inicio_plan)} className={CTRL} /></Campo>
      <Campo label="Fin previsto"><input type="date" name="fecha_fin_plan" defaultValue={v(obra?.fecha_fin_plan)} className={CTRL} /></Campo>
      {obra && (
        <>
          <Campo label="Inicio real"><input type="date" name="fecha_inicio_real" defaultValue={v(obra.fecha_inicio_real)} className={CTRL} /></Campo>
          <Campo label="Fin real"><input type="date" name="fecha_fin_real" defaultValue={v(obra.fecha_fin_real)} className={CTRL} /></Campo>
        </>
      )}
      <Campo label="Monto contratado ($)" ancho="col-span-2" ayuda="Vacío = no cargado. No es lo mismo que un contrato de $0.">
        <input type="number" name="monto_contratado" min={0} step="0.01" defaultValue={v(obra?.monto_contratado)} className={CTRL} />
      </Campo>
      <Campo label="Carpeta de Drive" ancho="col-span-2" ayuda="El id de la carpeta, no su nombre.">
        <input name="drive_carpeta_id" defaultValue={v(obra?.drive_carpeta_id)} maxLength={80} className={CTRL} />
      </Campo>
    </div>
  )
}
