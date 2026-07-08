import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getDashboardDatosFuente } from '@/features/dashboard/services/dashboardDataService'
import { construirAlertasDashboard } from '@/features/dashboard/types'
import { getAcciones } from '@/features/acciones/services/accionesService'
import { getBacklogAutonomo } from '@/features/backlog-autonomo/services/backlogAutonomoService'
import { ordenarBacklogPorPrioridad } from '@/features/backlog-autonomo/types'
import { construirTableroObras, ordenarTableroObras } from '@/features/obras/types/tableroObras'
import { ESTADO_ECONOMICO_LABEL, ESTADO_ECONOMICO_CLASSNAME } from '@/features/control-economico/types'
import { calcularAlertasConcentracion } from '@/features/capital-trabajo/types'

// Ritual semanal de Dirección (ciclo "operabilidad real", Sección 8): agenda real
// para la reunión entre los dos directores. Cero cálculo nuevo -- compone F1
// (posición de caja, ya con 8 semanas de forecast), F2 (capital de trabajo), el
// tablero de Obras y el Motor de Observación completo. Declara explícitamente lo que
// todavía no existe (P&L propio, historial de margen semana a semana) en vez de
// fabricarlo.

async function loadSintesisSemanal() {
  try {
    const supabase = await createClient()
    const [datosFuente, acciones, backlog] = await Promise.all([
      getDashboardDatosFuente(supabase),
      getAcciones(supabase),
      getBacklogAutonomo(supabase),
    ])
    return { datosFuente, acciones, backlog }
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Error desconocido al conectar con Supabase'
    const failed = { data: null, error } as const
    return { datosFuente: failed, acciones: failed, backlog: failed }
  }
}

function money(v: number) {
  return `$${v.toLocaleString('es-AR', { maximumFractionDigits: 0 })}`
}

export default async function SintesisSemanalPage() {
  const { datosFuente, acciones, backlog } = await loadSintesisSemanal()
  const pageError = datosFuente.error ?? acciones.error ?? backlog.error
  const isAuthError = pageError?.toLowerCase().includes('permission denied') ?? false

  if (pageError) {
    return (
      <div className="min-h-screen space-y-8 p-8">
        <h1 className="text-3xl font-bold">Síntesis semanal de Dirección</h1>
        <div
          className={`rounded border p-4 ${isAuthError ? 'border-amber-300 bg-amber-50 text-amber-900' : 'border-red-300 bg-red-50 text-red-800'}`}
          data-testid="page-error"
        >
          <p className="font-semibold">
            {isAuthError ? 'No hay sesión autenticada — RLS está bloqueando el acceso correctamente.' : 'Supabase no está configurado o no responde.'}
          </p>
          <p className="mt-1 text-sm">{pageError}</p>
        </div>
      </div>
    )
  }

  const datos = datosFuente.data!
  const todasLasAlertas = construirAlertasDashboard(datos)
  const tablero = ordenarTableroObras(
    construirTableroObras(datos.obras, datos.resumenEconomico, datos.resumenHH, datos.ejecucionFinanciera, datos.actividadesSemanales)
  )
  const concentracion = calcularAlertasConcentracion(datos.capitalTrabajo)
  const accionesActivas = (acciones.data ?? []).filter((a) => a.estado === 'pendiente' || a.estado === 'en_curso')
  const hoy = new Date().toISOString().slice(0, 10)
  const accionesVencidas = accionesActivas.filter((a) => a.fecha_limite && a.fecha_limite < hoy)
  const bloqueadas = accionesActivas.filter((a) => a.bloqueada)
  const backlogAbierto = ordenarBacklogPorPrioridad((backlog.data ?? []).filter((b) => b.estado === 'abierto'))
  const backlogSinDato = backlogAbierto.filter((b) => b.confianza === 'sin_dato')

  return (
    <div className="min-h-screen space-y-8 p-8">
      <div>
        <h1 className="text-3xl font-bold">Síntesis semanal de Dirección</h1>
        <p className="mt-2 text-gray-600">Agenda real para la reunión semanal entre los dos directores.</p>
      </div>

      <section data-testid="semanal-caja">
        <h2 className="text-xl font-semibold">Situación financiera — caja 8 semanas</h2>
        <p className="mt-1 text-sm">Caja actual: <span className="font-semibold">{money(datos.posicionCaja.saldoActual)}</span></p>
        <table className="mt-2 w-full text-left text-sm">
          <thead>
            <tr className="text-xs text-gray-500 uppercase">
              <th className="pr-4 py-1">Semana desde</th>
              <th className="pr-4 py-1">Cobros ciertos</th>
              <th className="pr-4 py-1">Pagos comprometidos</th>
              <th className="pr-4 py-1">Saldo final</th>
            </tr>
          </thead>
          <tbody>
            {datos.posicionCaja.forecastSemanal.map((s) => (
              <tr key={s.inicio} className={s.esDeficit ? 'bg-red-50' : ''}>
                <td className="pr-4 py-1">{s.inicio}</td>
                <td className="pr-4 py-1">{money(s.cobrosCiertos)}</td>
                <td className="pr-4 py-1">{money(s.pagosComprometidos)}</td>
                <td className="pr-4 py-1 font-medium">{money(s.saldoFinal)}{s.esDeficit ? ' ⚠️' : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-xs text-gray-500">
          Resultado económico (P&amp;L devengado): no disponible todavía como capacidad propia del OS — gap real, no
          se fabrica un número. Ver Ingresos y Egresos (P&amp;L) en Drive mientras tanto.
        </p>
      </section>

      <section data-testid="semanal-capital-trabajo">
        <h2 className="text-xl font-semibold">Capital de trabajo y concentración</h2>
        <dl className="mt-2 grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-gray-500">Cuentas por cobrar</dt>
            <dd className="font-semibold">{money(datos.capitalTrabajo.totalCxC)}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Cuentas por pagar</dt>
            <dd className="font-semibold">{money(datos.capitalTrabajo.totalCxP)}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Capital de trabajo neto</dt>
            <dd className="font-semibold">{money(datos.capitalTrabajo.capitalTrabajoNeto)}</dd>
          </div>
        </dl>
        {concentracion.length > 0 && (
          <ul className="mt-2 space-y-1 text-sm text-amber-700">
            {concentracion.map((c) => (
              <li key={`${c.tipo}-${c.contraparte.id}`}>· {c.mensaje}</li>
            ))}
          </ul>
        )}
        <Link href="/capital-trabajo" className="mt-2 inline-block text-sm font-medium text-blue-700 underline">
          Ver Capital de Trabajo completo →
        </Link>
      </section>

      <section data-testid="semanal-obras">
        <h2 className="text-xl font-semibold">Estado de obras</h2>
        <table className="mt-2 w-full text-left text-sm">
          <thead>
            <tr className="text-xs text-gray-500 uppercase">
              <th className="pr-4 py-1">Obra</th>
              <th className="pr-4 py-1">Avance</th>
              <th className="pr-4 py-1">Margen actualizado</th>
              <th className="pr-4 py-1">Pendiente cobrar</th>
              <th className="pr-4 py-1">Salud</th>
            </tr>
          </thead>
          <tbody>
            {tablero.map((o) => (
              <tr key={o.obra_id}>
                <td className="pr-4 py-1">
                  <Link href={`/obras/${o.obra_id}`} className="underline">{o.obra_nombre}</Link>
                </td>
                <td className="pr-4 py-1">{o.avanceFisicoPromedio != null ? `${o.avanceFisicoPromedio.toFixed(0)}%` : '—'}</td>
                <td className="pr-4 py-1">{o.margenActualizado != null ? money(o.margenActualizado) : '—'}</td>
                <td className="pr-4 py-1">{money(o.pendienteCobrar)}</td>
                <td className="pr-4 py-1">
                  <span className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${ESTADO_ECONOMICO_CLASSNAME[o.estadoEconomico]}`}>
                    {ESTADO_ECONOMICO_LABEL[o.estadoEconomico]}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-xs text-gray-500">
          Cambio de margen semana a semana: no disponible — el OS no versiona todavía el margen anterior (gap
          conocido, ver backlog).
        </p>
      </section>

      <section data-testid="semanal-riesgos-decisiones">
        <h2 className="text-xl font-semibold">Principales riesgos y decisiones</h2>
        <ul className="mt-2 space-y-2 text-sm">
          {todasLasAlertas.slice(0, 8).map((a) => (
            <li key={a.id} className="rounded border p-2">
              <span className="font-medium">{a.titulo}</span> — {a.decisionSugerida}
            </li>
          ))}
          {todasLasAlertas.length === 0 && <p className="text-gray-500">Sin riesgos detectados esta semana.</p>}
        </ul>
      </section>

      <section data-testid="semanal-acciones">
        <h2 className="text-xl font-semibold">Acciones</h2>
        <dl className="mt-2 grid grid-cols-3 gap-4 text-sm">
          <div>
            <dt className="text-gray-500">Abiertas</dt>
            <dd className="text-xl font-bold">{accionesActivas.length}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Vencidas</dt>
            <dd className="text-xl font-bold text-red-700">{accionesVencidas.length}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Bloqueadas</dt>
            <dd className="text-xl font-bold text-red-700">{bloqueadas.length}</dd>
          </div>
        </dl>
        <Link href="/acciones" className="mt-2 inline-block text-sm font-medium text-blue-700 underline">
          Ir al Centro de Acción →
        </Link>
      </section>

      <section data-testid="semanal-os-trabajando">
        <h2 className="text-xl font-semibold">Qué hizo el OS / qué necesita intervención humana</h2>
        <p className="mt-1 text-sm">Backlog abierto generado automáticamente: <span className="font-semibold">{backlogAbierto.length}</span></p>
        <p className="mt-1 text-sm">
          De ese backlog, <span className="font-semibold">{backlogSinDato.length}</span> no tienen sugerencia
          confiable — requieren intervención humana explícita, no se resolvieron solas.
        </p>
        <Link href="/operador-digital" className="mt-2 inline-block text-sm font-medium text-blue-700 underline">
          Ver Operador Digital →
        </Link>
      </section>
    </div>
  )
}
