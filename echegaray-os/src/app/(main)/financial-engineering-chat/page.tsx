import { FinancialEngineeringChat } from '@/features/financial-engineering-chat/components/FinancialEngineeringChat'
import { PageShell } from '@/shared/components/ui'

// FINANCIAL ENGINEERING MULTI-EXPERTO (FE1). La página monta la UI cliente; el backend
// (/api/financial-engineering-chat) lee el contexto financiero de las fuentes únicas del OS y corre las
// tres lentes expertas + la comparación. RAZONA sólo cuando el dueño pregunta. Es SÓLO-LECTURA: nunca
// toca el Google Sheet ni la base.
export const metadata = { title: 'Financial Engineering — multi-experto' }
export const dynamic = 'force-dynamic'

export default function Page() {
  return (
    <PageShell
      eyebrow="Administración y Finanzas · Ingeniería Financiera"
      title="Hablá con el Financial Engineering"
      subtitle="Preguntá sobre el Flujo de Fondos y recibí la lectura del contador, el abogado y el financiero — cada uno con el criterio de su especialidad — más dónde coinciden y dónde chocan. Interpreta la realidad financiera; no ejecuta pagos ni edita planillas."
    >
      <FinancialEngineeringChat />
    </PageShell>
  )
}
