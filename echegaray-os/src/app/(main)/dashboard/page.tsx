import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getDashboardDatosFuente } from '@/features/dashboard/services/dashboardDataService'
import { construirAlertasDashboard } from '@/features/dashboard/types'
import { SeccionAlertas } from '@/features/dashboard/components/SeccionAlertas'
import { getAcciones, accionesPorAlertaOrigen } from '@/features/acciones/services/accionesService'
import { getPosicionCajaConsolidada } from '@/features/posicion-caja/services/posicionCajaService'
import { getObras } from '@/features/obras/services/obrasService'
import { getResumenEconomicoTodasLasObras } from '@/features/control-economico/services/controlEconomicoService'
import { getHHResumenTodasLasObras } from '@/features/hh-productividad/services/hhProductividadService'
import { getEjecucionFinancieraTodasLasObras } from '@/features/ejecucion-financiera/services/ejecucionFinancieraService'
import { getActividadesSemanalesTodasLasObras } from '@/features/actividades-semanales/services/actividadesSemanalesService'
import { construirTableroObras, ordenarTableroObras } from '@/features/obras/types/tableroObras'
import { ESTADO_ECONOMICO_LABEL, ESTADO_ECONOMICO_CLASSNAME } from '@/features/control-economico/types'
import { getBacklogAutonomo } from '@/features/backlog-autonomo/services/backlogAutonomoService'
import { ordenarBacklogPorPrioridad } from '@/features/backlog-autonomo/types'
import { getFuentesDatos } from '@/features/fuentes-datos/services/fuentesDatosService'
import { fuentesCriticasConProblema } from '@/features/fuentes-datos/types'
import { AREAS_OS, AREA_LABEL, AREA_RUTA } from '@/features/areas/types'
import { alertasPorArea } from '@/features/areas/types'
import { ConfianzaBadge } from '@/shared/components/ConfianzaBadge'

// PR UX-1: la home de Dirección deja de ser un volcado de 8 secciones técnicas por
// categoría de alerta ("Compras", "Adicionales"...) y pasa a responder en <30s: qué
// decidir hoy, cómo está la caja, qué obra mirar, qué acción está vencida y qué está
// haciendo el OS solo. Cero cálculo nuevo -- todo esto ya existe (F1, tablero de
// obras, backlog_autonomo, fuentes_datos); esta página solo los sintetiza.

async function loadDireccion() {
  try {
    const supabase = await createClient()
    const [
      datosDashboard,
      acciones,
      caja,
      obras,
      resumenes,
      hhResumenes,
      ejecuciones,
      actividades,
      backlog,
      fuentes,
    ] = await Promise.all([
      getDashboardDatosFuente(supabase),
      getAcciones(supabase),
      getPosicionCajaConsolidada(supabase),
      getObras(supabase),
      getResumenEconomicoTodasLasObras(supabase),
      getHHResumenTodasLasObras(supabase),
      getEjecucionFinancieraTodasLasObras(supabase),
      getActividadesSemanalesTodasLasObras(supabase),
      getBacklogAutonomo(supabase),
      getFuentesDatos(supabase),
    ])
    return { datosDashboard, acciones, caja, obras, resumenes, hhResumenes, ejecuciones, actividades, backlog, fuentes }
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Error desconocido al conectar con Supabase'
    const failed = { data: null, error } as const
    return {
      datosDashboard: failed,
      acciones: failed,
      caja: failed,
      obras: failed,
      resumenes: failed,
      hhResumenes: failed,
      ejecuciones: failed,
      actividades: failed,
      backlog: failed,
      fuentes: failed,
    }
  }
}

function money(v: number) {
  return `$${v.toLocaleString('es-AR', { maximumFractionDigits: 0 })}`
}

export default async function DashboardPage() {
  const { datosDashboard, acciones, caja, obras, resumenes, hhResumenes, ejecuciones, actividades, backlog, fuentes } =
    await loadDireccion()

  const pageError = datosDashboard.error ?? acciones.error
  const isAuthError = pageError?.toLowerCase().includes('permission denied') ?? false

  if (pageError) {
    return (
      <div className="min-h-screen space-y-8 p-8">
        <h1 className="text-3xl font-bold">Dirección</h1>
        {isAuthError ? (
          <div className="rounded border border-amber-300 bg-amber-50 p-4 text-amber-900" data-testid="page-error">
            <p className="font-semibold">No hay sesión autenticada — RLS está bloqueando el acceso correctamente.</p>
            <p className="mt-1 text-sm">{pageError}</p>
          </div>
        ) : (
          <div className="rounded border border-red-300 bg-red-50 p-4 text-red-800" data-testid="page-error">
            <p className="font-semibold">Supabase no está configurado o no responde.</p>
            <p className="mt-1 text-sm">{pageError}</p>
          </div>
        )}
      </div>
    )
  }

  const todasLasAlertas = construirAlertasDashboard(datosDashboard.data!)
  const accionesMap = accionesPorAlertaOrigen(acciones.data ?? [])
  const decidirHoy = todasLasAlertas.slice(0, 5)

  const hoy = new Date().toISOString().slice(0, 10)
  const accionesVencidas = (acciones.data ?? []).filter(
    (a) => (a.estado === 'pendiente' || a.estado === 'en_curso') && a.fecha_limite && a.fecha_limite < hoy
  )
  const accionesProximas = (acciones.data ?? []).filter(
    (a) => (a.estado === 'pendiente' || a.estado === 'en_curso') && a.fecha_limite && a.fecha_limite >= hoy
  )

  const tablero =
    obras.data && resumenes.data && hhResumenes.data && ejecuciones.data && actividades.data
      ? ordenarTableroObras(
          construirTableroObras(obras.data, resumenes.data, hhResumenes.data, ejecuciones.data, actividades.data)
        )
      : []
  const obrasDestacadas = tablero.slice(0, 5)

  const posicion = caja.data
  const peorSemana = posicion
    ? posicion.forecastSemanal.reduce((peor, p) => (p.saldoFinal < peor.saldoFinal ? p : peor), posicion.forecastSemanal[0])
    : null

  const backlogAbierto = ordenarBacklogPorPrioridad((backlog.data ?? []).filter((b) => b.estado === 'abierto'))
  const fuentesConProblema = fuentesCriticasConProblema(fuentes.data ?? [])

  return (
    <div className="min-h-screen space-y-10 p-8">
      <div>
        <h1 className="text-3xl font-bold">Dirección</h1>
        <p className="mt-2 text-gray-600">Qué pasa, qué requiere atención y qué decisión tomar hoy.</p>
      </div>

      <SeccionAlertas
        titulo="Decidir hoy"
        descripcion="Las 5 situaciones más urgentes de toda la empresa, con causa, recomendación y confianza."
        alertas={decidirHoy}
        testId="direccion-decidir-hoy"
        accionesPorAlertaId={accionesMap}
      />

      <section data-testid="direccion-riesgos-abiertos">
        <h2 className="text-xl font-semibold">Riesgos abiertos por área</h2>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-6">
          {AREAS_OS.map((area) => {
            const cantidad = alertasPorArea(todasLasAlertas, area).length
            return (
              <Link
                key={area}
                href={AREA_RUTA[area]}
                className={`rounded border p-3 text-center hover:bg-gray-50 ${cantidad > 0 ? 'border-amber-300' : ''}`}
              >
                <p className="text-2xl font-bold">{cantidad}</p>
                <p className="text-xs text-gray-500">{AREA_LABEL[area]}</p>
              </Link>
            )
          })}
        </div>
      </section>

      <section data-testid="direccion-caja">
        <h2 className="text-xl font-semibold">Caja</h2>
        {posicion ? (
          <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <p className="text-xs text-gray-500">Caja actual</p>
              <p className="text-lg font-bold">{money(posicion.saldoActual)}</p>
              <ConfianzaBadge naturaleza="observado" />
            </div>
            {peorSemana && (
              <div>
                <p className="text-xs text-gray-500">Peor semana proyectada (desde {peorSemana.inicio})</p>
                <p className={`text-lg font-bold ${peorSemana.esDeficit ? 'text-red-700' : ''}`}>
                  {money(peorSemana.saldoFinal)}
                  {peorSemana.esDeficit ? ' ⚠️ déficit' : ''}
                </p>
                <ConfianzaBadge naturaleza="estimado" />
              </div>
            )}
            <div>
              <p className="text-xs text-gray-500">Cobros ciertos (semana actual)</p>
              <p className="text-lg font-bold">{money(posicion.forecastSemanal[0]?.cobrosCiertos ?? 0)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Pagos comprometidos (semana actual)</p>
              <p className="text-lg font-bold">{money(posicion.forecastSemanal[0]?.pagosComprometidos ?? 0)}</p>
            </div>
          </div>
        ) : (
          <p className="mt-2 text-sm text-gray-500">Sin datos de caja disponibles.</p>
        )}
        <Link href="/caja" className="mt-2 inline-block text-sm font-medium text-blue-700 underline">
          Ver Caja y forecast completo →
        </Link>
      </section>

      <section data-testid="direccion-obras">
        <h2 className="text-xl font-semibold">Obras</h2>
        {obrasDestacadas.length > 0 ? (
          <table className="mt-3 w-full text-left text-sm">
            <thead>
              <tr className="border-b text-xs text-gray-500 uppercase">
                <th className="pr-4 py-2">Obra</th>
                <th className="pr-4 py-2">Avance</th>
                <th className="pr-4 py-2">Margen actualizado</th>
                <th className="pr-4 py-2">Salud</th>
              </tr>
            </thead>
            <tbody>
              {obrasDestacadas.map((o) => (
                <tr key={o.obra_id} className="border-b" data-testid="direccion-obra-fila">
                  <td className="pr-4 py-2">
                    <Link href={`/obras/${o.obra_id}`} className="underline">
                      {o.obra_nombre}
                    </Link>
                  </td>
                  <td className="pr-4 py-2">{o.avanceFisicoPromedio != null ? `${o.avanceFisicoPromedio.toFixed(0)}%` : '—'}</td>
                  <td className="pr-4 py-2">{o.margenActualizado != null ? money(o.margenActualizado) : '—'}</td>
                  <td className="pr-4 py-2">
                    <span className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${ESTADO_ECONOMICO_CLASSNAME[o.estadoEconomico]}`}>
                      {ESTADO_ECONOMICO_LABEL[o.estadoEconomico]}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="mt-2 text-sm text-gray-500">Sin obras cargadas.</p>
        )}
        <Link href="/obras" className="mt-2 inline-block text-sm font-medium text-blue-700 underline">
          Ver tablero completo de Obras →
        </Link>
      </section>

      <section data-testid="direccion-acciones">
        <h2 className="text-xl font-semibold">Acciones</h2>
        <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-3">
          <div className="rounded border border-red-300 bg-red-50 p-3 text-center">
            <p className="text-2xl font-bold text-red-700">{accionesVencidas.length}</p>
            <p className="text-xs text-gray-600">Vencidas</p>
          </div>
          <div className="rounded border p-3 text-center">
            <p className="text-2xl font-bold">{accionesProximas.length}</p>
            <p className="text-xs text-gray-600">Próximas</p>
          </div>
        </div>
        <Link href="/acciones" className="mt-2 inline-block text-sm font-medium text-blue-700 underline">
          Ir al Centro de Acción →
        </Link>
      </section>

      <section data-testid="direccion-os-trabajando">
        <h2 className="text-xl font-semibold">Qué está haciendo el OS por su cuenta</h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-sm font-medium">Backlog generado automáticamente ({backlogAbierto.length} abiertos)</p>
            <ul className="mt-1 space-y-1 text-sm text-gray-600">
              {backlogAbierto.slice(0, 5).map((b) => (
                <li key={b.id}>· {b.titulo}</li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-sm font-medium">Fuentes críticas atrasadas ({fuentesConProblema.length})</p>
            <ul className="mt-1 space-y-1 text-sm text-gray-600">
              {fuentesConProblema.slice(0, 5).map((f) => (
                <li key={f.id}>· {f.nombre}</li>
              ))}
            </ul>
          </div>
        </div>
        <Link href="/operador-digital" className="mt-2 inline-block text-sm font-medium text-blue-700 underline">
          Ver Operador Digital →
        </Link>
      </section>
    </div>
  )
}
