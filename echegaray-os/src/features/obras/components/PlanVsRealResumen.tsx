// PLAN CONTRA REAL — el bloque de desvíos del Resumen de la obra.
//
// ═══ NINGÚN SEMÁFORO SIN EXPLICACIÓN ═══
//
// Cada línea dice tres cosas y no se publica si le falta alguna: QUÉ pasa, DE QUÉ DATO sale, y a
// DÓNDE ir a mirarlo. Un punto rojo que no se puede rastrear hasta su origen no produce una
// decisión: produce una discusión sobre si el número está bien.
//
// ═══ Y LA AUSENCIA DE DESVÍO TAMBIÉN SE PUBLICA ═══
//
// Cuando falta una punta de la comparación, la línea aparece igual y dice qué falta. Si se ocultara,
// la pantalla de una obra sin presupuesto se vería idéntica a la de una obra en presupuesto — que es
// la peor forma de mentir, porque no hay ningún número que revisar.

import Link from 'next/link'
import type { PlanVsReal } from '../types'
import { lineasPlanVsReal, type Tono } from '../services/planVsReal'


const PUNTO: Record<Tono, string> = {
  alerta: 'bg-neg',
  atencion: 'bg-warn',
  ok: 'bg-pos',
  falta: 'bg-slate-300',
}

export function PlanVsRealResumen({ plan, obraId, veComercial = true }: {
  plan: PlanVsReal; obraId: string; veComercial?: boolean
}) {
  const lineas = lineasPlanVsReal(plan, veComercial)
  return (
    <div className="overflow-hidden rounded-card border border-line bg-surface" data-testid="plan-vs-real">
      <h2 className="border-b border-line px-4 py-2.5 text-[13px] font-semibold text-ink">Plan contra real</h2>
      <ul className="divide-y divide-line/60">
        {lineas.map((l) => (
          <li key={l.clave}>
            {/* ═══ EL ORIGEN TÉCNICO SE FUE DEL RENGLÓN — Y NO SE BORRÓ (18/08/2026) ═══
                El dueño, textual: *"No mostrar mensajes técnicos tipo `obra_actividad.fin_plan
                anterior a hoy...`. Eso sirve para auditoría/debug, no para UX. La trazabilidad
                técnica puede estar disponible en detalle contextual"*.

                Se veían SEIS de esas líneas apiladas bajo el titular de la obra, en gris chico,
                permanentes. Ahora viajan en el `title` del renglón: se leen al apoyar el mouse y
                siguen ahí para auditar, sin ocupar la mitad del bloque todos los días. Es la misma
                regla que el `no párrafos explicativos permanentes` de las reglas visuales.

                TOCAR LA ALERTA SIGUE LLEVANDO AL DATO: una alerta que no se puede seguir hasta su
                origen obliga a buscarlo a mano, y ahí es donde se deja de mirar. */}
            <Link
              href={`/obras/${obraId}?vista=${l.vista}`}
              title={l.origen}
              className="flex items-center gap-2.5 px-4 py-2 hover:bg-surface-quiet"
            >
              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${PUNTO[l.tono]}`} />
              <span className="min-w-0 truncate text-[13px] leading-snug text-ink">{l.titulo}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
