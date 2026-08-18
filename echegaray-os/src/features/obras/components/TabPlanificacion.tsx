// PLANIFICACIÓN — qué viene y qué lo está frenando.
//
// SIN JERGA. Acá adentro el concepto se llama restricción y la tabla `obra_restriccion`, pero en la
// pantalla se lee "impedimento", "próximos trabajos" y "atrasos": el jefe de obra no tiene por qué
// aprender el vocabulario de un método para cargar que le falta un plano.
//
// UN IMPEDIMENTO SIN RESPONSABLE Y SIN FECHA NO ES GESTIÓN, ES UNA QUEJA ANOTADA. Los dos campos son
// obligatorios en el formulario porque son obligatorios en la acción del servidor: si el formulario
// los dejara pasar, el error volvería igual y la carga se perdería.

import { BotonAccion, Callout, Campo, CTRL, FormAccion, type AccionFormulario, type ResultadoAccion } from '@/shared/components/ui'
import { TIPO_RESTRICCION, TIPO_RESTRICCION_LABEL, type Actividad, type Restriccion } from '../types'
import { fecha } from './formato'

export function TabPlanificacion({
  proximas, impedimentos, actividades, crear, liberar,
}: {
  proximas: Actividad[]
  impedimentos: Restriccion[]
  actividades: Actividad[]
  crear: AccionFormulario
  liberar: (restriccionId: string) => Promise<ResultadoAccion>
}) {
  const hoy = new Date().toISOString().slice(0, 10)
  const abiertos = impedimentos.filter((r) => r.estado !== 'liberada')

  return (
    <div className="space-y-5">
      <div>
        <h2 className="mb-2 text-[13px] font-semibold text-ink">Próximos trabajos · seis semanas</h2>
        {proximas.length === 0 ? (
          <p className="text-[12px] text-faint">No hay actividades con fecha en las próximas seis semanas.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-line bg-white">
            <table data-testid="proximos-trabajos" className="w-full min-w-[560px] text-left">
              <thead><tr className="border-b border-line text-[10px] uppercase tracking-wide text-faint">
                <th className="px-3 py-2 font-medium">Actividad</th>
                <th className="px-3 py-2 font-medium">Cuadrilla</th>
                <th className="px-3 py-2 text-right font-medium">Inicio</th>
                <th className="px-3 py-2 text-right font-medium">Fin</th>
                <th className="px-3 py-2 text-right font-medium">Avance</th>
              </tr></thead>
              <tbody>
                {proximas.map((a) => {
                  const atrasada = a.fin_plan != null && a.fin_plan < hoy && (a.pct ?? 0) < 100
                  return (
                    <tr key={a.id} className="border-b border-line/60 last:border-0">
                      <td className="px-3 py-2 text-[12px] text-ink">
                        {a.nombre}
                        {atrasada && <span className="ml-2 text-[11px] text-neg">atrasada</span>}
                      </td>
                      <td className="px-3 py-2 text-[12px] text-muted">{a.cuadrilla ?? '—'}</td>
                      <td className="px-3 py-2 text-right text-[12px] tabular-nums text-muted">{fecha(a.inicio_plan)}</td>
                      <td className="px-3 py-2 text-right text-[12px] tabular-nums text-muted">{fecha(a.fin_plan)}</td>
                      <td className="px-3 py-2 text-right text-[12px] tabular-nums text-ink">{a.pct == null ? '—' : `${a.pct}%`}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div>
        <h2 className="mb-2 text-[13px] font-semibold text-ink">Impedimentos</h2>
        {impedimentos.length === 0 ? (
          <Callout tono="info">
            No hay ningún impedimento cargado. En una obra en ejecución eso rara vez significa que no haya:
            significa que nadie los anotó. Se cargan con el formulario de abajo.
          </Callout>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-line bg-white">
            <table data-testid="tabla-impedimentos" className="w-full min-w-[680px] text-left">
              <thead><tr className="border-b border-line text-[10px] uppercase tracking-wide text-faint">
                <th className="px-3 py-2 font-medium">Tipo</th>
                <th className="px-3 py-2 font-medium">Qué frena</th>
                <th className="px-3 py-2 font-medium">Responsable</th>
                <th className="px-3 py-2 text-right font-medium">Compromiso</th>
                <th className="px-3 py-2 text-right font-medium">Estado</th>
              </tr></thead>
              <tbody>
                {impedimentos.map((r) => {
                  const vencido = r.estado !== 'liberada' && !!r.fecha_compromiso && r.fecha_compromiso < hoy
                  return (
                    <tr key={r.id} className="border-b border-line/60 last:border-0">
                      <td className="px-3 py-2 text-[12px] text-muted">{TIPO_RESTRICCION_LABEL[r.tipo] ?? r.tipo}</td>
                      <td className="px-3 py-2 text-[12px] text-ink">{r.descripcion}</td>
                      <td className="px-3 py-2 text-[12px] text-muted">{r.responsable ?? <span className="text-warn">sin responsable</span>}</td>
                      <td className={`px-3 py-2 text-right text-[12px] tabular-nums ${vencido ? 'font-semibold text-neg' : 'text-muted'}`}>
                        {fecha(r.fecha_compromiso)}{vencido && ' · vencido'}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {r.estado === 'liberada'
                          ? <span className="text-[11px] uppercase text-faint">liberado</span>
                          : <BotonAccion accion={liberar} args={[r.id]} testid="liberar-impedimento">Liberar</BotonAccion>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        {abiertos.length > 0 && (
          <p className="mt-2 text-[12px] text-faint">
            {abiertos.length} sin resolver. Liberar uno lo marca resuelto con la fecha de hoy; la fila queda.
          </p>
        )}
      </div>

      <details className="rounded-xl border border-line bg-white" data-testid="alta-impedimento">
        <summary className="cursor-pointer px-4 py-2.5 text-[13px] font-medium text-ink">Anotar un impedimento</summary>
        <div className="border-t border-line p-4">
          <FormAccion accion={crear} testid="form-impedimento" enviar="Anotar" limpiarAlOk mensajeOk="Impedimento anotado.">
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              <Campo label="Qué frena el trabajo" ancho="col-span-2 sm:col-span-4">
                <input name="descripcion" required minLength={3} maxLength={300} className={CTRL} placeholder="falta el plano de detalle del tanque" />
              </Campo>
              <Campo label="Tipo">
                <select name="tipo" required defaultValue="material" className={CTRL}>
                  {TIPO_RESTRICCION.map((t) => <option key={t} value={t}>{TIPO_RESTRICCION_LABEL[t]}</option>)}
                </select>
              </Campo>
              <Campo label="Quién lo resuelve" ayuda="Con nombre: sin dueño no se resuelve solo.">
                <input name="responsable" required minLength={2} maxLength={120} className={CTRL} />
              </Campo>
              <Campo label="Para cuándo" ayuda="La fecha comprometida, no un deseo.">
                <input type="date" name="fecha_compromiso" required className={CTRL} />
              </Campo>
              <Campo label="Actividad que frena" ayuda="Opcional. Si se elige, la barra se marca en el Gantt.">
                <select name="actividad_id" defaultValue="" className={CTRL}>
                  <option value="">ninguna en particular</option>
                  {actividades.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
                </select>
              </Campo>
            </div>
          </FormAccion>
        </div>
      </details>
    </div>
  )
}
