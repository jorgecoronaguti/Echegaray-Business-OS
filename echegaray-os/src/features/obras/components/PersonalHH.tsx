// LAS HORAS DE LA OBRA — productividad por actividad, detalle y las dos formas de cargar.
//
// ═══ UN SOLO CÁLCULO DE PLAN CONTRA REAL ═══
//
// La tabla de productividad NO suma nada: muestra lo que publica `obra_actividad_hh`, que es la
// misma vista que lee Cronograma. Si esta pantalla volviera a sumar `registros_hh` por su cuenta,
// habría dos números para el mismo hecho y el día que difieran nadie sabría cuál mirar.
//
// ═══ EL DESVÍO SÓLO CON LAS DOS PUNTAS ═══
//
// Sin `hh_plan` cargada NO hay 0% de desvío: hay «HH plan sin cargar». Asumir cero convierte una
// actividad sin planificar en una actividad perfectamente cumplida, que es la mentira más cara que
// puede decir esta pantalla.

import {
  Campo, CTRL, FormAccion, BotonAccion,
  type AccionFormulario, type ResultadoAccion,
} from '@/shared/components/ui'
import type { ActividadHH, RegistroHH } from '../services/personalService'
import type { Actividad, Asignacion, Persona } from '../types'
import { lecturaProductividad } from '../services/productividadHH'
import { TIPOS_HORA, TIPO_HORA_LABEL, type TipoHora } from '../services/tipoHora'

const hh = (n: number | null) => (n == null ? '—' : n.toLocaleString('es-AR', { maximumFractionDigits: 1 }))
const pct = (n: number | null) => (n == null ? '—' : `${Number(n).toLocaleString('es-AR', { maximumFractionDigits: 1 })}%`)

// `lecturaProductividad` vive en `services/productividadHH.ts` y no acá: `node --test` no sabe leer
// `.tsx`, y una regla que decide si la pantalla dice la verdad tiene que poder probarse.

export function TablaProductividad({ actividades }: { actividades: ActividadHH[] }) {
  // Las que no tienen ni plan ni horas no dicen nada y ensucian la lectura de las que sí.
  const conAlgo = actividades.filter((a) => a.hh_plan != null || a.hh_real != null)
  if (conAlgo.length === 0) {
    return (
      <p className="text-[13px] text-muted">
        Ninguna actividad tiene HH plan cargadas ni horas imputadas. El plan se carga en Cronograma;
        las horas, acá abajo.
      </p>
    )
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-line bg-surface">
      <table data-testid="tabla-productividad" className="w-full min-w-[680px] text-left">
        <thead><tr className="border-b border-line text-[10px] uppercase tracking-wide text-faint">
          <th className="px-4 py-2 font-medium">Actividad</th>
          <th className="px-3 py-2 text-right font-medium">Avance</th>
          <th className="px-3 py-2 text-right font-medium">HH plan</th>
          <th className="px-3 py-2 text-right font-medium">HH real</th>
          <th className="px-3 py-2 font-medium">Lectura</th>
        </tr></thead>
        <tbody>
          {conAlgo.map((a) => (
            <tr key={a.actividad_id} data-testid="fila-productividad" className="border-b border-line/60 last:border-0">
              <td className="px-4 py-2 text-[13px] text-ink">{a.nombre}</td>
              <td className="px-3 py-2 text-right text-[12px] tabular-nums text-muted">{pct(a.avance_pct)}</td>
              <td className="px-3 py-2 text-right text-[12px] tabular-nums text-muted">{hh(a.hh_plan)}</td>
              <td className="px-3 py-2 text-right text-[12px] tabular-nums text-ink">{hh(a.hh_real)}</td>
              <td className="px-3 py-2 text-[12px] text-muted">{lecturaProductividad(a)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function TablaHoras({
  registros, borrarHoras,
}: {
  registros: RegistroHH[]
  borrarHoras: (registroId: string) => Promise<ResultadoAccion>
}) {
  if (registros.length === 0) {
    return <p className="text-[13px] text-muted">Sin horas imputadas. Se cargan con los formularios de abajo.</p>
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-line bg-surface">
      <table data-testid="tabla-hh" className="w-full min-w-[600px] text-left">
        <thead><tr className="border-b border-line text-[10px] uppercase tracking-wide text-faint">
          <th className="px-4 py-2 font-medium">Día</th>
          <th className="px-3 py-2 font-medium">Persona</th>
          <th className="px-3 py-2 font-medium">Actividad</th>
          <th className="px-3 py-2 font-medium">Tipo</th>
          <th className="px-3 py-2 text-right font-medium">Horas</th>
          <th className="px-3 py-2" />
        </tr></thead>
        <tbody>
          {registros.map((r) => (
            <tr key={r.id} data-testid="fila-hh" className="border-b border-line/60 last:border-0">
              <td className="px-4 py-2 text-[12px] tabular-nums text-muted">
                {/* Las filas legacy no tienen día: su grano es la semana, y se dice así en vez de
                    inventarles un lunes que nadie cargó. */}
                {r.fecha ?? `semana del ${r.fecha_inicio_semana}`}
              </td>
              <td className="px-3 py-2 text-[12px] text-ink">
                {r.persona_nombre ?? r.trabajador_o_cuadrilla ?? '—'}
                {!r.persona_id && (
                  <span className="block text-[10px] text-faint">carga vieja, sin legajo vinculado</span>
                )}
              </td>
              <td className="px-3 py-2 text-[12px] text-muted">{r.actividad_nombre ?? 'toda la obra'}</td>
              {/* La normal no se rotula: es el 95% de las filas y ponerle una etiqueta a cada una
                  haría que la excepción —que es lo que hay que ver— dejara de saltar a la vista. */}
              <td className="px-3 py-2 text-[12px] text-muted">
                {r.tipo_hora && r.tipo_hora !== 'normal' ? TIPO_HORA_LABEL[r.tipo_hora as TipoHora] : ''}
              </td>
              <td className="px-3 py-2 text-right text-[12px] tabular-nums text-ink">{hh(r.horas)}</td>
              <td className="px-3 py-2 text-right">
                <BotonAccion accion={borrarHoras} args={[r.id]} testid="borrar-hh" tono="peligro">Quitar</BotonAccion>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** LA CLASE DE HORA, en todas las cargas. Arranca en «Normal» porque es lo que se carga casi
 *  siempre: el que tuvo extras la cambia, y el que no, no toca nada. */
function SelectTipoHora({ nombre = 'tipo_hora', compacto = false }: { nombre?: string; compacto?: boolean }) {
  return (
    <select
      name={nombre} defaultValue="normal" data-testid={compacto ? 'tipo-masiva' : 'tipo-hora'}
      className={compacto
        ? 'shrink-0 rounded-control border border-line bg-white px-1.5 py-1 text-[11px] text-muted'
        : CTRL}
    >
      {TIPOS_HORA.map((t) => <option key={t} value={t}>{TIPO_HORA_LABEL[t]}</option>)}
    </select>
  )
}

function SelectActividad({ actividades }: { actividades: Actividad[] }) {
  return (
    <select name="actividad_id" defaultValue="" className={CTRL}>
      <option value="">toda la obra</option>
      {actividades.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
    </select>
  )
}

/** CARGA A: una persona, un día. */
export function FormIndividual({
  personas, asignadas, actividades, imputar,
}: {
  personas: Persona[]
  /** Los ids de quienes están asignados a ESTA obra hoy. Se muestran primero. */
  asignadas?: string[]
  actividades: Actividad[]
  imputar: AccionFormulario
}) {
  // ═══ LOS DE ESTA OBRA ARRIBA, EL RESTO DEL PLANTEL DESPUÉS (19/08/2026, QA) ═══
  //
  // La lista traía las 30 personas de la empresa en un solo bloque alfabético, así que imputarle
  // horas a alguien que no trabaja en esta obra era tan fácil como imputárselas al de al lado. No
  // se recorta la lista —a veces hay que cargarle horas a alguien que todavía no está asignado, y
  // esconderlo obligaría a salir de la pantalla—: se separa en dos grupos, y el que se usa todos
  // los días queda primero.
  const enLaObra = new Set(asignadas ?? [])
  const acá = personas.filter((p) => enLaObra.has(p.id))
  const resto = personas.filter((p) => !enLaObra.has(p.id))
  return (
    <FormAccion accion={imputar} testid="form-hh" enviar="Imputar" limpiarAlOk mensajeOk="Horas imputadas.">
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <Campo label="Persona" ancho="col-span-2">
          <select name="persona_id" required defaultValue="" className={CTRL}>
            <option value="" disabled>elegir del plantel</option>
            {acá.length > 0 && (
              <optgroup label="En esta obra">
                {acá.map((p) => <option key={p.id} value={p.id}>{p.nombre_completo}</option>)}
              </optgroup>
            )}
            {resto.length > 0 && (
              <optgroup label={acá.length > 0 ? 'Resto del plantel' : 'Plantel'}>
                {resto.map((p) => <option key={p.id} value={p.id}>{p.nombre_completo}</option>)}
              </optgroup>
            )}
          </select>
        </Campo>
        <Campo label="Día"><input type="date" name="fecha" required className={CTRL} /></Campo>
        <Campo label="Horas">
          {/* JORNADA COMPLETA POR DEFECTO, igual que la carga masiva: medido por QA, la carga de a
              una persona pedía tipear el número a mano y era el único campo que no se podía dejar
              como venía. Ocho es lo que sale en la enorme mayoría de las filas; el que hizo media
              jornada lo corrige, que es un caso y no la regla. */}
          <input type="number" name="horas" required min="0.5" max="24" step="0.5" defaultValue="8" className={CTRL} />
        </Campo>
        <Campo label="Actividad" ancho="col-span-2" ayuda="Opcional: en blanco quedan imputadas a la obra entera.">
          <SelectActividad actividades={actividades} />
        </Campo>
        <Campo label="Tipo de hora" ancho="col-span-2"
          ayuda="Las horas se cargan reales: el recargo no se multiplica acá.">
          <SelectTipoHora />
        </Campo>
        <Campo label="Observación" ancho="col-span-2">
          <input name="notas" maxLength={300} className={CTRL} />
        </Campo>
      </div>
    </FormAccion>
  )
}

/**
 * CARGA B: la cuadrilla entera, un día.
 *
 * ═══ POR QUÉ NO HAY CASILLAS DE SELECCIÓN ═══
 *
 * La selección ES el casillero de horas: en blanco no se imputa. Un par casilla+horas obliga a
 * mantener dos estados coherentes —marcado con horas vacías, sin marcar con 8— y eso necesita
 * JavaScript de cliente para algo que un campo vacío ya dice. Además, es el mismo gesto con el que
 * se corrige una excepción: el que hizo media jornada se escribe 4 y listo.
 */
export function FormMasiva({
  asignaciones, actividades, imputarMasivo,
}: {
  asignaciones: Asignacion[]
  actividades: Actividad[]
  imputarMasivo: AccionFormulario
}) {
  const vigentes = asignaciones.filter((a) => !a.hasta && a.persona_nombre)
  if (vigentes.length === 0) {
    return (
      <p className="text-[13px] text-muted">
        No hay nadie asignado a la obra con asignación vigente: la carga masiva sale de esa lista.
      </p>
    )
  }
  const grupos = new Map<string, Asignacion[]>()
  for (const a of vigentes) {
    const k = a.cuadrilla ?? 'Sin cuadrilla'
    grupos.set(k, [...(grupos.get(k) ?? []), a])
  }

  return (
    <FormAccion accion={imputarMasivo} testid="form-hh-masiva" enviar="Imputar a todos" mensajeOk="Imputado.">
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <Campo label="Día"><input type="date" name="fecha" required className={CTRL} /></Campo>
        <Campo label="Actividad" ancho="col-span-2 sm:col-span-2" ayuda="Opcional: en blanco quedan en la obra entera.">
          <SelectActividad actividades={actividades} />
        </Campo>
        <Campo label="Tipo de hora" ayuda="El de toda la carga. Se puede cambiar de a uno abajo.">
          <SelectTipoHora />
        </Campo>
      </div>

      <div className="mt-3 space-y-3">
        {[...grupos.entries()].map(([cuadrilla, gente]) => (
          <div key={cuadrilla}>
            <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-faint">{cuadrilla}</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {gente.map((a) => (
                <label key={a.persona_id} className="flex items-center justify-between gap-3 rounded-control border border-line bg-white px-2.5 py-1.5">
                  <span className="min-w-0 truncate text-[12px] text-ink">{a.persona_nombre}</span>
                  {/* LA EXCEPCIÓN SE CORRIGE DONDE ESTÁ LA PERSONA. El dueño pidió poder cambiarle
                      las horas Y el tipo a uno solo: en una cuadrilla que se quedó hasta tarde, dos
                      hicieron extras y el resto no. Sin tipo por persona habría que cargar la misma
                      cuadrilla dos veces. En blanco hereda el tipo general de arriba. */}
                  <span className="flex shrink-0 items-center gap-1.5">
                    <SelectTipoHora nombre={`tipo_${a.persona_id}`} compacto />
                    <input
                      type="number" name={`horas_${a.persona_id}`} min="0" max="24" step="0.5"
                      defaultValue="8" data-testid="horas-masiva"
                      className="w-16 shrink-0 rounded-control border border-line px-2 py-1 text-right text-[12px] tabular-nums text-ink"
                    />
                  </span>
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>

      <p className="mt-2 text-[11px] text-faint">
        El que no trabajó se deja en blanco o en cero: no se imputa. Quien ya tenga horas cargadas ese
        día se saltea y se avisa cuántos fueron.
      </p>
      <Campo label="Observación" ancho="mt-2 block">
        <input name="notas" maxLength={300} className={CTRL} />
      </Campo>
    </FormAccion>
  )
}
