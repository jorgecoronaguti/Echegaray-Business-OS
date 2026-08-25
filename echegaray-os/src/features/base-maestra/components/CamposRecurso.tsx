// LOS CAMPOS DE UN RECURSO — los seis que la base pide, y ninguno más.
//
// EL TIPO SÓLO APARECE EN EL ALTA. Cambiar un material por mano de obra reclasifica hacia atrás el
// costo de todos los análisis que lo usan, y también las HH: `hs_unitarias` es la suma de las
// cantidades de `mano_obra`, así que una tarea pasaría de 24 a 0 horas por unidad sin que nadie le
// tocara el análisis. Un recurso mal tipado se da de baja y se carga bien.
//
// EL PRECIO TAMPOCO ESTÁ ACÁ: es historia con fecha y fuente, y tiene su propio panel («Actualizar
// precio»). Pedirlo en el alta obligaría a inventar una fecha para poder guardar.

import { Campo, CTRL } from '@/shared/components/ui'
import type { RecursoFila } from '../types'

const TIPOS: { valor: string; etiqueta: string }[] = [
  { valor: 'material', etiqueta: 'Material' },
  { valor: 'equipo', etiqueta: 'Equipo' },
  { valor: 'mano_obra', etiqueta: 'Mano de obra' },
  { valor: 'carga_social', etiqueta: 'Carga social' },
  { valor: 'otro', etiqueta: 'Otro' },
]

export function CamposRecurso({
  familias, recurso,
}: {
  familias: string[]
  /** Ausente = alta. Presente = edición, y los campos vienen con lo guardado. */
  recurso?: RecursoFila
}) {
  return (
    <div className="grid grid-cols-2 gap-2.5">
      {!recurso && (
        <>
          <Campo label="Código" ayuda="Se guarda en mayúsculas. No puede repetirse.">
            <input name="codigo" required maxLength={40} className={CTRL} data-testid="recurso-codigo" />
          </Campo>
          <Campo label="Tipo" ayuda="No se puede cambiar después.">
            <select name="tipo" required defaultValue="material" className={CTRL} data-testid="recurso-tipo">
              {TIPOS.map((t) => <option key={t.valor} value={t.valor}>{t.etiqueta}</option>)}
            </select>
          </Campo>
        </>
      )}
      <Campo label="Nombre" ancho="col-span-2">
        <input name="nombre" required maxLength={200} className={CTRL} defaultValue={recurso?.nombre ?? ''} data-testid="recurso-nombre" />
      </Campo>
      <Campo label="Unidad" ayuda="m³, kg, un, h…">
        <input name="unidad" required maxLength={20} className={CTRL} defaultValue={recurso?.unidad ?? ''} data-testid="recurso-unidad" />
      </Campo>
      {/* FRACCIÓN, NO PORCENTAJE: es el mismo CHECK que la base (`>= 0 and < 1`). El costo con
          desperdicio lo calcula `recurso_costo`, no este formulario. */}
      <Campo label="Desperdicio" ayuda="Fracción: 0,05 es 5 %.">
        <input
          name="desperdicio" type="number" step="0.01" min="0" max="0.99" className={CTRL}
          defaultValue={recurso?.desperdicio ?? 0} data-testid="recurso-desperdicio"
        />
      </Campo>
      <Campo label="Familia" ancho="col-span-2" ayuda="Elegí una existente o escribí una nueva. Opcional.">
        <input name="familia" list="familias-base-maestra" maxLength={120} className={CTRL} defaultValue={recurso?.familia ?? ''} data-testid="recurso-familia" />
        <datalist id="familias-base-maestra">
          {familias.map((f) => <option key={f} value={f} />)}
        </datalist>
      </Campo>
    </div>
  )
}

/**
 * LOS CAMPOS DE UN PRECIO NUEVO. La fecha es DEL PRECIO, no de la carga: una lista de proveedor de
 * la semana pasada cargada hoy vale desde la semana pasada, y la frescura —que decide si ese número
 * todavía sirve para cotizar— se mide contra ESA fecha.
 */
export function CamposPrecio({ hoy, proveedor }: { hoy: string; proveedor?: string | null }) {
  return (
    <div className="grid grid-cols-2 gap-2.5">
      <Campo label="Precio" ayuda="Sin IVA, como el resto de la base.">
        <input name="costo" type="number" step="0.01" min="0" required className={CTRL} data-testid="precio-costo" />
      </Campo>
      <Campo label="Fecha del precio">
        <input name="fecha_precio" type="date" required defaultValue={hoy} max={hoy} className={CTRL} data-testid="precio-fecha" />
      </Campo>
      {/* OBLIGATORIA. Un precio sin procedencia no se puede defender delante de un cliente ni
          auditar tres meses después: es el estado del que este modelo vino a sacarnos. */}
      <Campo label="De dónde salió" ancho="col-span-2" ayuda="Lista de proveedor, compra real, convenio…">
        <input name="fuente" required maxLength={200} className={CTRL} data-testid="precio-fuente" />
      </Campo>
      <Campo label="Proveedor" ancho="col-span-2" ayuda="Opcional.">
        <input name="proveedor" maxLength={200} className={CTRL} defaultValue={proveedor ?? ''} data-testid="precio-proveedor" />
      </Campo>
    </div>
  )
}
