// PERSONAL DE LA OBRA — quién está, con qué rol, y cuántas horas lleva.
//
// ═══ ES LA MISMA RELACIÓN QUE MUESTRA LA FICHA DE LA PERSONA ═══
//
// Esta solapa NO es un segundo maestro de personas: es la vista de recursos humanos DE ESTA OBRA.
// Lee `obra_asignacion` —la misma tabla que lee `/administracion/personas/<id>`— y `registros_hh`,
// que es la única fuente de las horas. Ninguna de las dos pantallas guarda un resumen propio, y por
// eso no pueden decir cosas distintas.
//
// ═══ EL CRUCE PERSONA ↔ HORAS AHORA ES POR ID ═══
//
// Hasta el 19/08/2026 se comparaban NOMBRES normalizados, porque `registros_hh` guardaba
// `trabajador_o_cuadrilla` como texto libre. Con un apodo, una tilde o un segundo nombre, las horas
// de esa persona desaparecían de la fila sin un solo error. Ahora la imputación apunta a
// `personas.id`. Las 19 filas históricas siguen sin persona y se muestran igual en la tabla de
// abajo, marcadas: son horas reales aunque no se sepa de quién, y no se les inventa un dueño.
//
// ═══ LAS DOS PUNTAS DE LAS HH, Y EL DESVÍO SÓLO CUANDO ESTÁN LAS DOS ═══
//
// HH plan es la suma de `obra_actividad.hh_plan`; HH real es la suma de `registros_hh`. Las dos las
// publica `obra_plan_vs_real`, que también anula el desvío cuando falta una. Acá no se vuelve a
// sumar: se muestra lo que la vista publicó y, debajo, las filas que lo respaldan.

import {
  BotonAccion, Callout, Campo, CTRL, FormAccion,
  type AccionFormulario, type ResultadoAccion,
} from '@/shared/components/ui'
import type { ActividadHH, RegistroHH } from '../services/personalService'
import type { Actividad, Asignacion, Persona, PlanVsReal } from '../types'
import { etiquetaCategoria } from '@/features/administracion/types'
import { FormIndividual, FormMasiva, TablaHoras, TablaProductividad } from './PersonalHH'
import { horasPorAsignado } from '../services/productividadHH'
import { desvio } from './formato'

/**
 * EL TITULAR, EN UNA LÍNEA.
 *
 * El dueño lo dibujó así: *"12 personas · HH plan 420 · HH real 380 · −40 HH"*, y agregó *"sin KPIs
 * decorativos"*. Eran cuatro recuadros con borde; ahora es un renglón. Las mismas cuatro cifras
 * ocupan un tercio del alto y se leen de un vistazo, que es lo que hace un titular.
 *
 * NINGUNA DE LAS CUATRO SE INVENTA. Sin plan cargado no dice «0 HH»: dice «HH plan sin cargar», y el
 * desvío directamente no aparece. Un cero donde falta un dato convierte una obra sin planificar en
 * una obra perfectamente cumplida.
 */
function Titular({ plan, asignaciones, registros }: {
  plan: PlanVsReal | null; asignaciones: Asignacion[]; registros: RegistroHH[]
}) {
  const hhPlan = plan?.hh_plan ?? null
  const hhReal = plan?.hh_real ?? null
  const dif = hhPlan != null && hhReal != null ? hhReal - hhPlan : null
  const vigentes = asignaciones.filter((a) => !a.hasta)
  const n = (x: number) => Math.round(x).toLocaleString('es-AR')

  const partes = [
    vigentes.length === 0 ? 'nadie asignado' : `${vigentes.length} ${vigentes.length === 1 ? 'persona' : 'personas'}`,
    hhPlan == null ? 'HH plan sin cargar' : `HH plan ${n(hhPlan)}`,
    hhReal == null
      ? 'HH real sin imputar'
      : `HH real ${n(hhReal)} (${registros.length} ${registros.length === 1 ? 'registro' : 'registros'})`,
  ]

  return (
    <p className="text-[13px] text-muted" data-testid="titular-personal">
      {partes.join(' · ')}
      {dif != null && (
        <>
          {' · '}
          {/* ROJO SÓLO PARA UN PROBLEMA REAL: pasarse del plan de horas lo es. Estar por debajo no
              se pinta de verde —puede ser que falte imputar—, así que queda neutro. */}
          <span className={dif > 0 ? 'font-medium text-neg' : 'font-medium text-ink'}>
            {dif > 0 ? '+' : '−'}{n(Math.abs(dif))} HH
          </span>
          <span className="text-faint"> {desvio(plan?.desvio_hh_pct)}</span>
        </>
      )}
    </p>
  )
}

function TablaAsignaciones({ asignaciones, actividadDe, porAsignado, cerrar, quitar }: {
  asignaciones: Asignacion[]
  actividadDe: Map<string, string>
  porAsignado: Map<string, number>
  cerrar: (asignacionId: string) => Promise<ResultadoAccion>
  quitar: (asignacionId: string) => Promise<ResultadoAccion>
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-line bg-surface">
      <table data-testid="tabla-personal" className="w-full min-w-[620px] text-left">
        <thead><tr className="border-b border-line text-[10px] uppercase tracking-wide text-faint">
          <th className="px-4 py-2 font-medium">Persona</th>
          <th className="px-3 py-2 font-medium">Rol / categoría</th>
          <th className="px-3 py-2 font-medium">Cuadrilla</th>
          <th className="px-3 py-2 font-medium">Actividad</th>
          <th className="px-3 py-2 text-right font-medium">HH</th>
          <th className="px-3 py-2" />
        </tr></thead>
        <tbody>
          {asignaciones.map((a) => (
            <tr key={a.id} data-testid="fila-asignacion" className="border-b border-line/60 last:border-0">
              <td className="px-4 py-2 text-[13px] text-ink">
                {a.persona_nombre ?? <span className="text-warn">persona borrada del legajo</span>}
                {a.persona_especialidad && (
                  <span className="block text-[11px] text-faint">{a.persona_especialidad}</span>
                )}
              </td>
              {/* ROL Y CATEGORÍA JUNTOS: son la misma pregunta —«¿qué hace acá?»— y separarlos
                  gastaba una columna en un dato de una palabra. */}
              <td className="px-3 py-2 text-[12px] text-muted">
                {a.rol}
                {a.persona_categoria && (
                  <span className="block text-[11px] text-faint">{etiquetaCategoria(a.persona_categoria)}</span>
                )}
              </td>
              <td className="px-3 py-2 text-[12px] text-muted">{a.cuadrilla ?? '—'}</td>
              <td className="px-3 py-2 text-[12px] text-muted">
                {a.actividad_id ? (actividadDe.get(a.actividad_id) ?? '—') : 'toda la obra'}
                {/* La asignación cerrada no se esconde —es la historia de la obra— pero se dice con
                    una palabra en vez de gastar una columna de fechas en el listado operativo. */}
                {a.hasta && <span className="block text-[11px] text-faint">hasta {a.hasta}</span>}
              </td>
              <td className="px-3 py-2 text-right text-[12px] tabular-nums text-ink">
                {porAsignado.get(a.id)?.toLocaleString('es-AR', { maximumFractionDigits: 1 })
                  ?? <span className="text-faint">sin imputar</span>}
              </td>
              <td className="px-3 py-2 text-right">
                {/* CERRAR conserva el período; QUITAR borra la fila y sólo sirve para el alta hecha
                    por error. Si las dos hicieran lo mismo, cada rotación borraría el pasado. */}
                {a.hasta
                  ? <BotonAccion accion={quitar} args={[a.id]} testid="quitar-asignacion" tono="peligro">Quitar</BotonAccion>
                  : <BotonAccion accion={cerrar} args={[a.id]} testid="cerrar-asignacion">Cerrar</BotonAccion>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function TabPersonal({
  plan, asignaciones, personas, cuadrillas, actividades, actividadHH, registros,
  asignar, cerrar, quitar, imputar, imputarMasivo, borrarHoras,
}: {
  plan: PlanVsReal | null
  asignaciones: Asignacion[]
  personas: Persona[]
  cuadrillas: { id: string; nombre: string; integrantes: number }[]
  actividades: Actividad[]
  actividadHH: ActividadHH[]
  registros: RegistroHH[]
  asignar: AccionFormulario
  cerrar: (asignacionId: string) => Promise<ResultadoAccion>
  quitar: (asignacionId: string) => Promise<ResultadoAccion>
  imputar: AccionFormulario
  imputarMasivo: AccionFormulario
  borrarHoras: (registroId: string) => Promise<ResultadoAccion>
}) {
  const porAsignado = horasPorAsignado(asignaciones, registros)
  const actividadDe = new Map(actividades.map((a) => [a.id, a.nombre]))

  return (
    <div className="space-y-6">
      <Titular plan={plan} asignaciones={asignaciones} registros={registros} />

      <section>
        <h2 className="mb-2 text-[11px] font-medium uppercase tracking-wide text-faint">
          Quién trabaja en esta obra
        </h2>
        {asignaciones.length === 0
          ? <p className="text-[13px] text-muted">Nadie asignado todavía.</p>
          : (
              <TablaAsignaciones
                asignaciones={asignaciones} actividadDe={actividadDe}
                porAsignado={porAsignado} cerrar={cerrar} quitar={quitar}
              />
            )}
      </section>

      <details className="rounded-lg border border-line bg-surface" data-testid="alta-asignacion">
        <summary className="cursor-pointer px-4 py-2.5 text-[13px] font-medium text-ink">+ Asignar persona</summary>
        <div className="border-t border-line p-4">
          {personas.length === 0
            ? <Callout tono="warn">No hay ninguna persona activa en el legajo, así que no hay a quién asignar.</Callout>
            : (
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
                    <Campo label="Cuadrilla">
                      <select name="cuadrilla_id" defaultValue="" className={CTRL}>
                        <option value="">sin cuadrilla</option>
                        {cuadrillas.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                      </select>
                    </Campo>
                    <Campo label="Desde"><input type="date" name="desde" className={CTRL} /></Campo>
                    <Campo
                      label="Actividad" ancho="col-span-2 sm:col-span-3"
                      ayuda="Opcional: en blanco queda asignado a la obra entera."
                    >
                      <select name="actividad_id" defaultValue="" className={CTRL}>
                        <option value="">toda la obra</option>
                        {actividades.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
                      </select>
                    </Campo>
                    <Campo label="Notas" ancho="col-span-2 sm:col-span-4" ayuda="Por qué está en esta obra.">
                      <input name="notas" maxLength={300} className={CTRL} />
                    </Campo>
                  </div>
                </FormAccion>
              )}
        </div>
      </details>

      <section>
        <h2 className="mb-2 text-[11px] font-medium uppercase tracking-wide text-faint">
          Plan contra real por actividad
        </h2>
        <TablaProductividad actividades={actividadHH} />
      </section>

      <section>
        <h2 className="mb-2 text-[11px] font-medium uppercase tracking-wide text-faint">
          Horas imputadas a esta obra
        </h2>
        <TablaHoras registros={registros} borrarHoras={borrarHoras} />
      </section>

      <details className="rounded-lg border border-line bg-surface" data-testid="alta-hh">
        <summary className="cursor-pointer px-4 py-2.5 text-[13px] font-medium text-ink">
          + Imputar horas a una persona
        </summary>
        <div className="border-t border-line p-4">
          <FormIndividual personas={personas} asignadas={asignaciones.map((a) => a.persona_id)}
            actividades={actividades} imputar={imputar} />
        </div>
      </details>

      <details className="rounded-lg border border-line bg-surface" data-testid="alta-hh-masiva">
        <summary className="cursor-pointer px-4 py-2.5 text-[13px] font-medium text-ink">
          + Imputar horas a la cuadrilla
        </summary>
        <div className="border-t border-line p-4">
          <FormMasiva asignaciones={asignaciones} actividades={actividades} imputarMasivo={imputarMasivo} />
        </div>
      </details>
    </div>
  )
}
