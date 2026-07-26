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
import { PageShell, Card, SectionHeader, Callout } from '@/shared/components/ui'

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
    <PageShell
      eyebrow="Administración y Finanzas · Ingeniería Financiera"
      title="Tablero del motor de tesorería"
      subtitle="Las siete salidas del Financial Engineering con datos reales. Todo lo que ves lo decidió el motor del OS; la web sólo lo lee. Es una superficie de lectura: prepara decisiones, no ejecuta pagos."
    >
      <div className="space-y-5">
        {/* 1 · Modelo único de liquidez */}
        {modelo.data
          ? <ModeloLiquidezSection modelo={modelo.data.modelo} recomendaciones={modelo.data.recomendaciones} />
          : <Callout>{modelo.error}</Callout>}

        {/* 2 · Condiciones de financiamiento */}
        {condiciones.data
          ? <CondicionesSection doc={condiciones.data.condiciones} />
          : <Callout>{condiciones.error}</Callout>}

        {/* 3 · Comparar financiamiento */}
        {comparar.data
          ? <CompararSection doc={comparar.data.comparacion} />
          : <Callout>{comparar.error}</Callout>}

        {/* 4 · Priorizar pagos */}
        {priorizar.data
          ? <PriorizarSection doc={priorizar.data.priorizacion} />
          : <Callout>{priorizar.error}</Callout>}

        {/* 5 · Calendario financiero diario */}
        <Card as="section" padding="lg">
          <SectionHeader
            title={<NumTitulo n={5}>Calendario financiero diario</NumTitulo>}
            subtitle="Qué entra, qué sale y cómo queda la caja cada día, con el nivel de riesgo."
            className="mb-4"
          />
          {calendario.data ? <CalendarioFinancieroView cal={calendario.data} /> : <Callout>{calendario.error}</Callout>}
        </Card>

        {/* 6 · Plan de tesorería */}
        <Card as="section" padding="lg">
          <SectionHeader
            title={<NumTitulo n={6}>Plan de tesorería</NumTitulo>}
            subtitle="El plan cronológico ejecutable que el motor recalcula solo — pendiente de tu autorización."
            className="mb-2"
          />
          {plan.data ? <PlanEjecucionView vigente={plan.data} seguimiento={seguimiento} /> : <Callout>Todavía no hay un plan de tesorería calculado.</Callout>}
        </Card>

        {/* 7 · Estrategia financiera */}
        {estrategia.data
          ? <EstrategiaResumenSection e={estrategia.data.estrategia} />
          : <Callout>{estrategia.error}</Callout>}

        {marca && (
          <p className="text-right text-[11px] text-faint">Materializado por el motor de Ingeniería Financiera · {fechaHora(marca)}</p>
        )}
      </div>
    </PageShell>
  )
}

function NumTitulo({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-2.5">
      <span className="flex h-6 w-6 items-center justify-center rounded-control bg-accent text-[11px] font-semibold text-white">{n}</span>
      {children}
    </span>
  )
}
