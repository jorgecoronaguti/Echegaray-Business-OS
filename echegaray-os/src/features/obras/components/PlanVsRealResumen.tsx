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
import { desvio, fecha, plata } from './formato'

type Tono = 'alerta' | 'atencion' | 'ok' | 'falta'

const PUNTO: Record<Tono, string> = {
  alerta: 'bg-neg',
  atencion: 'bg-warn',
  ok: 'bg-pos',
  falta: 'bg-slate-300',
}

interface Linea {
  clave: string
  tono: Tono
  titulo: string
  origen: string
  vista: string
}

const hoy = () => new Date().toISOString().slice(0, 10)

/** Las cinco comparaciones del módulo, cada una con su origen. Sin ninguna inferencia: o hay dos
 *  puntas y se compara, o falta una y se nombra. */
export function lineasPlanVsReal(p: PlanVsReal): Linea[] {
  const l: Linea[] = []

  // ── PLAZO ──────────────────────────────────────────────────────────────────
  if (p.desvio_plazo_dias != null) {
    const d = p.desvio_plazo_dias
    l.push({
      clave: 'plazo',
      tono: d > 0 ? 'alerta' : 'ok',
      titulo: d > 0
        ? `El fin previsto se corrió ${d} día(s) respecto de la línea base`
        : d < 0 ? `El fin previsto se adelantó ${Math.abs(d)} día(s) respecto de la línea base`
          : 'El fin previsto coincide con la línea base',
      origen: `fin plan ${fecha(p.fin_plan)} contra fin base ${fecha(p.fin_base)} · obra_actividad`,
      vista: 'gantt',
    })
  } else {
    l.push({
      clave: 'plazo',
      tono: 'falta',
      titulo: 'No hay desvío de plazo que medir: la línea base no está sellada',
      origen: 'obra_actividad.inicio_base está vacío en todas las actividades. Se sella desde el Gantt, una sola vez.',
      vista: 'gantt',
    })
  }

  if (p.actividades_atrasadas) {
    l.push({
      clave: 'atrasos',
      tono: 'alerta',
      titulo: `${p.actividades_atrasadas} actividad(es) pasaron su fecha de fin sin llegar al 100%`,
      origen: 'obra_actividad: fin_plan anterior a hoy y avance menor a 100',
      vista: 'gantt',
    })
  }

  // ── AVANCE ─────────────────────────────────────────────────────────────────
  if (p.avance_pct == null) {
    l.push({
      clave: 'avance',
      tono: 'falta',
      titulo: p.n_actividades ? 'Hay cronograma pero ninguna actividad tiene fecha: el avance no se puede promediar' : 'Esta obra no tiene cronograma cargado',
      origen: 'vista obra_avance, la misma que publican el portafolio y el chat',
      vista: 'gantt',
    })
  } else {
    // La comparación es entre DOS datos reales: la fecha de fin prevista y el avance publicado.
    // No se proyecta una fecha de fin nueva: eso sería una estimación disfrazada de hecho.
    const vencida = p.fin_plan != null && p.fin_plan < hoy() && p.avance_pct < 100
    l.push({
      clave: 'avance',
      tono: vencida ? 'alerta' : 'ok',
      titulo: vencida
        ? `La obra pasó su fin previsto (${fecha(p.fin_plan)}) con ${p.avance_pct}% de avance`
        : `Avance ${p.avance_pct}% sobre ${p.n_actividades_medidas} de ${p.n_actividades} actividades`,
      origen: `vista obra_avance · promedio de las ${p.n_actividades_medidas} actividades con fecha`,
      vista: 'gantt',
    })
  }

  // ── HH ─────────────────────────────────────────────────────────────────────
  if (p.desvio_hh_pct != null) {
    l.push({
      clave: 'hh',
      tono: p.desvio_hh_pct > 10 ? 'alerta' : p.desvio_hh_pct > 0 ? 'atencion' : 'ok',
      titulo: `HH real ${desvio(p.desvio_hh_pct)} contra el plan (${p.hh_real} reales, ${p.hh_plan ?? p.hh_estimada} planificadas)`,
      origen: 'registros_hh por obra_canonica_id contra la suma de obra_actividad.hh_plan',
      vista: 'personal',
    })
  } else {
    l.push({
      clave: 'hh',
      tono: 'falta',
      titulo: p.hh_real == null && p.hh_plan == null && p.hh_estimada == null
        ? 'No hay desvío de HH: no hay ni horas planificadas ni horas imputadas'
        : p.hh_real == null ? 'No hay desvío de HH: nadie imputó horas a esta obra'
          : 'No hay desvío de HH: ninguna actividad tiene HH plan cargadas',
      origen: 'registros_hh y obra_actividad.hh_plan',
      vista: 'personal',
    })
  }

  // ── COSTO ──────────────────────────────────────────────────────────────────
  if (p.desvio_costo_pct != null) {
    l.push({
      clave: 'costo',
      tono: p.desvio_costo_pct > 10 ? 'alerta' : p.desvio_costo_pct > 0 ? 'atencion' : 'ok',
      titulo: `Costo real ${desvio(p.desvio_costo_pct)} contra el presupuesto (${plata(p.costo_real)} contra ${plata(p.costo_presupuestado)})`,
      origen: 'Compras (comprobantes imputados) contra presupuestos.costo_directo_presupuestado',
      vista: 'economia',
    })
  } else {
    l.push({
      clave: 'costo',
      tono: 'falta',
      titulo: p.costo_presupuestado == null
        ? 'No hay desvío de costo: esta obra no tiene presupuesto cargado'
        : 'No hay desvío de costo: ningún comprobante de Compras está imputado a esta obra',
      origen: 'presupuestos y Compras por obra',
      vista: 'economia',
    })
  }

  // ── MARGEN ─────────────────────────────────────────────────────────────────
  if (p.margen_actual != null) {
    l.push({
      clave: 'margen',
      tono: p.margen_actual < 0 ? 'alerta' : 'ok',
      titulo: `Margen a hoy ${plata(p.margen_actual)} (contratado ${plata(p.monto_contratado)} − costo ${plata(p.costo_real)})`,
      origen: 'obra_canonica.monto_contratado contra el costo real de Compras. NO es el margen de fin de obra: falta lo que queda por gastar.',
      vista: 'economia',
    })
  } else {
    l.push({
      clave: 'margen',
      tono: 'falta',
      titulo: p.monto_contratado == null
        ? 'No hay margen que calcular: falta el monto contratado'
        : 'No hay margen que calcular: falta el costo real imputado',
      origen: 'obra_canonica.monto_contratado y Compras por obra',
      vista: 'economia',
    })
  }

  return l
}

export function PlanVsRealResumen({ plan, obraId }: { plan: PlanVsReal; obraId: string }) {
  const lineas = lineasPlanVsReal(plan)
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-white" data-testid="plan-vs-real">
      <h2 className="border-b border-line px-4 py-2.5 text-[13px] font-semibold text-ink">Plan contra real</h2>
      <ul className="divide-y divide-line/60">
        {lineas.map((l) => (
          <li key={l.clave}>
            {/* TOCAR LA ALERTA LLEVA AL DATO. Una alerta que no se puede seguir hasta su origen
                obliga a buscarlo a mano, y ahí es donde se deja de mirar. */}
            <Link href={`/obras/${obraId}?vista=${l.vista}`} className="flex items-start gap-2.5 px-4 py-2.5 hover:bg-sky-50/50">
              <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${PUNTO[l.tono]}`} />
              <span className="min-w-0">
                <span className="block text-[13px] leading-snug text-ink">{l.titulo}</span>
                <span className="block text-[11px] leading-snug text-faint">{l.origen}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
