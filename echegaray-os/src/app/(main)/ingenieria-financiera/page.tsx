import { createClient } from '@/lib/supabase/server'
import { getModeloLiquidez, getCondicionesFinancieras, getCompararFinanciamiento, getPriorizarPagos } from '@/features/ingenieria-financiera/services/tableroService'
import { getCalendarioFinanciero } from '@/features/ingenieria-financiera/services/calendarioService'
import { getPlanVigente, getSeguimiento } from '@/features/ingenieria-financiera/services/planService'
import { getEstrategiaFinanciera } from '@/features/ingenieria-financiera/services/estrategiaService'
import {
  ModeloLiquidezSection, CondicionesSection, CompararSection, PriorizarSection, EstrategiaResumenSection,
} from '@/features/ingenieria-financiera/components/TableroFinancieroView'
import { CalendarioFinancieroView } from '@/features/ingenieria-financiera/components/CalendarioFinancieroView'
import { PlanEjecucionView } from '@/features/ingenieria-financiera/components/PlanEjecucionView'
import { fechaHora } from '@/shared/utils/fecha'

export const dynamic = 'force-dynamic'

// TABLERO DE INGENIERÍA FINANCIERA — la superficie para PROBAR el motor completo desde la web.
//
// Muestra las 7 salidas del motor de tesorería (modelo de liquidez, condiciones, comparar
// financiamiento, priorizar pagos, calendario diario, plan de tesorería y estrategia). Cada número
// salió de una tabla public.finanzas_* que un sync materializó desde el tool del motor: la Web NO
// recalcula un solo peso ni llama al orquestador. Si un número está mal, se arregla en el motor.
export default async function Page() {
  const supabase = await createClient()

  // Todas las salidas se leen en paralelo: son lecturas de tablas materializadas, sin dependencias.
  const [modelo, condiciones, comparar, priorizar, calendario, plan, estrategia] = await Promise.all([
    getModeloLiquidez(supabase),
    getCondicionesFinancieras(supabase),
    getCompararFinanciamiento(supabase),
    getPriorizarPagos(supabase),
    getCalendarioFinanciero(supabase),
    getPlanVigente(supabase),
    getEstrategiaFinanciera(supabase),
  ])
  const seguimiento = plan.data?.correlation_id
    ? (await getSeguimiento(supabase, plan.data.correlation_id)).data
    : []

  const marca = modelo.data?.calculado_en ?? calendario.generadoEn ?? null

  return (
    <main className="mx-auto max-w-6xl space-y-5 p-6">
      <header className="mb-2">
        <div className="text-[11px] uppercase tracking-wide text-slate-400">Administración y Finanzas · Ingeniería Financiera</div>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">Tablero del motor de tesorería</h1>
        <p className="mt-1 text-sm text-slate-500">
          Las siete salidas del Financial Engineering con datos reales. Todo lo que ves lo decidió el motor del OS; la web sólo lo lee. Es una superficie de lectura: prepara decisiones, no ejecuta pagos.
        </p>
      </header>

      {/* 1 · Modelo único de liquidez */}
      {modelo.data
        ? <ModeloLiquidezSection modelo={modelo.data.modelo} recomendaciones={modelo.data.recomendaciones} />
        : <Aviso>{modelo.error}</Aviso>}

      {/* 2 · Condiciones de financiamiento */}
      {condiciones.data
        ? <CondicionesSection doc={condiciones.data.condiciones} />
        : <Aviso>{condiciones.error}</Aviso>}

      {/* 3 · Comparar financiamiento */}
      {comparar.data
        ? <CompararSection doc={comparar.data.comparacion} />
        : <Aviso>{comparar.error}</Aviso>}

      {/* 4 · Priorizar pagos */}
      {priorizar.data
        ? <PriorizarSection doc={priorizar.data.priorizacion} />
        : <Aviso>{priorizar.error}</Aviso>}

      {/* 5 · Calendario financiero diario */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <header className="mb-4 flex items-baseline gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">5</span>
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Calendario financiero diario</h2>
            <p className="text-xs text-slate-500">Qué entra, qué sale y cómo queda la caja cada día, con el nivel de riesgo.</p>
          </div>
        </header>
        {calendario.data ? <CalendarioFinancieroView cal={calendario.data} /> : <Aviso>{calendario.error}</Aviso>}
      </section>

      {/* 6 · Plan de tesorería */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <header className="mb-4 flex items-baseline gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">6</span>
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Plan de tesorería</h2>
            <p className="text-xs text-slate-500">El plan cronológico ejecutable que el motor recalcula solo — pendiente de tu autorización.</p>
          </div>
        </header>
        {plan.data ? <PlanEjecucionView vigente={plan.data} seguimiento={seguimiento} /> : <Aviso>Todavía no hay un plan de tesorería calculado.</Aviso>}
      </section>

      {/* 7 · Estrategia financiera */}
      {estrategia.data
        ? <EstrategiaResumenSection e={estrategia.data.estrategia} />
        : <Aviso>{estrategia.error}</Aviso>}

      {marca && (
        <p className="text-right text-[11px] text-slate-400">Materializado por el motor de Ingeniería Financiera · {fechaHora(marca)}</p>
      )}
    </main>
  )
}

function Aviso({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">{children}</div>
}
