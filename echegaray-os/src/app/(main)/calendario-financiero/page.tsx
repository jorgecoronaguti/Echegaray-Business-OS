import { createClient } from '@/lib/supabase/server'
import { getCalendarioFinanciero } from '@/features/ingenieria-financiera/services/calendarioService'
import { getPlanVigente, getSeguimiento } from '@/features/ingenieria-financiera/services/planService'
import { getEstrategiaFinanciera } from '@/features/ingenieria-financiera/services/estrategiaService'
import { CalendarioFinancieroView } from '@/features/ingenieria-financiera/components/CalendarioFinancieroView'
import { PlanEjecucionView } from '@/features/ingenieria-financiera/components/PlanEjecucionView'
import { fechaHora } from '@/shared/utils/fecha'
import { PageShell, Callout } from '@/shared/components/ui'

export const dynamic = 'force-dynamic'

// CALENDARIO FINANCIERO — la primera interfaz ejecutiva del motor de Ingeniería Financiera.
//
// Consume EXCLUSIVAMENTE el modelo que produce la Skill (materializado en public.finanzas_calendario
// por el worker). No hay una sola regla financiera en React: todo saldo, riesgo y recomendación viene
// del motor. Si el número está mal, se arregla en el motor, nunca acá.
export default async function Page() {
  const supabase = await createClient()
  // ═══ TRES LECTURAS INDEPENDIENTES IBAN EN FILA INDIA (12/09/2026) ═══
  //
  // El calendario, la estrategia vigente y el plan vigente no se necesitan entre sí: ninguna usa el
  // resultado de otra. Estaban en tres `await` seguidos, así que la pantalla esperaba la suma de los
  // tres viajes a PostgREST en vez del más largo. Medido contra producción el 12/09, esta ruta daba
  // doc=1.092 ms en frío y 551 ms en caliente; el piso de un viaje desde Vercel a esta instancia son
  // ~150 ms, y acá había tres puestos uno detrás del otro sin motivo.
  //
  // EL SEGUIMIENTO SIGUE APARTE Y DESPUÉS, porque sí depende: necesita el `correlation_id` que trae
  // el plan vigente. Meterlo en el `Promise.all` exigiría adivinar ese id, y eso ya no sería
  // paralelizar sino inventar.
  const [
    { data, error, generadoEn },
    { data: estrategiaVigente },
    { data: vigente },
  ] = await Promise.all([
    getCalendarioFinanciero(supabase),
    // La estrategia financiera vigente — la protagonista del calendario. Ya la ensambló el motor y el
    // sync la materializó; la Web sólo la lee. Si no hay fila todavía, se muestra el calendario solo.
    getEstrategiaFinanciera(supabase),
    // El Plan de ejecución — ya calculado por el motor, la Web sólo lee.
    getPlanVigente(supabase),
  ])
  // El estado real de las tareas del plan. Cuelga del plan, así que va en un segundo tramo.
  const { data: seguimiento } = vigente?.correlation_id
    ? await getSeguimiento(supabase, vigente.correlation_id)
    : { data: [] }

  return (
    <PageShell
      eyebrow="Administración y Finanzas · Ingeniería Financiera"
      title="Calendario Financiero"
      subtitle="Qué estrategia financiera está ejecutando el OS y por qué. El calendario es la interfaz: al elegir un día ves qué hace hoy esa estrategia."
    >
      {error && <Callout tono="warn">{error}</Callout>}

      {data && <CalendarioFinancieroView cal={data} estrategia={estrategiaVigente?.estrategia} />}

      {vigente && <PlanEjecucionView vigente={vigente} seguimiento={seguimiento} />}

      {generadoEn && (
        <p className="mt-6 text-right text-[11px] text-faint">
          Generado por el motor de Ingeniería Financiera · {fechaHora(generadoEn)}
        </p>
      )}
    </PageShell>
  )
}
