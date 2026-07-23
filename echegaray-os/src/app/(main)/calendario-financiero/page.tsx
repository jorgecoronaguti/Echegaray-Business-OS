import { createClient } from '@/lib/supabase/server'
import { getCalendarioFinanciero } from '@/features/ingenieria-financiera/services/calendarioService'
import { CalendarioFinancieroView } from '@/features/ingenieria-financiera/components/CalendarioFinancieroView'
import { fechaHora } from '@/shared/utils/fecha'

export const dynamic = 'force-dynamic'

// CALENDARIO FINANCIERO — la primera interfaz ejecutiva del motor de Ingeniería Financiera.
//
// Consume EXCLUSIVAMENTE el modelo que produce la Skill (materializado en public.finanzas_calendario
// por el worker). No hay una sola regla financiera en React: todo saldo, riesgo y recomendación viene
// del motor. Si el número está mal, se arregla en el motor, nunca acá.
export default async function Page() {
  const supabase = await createClient()
  const { data, error, generadoEn } = await getCalendarioFinanciero(supabase)

  return (
    <main className="mx-auto max-w-6xl p-6">
      <header className="mb-6">
        <div className="text-[11px] uppercase tracking-wide text-slate-400">Administración y Finanzas · Ingeniería Financiera</div>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">Calendario Financiero</h1>
        <p className="mt-1 text-sm text-slate-500">
          Qué entra, qué sale y cómo queda la caja cada día — con el nivel de riesgo y las acciones que recomienda el motor.
        </p>
      </header>

      {error && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">{error}</div>
      )}

      {data && <CalendarioFinancieroView cal={data} />}

      {generadoEn && (
        <p className="mt-6 text-right text-[11px] text-slate-400">
          Generado por el motor de Ingeniería Financiera · {fechaHora(generadoEn)}
        </p>
      )}
    </main>
  )
}
