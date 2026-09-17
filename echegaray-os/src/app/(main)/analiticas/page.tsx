// ANALÍTICAS — ocho vistas sobre la misma cartera, con los filtros en la URL.
//
// ═══ LA PUERTA SE CIERRA EN EL SERVIDOR, Y LA CERRADURA ESTÁ EN LA BASE ═══
//
// Sin permiso económico la página es `notFound()`: no existe para ese rol. Y aunque alguien llamara la
// RPC a mano, `analiticas_costos` devuelve null sin `ve_economia()` y las vistas de egresos, nómina y
// contrato filtran por rol. El middleware (`RUTAS_SOLO_ECONOMIA`) es la tercera capa, no la primera.
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getPerfilActual } from '@/features/auth/services/authService'
import { veEconomia } from '@/features/auth/types/areas'
import { leerFiltros, razonNoAplica, rotuloPeriodo } from '@/features/analiticas/services/filtros'
import { getDatosAnaliticas } from '@/features/analiticas/services/analiticasService'
import { cifrasResumen } from '@/features/analiticas/services/agregados'
import { BarraAnaliticas } from '@/features/analiticas/components/BarraAnaliticas'
import { SinLectura } from '@/features/analiticas/components/Piezas'
import { VistaEstado, VistaResumen } from '@/features/analiticas/components/VistasCartera'
import { VistaContrato } from '@/features/analiticas/components/VistaContrato'
import { VistaHora, VistaObra } from '@/features/analiticas/components/VistasObra'
import { VistaCaja, VistaCobranza, VistaNomina } from '@/features/analiticas/components/VistasEmpresa'
import { SelloDatoBueno } from '@/shared/components/estado/SelloDatoBueno'

export const dynamic = 'force-dynamic'

export default async function AnaliticasPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const filtros = leerFiltros(await searchParams)
  const supabase = await createClient()
  const perfil = await getPerfilActual(supabase)
  if (!veEconomia(perfil.data?.rol ?? null)) notFound()

  const d = await getDatosAnaliticas(supabase, filtros)
  const periodo = razonNoAplica(filtros.vista, 'periodo') ? 'acumulado a la fecha' : rotuloPeriodo(filtros.periodo).toLowerCase()
  const opciones = d.cartera.map((o) => ({ id: o.id, nombre: o.nombre, estado: o.estado }))

  return (
    <>
      <SelloDatoBueno />
      <BarraAnaliticas filtros={filtros} obras={opciones} />
      <div className="px-4 py-6 sm:px-6 lg:px-10">
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
    case 'resumen': return <VistaResumen obras={d.obras} sinObra={d.sinObra} filtros={filtros} />
    case 'contrato': return <VistaContrato obras={d.obras} sinObra={d.sinObra} filtros={filtros} />
    case 'obra': return <VistaObra obras={d.obras} filtros={filtros} periodo={periodo} />
    case 'hora': return <VistaHora obras={d.obras} periodo={periodo} />
    case 'caja': return <VistaCaja egresos={d.egresos} periodo={periodo} />
    case 'nomina': return <VistaNomina filas={d.nomina} personas={d.personas} rango={d.rango} periodo={periodo} />
    case 'cobranza': return (
      <VistaCobranza cuenta={d.cuentaCorriente} certificados={d.certificados} hoy={d.hoy} periodo={periodo}
        gastado={cifrasResumen(d.cartera, d.sinObra).gastadoEnObras} />
    )
    default: return <VistaEstado obras={d.obras} />
  }
}
