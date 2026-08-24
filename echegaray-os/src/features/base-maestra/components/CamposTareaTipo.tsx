// LOS CAMPOS DEL ALTA DE UNA TAREA TIPO — los cinco que la base pide, y ninguno más.
//
// `tarea_tipo` tiene además `metodo_medicion` y `origen`. El método NO se pregunta en el alta: es
// una decisión de la PLANTILLA de secuencia —cantidad, pasos o manual— y decidirla antes de que la
// tarea tenga análisis es pedir una respuesta a alguien que todavía no tiene la pregunta. `origen`
// lo pone la acción («web»), porque es de dónde salió la fila y no algo que se elija.
//
// El análisis tampoco se carga acá: son N líneas de recursos con sus cantidades, y ésa es la ficha
// de la tarea. La tarea nace «Sin análisis», que es cierto y la lista lo dice.

import { Campo, CTRL } from '@/shared/components/ui'
import type { TareaTipoFila } from '../types'

export function CamposTareaTipo({
  divisiones, tarea,
}: {
  divisiones: string[]
  /** Ausente = alta. Presente = edición, y los campos vienen con lo guardado. */
  tarea?: TareaTipoFila
}) {
  return (
    <div className="grid grid-cols-2 gap-2.5">
      <Campo label="Código" ayuda="Se guarda en mayúsculas. No puede repetirse.">
        <input name="codigo" required maxLength={40} className={CTRL} defaultValue={tarea?.codigo ?? ''} data-testid="tarea-codigo" />
      </Campo>
      {/* CAMBIAR LA UNIDAD ES LA EDICIÓN PELIGROSA y se dice DONDE se hace: `hs_unitarias` son horas
          POR unidad, así que pasar de m² a m³ deja el mismo número significando otra cosa. Sólo se
          advierte en la edición: en el alta no hay ningún esfuerzo cargado todavía. */}
      <Campo
        label="Unidad"
        ayuda={tarea ? 'Cambiarla NO recalcula el esfuerzo: 1,35 hs/m² pasan a leerse hs/m³.' : 'm², m³, un, kg, ml…'}
      >
        <input name="unidad" required maxLength={20} className={CTRL} defaultValue={tarea?.unidad ?? ''} data-testid="tarea-unidad" />
      </Campo>
      <Campo label="Nombre" ancho="col-span-2">
        <input name="nombre" required maxLength={200} className={CTRL} defaultValue={tarea?.nombre ?? ''} data-testid="tarea-nombre" />
      </Campo>
      {/* EL RUBRO SE ELIGE ENTRE LOS QUE YA EXISTEN, y también se puede escribir uno nuevo: con un
          `select` cerrado no habría manera de abrir un rubro, y con un texto libre solo aparecen
          «Albañilería» y «albanileria» como dos rubros distintos a la semana. `list` da las dos. */}
      <Campo label="Rubro" ancho="col-span-2" ayuda="Elegí uno existente o escribí uno nuevo.">
        <input name="division" list="rubros-base-maestra" maxLength={120} className={CTRL} defaultValue={tarea?.division ?? ''} data-testid="tarea-division" />
        <datalist id="rubros-base-maestra">
          {divisiones.map((d) => <option key={d} value={d} />)}
        </datalist>
      </Campo>
      <Campo label="Descripción" ancho="col-span-2" ayuda="Qué incluye y qué no. Opcional.">
        <textarea name="descripcion" rows={3} maxLength={1000} className={CTRL} defaultValue={tarea?.descripcion ?? ''} data-testid="tarea-descripcion" />
      </Campo>
    </div>
  )
}
