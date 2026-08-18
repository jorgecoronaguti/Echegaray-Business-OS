// PERSONAL DE LA OBRA — quién está, con qué rol, y cuántas horas lleva.
//
// ═══ LAS DOS PUNTAS DE LAS HH, Y EL DESVÍO SÓLO CUANDO ESTÁN LAS DOS ═══
//
// HH plan es la suma de `obra_actividad.hh_plan`; HH real es la suma de `registros_hh` por
// `obra_canonica_id`. Las dos las publica `obra_plan_vs_real`, que también anula el desvío cuando
// falta una. Acá NO se vuelve a sumar: se muestra lo que la vista publicó y, debajo, las filas que
// lo respaldan.
//
// Hoy las 19 filas de `registros_hh` cuelgan del `obra_id` legacy y ninguna tiene el eje canónico,
// así que HH real viene en null para todas las obras. Eso se dice con esas palabras: "nadie imputó
// HH a esta obra". Un cero diría que se trabajó cero horas, que es otra cosa.

import { BotonAccion, Callout, Campo, CTRL, FormAccion, type AccionFormulario, type ResultadoAccion } from '@/shared/components/ui'
import type { Actividad, Asignacion, Persona, PlanVsReal } from '../types'
import type { RegistroHH } from '../services/personalService'
import { desvio, fecha, horas } from './formato'

function Dato({ k, v, sub }: { k: string; v: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-line bg-white px-3.5 py-2.5">
      <p className="text-[10px] uppercase tracking-wide text-faint">{k}</p>
      <p className="mt-0.5 text-[15px] font-semibold tabular-nums text-ink">{v}</p>
      {sub && <p className="text-[11px] leading-snug text-faint">{sub}</p>}
    </div>
  )
}

export function TabPersonal({
  plan, asignaciones, personas, actividades, registros, asignar, quitar,
}: {
  plan: PlanVsReal | null
  asignaciones: Asignacion[]
  personas: Persona[]
  actividades: Actividad[]
  registros: RegistroHH[]
  asignar: AccionFormulario
  quitar: (asignacionId: string) => Promise<ResultadoAccion>
}) {
  const hhPlan = plan?.hh_plan ?? null
  const hhReal = plan?.hh_real ?? null

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Dato k="Asignados" v={asignaciones.length ? String(asignaciones.length) : 'nadie'} sub={`${asignaciones.filter((a) => a.rol === 'responsable').length} responsable(s)`} />
        <Dato
          k="HH plan"
          v={horas(hhPlan)}
          sub={hhPlan == null ? 'ninguna actividad tiene HH plan cargadas' : 'suma de las actividades del cronograma'}
        />
        <Dato
          k="HH real"
          v={horas(hhReal)}
          sub={hhReal == null ? 'nadie imputó horas a esta obra' : `${registros.length} registro(s) semanales`}
        />
        <Dato
          k="Desvío"
          v={desvio(plan?.desvio_hh_pct)}
          // EL DESVÍO SIN UNA PUNTA NO ES CERO: es desconocido, y se dice cuál falta.
          sub={plan?.desvio_hh_pct != null
            ? 'real contra plan'
            : hhPlan == null && hhReal == null ? 'faltan las dos puntas'
              : hhPlan == null ? 'falta cargar HH plan en las actividades'
                : 'faltan HH reales imputadas a esta obra'}
        />
      </div>

      <div>
        <h2 className="mb-2 text-[13px] font-semibold text-ink">Quién trabaja en esta obra</h2>
        {asignaciones.length === 0 ? (
          <Callout tono="info">Todavía no hay nadie asignado. El formulario de abajo asigna gente del legajo.</Callout>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-line bg-white">
            <table data-testid="tabla-personal" className="w-full min-w-[560px] text-left">
              <thead><tr className="border-b border-line text-[10px] uppercase tracking-wide text-faint">
                <th className="px-4 py-2.5 font-medium">Persona</th>
                <th className="px-3 py-2.5 font-medium">Rol</th>
                <th className="px-3 py-2.5 font-medium">Cuadrilla</th>
                <th className="px-3 py-2.5 font-medium">Desde</th>
                <th className="px-3 py-2.5 text-right font-medium"></th>
              </tr></thead>
              <tbody>
                {asignaciones.map((a) => (
                  <tr key={a.id} className="border-b border-line/60 last:border-0">
                    <td className="px-4 py-2.5 text-[13px] text-ink">
                      {a.persona_nombre ?? <span className="text-warn">persona borrada del legajo</span>}
                      {a.persona_especialidad && <span className="block text-[11px] text-faint">{a.persona_especialidad}</span>}
                    </td>
                    <td className="px-3 py-2.5 text-[12px] text-muted">{a.rol}</td>
                    <td className="px-3 py-2.5 text-[12px] text-muted">{a.cuadrilla ?? '—'}</td>
                    <td className="px-3 py-2.5 text-[12px] tabular-nums text-muted">{fecha(a.desde)}</td>
                    <td className="px-3 py-2.5 text-right">
                      <BotonAccion accion={quitar} args={[a.id]} testid="quitar-asignacion" tono="peligro">Quitar</BotonAccion>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <details className="rounded-xl border border-line bg-white" data-testid="alta-asignacion">
        <summary className="cursor-pointer px-4 py-2.5 text-[13px] font-medium text-ink">Asignar a alguien</summary>
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
                <Campo
                  label="Actividad"
                  ancho="col-span-2 sm:col-span-3"
                  ayuda="Opcional: en blanco queda asignado a la obra entera."
                >
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

      <div>
        <h2 className="mb-2 text-[13px] font-semibold text-ink">Horas imputadas a esta obra</h2>
        {registros.length === 0 ? (
          <Callout tono="warn">
            <strong>Ningún registro de horas apunta a esta obra.</strong> Las horas cargadas en el OS cuelgan de la tabla
            vieja de obras y todavía nadie las conectó al eje canónico: por eso HH real no es cero, es desconocido.
            La carga de horas no se hace desde acá — vive en el módulo de productividad.
          </Callout>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-line bg-white">
            <table className="w-full min-w-[460px] text-left">
              <thead><tr className="border-b border-line text-[10px] uppercase tracking-wide text-faint">
                <th className="px-4 py-2 font-medium">Semana</th>
                <th className="px-3 py-2 font-medium">Trabajador o cuadrilla</th>
                <th className="px-3 py-2 text-right font-medium">Horas</th>
              </tr></thead>
              <tbody>
                {registros.map((r) => (
                  <tr key={r.id} className="border-b border-line/60 last:border-0">
                    <td className="px-4 py-2 text-[12px] tabular-nums text-muted">{fecha(r.fecha_inicio_semana)}</td>
                    <td className="px-3 py-2 text-[12px] text-ink">{r.trabajador_o_cuadrilla}</td>
                    <td className="px-3 py-2 text-right text-[12px] tabular-nums text-ink">{r.horas}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
