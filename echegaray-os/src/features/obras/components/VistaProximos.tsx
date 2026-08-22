'use client'

// PRÓXIMOS TRABAJOS — qué viene y qué lo está frenando.
//
// ES OTRA MIRADA DE LAS MISMAS ACTIVIDADES, no una segunda lista. Sale de filtrar el cronograma con
// `lookahead()`, la misma función que usa el resto de Cronograma: si la ventana se
// recalculara acá con otra regla, la obra tendría dos respuestas para "qué viene esta semana".
//
// SIN JERGA. Adentro el concepto se llama restricción y la tabla `obra_restriccion`, pero en la
// pantalla se lee "impedimento" y "atrasada": el jefe de obra no tiene por qué aprender el
// vocabulario de un método para cargar que le falta un plano.
//
// UN IMPEDIMENTO SIN RESPONSABLE Y SIN FECHA NO ES GESTIÓN, ES UNA QUEJA ANOTADA. Los dos campos son
// obligatorios en el formulario porque son obligatorios en la acción del servidor: si el formulario
// los dejara pasar, el error volvería igual y la carga se perdería.

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { SegmentedControl } from '@/shared/components/ui'
import { lookahead } from '../services/obrasService'
import { ESTADO_LABEL, estadoDe } from '../services/cronograma'
import type { Actividad, Persona, Restriccion } from '../types'
import { fecha } from './formato'

export type Ventana = '1' | '2' | '6'

const VENTANAS: { value: Ventana; label: string }[] = [
  { value: '1', label: 'Esta semana' },
  { value: '2', label: '2 semanas' },
  { value: '6', label: '6 semanas' },
]

/** El rojo es SÓLO para lo que está mal y el verde SÓLO para lo que está bien. El resto es tinta. */
const TONO_ESTADO: Record<string, string> = {
  atrasada: 'text-neg font-medium',
  terminada: 'text-pos',
  en_curso: 'text-ink',
  por_empezar: 'text-muted',
  sin_fecha: 'text-faint',
}

export function VistaProximos({
  actividades, impedimentos, obraId, personas = [], semanas, alCambiarSemanas,
  hoy = new Date(),
}: {
  actividades: Actividad[]
  impedimentos: Restriccion[]
  /** Para poder mandar a Operación, que es donde se anotan y se liberan desde el 20/08. */
  obraId: string
  personas?: Persona[]
  /** Controlada por el que la usa —así la ventana puede vivir en la URL—. Sin esto se gobierna sola. */
  semanas?: Ventana
  alCambiarSemanas?: (v: Ventana) => void
  hoy?: Date
}) {
  const [local, setLocal] = useState<Ventana>(semanas ?? '2')
  const ventana = semanas ?? local
  const elegir = (v: Ventana) => { setLocal(v); alCambiarSemanas?.(v) }
  const hoyIso = hoy.toISOString().slice(0, 10)

  const proximas = useMemo(
    () => lookahead(actividades, Number(ventana), hoy),
    [actividades, ventana, hoy],
  )

  // RESPONSABLE Y CUADRILLA SON DOS COLUMNAS, NO UNA CON RESPALDO. Esto caía a `a.cuadrilla` cuando
  // la actividad no tenía responsable cargado, así que la columna RESPONSABLE mostraba «Cuadrilla 2»
  // y nadie podía distinguir a quién le habían asignado la actividad de con qué se ejecuta. Peor:
  // una actividad sin responsable se leía como si lo tuviera, y la deuda de carga desaparecía.
  const nombrePersona = useMemo(() => {
    const m = new Map(personas.map((p) => [p.id, p.nombre_completo]))
    return (a: Actividad) => (a.responsable_id ? m.get(a.responsable_id) ?? null : null)
  }, [personas])
  const cuadrillaDe = (a: Actividad) => a.cuadrilla_prevista ?? a.cuadrilla ?? null

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
            value={ventana}
            onChange={elegir}
            size="sm"
            ariaLabel="Ventana de los próximos trabajos"
          />
        </div>

        {proximas.length === 0 ? (
          <p className="text-[12px] text-faint">
            No hay actividades con fecha en {ventana === '1' ? 'esta semana' : `las próximas ${ventana} semanas`}.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-card border border-line bg-surface">
            <table data-testid="proximos-trabajos" className="w-full min-w-[660px] text-left">
              <thead><tr className="border-b border-line text-[10px] uppercase tracking-wide text-faint">
                <th className="px-3 py-2 font-medium">Actividad</th>
                <th className="px-3 py-2 font-medium">Fecha</th>
                <th className="px-3 py-2 font-medium">Responsable</th>
                <th className="px-3 py-2 font-medium">Cuadrilla</th>
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
                      <td className="px-3 py-2 text-[12px] text-muted">{cuadrillaDe(a) ?? '—'}</td>
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

      {/* ═══ ACÁ VIVÍA EL ALTA DE IMPEDIMENTOS, Y SE MUDÓ A OPERACIÓN (20/08/2026) ═══
          El dueño puso los cinco bloques de la ejecución diaria en una sola solapa —pedidos,
          compras, herramientas, movimientos, impedimentos— y ahí el alta vive una sola vez. Lo que
          queda acá es lo que esta pantalla sí necesita: cuáles de los que hay frenan lo que viene
          en esta ventana. Dos formularios para el mismo dato en dos pantallas se contestan distinto
          el día que a uno se le agregue un campo. */}
      <section data-testid="impedimentos-de-la-ventana">
        <h2 className="mb-2 text-[13px] font-semibold text-ink">Qué lo frena</h2>
        {abiertos.length === 0 ? (
          <p className="text-[12px] text-faint">
            Ningún impedimento sin resolver.{' '}
            <Link href={`/obras/${obraId}?vista=operacion&sub=impedimentos`} className="text-ink underline underline-offset-2">
              Anotar uno
            </Link>.
          </p>
        ) : (
          <>
            <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
              {relacionados.filter((r) => r.estado !== 'liberada').map((r) => {
                const vencido = !!r.fecha_compromiso && r.fecha_compromiso < hoyIso
                return (
                  <li key={r.id} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 px-3 py-2 text-[12px]">
                    <span className="min-w-0 flex-1 text-ink">{r.descripcion}</span>
                    <span className="text-faint">{nombreDe(r.actividad_id) ?? 'sin actividad'}</span>
                    <span className={`tabular-nums ${vencido ? 'font-medium text-neg' : 'text-muted'}`}>
                      {fecha(r.fecha_compromiso)}{vencido && ' · vencido'}
                    </span>
                  </li>
                )
              })}
            </ul>
            <p className="mt-2 text-[12px] text-faint">
              {relacionados.filter((r) => r.estado !== 'liberada').length} de {abiertos.length} sin
              resolver tocan esta ventana.{' '}
              <Link href={`/obras/${obraId}?vista=operacion&sub=impedimentos`} className="text-ink underline underline-offset-2">
                Anotarlos y liberarlos en Operación
              </Link>.
            </p>
          </>
        )}
      </section>
    </div>
  )
}
