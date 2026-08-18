// 01 OBRAS · PORTAFOLIO — la cartera entera en una pantalla.
//
// Cada columna contesta una pregunta y ninguna está de adorno: en qué etapa está la obra, cuánto
// lleva ejecutado, cuánto costó hasta hoy, y qué la está frenando. Sin tarjetas de colores, sin
// gráficos de torta y sin KPIs que nadie mira: la lista ES el tablero.
//
// FUENTE: la vista `obra_panel`, que sale de `obra_canonica` cruzada con `obra_costo_real`. NO se
// lee `public.obras` legacy — era la tabla con 4 obras pausadas que hacía que la web dijera "0 obras
// activas" mientras cuatro obras facturaban $287M.

import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getPortafolio, getPlanVsRealPortafolio } from '@/features/obras/services/obrasService'
import { ETAPA_LABEL, type ObraPanel, type PlanVsReal } from '@/features/obras/types'
import { fecha, plata } from '@/features/obras/components/formato'
import { PageShell, Callout } from '@/shared/components/ui'

export const dynamic = 'force-dynamic'

/**
 * PLAZO Y MARGEN EN LA LISTA — las dos preguntas que hacen que el portafolio sirva de tablero:
 * ¿esta obra llega?, ¿esta obra deja plata? Salen de `obra_plan_vs_real`, la misma vista que la
 * ficha, y NO se recalculan acá: si el portafolio hiciera su propia cuenta, un día diría una cosa
 * distinta de la ficha de la obra y no habría manera de saber cuál de las dos miente.
 */
function Plazo({ p }: { p: PlanVsReal | undefined }) {
  if (!p) return <span className="text-[12px] text-faint">—</span>
  if (p.desvio_plazo_dias != null) {
    const d = p.desvio_plazo_dias
    return (
      <span className={`text-[12px] tabular-nums ${d > 0 ? 'font-semibold text-neg' : 'text-pos'}`}>
        {d > 0 ? `+${d} d` : d < 0 ? `${d} d` : 'en fecha'}
        {p.actividades_atrasadas ? <span className="block text-[11px] font-normal text-warn">{p.actividades_atrasadas} atrasadas</span> : null}
      </span>
    )
  }
  // SIN LÍNEA BASE NO HAY DESVÍO, Y UN CERO SERÍA UNA MENTIRA PROLIJA: diría "vamos en fecha"
  // cuando nadie aprobó todavía una fecha contra la cual medir.
  return (
    <span className="text-[12px] text-faint">
      {p.fin_plan ? `fin ${fecha(p.fin_plan)}` : 'sin fechas'}
      <span className="block text-[11px]">sin línea base</span>
      {p.actividades_atrasadas ? <span className="block text-[11px] text-warn">{p.actividades_atrasadas} atrasadas</span> : null}
    </span>
  )
}

function Margen({ p }: { p: PlanVsReal | undefined }) {
  if (p?.margen_actual != null) {
    return (
      <span className={`text-[12px] tabular-nums ${p.margen_actual < 0 ? 'font-semibold text-neg' : 'text-ink'}`}>
        {plata(p.margen_actual)}
      </span>
    )
  }
  return (
    <span className="text-[11px] leading-snug text-faint">
      {p?.monto_contratado == null ? 'falta el contratado' : 'falta el costo imputado'}
    </span>
  )
}

/** La etapa se lee de un vistazo por su posición en la línea, no por un color arbitrario. */
function Etapa({ etapa }: { etapa: ObraPanel['etapa'] }) {
  // Sin etapa declarada NO se dibuja una: el default de la columna ponía "Desarrollo" hasta en una
  // obra cerrada, y un default presentado como estado del ciclo de vida es un dato fabricado.
  if (!etapa) return <span className="text-[12px] text-faint">etapa sin declarar</span>
  const orden = ['previo', 'inicio', 'desarrollo', 'terminacion', 'cierre']
  const i = orden.indexOf(etapa)
  return (
    <span className="inline-flex items-center gap-1.5" title={ETAPA_LABEL[etapa]}>
      <span className="flex gap-[3px]">
        {orden.map((_, k) => (
          <i key={k} className={`h-1.5 w-1.5 rounded-full ${k <= i ? 'bg-slate-700' : 'bg-slate-200'}`} />
        ))}
      </span>
      <span className="text-[12px] text-muted">{ETAPA_LABEL[etapa]}</span>
    </span>
  )
}

// EL NÚMERO DICE SOBRE QUÉ SE CALCULA.
//
// No es adorno. Hasta el 17/08/2026 el OS publicaba DOS avances del mismo archivo de Drive —éste y
// el del chat— y medían poblaciones distintas: San Francisco al 85% mirando 24 actividades, y al
// 44% mirando 80. Desde entonces el cálculo es uno solo (vista `obra_avance`, la lee también el
// chat), pero la cobertura se sigue mostrando: un promedio sin decir sobre cuántas cosas se tomó es
// la mitad de un dato.
function Avance({ pct, medidas, total }: { pct: number | null; medidas: number; total: number }) {
  if (pct == null) {
    return <span className="text-[12px] text-faint">{total ? 'sin avance cargado' : 'sin cronograma'}</span>
  }
  return (
    <span className="flex items-center gap-2">
      <span className="h-1.5 w-20 shrink-0 overflow-hidden rounded-full bg-slate-100">
        <span className="block h-full rounded-full bg-sky-600" style={{ width: `${Math.min(100, pct)}%` }} />
      </span>
      <span className="w-9 shrink-0 text-right text-[12px] tabular-nums text-ink">{pct}%</span>
      <span className="whitespace-nowrap text-[11px] text-faint" title="Actividades planificadas que entran en el promedio, sobre el total del cronograma">
        {medidas}/{total}
      </span>
    </span>
  )
}

export default async function ObrasPage() {
  const supabase = await createClient()
  const [{ data, error }, { data: planes }] = await Promise.all([
    getPortafolio(supabase),
    getPlanVsRealPortafolio(supabase),
  ])
  const obras = data ?? []
  const porObra = new Map((planes ?? []).map((p) => [p.obra_id, p]))
  const activas = obras.filter((o) => o.estado === 'activa')

  return (
    <PageShell
      eyebrow="01 · Obras"
      title="Portafolio"
      subtitle={`${activas.length} obra${activas.length === 1 ? '' : 's'} en curso. El avance sale del tracker de Drive; el costo, de Compras por obra.`}
      maxWidth="max-w-7xl"
    >
      {error && <Callout tono="neg">No pude leer el portafolio: {error}</Callout>}

      {!error && obras.length === 0 && (
        <Callout tono="info">Todavía no hay obras cargadas en el eje canónico.</Callout>
      )}

      {obras.length > 0 && (
        // `overflow-hidden` RECORTABA la tabla en el teléfono: a 390px desaparecían avance,
        // contratado, costo real, actividades y restricciones — todo lo que esta pantalla existe
        // para mostrar, y sin manera de llegar a ellos. Con `overflow-x-auto` se desplaza y no se
        // pierde una sola columna.
        <div className="overflow-x-auto rounded-xl border border-line bg-white">
          <table data-testid="portafolio-tabla" className="w-full min-w-[960px] text-left">
            <thead>
              <tr className="border-b border-line text-[10px] uppercase tracking-wide text-faint">
                <th className="px-4 py-2.5 font-medium">Obra / Cliente</th>
                <th className="px-3 py-2.5 font-medium">Etapa</th>
                <th className="px-3 py-2.5 font-medium">Avance</th>
                <th className="px-3 py-2.5 font-medium">Plazo</th>
                <th className="px-3 py-2.5 text-right font-medium">Contratado</th>
                <th className="px-3 py-2.5 text-right font-medium">Costo real</th>
                <th className="px-3 py-2.5 text-right font-medium">Margen</th>
                <th className="px-3 py-2.5 font-medium">Estado</th>
                <th className="px-3 py-2.5 text-center font-medium">Impedim.</th>
              </tr>
            </thead>
            <tbody>
              {obras.map((o) => (
                <tr key={o.obra_id} className="border-b border-line/60 last:border-0 hover:bg-sky-50/50">
                  <td className="px-4 py-2.5">
                    <Link href={`/obras/${o.obra_id}`} className="block">
                      <span className="text-[13px] font-semibold text-ink hover:underline">{o.nombre}</span>
                      {/* El cliente que manda es el canónico. `cliente_texto` era lo que decía la
                          fuente, y tres obras de La Estrella eran tres cadenas iguales de casualidad. */}
                      <span className="block truncate text-[11px] text-faint">
                        {o.cliente_nombre ?? 'sin cliente declarado'}
                      </span>
                    </Link>
                  </td>
                  <td className="px-3 py-2.5"><Etapa etapa={o.etapa} /></td>
                  <td className="px-3 py-2.5"><Avance pct={o.avance_pct} medidas={o.n_actividades_medidas} total={o.n_actividades} /></td>
                  <td className="px-3 py-2.5"><Plazo p={porObra.get(o.obra_id)} /></td>
                  <td className="px-3 py-2.5 text-right text-[12px] tabular-nums text-muted">{plata(o.monto_contratado)}</td>
                  <td className="px-3 py-2.5 text-right text-[12px] tabular-nums text-ink">{plata(o.costo_real)}</td>
                  <td className="px-3 py-2.5 text-right"><Margen p={porObra.get(o.obra_id)} /></td>
                  <td className="px-3 py-2.5 text-[12px] text-muted">{o.estado}</td>
                  <td className="px-3 py-2.5 text-center text-[12px] tabular-nums">
                    {o.restricciones_abiertas === 0
                      ? <span className="text-faint">—</span>
                      : <span className={o.restricciones_vencidas > 0 ? 'font-semibold text-amber-700' : 'text-muted'}>
                          {o.restricciones_abiertas}{o.restricciones_vencidas > 0 ? ` · ${o.restricciones_vencidas} vencidas` : ''}
                        </span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* LO QUE FALTA SE DICE, no se disimula con un cero. Un contratado en "—" es un contrato que
          nadie cargó, y es distinto de un contrato de $0. */}
      {obras.some((o) => o.monto_contratado == null) && (
        <p className="mt-3 text-[12px] text-faint">
          Las obras sin monto contratado no lo tienen cargado en ninguna fuente del OS — no es que valgan cero.
        </p>
      )}
    </PageShell>
  )
}
