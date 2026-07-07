import { createClient } from '@/lib/supabase/server'
import { getProveedores } from '@/features/fundacion/services/fundacionService'
import { getObras } from '@/features/obras/services/obrasService'
import { getMovimientosCaja } from '@/features/flujo-caja/services/movimientosCajaService'
import {
  getObligaciones,
  getObligacionesResumen,
} from '@/features/obligaciones/services/obligacionesService'
import { ObligacionForm } from '@/features/obligaciones/components/ObligacionForm'
import { ObligacionesList } from '@/features/obligaciones/components/ObligacionesList'
import { calcularTensionLiquidez, UMBRAL_DIAS_PROXIMO_VENCIMIENTO } from '@/features/obligaciones/types'

async function loadObligacionesData() {
  try {
    const supabase = await createClient()
    const [proveedores, obras, movimientos, obligaciones, obligacionesResumen] = await Promise.all([
      getProveedores(supabase),
      getObras(supabase),
      getMovimientosCaja(supabase),
      getObligaciones(supabase),
      getObligacionesResumen(supabase),
    ])
    return { proveedores, obras, movimientos, obligaciones, obligacionesResumen }
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Error desconocido al conectar con Supabase'
    const failed = { data: null, error } as const
    return { proveedores: failed, obras: failed, movimientos: failed, obligaciones: failed, obligacionesResumen: failed }
  }
}

export default async function ObligacionesPage() {
  const { proveedores, obras, movimientos, obligaciones, obligacionesResumen } = await loadObligacionesData()

  const pageError =
    proveedores.error ?? obras.error ?? movimientos.error ?? obligaciones.error ?? obligacionesResumen.error
  const isAuthError = pageError?.toLowerCase().includes('permission denied') ?? false

  const movimientosDePago = (movimientos.data ?? []).filter((m) => m.tipo === 'pago')
  const resumenes = obligacionesResumen.data ?? []

  const totalAdeudado = resumenes.reduce((acc, r) => acc + r.saldo_pendiente, 0)
  const hoy = new Date()
  const totalVencido = resumenes
    .filter((r) => r.saldo_pendiente > 0 && r.fecha_vencimiento && new Date(r.fecha_vencimiento) < hoy)
    .reduce((acc, r) => acc + r.saldo_pendiente, 0)
  const venceEnVentana = resumenes
    .filter((r) => {
      if (r.saldo_pendiente <= 0 || !r.fecha_vencimiento) return false
      const dias = (new Date(r.fecha_vencimiento).getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24)
      return dias >= 0 && dias <= UMBRAL_DIAS_PROXIMO_VENCIMIENTO
    })
    .reduce((acc, r) => acc + r.saldo_pendiente, 0)

  // Cobros proyectados en la misma ventana, para la alerta de tensión de liquidez —
  // solo se afirma tensión si hay datos de ambos lados (obligaciones y cobros).
  const cobrosProyectadosEnVentana = (movimientos.data ?? [])
    .filter((m) => {
      if (m.tipo !== 'cobro' || m.estado !== 'proyectado') return false
      const dias = (new Date(m.fecha_esperada).getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24)
      return dias >= 0 && dias <= UMBRAL_DIAS_PROXIMO_VENCIMIENTO
    })
    .reduce((acc, m) => acc + m.monto, 0)
  const alertasTensionLiquidez = calcularTensionLiquidez(resumenes, cobrosProyectadosEnVentana)

  return (
    <div className="min-h-screen space-y-8 p-8">
      <div>
        <h1 className="text-3xl font-bold">Obligaciones y Medios de Pago</h1>
        <p className="mt-2 text-gray-600">
          Qué debe pagar Echegaray, a quién, por qué concepto y cuándo vence — PRP-010. No es Caja: una obligación
          futura recién impacta caja cuando se le aplica un pago real.
        </p>
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

      <section data-testid="obligaciones-resumen-general">
        <dl className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-gray-500">Total adeudado (saldo pendiente)</dt>
            <dd className="text-lg font-semibold">${totalAdeudado}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Vencido</dt>
            <dd className="text-lg font-semibold text-red-700">${totalVencido}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Vence en los próximos {UMBRAL_DIAS_PROXIMO_VENCIMIENTO} días</dt>
            <dd className="text-lg font-semibold text-amber-700">${venceEnVentana}</dd>
          </div>
        </dl>

        {alertasTensionLiquidez.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1" data-testid="tension-liquidez-alertas">
            {alertasTensionLiquidez.map((a, i) => (
              <span key={i} className="inline-block rounded bg-red-100 px-2 py-1 text-xs font-medium text-red-800">
                {a.mensaje}
              </span>
            ))}
          </div>
        )}
      </section>

      <section data-testid="obligacion-form-section">
        <h2 className="text-xl font-semibold">Registrar obligación</h2>
        <ObligacionForm obras={obras.data ?? []} proveedores={proveedores.data ?? []} />
      </section>

      <section data-testid="obligaciones-section">
        <h2 className="text-xl font-semibold">Obligaciones</h2>
        <ObligacionesList
          obligaciones={obligaciones.data ?? []}
          resumenes={resumenes}
          proveedores={proveedores.data ?? []}
          obras={obras.data ?? []}
          movimientosDePago={movimientosDePago}
        />
      </section>
    </div>
  )
}
