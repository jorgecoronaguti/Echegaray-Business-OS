import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getClientes, getCuentasFinancieras, getProveedores } from '@/features/fundacion/services/fundacionService'
import { getObraById } from '@/features/obras/services/obrasService'
import { getMovimientosCajaPorObra } from '@/features/flujo-caja/services/movimientosCajaService'
import {
  getPresupuestosPorObra,
  getPartidasPorPresupuesto,
} from '@/features/presupuestos/services/presupuestosService'
import { PresupuestoForm } from '@/features/presupuestos/components/PresupuestoForm'
import { PartidaPresupuestoForm } from '@/features/presupuestos/components/PartidaPresupuestoForm'
import { getCostosRealesPorObra } from '@/features/costos-reales/services/costosRealesService'
import { CostoRealForm } from '@/features/costos-reales/components/CostoRealForm'
import {
  getResumenEconomicoPorObra,
  getCostosQueExplicanDesvio,
} from '@/features/control-economico/services/controlEconomicoService'
import { ResumenEconomicoObra } from '@/features/control-economico/components/ResumenEconomicoObra'
import { getAdicionalesPorObra } from '@/features/adicionales/services/adicionalesService'
import { AdicionalForm } from '@/features/adicionales/components/AdicionalForm'
import { AdicionalesList } from '@/features/adicionales/components/AdicionalesList'
import {
  getCertificadosPorObra,
  getEjecucionFinancieraPorObra,
} from '@/features/ejecucion-financiera/services/ejecucionFinancieraService'
import { CertificadoForm } from '@/features/ejecucion-financiera/components/CertificadoForm'
import { CertificadosList } from '@/features/ejecucion-financiera/components/CertificadosList'
import { ResumenEjecucionFinanciera } from '@/features/ejecucion-financiera/components/ResumenEjecucionFinanciera'

async function loadObraDetalle(id: string) {
  try {
    const supabase = await createClient()
    const [
      obra,
      clientes,
      cuentas,
      proveedores,
      movimientos,
      presupuestos,
      costosReales,
      resumenEconomico,
      costosQueExplicanDesvio,
      adicionales,
      certificados,
      ejecucionFinanciera,
    ] = await Promise.all([
      getObraById(supabase, id),
      getClientes(supabase),
      getCuentasFinancieras(supabase),
      getProveedores(supabase),
      getMovimientosCajaPorObra(supabase, id),
      getPresupuestosPorObra(supabase, id),
      getCostosRealesPorObra(supabase, id),
      getResumenEconomicoPorObra(supabase, id),
      getCostosQueExplicanDesvio(supabase, id),
      getAdicionalesPorObra(supabase, id),
      getCertificadosPorObra(supabase, id),
      getEjecucionFinancieraPorObra(supabase, id),
    ])

    // Las partidas se muestran de la versión más reciente (mayor `version`), que es
    // además a la que se agregan partidas nuevas — simplificación deliberada (PRP-003).
    const presupuestoMasReciente = presupuestos.data?.[0] ?? null
    const partidas = presupuestoMasReciente
      ? await getPartidasPorPresupuesto(supabase, presupuestoMasReciente.id)
      : { data: [], error: null }

    return {
      obra,
      clientes,
      cuentas,
      proveedores,
      movimientos,
      presupuestos,
      partidas,
      costosReales,
      resumenEconomico,
      costosQueExplicanDesvio,
      adicionales,
      certificados,
      ejecucionFinanciera,
    }
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Error desconocido al conectar con Supabase'
    const failed = { data: null, error } as const
    return {
      obra: failed,
      clientes: failed,
      cuentas: failed,
      proveedores: failed,
      movimientos: failed,
      presupuestos: failed,
      partidas: failed,
      costosReales: failed,
      resumenEconomico: failed,
      costosQueExplicanDesvio: failed,
      adicionales: failed,
      certificados: failed,
      ejecucionFinanciera: failed,
    }
  }
}

export default async function ObraDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const {
    obra,
    clientes,
    cuentas,
    proveedores,
    movimientos,
    presupuestos,
    partidas,
    costosReales,
    resumenEconomico,
    costosQueExplicanDesvio,
    adicionales,
    certificados,
    ejecucionFinanciera,
  } = await loadObraDetalle(id)

  const pageError =
    obra.error ??
    clientes.error ??
    cuentas.error ??
    proveedores.error ??
    movimientos.error ??
    presupuestos.error ??
    costosReales.error ??
    resumenEconomico.error ??
    costosQueExplicanDesvio.error ??
    adicionales.error ??
    certificados.error ??
    ejecucionFinanciera.error
  const isAuthError = pageError?.toLowerCase().includes('permission denied') ?? false

  if (!pageError && !obra.data) {
    notFound()
  }

  const clienteNombre = clientes.data?.find((c) => c.id === obra.data?.cliente_id)?.nombre ?? '—'
  const cuentaNombre = (id: string | null) => cuentas.data?.find((c) => c.id === id)?.nombre ?? '—'
  const proveedorNombre = (id: string | null) => proveedores.data?.find((p) => p.id === id)?.nombre ?? '—'
  const presupuestoMasReciente = presupuestos.data?.[0] ?? null
  const movimientosDePago = (movimientos.data ?? []).filter((m) => m.tipo === 'pago')
  const movimientosDeCobro = (movimientos.data ?? []).filter((m) => m.tipo === 'cobro')
  const movimientoConcepto = (id: string | null) =>
    movimientos.data?.find((m) => m.id === id)?.concepto ?? '—'

  return (
    <div className="min-h-screen space-y-8 p-8">
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

      {obra.data && (
        <>
          <div data-testid="obra-detalle">
            <h1 className="text-3xl font-bold">{obra.data.nombre}</h1>
            <dl className="mt-4 grid grid-cols-2 gap-x-8 gap-y-2 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-gray-500">Cliente</dt>
                <dd>{clienteNombre}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Estado</dt>
                <dd>{obra.data.estado}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Monto contratado</dt>
                <dd>${obra.data.monto_contratado}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Fecha de inicio</dt>
                <dd>{obra.data.fecha_inicio}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Fecha objetivo</dt>
                <dd>{obra.data.fecha_fin_objetivo}</dd>
              </div>
            </dl>
          </div>

          <section data-testid="ejecucion-financiera-obra-section">
            <h2 className="text-xl font-semibold">Ejecución financiera</h2>
            <p className="mt-1 text-sm text-gray-600">
              Contrato → Certificados → Facturación → Cobranza → Caja. No incluye adicionales (tienen su propio ciclo).
            </p>
            {ejecucionFinanciera.data && (
              <div className="mt-3">
                <ResumenEjecucionFinanciera resumen={ejecucionFinanciera.data} />
              </div>
            )}

            <div className="mt-4">
              <h3 className="text-lg font-semibold">Certificados</h3>
              <CertificadoForm obraId={id} />
              <CertificadosList
                certificados={certificados.data ?? []}
                obraId={id}
                movimientosDeCobro={movimientosDeCobro}
              />
            </div>
          </section>

          <section data-testid="control-economico-obra-section">
            <h2 className="text-xl font-semibold">Control económico</h2>
            <p className="mt-1 text-sm text-gray-600">
              Presupuesto aprobado vs. costo real acumulado. No reemplaza compras, HH ni adicionales.
            </p>
            {resumenEconomico.data && (
              <div className="mt-3">
                <ResumenEconomicoObra
                  resumen={resumenEconomico.data}
                  costosQueExplicanDesvio={costosQueExplicanDesvio.data ?? []}
                />
              </div>
            )}
          </section>

          <section data-testid="adicionales-obra-section">
            <h2 className="text-xl font-semibold">Adicionales</h2>
            <p className="mt-1 text-sm text-gray-600">
              Trazabilidad completa: detección → cotización → aprobación → ejecución → facturación → cobranza.
              Nunca se asume una etapa como cumplida sin registrarla.
            </p>

            <AdicionalForm obraId={id} />

            <AdicionalesList
              adicionales={adicionales.data ?? []}
              obraId={id}
              movimientosDeCobro={movimientosDeCobro}
            />
          </section>

          <section data-testid="presupuesto-obra-section">
            <h2 className="text-xl font-semibold">Presupuesto</h2>
            <p className="mt-1 text-sm text-gray-600">
              Registro del presupuesto base — no reemplaza a Planilla para Cotizar.xlsm.
            </p>

            <PresupuestoForm obraId={id} />

            <table className="mt-3 w-full text-left text-sm">
              <thead>
                <tr>
                  <th className="pr-4">Versión</th>
                  <th className="pr-4">Estado</th>
                  <th className="pr-4">Monto presupuestado</th>
                  <th className="pr-4">Costo directo</th>
                  <th className="pr-4">Costo indirecto</th>
                  <th className="pr-4">Margen esperado</th>
                  <th className="pr-4">Fuente</th>
                  <th className="pr-4">Fecha</th>
                </tr>
              </thead>
              <tbody>
                {(presupuestos.data ?? []).map((p) => (
                  <tr key={p.id}>
                    <td className="pr-4">{p.version}</td>
                    <td className="pr-4">{p.estado}</td>
                    <td className="pr-4">${p.monto_presupuestado}</td>
                    <td className="pr-4">${p.costo_directo_presupuestado}</td>
                    <td className="pr-4">${p.costo_indirecto_presupuestado}</td>
                    <td className="pr-4">${p.margen_esperado}</td>
                    <td className="pr-4">{p.fuente_legacy}</td>
                    <td className="pr-4">{p.fecha_presupuesto}</td>
                  </tr>
                ))}
                {(presupuestos.data ?? []).length === 0 && !pageError && (
                  <tr>
                    <td colSpan={8} className="pt-2 text-gray-500">
                      Sin presupuesto registrado todavía.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>

            {presupuestoMasReciente && (
              <div className="mt-4" data-testid="partidas-presupuesto-section">
                <h3 className="text-lg font-semibold">
                  Partidas — versión {presupuestoMasReciente.version}
                </h3>
                <PartidaPresupuestoForm presupuestoId={presupuestoMasReciente.id} obraId={id} />
                <ul className="mt-3 list-inside list-disc text-sm">
                  {(partidas.data ?? []).map((pp) => (
                    <li key={pp.id}>
                      {pp.codigo ? `${pp.codigo} — ` : ''}
                      {pp.descripcion}: ${pp.monto}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>

          <section data-testid="costos-reales-obra-section">
            <h2 className="text-xl font-semibold">Costos reales</h2>
            <p className="mt-1 text-sm text-gray-600">
              Costo real devengado o comprometido — no reemplaza a CONTROL DE GASTOS.xlsx.
            </p>

            <CostoRealForm
              obraId={id}
              proveedores={proveedores.data ?? []}
              movimientosDePago={movimientosDePago}
            />

            <table className="mt-3 w-full text-left text-sm">
              <thead>
                <tr>
                  <th className="pr-4">Fecha</th>
                  <th className="pr-4">Concepto</th>
                  <th className="pr-4">Proveedor</th>
                  <th className="pr-4">Monto</th>
                  <th className="pr-4">Estado</th>
                  <th className="pr-4">Movimiento de caja vinculado</th>
                  <th className="pr-4">Fuente</th>
                </tr>
              </thead>
              <tbody>
                {(costosReales.data ?? []).map((c) => (
                  <tr key={c.id}>
                    <td className="pr-4">{c.fecha}</td>
                    <td className="pr-4">{c.concepto}</td>
                    <td className="pr-4">{proveedorNombre(c.proveedor_id)}</td>
                    <td className="pr-4">${c.monto}</td>
                    <td className="pr-4">{c.estado}</td>
                    <td className="pr-4">{movimientoConcepto(c.movimiento_caja_id)}</td>
                    <td className="pr-4">{c.fuente_legacy}</td>
                  </tr>
                ))}
                {(costosReales.data ?? []).length === 0 && !pageError && (
                  <tr>
                    <td colSpan={7} className="pt-2 text-gray-500">
                      Sin costos reales registrados todavía.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </section>

          <section data-testid="movimientos-obra-section">
            <h2 className="text-xl font-semibold">Movimientos de caja de esta obra</h2>
            <table className="mt-3 w-full text-left text-sm">
              <thead>
                <tr>
                  <th className="pr-4">Fecha esperada</th>
                  <th className="pr-4">Tipo</th>
                  <th className="pr-4">Estado</th>
                  <th className="pr-4">Monto</th>
                  <th className="pr-4">Cuenta financiera</th>
                  <th className="pr-4">Proveedor</th>
                  <th className="pr-4">Concepto</th>
                </tr>
              </thead>
              <tbody>
                {(movimientos.data ?? []).map((m) => (
                  <tr key={m.id}>
                    <td className="pr-4">{m.fecha_esperada}</td>
                    <td className="pr-4">{m.tipo}</td>
                    <td className="pr-4">{m.estado}</td>
                    <td className="pr-4">${m.monto}</td>
                    <td className="pr-4">{cuentaNombre(m.cuenta_financiera_id)}</td>
                    <td className="pr-4">{proveedorNombre(m.proveedor_id)}</td>
                    <td className="pr-4">{m.concepto}</td>
                  </tr>
                ))}
                {(movimientos.data ?? []).length === 0 && !pageError && (
                  <tr>
                    <td colSpan={7} className="pt-2 text-gray-500">
                      Sin movimientos registrados todavía.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </section>
        </>
      )}
    </div>
  )
}
