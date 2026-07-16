import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import {
  getComprobantesSinAsignarConSugerencia,
  getObrasCanonicas,
  getResumenAsignacion,
} from '@/features/control-obras/services/costosObraService'
import { AsignarComprobantes } from '@/features/control-obras/components/AsignarComprobantes'

export const dynamic = 'force-dynamic'

// CONTROL DE OBRAS Fase 3 — asignar el costo real (comprobantes de ARCA) a cada obra. ARCA no
// trae la obra: acá el dueño la atribuye. Los de mayor monto primero (más impacto). El costo
// atribuido aparece después en la pestaña "Costos" de cada obra.

function money(n: number): string {
  return n.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 })
}

export default async function CostosAsignacionPage() {
  let error: string | null = null
  let comprobantes = [] as Awaited<ReturnType<typeof getComprobantesSinAsignarConSugerencia>>
  let obras: string[] = []
  let resumen = { sinAsignar: 0, montoSinAsignar: 0, asignados: 0, montoAsignado: 0 }
  try {
    const supabase = await createClient()
    ;[comprobantes, obras, resumen] = await Promise.all([
      getComprobantesSinAsignarConSugerencia(supabase),
      getObrasCanonicas(supabase),
      getResumenAsignacion(supabase),
    ])
  } catch (err) {
    error = err instanceof Error ? err.message : 'Error desconocido'
  }

  const totalCompras = resumen.montoAsignado + resumen.montoSinAsignar
  const pctAsignado = totalCompras > 0 ? Math.round((resumen.montoAsignado / totalCompras) * 100) : 0
  const conSugerencia = comprobantes.filter((c) => c.sugerencia).length

  return (
    <div className="min-h-screen space-y-6 p-8">
      <div>
        <Link href="/control-obras" className="text-sm font-medium text-gray-400 hover:text-gray-900">
          ← Control de obras
        </Link>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">Costo por obra — asignación</h1>
        <p className="mt-1 max-w-2xl text-sm text-gray-500">
          Los comprobantes reales de ARCA no dicen a qué obra fueron. Asigná cada uno a su obra para
          construir el costo real. Empezá por los de mayor monto. Nada se adivina: lo que no asignás
          queda “sin asignar”. Donde ya imputaste antes a ese proveedor, el OS te{' '}
          <span className="font-medium text-gray-700">sugiere</span> la obra por tu historial (la
          pre-selecciona) — vos confirmás o la cambiás.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-red-800">
          <p className="font-semibold">No se pudieron leer los comprobantes.</p>
          <p className="mt-1 text-sm">{error}</p>
        </div>
      )}

      {!error && (
        <div className="flex flex-wrap gap-3">
          <Kpi label="Sin asignar" valor={money(resumen.montoSinAsignar)} sub={`${resumen.sinAsignar} comprobantes`} tone="amber" />
          <Kpi label="Asignado a obras" valor={money(resumen.montoAsignado)} sub={`${resumen.asignados} comprobantes`} tone="ok" />
          <Kpi label="Cobertura" valor={`${pctAsignado}%`} sub="del costo de compras atribuido" />
          {conSugerencia > 0 && (
            <Kpi label="Con sugerencia" valor={`${conSugerencia}`} sub="confirmables por tu historial" tone="ok" />
          )}
        </div>
      )}

      {!error && <AsignarComprobantes comprobantes={comprobantes} obras={obras} />}
    </div>
  )
}

function Kpi({ label, valor, sub, tone = 'gray' }: { label: string; valor: string; sub: string; tone?: 'gray' | 'amber' | 'ok' }) {
  const cls =
    tone === 'amber'
      ? 'border-amber-200 bg-amber-50 text-amber-900'
      : tone === 'ok'
        ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
        : 'border-gray-200 bg-gray-50 text-gray-800'
  return (
    <div className={`rounded-lg border px-4 py-2 ${cls}`}>
      <div className="text-xl font-bold tabular-nums">{valor}</div>
      <div className="text-xs font-semibold">{label}</div>
      <div className="text-[11px] opacity-70">{sub}</div>
    </div>
  )
}
