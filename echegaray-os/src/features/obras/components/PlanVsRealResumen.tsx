// PLAN CONTRA REAL — las lecturas del plan, debajo de la fila de métricas del Resumen.
//
// La fila de arriba dice los CUATRO NÚMEROS; esto dice qué significan y adónde ir a mirarlos.
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
//
// ═══ SIN CAJA (20/08/2026, Design Handoff V2) ═══
//
// Iba en un recuadro con borde y radio, con su propio título dentro. El handoff pide lo contrario:
// rótulo `Eyebrow` afuera, hairline superior y divisores de fila. Y el punto de «falta» era
// `bg-slate-300`, un gris que no existe en la paleta — un color fuera de `COLOR.md` es un error. La
// ausencia de dato NO lleva punto: se escribe en `faint`, que es lo que dice el sistema de estados.

import Link from 'next/link'
import { Estado, Eyebrow, type TonoEstado } from '@/shared/components/ds'
import type { EconomiaObra, PlanVsReal } from '../types'
import { lineasPlanVsReal, type Tono } from '../services/planVsReal'

const TONO: Record<Tono, TonoEstado> = {
  alerta: 'neg',
  atencion: 'warn',
  ok: 'pos',
  falta: 'nulo',
}

export function PlanVsRealResumen({ plan, obraId, veComercial = true, economia = null }: {
  plan: PlanVsReal; obraId: string; veComercial?: boolean; economia?: EconomiaObra | null
}) {
  const lineas = lineasPlanVsReal(plan, veComercial, economia)
  return (
    <section data-testid="plan-vs-real">
      <Eyebrow className="mb-3">Lecturas del plan</Eyebrow>
      <ul className="border-t border-line">
        {lineas.map((l) => (
          <li key={l.clave} className="border-b border-[#EFEEEA]">
            {/* ═══ EL ORIGEN TÉCNICO VIAJA EN EL `title`, NO EN EL RENGLÓN ═══
                El dueño, textual: *"No mostrar mensajes técnicos tipo `obra_actividad.fin_plan
                anterior a hoy...`. Eso sirve para auditoría/debug, no para UX. La trazabilidad
                técnica puede estar disponible en detalle contextual"*.

                Se veían SEIS de esas líneas apiladas bajo el titular de la obra, en gris chico,
                permanentes. Ahora se leen al apoyar el mouse y siguen ahí para auditar.

                TOCAR LA LÍNEA SIGUE LLEVANDO AL DATO: una lectura que no se puede seguir hasta su
                origen obliga a buscarlo a mano, y ahí es donde se deja de mirar. */}
            <Link
              href={`/obras/${obraId}?vista=${l.vista}`} prefetch={false}
              title={l.origen}
              className="flex h-fila-compacta items-center gap-2.5 hover:bg-surface-quiet"
            >
              <span className="min-w-0 flex-1 truncate">
                <Estado tono={TONO[l.tono]} clave={l.clave}>{l.titulo}</Estado>
              </span>
              <span className="shrink-0 text-[13px] text-faint">›</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
