'use client'

// PRÓXIMOS TRABAJOS — qué viene y qué lo está frenando.
//
// ES OTRA MIRADA DE LAS MISMAS ACTIVIDADES, no una segunda lista. Sale de filtrar el cronograma con
// `lookahead()`, la misma función que ya usaba la pestaña de Planificación: si la ventana se
// recalculara acá con otra regla, la obra tendría dos respuestas para "qué viene esta semana".
//
// SIN JERGA. Adentro el concepto se llama restricción y la tabla `obra_restriccion`, pero en la
// pantalla se lee "impedimento" y "atrasada": el jefe de obra no tiene por qué aprender el
// vocabulario de un método para cargar que le falta un plano.
//
// UN IMPEDIMENTO SIN RESPONSABLE Y SIN FECHA NO ES GESTIÓN, ES UNA QUEJA ANOTADA. Los dos campos son
// obligatorios en el formulario porque son obligatorios en la acción del servidor: si el formulario
// los dejara pasar, el error volvería igual y la carga se perdería.

import { useMemo, useState } from 'react'
import {
  BotonAccion, Callout, Campo, CTRL, FormAccion, SegmentedControl,
  type AccionFormulario, type ResultadoAccion,
} from '@/shared/components/ui'
import { lookahead } from '../services/obrasService'
import { ESTADO_LABEL, estadoDe } from '../services/cronograma'
import {
  TIPO_RESTRICCION, TIPO_RESTRICCION_LABEL, type Actividad, type Persona, type Restriccion,
} from '../types'
import { fecha } from './formato'

const VENTANAS = [
  { value: '1', label: 'Esta semana' },
  { value: '2', label: '2 semanas' },
  { value: '6', label: '6 semanas' },
] as const

/** El rojo es SÓLO para lo que está mal y el verde SÓLO para lo que está bien. El resto es tinta. */
const TONO_ESTADO: Record<string, string> = {
  atrasada: 'text-neg font-medium',
  terminada: 'text-pos',
  en_curso: 'text-ink',
  por_empezar: 'text-muted',
  sin_fecha: 'text-faint',
}

export function VistaProximos({
  actividades, impedimentos, personas = [], crear, liberar, hoy = new Date(),
}: {
  actividades: Actividad[]
  impedimentos: Restriccion[]
  personas?: Persona[]
  crear: AccionFormulario
  liberar: (restriccionId: string) => Promise<ResultadoAccion>
  hoy?: Date
}) {
  const [semanas, setSemanas] = useState<'1' | '2' | '6'>('2')
  const hoyIso = hoy.toISOString().slice(0, 10)

  const proximas = useMemo(
    () => lookahead(actividades, Number(semanas), hoy),
    [actividades, semanas, hoy],
  )

  const nombrePersona = useMemo(() => {
    const m = new Map(personas.map((p) => [p.id, p.nombre_completo]))
    return (a: Actividad) => (a.responsable_id ? m.get(a.responsable_id) ?? null : null) ?? a.cuadrilla ?? null
  }, [personas])

  const abiertos = useMemo(() => impedimentos.filter((r) => r.estado !== 'liberada'), [impedimentos])

  // "Relacionados" es literal: los que frenan una de las actividades que se están mirando, más los
  // que no cuelgan de ninguna en particular —esos frenan la obra entera y valen en cualquier ventana—.
  const enVentana = useMemo(() => new Set(proximas.map((a) => a.id)), [proximas])
  const frenanActividad = useMemo(() => {
    const s = new Set<string>()
    for (const r of abiertos) if (r.actividad_id) s.add(r.actividad_id)
    return s
  }, [abiertos])
  // EL LIBERADO NO DESAPARECE DE LA TABLA, y no es un detalle: si la fila se esfuma al tocar
  // "Liberar", el que lo tocó no tiene manera de saber si se guardó o si se equivocó de fila. Queda,
  // marcado, con la fecha — que además es el registro de que el impedimento existió y se resolvió.
  const relacionados = impedimentos.filter((r) => !r.actividad_id || enVentana.has(r.actividad_id))
  const nombreDe = (id: string | null) => (id ? actividades.find((a) => a.id === id)?.nombre ?? null : null)

  return (
    <div className="space-y-6">
      <section>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-[13px] font-semibold text-ink">Próximos trabajos</h2>
          <SegmentedControl
            options={VENTANAS}
            value={semanas}
            onChange={setSemanas}
            size="sm"
            ariaLabel="Ventana de los próximos trabajos"
          />
        </div>

        {proximas.length === 0 ? (
          <p className="text-[12px] text-faint">
            No hay actividades con fecha en {semanas === '1' ? 'esta semana' : `las próximas ${semanas} semanas`}.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-card border border-line bg-surface">
            <table data-testid="proximos-trabajos" className="w-full min-w-[560px] text-left">
              <thead><tr className="border-b border-line text-[10px] uppercase tracking-wide text-faint">
                <th className="px-3 py-2 font-medium">Actividad</th>
                <th className="px-3 py-2 font-medium">Fecha</th>
                <th className="px-3 py-2 font-medium">Responsable</th>
                <th className="px-3 py-2 text-right font-medium">Avance</th>
                <th className="px-3 py-2 text-right font-medium">Estado</th>
              </tr></thead>
              <tbody>
                {proximas.map((a) => {
                  const estado = estadoDe(a, hoyIso)
                  const frenada = frenanActividad.has(a.id)
                  return (
                    <tr key={a.id} className="border-b border-line/60 last:border-0">
                      <td className="px-3 py-2 text-[12px] text-ink">
                        {a.nombre}
                        {a.seccion && <span className="block text-[11px] text-faint">{a.seccion}</span>}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-[12px] tabular-nums text-muted">
                        {fecha(a.inicio_plan)}{a.fin_plan && a.fin_plan !== a.inicio_plan ? ` → ${fecha(a.fin_plan)}` : ''}
                      </td>
                      <td className="px-3 py-2 text-[12px] text-muted">{nombrePersona(a) ?? '—'}</td>
                      <td className="px-3 py-2 text-right text-[12px] tabular-nums text-ink">{a.pct == null ? '—' : `${a.pct}%`}</td>
                      <td className={`whitespace-nowrap px-3 py-2 text-right text-[12px] ${TONO_ESTADO[estado]}`}>
                        {ESTADO_LABEL[estado]}
                        {frenada && <span className="block text-[11px] text-warn">frenada</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-[13px] font-semibold text-ink">Impedimentos</h2>
        {impedimentos.length === 0 ? (
          <Callout tono="info">
            No hay ningún impedimento cargado. En una obra en ejecución eso rara vez significa que no haya:
            significa que nadie los anotó.
          </Callout>
        ) : relacionados.length === 0 ? (
          <p className="text-[12px] text-faint">
            Ninguno toca lo que viene en esta ventana. Hay {abiertos.length} sin resolver en otras actividades.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-card border border-line bg-surface">
            <table data-testid="tabla-impedimentos" className="w-full min-w-[680px] text-left">
              <thead><tr className="border-b border-line text-[10px] uppercase tracking-wide text-faint">
                <th className="px-3 py-2 font-medium">Qué frena</th>
                <th className="px-3 py-2 font-medium">Tipo</th>
                <th className="px-3 py-2 font-medium">Responsable</th>
                <th className="px-3 py-2 text-right font-medium">Compromiso</th>
                <th className="px-3 py-2 text-right font-medium">Estado</th>
              </tr></thead>
              <tbody>
                {relacionados.map((r) => {
                  const liberado = r.estado === 'liberada'
                  const vencido = !liberado && !!r.fecha_compromiso && r.fecha_compromiso < hoyIso
                  const act = nombreDe(r.actividad_id)
                  return (
                    <tr key={r.id} className="border-b border-line/60 last:border-0">
                      <td className="px-3 py-2 text-[12px] text-ink">
                        {r.descripcion}
                        <span className="block text-[11px] text-faint">{act ?? 'no frena una actividad en particular'}</span>
                      </td>
                      <td className="px-3 py-2 text-[12px] text-muted">{TIPO_RESTRICCION_LABEL[r.tipo] ?? r.tipo}</td>
                      <td className="px-3 py-2 text-[12px] text-muted">{r.responsable ?? <span className="text-warn">sin responsable</span>}</td>
                      <td className={`whitespace-nowrap px-3 py-2 text-right text-[12px] tabular-nums ${vencido ? 'font-medium text-neg' : 'text-muted'}`}>
                        {fecha(r.fecha_compromiso)}{vencido && ' · vencido'}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {liberado
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

        {abiertos.length > 0 && relacionados.length > 0 && (
          <p className="mt-2 text-[12px] text-faint">
            {abiertos.length} sin resolver. Liberar uno lo marca resuelto con la fecha de hoy; la fila queda.
          </p>
        )}

        <details className="mt-3 rounded-card border border-line bg-surface" data-testid="alta-impedimento">
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
      </section>
    </div>
  )
}
