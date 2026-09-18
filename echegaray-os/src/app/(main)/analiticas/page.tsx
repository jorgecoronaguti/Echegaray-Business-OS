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
import { VistaCaja, VistaCobranza, VistaNomina } from '@/features/analiticas/components/VistasEmpresa'
import { SelloDatoBueno } from '@/shared/components/estado/SelloDatoBueno'
import { manoObraDe } from '@/features/analiticas/services/agregados'
import { rotuloEstimada, type ObraAnalitica } from '@/features/analiticas/services/obras'

/** La mano de obra imputada a obras en el período: la misma suma que Resumen, para que Nómina no la contradiga. */
function manoObraEnObras(cartera: ObraAnalitica[]) {
  const con = cartera.filter((o) => (o.gasto.manoObra ?? 0) > 0)
  const t = manoObraDe(cartera)
  return { manoObra: t.manoObra, estimada: rotuloEstimada(t), obras: con.length }
}

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
  const periodo = razonNoAplica(filtros.vista, 'periodo') ? 'acumulado a la fecha' : rotuloPeriodo(filtros.periodo).toLowerCase()
  const opciones = d.cartera.map((o) => ({ id: o.id, nombre: o.nombre, cliente: o.clienteNombre, estado: o.estado }))

  return (
    <>
      <SelloDatoBueno />
      <BarraAnaliticas filtros={filtros} obras={opciones} />
      <div className="px-4 lg:px-10">
        {!d.legible ? <SinLectura que="el gasto de las obras" /> : <Vista filtros={filtros} d={d} periodo={periodo} />}
      </div>
    </>
  )
}

function Vista({ filtros, d, periodo }: {
  filtros: ReturnType<typeof leerFiltros>
  d: Awaited<ReturnType<typeof getDatosAnaliticas>>
  periodo: string
}) {
  switch (filtros.vista) {
    case 'obras': return <VistaObras obras={d.obras} obra={d.obraElegida} filtros={filtros} consumo={d.consumoMensual} ritmo={d.ritmo}
      sinIva={d.obraElegida && d.sinIvaDiscriminado.size ? (d.sinIvaDiscriminado.get(d.obraElegida.id) ?? 0) : null} />
    case 'caja': return <VistaCaja egresos={d.egresos} periodo={periodo} />
    case 'nomina': return <VistaNomina filas={d.nomina} quincenas={d.quincenas} personas={d.personas} rango={d.rango} periodo={periodo} hoy={d.hoy}
      enObras={d.legible ? manoObraEnObras(d.cartera) : null} />
    case 'cobranza': return <VistaCobranza cuenta={d.cuentaCorriente} documentos={d.documentos} hoy={d.hoy} periodo={periodo} />
    default: return <VistaResumen obras={d.obras} sinObra={d.sinObra} filtros={filtros} neto={d.netoDeIva}
      comprobantesPorCliente={d.sinObraDetalle.size ? new Map([...d.sinObraDetalle.entries()].map(([id, g]) => [id, g.nComprobantes])) : null} />
  }
}
