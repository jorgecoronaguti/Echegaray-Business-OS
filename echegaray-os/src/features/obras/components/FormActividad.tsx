'use client'

// LOS FORMULARIOS DE UNA ACTIVIDAD — alta, edición y avance rápido.
//
// Viven juntos y aparte del panel por dos razones. Una: el alta y la edición comparten los MISMOS
// campos, y separadas terminarían aceptando cosas distintas sin que nadie lo note hasta que una
// obra tenga dos actividades que no se pueden comparar. Dos: el panel es una pantalla de LECTURA
// con acciones al pie —Plan contra Real, secciones plegables—, y meterle trescientas líneas de
// formulario adentro lo volvía imposible de leer.
//
// LA LÍNEA BASE NO SE TOCA DESDE ACÁ, y es la regla dura del módulo. Guardar mueve
// `inicio_plan`/`fin_plan` y NADA MÁS: `inicio_base`/`fin_base` sólo los escribe `sellarBaseline`,
// una vez. Si la edición moviera también la base, replanificar dejaría el desvío en cero para
// siempre y el tablero diría que la obra siempre va en fecha.

import { useState } from 'react'
import { BotonAccion, Campo, CTRL, FormAccion } from '@/shared/components/ui'
import type { Actividad, Persona } from '../types'
import type { ActividadHH } from '../services/personalService'
import type { AccionesCronograma } from './PanelActividad'

const fmt = (v: string | number | null | undefined) => (v == null ? '' : String(v))

function SelectResponsable({ personas, valor }: { personas: Persona[]; valor: string | null }) {
  return (
    <select name="responsable_id" defaultValue={valor ?? ''} className={CTRL}>
      <option value="">sin responsable asignado</option>
      {personas.map((p) => <option key={p.id} value={p.id}>{p.nombre_completo}</option>)}
    </select>
  )
}

/** HH real no es un campo: se muestra lo que publica `obra_actividad_hh`, que es un solo cálculo. */
function HHReal({ hh }: { hh?: ActividadHH }) {
  return (
    <Campo label="HH real" ayuda="Suma de las horas imputadas a esta actividad.">
      <p className="mt-1 py-1.5 font-mono text-[12.5px] tabular-nums text-ink" data-testid="actividad-hh-real">
        {hh?.hh_real == null
          ? <span className="font-sans text-faint">sin imputar</span>
          : Number(hh.hh_real).toLocaleString('es-AR', { maximumFractionDigits: 1 })}
        {hh?.desvio_pct != null && (
          <span className="ml-2 font-sans text-[11px] text-faint">
            {Number(hh.desvio_pct) > 0 ? '+' : ''}{Number(hh.desvio_pct)}% vs plan
          </span>
        )}
        {/* EL DESVÍO SIN LAS DOS PUNTAS NO ES CERO: es desconocido, y se dice cuál falta. */}
        {hh?.hh_real != null && hh?.hh_plan == null && (
          <span className="ml-2 font-sans text-[11px] text-warn">HH plan sin cargar</span>
        )}
      </p>
    </Campo>
  )
}

/** Los campos comunes al alta y a la edición. */
export function CamposActividad({ a, personas, hh, rubros = [] }: {
  a?: Actividad; personas: Persona[]; hh?: ActividadHH; rubros?: string[]
}) {
  return (
    <div className="grid grid-cols-2 gap-2.5">
      <Campo label="Actividad" ancho="col-span-2">
        <input name="nombre" defaultValue={fmt(a?.nombre)} required minLength={2} maxLength={200} className={CTRL} />
      </Campo>
      {!a && (
        // EL RUBRO SE ELIGE DE LOS QUE YA EXISTEN, y el campo libre queda para el que no está.
        // Escribiéndolo a mano cada vez, «Mampostería» y «MAMPOSTERIA» terminan siendo dos grupos.
        <Campo label="Rubro" ancho="col-span-2" ayuda="Agrupa la actividad en el cronograma. Se puede cambiar después.">
          <input name="seccion" maxLength={120} list="rubros-obra" className={CTRL} placeholder="opcional" data-testid="alta-rubro" />
          <datalist id="rubros-obra">
            {rubros.map((r) => <option key={r} value={r} />)}
          </datalist>
        </Campo>
      )}
      <Campo label="Inicio previsto"><input type="date" name="inicio_plan" defaultValue={fmt(a?.inicio_plan)} className={CTRL} /></Campo>
      <Campo label="Fin previsto"><input type="date" name="fin_plan" defaultValue={fmt(a?.fin_plan)} className={CTRL} /></Campo>
      <Campo label="Días"><input type="number" name="dias_plan" min={0} step={1} defaultValue={fmt(a?.dias_plan)} className={CTRL} /></Campo>
      <Campo label="Avance %"><input type="number" name="pct" min={0} max={100} step={1} defaultValue={fmt(a?.pct)} className={CTRL} /></Campo>
      <Campo label="HH plan"><input type="number" name="hh_plan" min={0} step="0.5" defaultValue={fmt(a?.hh_plan)} className={CTRL} /></Campo>
      <HHReal {...(hh ? { hh } : {})} />
      <Campo label="Responsable" ancho="col-span-2"><SelectResponsable personas={personas} valor={a?.responsable_id ?? null} /></Campo>
      <Campo label="Cuadrilla" ancho="col-span-2"><input name="cuadrilla" defaultValue={fmt(a?.cuadrilla)} maxLength={120} className={CTRL} /></Campo>
      <Campo label="Notas" ancho="col-span-2"><input name="comentario" defaultValue={fmt(a?.comentario)} maxLength={400} className={CTRL} /></Campo>
      {!a && (
        <label className="col-span-2 flex items-center gap-2 text-[12px] text-muted">
          <input type="checkbox" name="es_hito" className="h-3.5 w-3.5" /> Es un hito (una fecha, sin duración)
        </label>
      )}
    </div>
  )
}

/**
 * El avance rápido: un toque para los valores de siempre, y un campo para el resto.
 *
 * El campo arranca en el avance que tiene la actividad y el componente se REMONTA por `key` cuando
 * cambia la actividad o su avance. Sin eso, al pasar de una barra a otra el campo se quedaba con el
 * número de la anterior, y registrar habría escrito el avance de una actividad sobre otra.
 */
export function AvanceRapido({ a, avance }: { a: Actividad; avance: AccionesCronograma['avance'] }) {
  const [valor, setValor] = useState<string>(a.pct == null ? '' : String(a.pct))
  return (
    <div className="rounded-control border border-line bg-surface px-2.5 py-2" data-testid="avance-rapido">
      <p className="text-[11px] font-medium tracking-[0.04em] text-faint">Registrar avance</p>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        {[0, 25, 50, 75, 100].map((p) => (
          <BotonAccion key={p} accion={() => avance(a.id, p)} testid={`avance-${p}`}>{p}%</BotonAccion>
        ))}
        <input
          type="number" min={0} max={100} step={1} value={valor}
          onChange={(e) => setValor(e.target.value)}
          data-testid="avance-valor"
          className="w-16 rounded-control border border-line-strong px-2 py-1 font-mono text-[12.5px] tabular-nums"
        />
        <BotonAccion accion={() => avance(a.id, Number(valor))} testid="avance-guardar" tono="fuerte">Registrar</BotonAccion>
      </div>
    </div>
  )
}

/** El alta. Vive en el mismo archivo que la edición porque comparten los campos. */
export function FormNuevaActividad({ personas, crear, rubros = [] }: {
  personas: Persona[]
  crear: AccionesCronograma['crear']
  rubros?: string[]
}) {
  return (
    <FormAccion accion={crear} testid="form-nueva-actividad" enviar="Crear actividad" limpiarAlOk mensajeOk="Actividad creada.">
      <CamposActividad personas={personas} rubros={rubros} />
    </FormAccion>
  )
}
