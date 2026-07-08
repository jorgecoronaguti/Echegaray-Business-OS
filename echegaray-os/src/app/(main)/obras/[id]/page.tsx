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
import { getRegistrosHHPorObra, getHHResumenPorObra } from '@/features/hh-productividad/services/hhProductividadService'
import { getActividadesSemanales } from '@/features/actividades-semanales/services/actividadesSemanalesService'
import { ActividadesSemanalesList } from '@/features/actividades-semanales/components/ActividadesSemanalesList'
import { PlanSemanalForm } from '@/features/actividades-semanales/components/PlanSemanalForm'
import { calcularResumenProduccionEconomica } from '@/features/actividades-semanales/types/produccionEconomica'
import { ResumenProduccionEconomicaView } from '@/features/actividades-semanales/components/ResumenProduccionEconomica'
import { RegistroHHForm } from '@/features/hh-productividad/components/RegistroHHForm'
import { ResumenHHObra } from '@/features/hh-productividad/components/ResumenHHObra'
import { getComprasPorObra, getComprasResumenPorObra } from '@/features/compras/services/comprasService'
import { CompraForm } from '@/features/compras/components/CompraForm'
import { ComprasList } from '@/features/compras/components/ComprasList'
import {
  getObligacionesPorObra,
  getObligacionesResumenPorObra,
} from '@/features/obligaciones/services/obligacionesService'
import { ObligacionForm } from '@/features/obligaciones/components/ObligacionForm'
import { ObligacionesList } from '@/features/obligaciones/components/ObligacionesList'
import { getPostMortemPorObra } from '@/features/post-mortem/services/postMortemService'
import { construirResumenSnapshot } from '@/features/post-mortem/types'
import { IniciarPostMortemForm } from '@/features/post-mortem/components/IniciarPostMortemForm'
import { PostMortemForm } from '@/features/post-mortem/components/PostMortemForm'
import { ResumenPostMortem } from '@/features/post-mortem/components/ResumenPostMortem'
import { getDashboardDatosFuente } from '@/features/dashboard/services/dashboardDataService'
import { construirAlertasDashboard } from '@/features/dashboard/types'
import { getAcciones } from '@/features/acciones/services/accionesService'
import { construirFichaObra } from '@/features/obras/types/fichaObra'
import { FichaObraView } from '@/features/obras/components/FichaObraView'

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
      registrosHH,
      resumenHH,
      compras,
      comprasResumen,
      obligaciones,
      obligacionesResumen,
      postMortem,
      actividadesSemanales,
      datosFuente,
      acciones,
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
      getRegistrosHHPorObra(supabase, id),
      getHHResumenPorObra(supabase, id),
      getComprasPorObra(supabase, id),
      getComprasResumenPorObra(supabase, id),
      getObligacionesPorObra(supabase, id),
      getObligacionesResumenPorObra(supabase, id),
      getPostMortemPorObra(supabase, id),
      getActividadesSemanales(supabase, id),
      getDashboardDatosFuente(supabase),
      getAcciones(supabase),
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
      registrosHH,
      resumenHH,
      compras,
      comprasResumen,
      obligaciones,
      obligacionesResumen,
      postMortem,
      actividadesSemanales,
      datosFuente,
      acciones,
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
      registrosHH: failed,
      resumenHH: failed,
      compras: failed,
      comprasResumen: failed,
      obligaciones: failed,
      obligacionesResumen: failed,
      postMortem: failed,
      actividadesSemanales: failed,
      datosFuente: failed,
      acciones: failed,
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
    registrosHH,
    resumenHH,
    compras,
    comprasResumen,
    obligaciones,
    obligacionesResumen,
    postMortem,
    actividadesSemanales,
    datosFuente,
    acciones,
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
    ejecucionFinanciera.error ??
    registrosHH.error ??
    resumenHH.error ??
    compras.error ??
    comprasResumen.error ??
    obligaciones.error ??
    obligacionesResumen.error ??
    postMortem.error ??
    actividadesSemanales.error ??
    datosFuente.error ??
    acciones.error
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

  // Vista previa en vivo del resumen del Post Mortem — misma función que usa el
  // cierre real (construirResumenSnapshot), sin duplicar el cálculo; solo se muestra
  // mientras el post mortem sigue en 'borrador'.
  const resumenPostMortemEnVivo = construirResumenSnapshot({
    resumenEconomico: resumenEconomico.data,
    ejecucionFinanciera: ejecucionFinanciera.data,
    resumenHH: resumenHH.data,
    registrosHH: registrosHH.data ?? [],
    adicionales: adicionales.data ?? [],
    certificados: certificados.data ?? [],
    compras: compras.data ?? [],
    comprasResumen: comprasResumen.data ?? [],
    obligacionesResumen: obligacionesResumen.data ?? [],
  })

  const resumenProduccion = calcularResumenProduccionEconomica({
    actividades: actividadesSemanales.data ?? [],
    registrosHH: registrosHH.data ?? [],
    resumenEconomico: resumenEconomico.data,
    hhEstimadaPresupuesto: presupuestoMasReciente?.hh_estimada ?? null,
  })

  const ficha =
    obra.data && datosFuente.data
      ? construirFichaObra({
          obra: obra.data,
          clienteNombre,
          resumenEconomico: resumenEconomico.data,
          resumenProduccion,
          ejecucionFinanciera: ejecucionFinanciera.data,
          resumenHH: resumenHH.data,
          registrosHH: registrosHH.data ?? [],
          costosReales: costosReales.data ?? [],
          movimientosObra: movimientos.data ?? [],
          adicionalesObra: adicionales.data ?? [],
          actividadesObra: actividadesSemanales.data ?? [],
          accionesObra: (acciones.data ?? []).filter((a) => a.obra_id === id),
          alertasObra: construirAlertasDashboard(datosFuente.data).filter((a) => a.obraId === id),
        })
      : null

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

          {ficha && <FichaObraView ficha={ficha} />}

          <details className="mt-6" data-testid="obra-detalle-operativo">
            <summary className="cursor-pointer text-sm font-semibold text-gray-600">
              Detalle operativo completo (carga y edición de datos)
            </summary>
            <div className="mt-4 space-y-8">
          <section data-testid="post-mortem-obra-section">
            <h2 className="text-xl font-semibold">Post Mortem</h2>
            <p className="mt-1 text-sm text-gray-600">
              El cierre inteligente de la obra: qué margen esperábamos vs. qué obtuvimos, qué se desvió y qué
              aprendemos para la próxima cotización.
            </p>

            {!postMortem.data && <IniciarPostMortemForm obraId={id} />}

            {postMortem.data && (
              <div className="mt-3 space-y-4">
                <span
                  className={`inline-block rounded px-2 py-1 text-xs font-semibold ${
                    postMortem.data.estado === 'cerrado' ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'
                  }`}
                >
                  {postMortem.data.estado === 'cerrado' ? 'Cerrado' : 'Borrador'}
                </span>

                <ResumenPostMortem
                  resumen={postMortem.data.resumen_snapshot ?? resumenPostMortemEnVivo}
                  congelado={postMortem.data.estado === 'cerrado'}
                />

                <PostMortemForm postMortem={postMortem.data} obraId={id} />
              </div>
            )}
          </section>

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

          <section data-testid="actividades-semanales-obra-section">
            <h2 className="text-xl font-semibold">Actividad semanal (O1-B)</h2>
            <p className="mt-1 text-sm text-gray-600">
              Ciclo semanal mínimo: lunes se planifica, viernes se informa solo el avance real y la causa de desvío
              -- todo lo demás ya está cargado. Reutiliza responsable, HH y costos ya existentes, no los duplica.
            </p>
            <div className="mt-3">
              <ActividadesSemanalesList obraId={id} actividades={actividadesSemanales.data ?? []} />
            </div>
            <div className="mt-4">
              <PlanSemanalForm obraId={id} />
            </div>
          </section>

          <section data-testid="produccion-economica-obra-section">
            <h2 className="text-xl font-semibold">Conexión físico-económica (O1-C)</h2>
            <p className="mt-1 text-sm text-gray-600">
              Cruza avance físico real con HH, costo y margen ya cargados. Cada dato declara si es observado,
              calculado, estimado o inferido -- no inventa precisión que la evidencia no sostiene.
            </p>
            {resumenEconomico.data && (
              <div className="mt-3">
                <ResumenProduccionEconomicaView resumen={resumenProduccion} />
              </div>
            )}
          </section>

          <section data-testid="hh-productividad-obra-section">
            <h2 className="text-xl font-semibold">HH y productividad</h2>
            <p className="mt-1 text-sm text-gray-600">
              Consumo real de horas hombre por semana vs. HH estimadas del presupuesto aprobado. No calcula costo de
              mano de obra (eso ya se registra en Costos Reales) ni reemplaza JORNALES todavía.
            </p>
            {resumenHH.data && (
              <div className="mt-3">
                <ResumenHHObra resumen={resumenHH.data} registros={registrosHH.data ?? []} />
              </div>
            )}

            <div className="mt-4">
              <RegistroHHForm obraId={id} costosReales={costosReales.data ?? []} />
            </div>
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
                  <th className="pr-4">HH estimadas</th>
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
                    <td className="pr-4">{p.hh_estimada ?? '—'}</td>
                    <td className="pr-4">{p.fuente_legacy}</td>
                    <td className="pr-4">{p.fecha_presupuesto}</td>
                  </tr>
                ))}
                {(presupuestos.data ?? []).length === 0 && !pageError && (
                  <tr>
                    <td colSpan={9} className="pt-2 text-gray-500">
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

          <section data-testid="obligaciones-obra-section">
            <h2 className="text-xl font-semibold">Obligaciones de esta obra</h2>
            <p className="mt-1 text-sm text-gray-600">
              Compromisos financieros pendientes de pago, total o parcial. No es Caja: una obligación futura recién
              impacta caja cuando se le aplica un pago real.
            </p>

            <ObligacionForm obraId={id} proveedores={proveedores.data ?? []} compras={compras.data ?? []} />

            <ObligacionesList
              obligaciones={obligaciones.data ?? []}
              resumenes={obligacionesResumen.data ?? []}
              proveedores={proveedores.data ?? []}
              movimientosDePago={movimientosDePago}
              obraId={id}
            />
          </section>

          <section data-testid="compras-obra-section">
            <h2 className="text-xl font-semibold">Compras y abastecimiento</h2>
            <p className="mt-1 text-sm text-gray-600">
              Necesidad → solicitud → cotización → orden → recepción. Una compra puede tener varios costos reales
              (entregas parciales) y varios pagos (cuotas) — no se fuerza un único vínculo.
            </p>

            <CompraForm obraId={id} proveedores={proveedores.data ?? []} />

            <ComprasList
              compras={compras.data ?? []}
              resumenes={comprasResumen.data ?? []}
              obraId={id}
              movimientosDePago={movimientosDePago}
              proveedores={proveedores.data ?? []}
            />
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
              compras={compras.data ?? []}
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
            </div>
          </details>
        </>
      )}
    </div>
  )
}
