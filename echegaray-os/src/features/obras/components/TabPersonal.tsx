// PERSONAL DE LA OBRA — quién está, con qué rol, y cuántas horas lleva.
//
// ═══ LAS DOS PUNTAS DE LAS HH, Y EL DESVÍO SÓLO CUANDO ESTÁN LAS DOS ═══
//
// HH plan es la suma de `obra_actividad.hh_plan`; HH real es la suma de `registros_hh` por
// `obra_canonica_id`. Las dos las publica `obra_plan_vs_real`, que también anula el desvío cuando
// falta una. Acá NO se vuelve a sumar: se muestra lo que la vista publicó y, debajo, las filas que
// lo respaldan. Sumarlo también acá sería la segunda versión del mismo número.
//
// ═══ AHORA SE PUEDEN IMPUTAR (19/08/2026) ═══
//
// Hasta hoy esta pantalla decía "la carga de horas no se hace desde acá" y era verdad por un
// defecto, no por un diseño: `registros_hh.obra_id` era `not null` contra la tabla legacy de obras,
// así que NO EXISTÍA forma de imputar una hora al eje canónico. Ver
// `20260819T0100_hh_sobre_el_eje_canonico.sql`. Las 19 filas históricas siguen colgadas de «Pisos»
// —una obra pausada sin canónica— y NO se les inventó un destino: a cuál de las ocho obras de hoy
// corresponden, si a alguna, lo decide el dueño.
//
// EL CRUCE PERSONA ↔ HORAS ES POR NOMBRE, y se dice cuando no cruza. `registros_hh` guarda
// `trabajador_o_cuadrilla` como texto libre (la fuente original, JORNALES, no usa legajo) mientras
// que la asignación apunta a `personas.id`. Donde el texto no coincide con ningún asignado, las
// horas se muestran igual en la tabla de abajo: son horas reales aunque no se sepa de quién.

import {
  BotonAccion, Callout, Campo, CTRL, FormAccion,
  type AccionFormulario, type ResultadoAccion,
} from '@/shared/components/ui'
import type { Actividad, Asignacion, Persona, PlanVsReal } from '../types'
import type { RegistroHH } from '../services/personalService'
import { desvio, fecha } from './formato'

/** Una cifra de la franja del titular. Mismo criterio que el Resumen: un recuadro, cuatro números. */
function Cifra({ k, v, sub, tono = 'ink' }: {
  k: string; v: string; sub?: string; tono?: 'ink' | 'neg' | 'warn' | 'pos'
}) {
  const color = { ink: 'text-ink', neg: 'text-neg', warn: 'text-warn', pos: 'text-pos' }[tono]
  return (
    <div className="min-w-0 px-4 py-3 first:pl-0 sm:px-5">
      <p className="text-[10px] font-medium uppercase tracking-wide text-faint">{k}</p>
      <p className={`mt-1 truncate text-[19px] font-semibold leading-none tabular-nums ${color}`}>{v}</p>
      {sub && <p className="mt-1.5 truncate text-[11px] leading-none text-faint">{sub}</p>}
    </div>
  )
}

const nrm = (s: string) => s.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')

/** Las horas que le cruzan a cada asignado por nombre. Devuelve un mapa persona_id → horas. */
export function horasPorAsignado(asignaciones: Asignacion[], registros: RegistroHH[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const a of asignaciones) {
    if (!a.persona_nombre) continue
    const suma = registros
      .filter((r) => nrm(r.trabajador_o_cuadrilla) === nrm(a.persona_nombre!))
      .reduce((s, r) => s + Number(r.horas), 0)
    if (suma > 0) m.set(a.id, suma)
  }
  return m
}

export function TabPersonal({
  plan, asignaciones, personas, actividades, registros, asignar, quitar, imputar, borrarHoras,
}: {
  plan: PlanVsReal | null
  asignaciones: Asignacion[]
  personas: Persona[]
  actividades: Actividad[]
  registros: RegistroHH[]
  asignar: AccionFormulario
  quitar: (asignacionId: string) => Promise<ResultadoAccion>
  imputar: AccionFormulario
  borrarHoras: (registroId: string) => Promise<ResultadoAccion>
}) {
  const hhPlan = plan?.hh_plan ?? null
  const hhReal = plan?.hh_real ?? null
  const dif = hhPlan != null && hhReal != null ? hhReal - hhPlan : null
  const porAsignado = horasPorAsignado(asignaciones, registros)
  const actividadDe = new Map(actividades.map((a) => [a.id, a.nombre]))

  return (
    <div className="space-y-6">
      {/* ═══ EL TITULAR ═══ */}
      <div
        className="grid grid-cols-2 divide-line rounded-lg border border-line bg-surface sm:grid-cols-4 sm:divide-x"
        data-testid="titular-personal"
      >
        <Cifra
          k="Personas"
          v={asignaciones.length ? String(asignaciones.length) : '—'}
          sub={asignaciones.length
            ? `${asignaciones.filter((a) => a.rol === 'responsable').length} responsable(s)`
            : 'nadie asignado'}
        />
        <Cifra
          k="HH plan"
          v={hhPlan == null ? '—' : Math.round(hhPlan).toLocaleString('es-AR')}
          sub={hhPlan == null ? 'sin cargar en las actividades' : 'suma del cronograma'}
        />
        <Cifra
          k="HH real"
          v={hhReal == null ? '—' : Math.round(hhReal).toLocaleString('es-AR')}
          sub={hhReal == null ? 'sin imputar' : `${registros.length} registro(s)`}
        />
        <Cifra
          k="Desvío"
          v={dif == null ? '—' : `${dif > 0 ? '+' : ''}${Math.round(dif).toLocaleString('es-AR')} HH`}
          // EL DESVÍO SIN UNA PUNTA NO ES CERO: es desconocido, y se dice cuál falta.
          sub={dif != null
            ? desvio(plan?.desvio_hh_pct)
            : hhPlan == null && hhReal == null ? 'faltan las dos puntas'
              : hhPlan == null ? 'falta el plan' : 'falta el real'}
          tono={dif != null && dif > 0 ? 'warn' : 'ink'}
        />
      </div>

      {/* ═══ QUIÉN TRABAJA ═══ */}
      <section>
        <div className="mb-2 flex items-baseline justify-between gap-3">
          <h2 className="text-[11px] font-medium uppercase tracking-wide text-faint">Quién trabaja en esta obra</h2>
        </div>
        {asignaciones.length === 0 ? (
          <p className="text-[13px] text-muted">Nadie asignado todavía.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-line bg-surface">
            <table data-testid="tabla-personal" className="w-full min-w-[640px] text-left">
              <thead><tr className="border-b border-line text-[10px] uppercase tracking-wide text-faint">
                <th className="px-4 py-2 font-medium">Persona</th>
                <th className="px-3 py-2 font-medium">Rol</th>
                <th className="px-3 py-2 font-medium">Cuadrilla</th>
                <th className="px-3 py-2 font-medium">Actividad</th>
                <th className="px-3 py-2 text-right font-medium">HH</th>
                <th className="px-3 py-2 text-right font-medium" />
              </tr></thead>
              <tbody>
                {asignaciones.map((a) => (
                  <tr key={a.id} className="border-b border-line/60 last:border-0">
                    <td className="px-4 py-2 text-[13px] text-ink">
                      {a.persona_nombre ?? <span className="text-warn">persona borrada del legajo</span>}
                      {a.persona_especialidad && <span className="block text-[11px] text-faint">{a.persona_especialidad}</span>}
                    </td>
                    <td className="px-3 py-2 text-[12px] text-muted">{a.rol}</td>
                    <td className="px-3 py-2 text-[12px] text-muted">{a.cuadrilla ?? '—'}</td>
                    <td className="px-3 py-2 text-[12px] text-muted">
                      {a.actividad_id ? (actividadDe.get(a.actividad_id) ?? '—') : 'toda la obra'}
                    </td>
                    <td className="px-3 py-2 text-right text-[12px] tabular-nums text-ink">
                      {porAsignado.get(a.id)?.toLocaleString('es-AR', { maximumFractionDigits: 1 }) ?? '—'}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <BotonAccion accion={quitar} args={[a.id]} testid="quitar-asignacion" tono="peligro">Quitar</BotonAccion>
                    </td>
                  </tr>
                ))}
                <tr className="border-t border-line bg-surface-quiet">
                  <td className="px-4 py-2 text-[12px] font-medium text-muted" colSpan={4}>Total imputado a la obra</td>
                  <td className="px-3 py-2 text-right text-[12px] font-semibold tabular-nums text-ink">
                    {hhReal == null ? '—' : Math.round(hhReal).toLocaleString('es-AR')}
                  </td>
                  <td />
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </section>

      <details className="rounded-lg border border-line bg-surface" data-testid="alta-asignacion">
        <summary className="cursor-pointer px-4 py-2.5 text-[13px] font-medium text-ink">+ Asignar persona</summary>
        <div className="border-t border-line p-4">
          {personas.length === 0 ? (
            <Callout tono="warn">No hay ninguna persona activa en el legajo, así que no hay a quién asignar.</Callout>
          ) : (
            <FormAccion accion={asignar} testid="form-asignar" enviar="Asignar" limpiarAlOk mensajeOk="Asignado.">
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                <Campo label="Persona" ancho="col-span-2">
                  <select name="persona_id" required className={CTRL} defaultValue="">
                    <option value="" disabled>elegir del legajo</option>
                    {personas.map((p) => <option key={p.id} value={p.id}>{p.nombre_completo}</option>)}
                  </select>
                </Campo>
                <Campo label="Rol">
                  <select name="rol" defaultValue="integrante" className={CTRL}>
                    <option value="integrante">integrante</option>
                    <option value="responsable">responsable</option>
                  </select>
                </Campo>
                <Campo label="Cuadrilla"><input name="cuadrilla" maxLength={120} className={CTRL} /></Campo>
                <Campo label="Desde"><input type="date" name="desde" className={CTRL} /></Campo>
                <Campo label="Actividad" ancho="col-span-2 sm:col-span-3" ayuda="Opcional: en blanco queda asignado a la obra entera.">
                  <select name="actividad_id" defaultValue="" className={CTRL}>
                    <option value="">toda la obra</option>
                    {actividades.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
                  </select>
                </Campo>
                <Campo label="Notas" ancho="col-span-2 sm:col-span-4" ayuda="Por qué está en esta obra, o hasta cuándo.">
                  <input name="notas" maxLength={300} className={CTRL} />
                </Campo>
              </div>
            </FormAccion>
          )}
        </div>
      </details>

      {/* ═══ LAS HORAS ═══ */}
      <section>
        <h2 className="mb-2 text-[11px] font-medium uppercase tracking-wide text-faint">Horas imputadas a esta obra</h2>
        {registros.length === 0 ? (
          <p className="text-[13px] text-muted">Sin horas imputadas. Se cargan por semana con el formulario de abajo.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-line bg-surface">
            <table data-testid="tabla-hh" className="w-full min-w-[520px] text-left">
              <thead><tr className="border-b border-line text-[10px] uppercase tracking-wide text-faint">
                <th className="px-4 py-2 font-medium">Semana</th>
                <th className="px-3 py-2 font-medium">Trabajador o cuadrilla</th>
                <th className="px-3 py-2 font-medium">Categoría</th>
                <th className="px-3 py-2 text-right font-medium">Horas</th>
                <th className="px-3 py-2 text-right font-medium" />
              </tr></thead>
              <tbody>
                {registros.map((r) => (
                  <tr key={r.id} className="border-b border-line/60 last:border-0">
                    <td className="px-4 py-2 text-[12px] tabular-nums text-muted">{fecha(r.fecha_inicio_semana)}</td>
                    <td className="px-3 py-2 text-[12px] text-ink">{r.trabajador_o_cuadrilla}</td>
                    <td className="px-3 py-2 text-[12px] text-muted">{r.categoria?.replace(/_/g, ' ') ?? '—'}</td>
                    <td className="px-3 py-2 text-right text-[12px] tabular-nums text-ink">{r.horas}</td>
                    <td className="px-3 py-2 text-right">
                      <BotonAccion accion={borrarHoras} args={[r.id]} testid="borrar-hh" tono="peligro">Quitar</BotonAccion>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <details className="rounded-lg border border-line bg-surface" data-testid="alta-hh">
        <summary className="cursor-pointer px-4 py-2.5 text-[13px] font-medium text-ink">+ Imputar horas</summary>
        <div className="border-t border-line p-4">
          <FormAccion accion={imputar} testid="form-hh" enviar="Imputar" limpiarAlOk mensajeOk="Horas imputadas.">
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              <Campo label="Trabajador o cuadrilla" ancho="col-span-2" ayuda="El nombre como figura en la planilla de jornales.">
                <input name="trabajador_o_cuadrilla" required maxLength={160} list="plantel-obra" className={CTRL} />
                <datalist id="plantel-obra">
                  {personas.map((p) => <option key={p.id} value={p.nombre_completo} />)}
                </datalist>
              </Campo>
              <Campo label="Semana" ayuda="Se guarda el lunes.">
                <input type="date" name="semana" required className={CTRL} />
              </Campo>
              <Campo label="Horas"><input type="number" name="horas" required min="0.5" max="400" step="0.5" className={CTRL} /></Campo>
              <Campo label="Categoría" ancho="col-span-2">
                <select name="categoria" defaultValue="" className={CTRL}>
                  <option value="">sin declarar</option>
                  <option value="oficial_especializado">oficial especializado</option>
                  <option value="oficial">oficial</option>
                  <option value="medio_oficial">medio oficial</option>
                  <option value="ayudante">ayudante</option>
                </select>
              </Campo>
              <Campo label="Notas" ancho="col-span-2"><input name="notas" maxLength={300} className={CTRL} /></Campo>
            </div>
          </FormAccion>
        </div>
      </details>
    </div>
  )
}
