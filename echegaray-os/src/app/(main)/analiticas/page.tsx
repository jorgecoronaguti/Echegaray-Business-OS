// ANALÍTICAS — cinco vistas sobre la misma cartera, con los filtros en la URL.
//
// Estructura confirmada por el dueño (17/09/2026): Resumen (la única con cifras generales), Obras (una
// obra, rubro contra rubro), Caja, Nómina y Cobranza. Estilo del diseño «Analíticas v6». Un link a una
// vista retirada (Contrato y gasto, Gasto por obra, Costo por hora, Estado del gasto) redirige.
//
// ═══ LA PUERTA SE CIERRA EN EL SERVIDOR, Y LA CERRADURA ESTÁ EN LA BASE ═══
//
// Sin permiso económico la página es `notFound()`: no existe para ese rol. Y aunque alguien llamara la
// RPC a mano, `analiticas_costos` devuelve null sin `ve_economia()` y las vistas de egresos, nómina y
// contrato filtran por rol. El middleware (`RUTAS_SOLO_ECONOMIA`) es la tercera capa, no la primera.
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getPerfilActual } from '@/features/auth/services/authService'
import { veEconomia } from '@/features/auth/types/areas'
import { leerFiltros, razonNoAplica, redireccionDe, rotuloPeriodo } from '@/features/analiticas/services/filtros'
import { getDatosAnaliticas } from '@/features/analiticas/services/analiticasService'
import { BarraAnaliticas } from '@/features/analiticas/components/BarraAnaliticas'
import { SinLectura } from '@/features/analiticas/components/Piezas'
import { VistaResumen } from '@/features/analiticas/components/VistaResumen'
import { VistaObras } from '@/features/analiticas/components/VistaObras'
import { VistaCobranza, VistaNomina } from '@/features/analiticas/components/VistasEmpresa'
import { VistaCaja } from '@/features/analiticas/components/VistaCaja'
import type { ObraAnalitica } from '@/features/analiticas/services/obras'
import { SelloDatoBueno } from '@/shared/components/estado/SelloDatoBueno'
import { PanelDetalleCosto } from '@/features/clientes/components/PanelDetalleCosto'
import { leerDetalle, leerRubro } from '@/features/clientes/services/detalleCostoDeObra'
import { aUrl } from '@/features/analiticas/services/filtros'
import { millones } from '@/features/analiticas/services/formato'
import { leerMes, mesDelDetalle } from '@/features/analiticas/services/nominaPagada'

export const dynamic = 'force-dynamic'

export default async function AnaliticasPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams
  const supabase = await createClient()
  const perfil = await getPerfilActual(supabase)
  if (!veEconomia(perfil.data?.rol ?? null)) notFound()
  const destino = redireccionDe(params)
  if (destino) redirect(destino)
  const filtros = leerFiltros(params)

  const d = await getDatosAnaliticas(supabase, filtros)
  // ═══ EL PANEL DE COMPOSICIÓN DE UN RUBRO (dueño, 21/09/2026) ═══
  //
  // «Cada rubro de Analíticas > Obras, al hacer click, tiene que abrirse un menú a la derecha en
  // donde muestre cómo está compuesto.» Es el MISMO pedido que el 15/09 puso el panel en la ficha
  // del cliente, así que se reutiliza el mismo panel y la misma RPC (`detalle_costo_de_obra`): dos
  // paneles con el mismo nombre y distinta cuenta serían dos definiciones del costo de una obra.
  //
  // Sólo en la vista Obras y con una obra elegida. La lectura se hace SÓLO con el panel abierto: es
  // el detalle de un clic, no algo que la pantalla necesite para dibujarse.
  const rubro = filtros.vista === 'obras' ? leerRubro(params.rubro) : null
  const obraDelPanel = rubro && d.obraElegida ? d.obraElegida : null
  const detalle = obraDelPanel && rubro
    ? await leerDetalle(supabase, { obraId: obraDelPanel.id, rubro })
    : { detalle: null, error: null }
  // ═══ EL MES DEL DETALLE DE NÓMINA VIAJA EN LA URL, COMO `rubro` ═══
  //
  // No es un filtro (no recorta la serie: los doce meses se siguen dibujando), es qué mes tiene
  // abierto el detalle por persona. Entra por `leerMes`, que no cree en un `2026-13`, y si el mes
  // pedido no tiene cifras se abre el último que sí las tenga.
  const mes = filtros.vista === 'nomina' && d.nominaPagada ? mesDelDetalle(d.nominaPagada, leerMes(params.mes)) : null
  const periodo = razonNoAplica(filtros.vista, 'periodo') ? 'acumulado a la fecha' : rotuloPeriodo(filtros.periodo).toLowerCase()
  const opciones = d.cartera.map((o) => ({ id: o.id, nombre: o.nombre, cliente: o.clienteNombre, estado: o.estado }))

  return (
    <>
      <SelloDatoBueno />
      <BarraAnaliticas filtros={filtros} obras={opciones} />
      <div className="px-4 lg:px-10">
        {!d.legible ? <SinLectura que="el gasto de las obras" /> : <Vista filtros={filtros} d={d} periodo={periodo} mes={mes} />}
      </div>
      {obraDelPanel && rubro ? (
        <PanelDetalleCosto
          titulo={obraDelPanel.nombre}
          rubro={rubro}
          detalle={detalle.detalle}
          error={detalle.error}
          celda={celdaDeLaVista(obraDelPanel, rubro)}
          // ═══ LOS DOS NÚMEROS SON CORRECTOS Y DISTINTOS, Y SE DICE ═══
          //
          // Analíticas publica el consumo NETO DE IVA; este panel lista los comprobantes como los
          // registra Compras, con IVA. Medido en Salón Comercial: la pantalla dice $ 31,15 M y el
          // panel suma $ 37,51 M. Sin esta línea, el que mira ve dos números para la misma palabra y
          // supone que uno está mal. Con la aclaración puesta, el cotejo contra la celda se apaga:
          // enfrentar dos criterios distintos daría ámbar siempre y el aviso dejaría de significar.
          aclaracion={rubro === 'materiales' || rubro === 'subcontratos'
            ? `La pantalla mide ${millonesDeLaVista(obraDelPanel, rubro)} neto de IVA; acá abajo van los comprobantes como los registra Compras, con IVA. Los dos son correctos: miden cosas distintas.`
            : undefined}
          cerrarHref={aUrl(filtros, { rubro: null })}
          hrefDesgloseHH={null}
          hrefComprasBase="/administracion/compras?s="
        />
      ) : null}
    </>
  )
}

function Vista({ filtros, d, periodo, mes }: {
  filtros: ReturnType<typeof leerFiltros>
  d: Awaited<ReturnType<typeof getDatosAnaliticas>>
  periodo: string
  /** Vista Nómina: el mes cuyo detalle por persona se abre. `null` = ninguno tiene cifras. */
  mes: string | null
}) {
  switch (filtros.vista) {
    case 'obras': return <VistaObras obras={d.obras} obra={d.obraElegida} filtros={filtros} consumo={d.consumoMensual} ritmo={d.ritmo}
      sinIva={d.obraElegida && d.sinIvaDiscriminado.size ? (d.sinIvaDiscriminado.get(d.obraElegida.id) ?? 0) : null} />
    case 'caja': return <VistaCaja lectura={d.cajaSheet} egresos={d.egresos} criterio={d.criterioEgresos} periodo={periodo} rango={d.rango} deuda={d.deudaProveedores} />
    case 'nomina': return <VistaNomina pagado={d.nominaPagada} personas={d.personas} filtros={filtros} mes={mes} />
    case 'cobranza': return <VistaCobranza cuenta={d.cuentaCorriente} documentos={d.documentos} agenda={d.documentosParaAgenda} hoy={d.hoy} periodo={periodo} />
    default: return <VistaResumen obras={d.obras} sinObra={d.sinObra} filtros={filtros} neto={d.netoDeIva}
      comprobantesPorCliente={d.sinObraDetalle.size ? new Map([...d.sinObraDetalle.entries()].map(([id, g]) => [id, g.nComprobantes])) : null} />
  }
}

/** El importe de la vista, escrito, para poder nombrarlo en la aclaración del panel. */
function millonesDeLaVista(o: ObraAnalitica, rubro: 'materiales' | 'subcontratos' | 'mo' | 'hh'): string {
  const v = celdaDeLaVista(o, rubro)
  return v == null ? 'otra cosa' : (millones(v) ?? 'otra cosa')
}

/** Lo que la vista Obras publica para ese rubro. Es la MISMA celda que el clic abrió. */
function celdaDeLaVista(o: ObraAnalitica, rubro: 'materiales' | 'subcontratos' | 'mo' | 'hh'): number | null {
  switch (rubro) {
    case 'materiales': return o.gasto.materiales ?? null
    case 'subcontratos': return o.gasto.subcontratos ?? null
    case 'mo': return o.gasto.manoObra ?? null
    case 'hh': return o.gasto.horas ?? null
  }
}
