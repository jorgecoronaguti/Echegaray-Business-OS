import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getClientes } from '@/features/fundacion/services/fundacionService'
import { getObras } from '@/features/obras/services/obrasService'
import { ObraForm } from '@/features/obras/components/ObraForm'
import { getResumenEconomicoTodasLasObras } from '@/features/control-economico/services/controlEconomicoService'
import { getHHResumenTodasLasObras } from '@/features/hh-productividad/services/hhProductividadService'
import { getEjecucionFinancieraTodasLasObras } from '@/features/ejecucion-financiera/services/ejecucionFinancieraService'
import { getActividadesSemanalesTodasLasObras } from '@/features/actividades-semanales/services/actividadesSemanalesService'
import { construirTableroObras, ordenarTableroObras } from '@/features/obras/types/tableroObras'
import { ESTADO_ECONOMICO_LABEL, ESTADO_ECONOMICO_CLASSNAME } from '@/features/control-economico/types'
import { getDashboardDatosFuente } from '@/features/dashboard/services/dashboardDataService'
import { construirAlertasDashboard } from '@/features/dashboard/types'
import { getAcciones, accionesPorAlertaOrigen } from '@/features/acciones/services/accionesService'
import { SeccionAlertas } from '@/features/dashboard/components/SeccionAlertas'
import { alertasPorArea } from '@/features/areas/types'
import { ConfianzaBadge } from '@/shared/components/ConfianzaBadge'

const ESTADO_OBRA_LABEL: Record<string, string> = {
  contratada: 'Contratada',
  activa: 'Activa',
  pausada: 'Pausada',
  cerrada: 'Cerrada',
}

async function loadObrasData() {
  try {
    const supabase = await createClient()
    const [clientes, obras, resumenes, hhResumenes, ejecuciones, actividades, datosDashboard, acciones] =
      await Promise.all([
        getClientes(supabase),
        getObras(supabase),
        getResumenEconomicoTodasLasObras(supabase),
        getHHResumenTodasLasObras(supabase),
        getEjecucionFinancieraTodasLasObras(supabase),
        getActividadesSemanalesTodasLasObras(supabase),
        getDashboardDatosFuente(supabase),
        getAcciones(supabase),
      ])
    return { clientes, obras, resumenes, hhResumenes, ejecuciones, actividades, datosDashboard, acciones }
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Error desconocido al conectar con Supabase'
    const failed = { data: null, error } as const
    return {
      clientes: failed,
      obras: failed,
      resumenes: failed,
      hhResumenes: failed,
      ejecuciones: failed,
      actividades: failed,
      datosDashboard: failed,
      acciones: failed,
    }
  }
}

function money(v: number) {
  return `$${v.toLocaleString('es-AR', { maximumFractionDigits: 0 })}`
}

export default async function ObrasPage() {
  const { clientes, obras, resumenes, hhResumenes, ejecuciones, actividades, datosDashboard, acciones } =
    await loadObrasData()

  const pageError = clientes.error ?? obras.error
  const isAuthError = pageError?.toLowerCase().includes('permission denied') ?? false

  const todasLasAlertas = datosDashboard.data ? construirAlertasDashboard(datosDashboard.data) : []
  const alertasDelArea = alertasPorArea(todasLasAlertas, 'obras_produccion')
  const accionesMap = accionesPorAlertaOrigen(acciones.data ?? [])

  const tablero =
    obras.data && resumenes.data && hhResumenes.data && ejecuciones.data && actividades.data
      ? ordenarTableroObras(
          construirTableroObras(obras.data, resumenes.data, hhResumenes.data, ejecuciones.data, actividades.data)
        )
      : []

  return (
    <div className="min-h-screen space-y-8 p-8">
      <div>
        <h1 className="text-3xl font-bold">Obras</h1>
        <p className="mt-2 text-gray-600">Tablero de gestión — obras activas primero, ordenadas por riesgo económico.</p>
      </div>

      {pageError && isAuthError && (
        <div className="rounded border border-amber-300 bg-amber-50 p-4 text-amber-900" data-testid="page-error">
          <p className="font-semibold">No hay sesión autenticada — RLS está bloqueando el acceso correctamente.</p>
          <p className="mt-1 text-sm">{pageError}</p>
        </div>
      )}
      {pageError && !isAuthError && (
        <div className="rounded border border-red-300 bg-red-50 p-4 text-red-800" data-testid="page-error">
          <p className="font-semibold">Supabase no está configurado o no responde.</p>
          <p className="mt-1 text-sm">{pageError}</p>
        </div>
      )}

      {datosDashboard.data && (
        <SeccionAlertas
          titulo="Qué requiere atención hoy"
          descripcion="Margen en riesgo, adicionales sin gestionar y obras activas sin movimiento reciente."
          alertas={alertasDelArea}
          testId="obras-area-alertas"
          accionesPorAlertaId={accionesMap}
        />
      )}

      {tablero.length > 0 && (
        <section data-testid="obras-tablero-section">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b text-xs text-gray-500 uppercase">
                  <th className="pr-4 py-2">Obra</th>
                  <th className="pr-4 py-2">Estado</th>
                  <th className="pr-4 py-2">Avance</th>
                  <th className="pr-4 py-2">HH real/est.</th>
                  <th className="pr-4 py-2">Costo real</th>
                  <th className="pr-4 py-2">Margen actualizado</th>
                  <th className="pr-4 py-2">Certificado</th>
                  <th className="pr-4 py-2">Cobrado</th>
                  <th className="pr-4 py-2">Salud económica</th>
                </tr>
              </thead>
              <tbody>
                {tablero.map((o) => (
                  <tr key={o.obra_id} className="border-b" data-testid="obra-tablero-fila">
                    <td className="pr-4 py-2">
                      <Link href={`/obras/${o.obra_id}`} className="font-medium underline">
                        {o.obra_nombre}
                      </Link>
                      {o.responsableReciente && (
                        <p className="text-xs text-gray-500">Resp.: {o.responsableReciente}</p>
                      )}
                    </td>
                    <td className="pr-4 py-2">{ESTADO_OBRA_LABEL[o.estado] ?? o.estado}</td>
                    <td className="pr-4 py-2">{o.avanceFisicoPromedio != null ? `${o.avanceFisicoPromedio.toFixed(0)}%` : '—'}</td>
                    <td className="pr-4 py-2">
                      {o.hhReal}
                      {o.hhEstimada != null ? ` / ${o.hhEstimada}` : ''}
                    </td>
                    <td className="pr-4 py-2">
                      {money(o.costoRealAcumulado)}
                      <div>
                        <ConfianzaBadge naturaleza={o.costoRealAcumulado > 0 ? 'observado' : 'sin_dato'} />
                      </div>
                    </td>
                    <td className="pr-4 py-2">{o.margenActualizado != null ? money(o.margenActualizado) : '—'}</td>
                    <td className="pr-4 py-2">{money(o.totalCertificado)}</td>
                    <td className="pr-4 py-2">{money(o.totalCobrado)}</td>
                    <td className="pr-4 py-2">
                      <span
                        className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${ESTADO_ECONOMICO_CLASSNAME[o.estadoEconomico]}`}
                      >
                        {ESTADO_ECONOMICO_LABEL[o.estadoEconomico]}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <details className="rounded border p-3" data-testid="obra-form-section">
        <summary className="cursor-pointer font-medium text-gray-700">+ Nueva obra</summary>
        <div className="mt-3">
          <ObraForm clientes={clientes.data ?? []} />
        </div>
      </details>
    </div>
  )
}
