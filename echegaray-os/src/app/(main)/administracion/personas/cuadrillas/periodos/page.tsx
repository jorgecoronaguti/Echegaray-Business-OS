// PERÍODOS DE HH — el mes que se liquida, y el botón que lo cierra.
//
// El estado NO es una ventana de fechas: es una fila de `periodo_hh` con quién cerró y cuándo, y un
// trigger que impide cargar horas de un mes cerrado (migración `20260821T5800`). Sin ese trigger,
// «Cerrado» sería una etiqueta y el total con el que se liquidó dejaría de coincidir con el que la
// base devuelve el día que alguien cargue una jornada atrasada.
//
// EL BOTÓN SE OFRECE SEGÚN `ve_economia()`, pero la cerradura está en la base: quien llame al RPC
// por PostgREST sin permiso económico recibe 42501 igual. Un perfil ilegible cae en «no puede», que
// es el modo de fallar correcto — esconderle el botón a quien sí puede es reparable; ofrecérselo a
// quien no, no.

import { createClient } from '@/lib/supabase/server'
import { getPerfilActual } from '@/features/auth/services/authService'
import { veEconomia } from '@/features/auth/types/areas'
import { Aviso, TituloPantalla, Vacio, Volver } from '@/shared/components/ds'
import { SolapasHH } from '@/features/administracion/components/SolapasHH'
import { TablaPeriodosHH } from '@/features/administracion/components/TablaPeriodosHH'
import { getPeriodos, rotuloPeriodo } from '@/features/administracion/services/periodoHHService'
import { cerrarPeriodo, reabrirPeriodo } from '@/features/administracion/services/periodoHHActions'

export const dynamic = 'force-dynamic'

export default async function PeriodosHHPage() {
  const supabase = await createClient()
  const [periodos, perfil] = await Promise.all([getPeriodos(supabase), getPerfilActual(supabase)])
  const puedeCerrar = veEconomia(perfil.data?.rol ?? null)

  const abierto = (periodos.data ?? []).find((p) => p.estado === 'abierto')

  return (
    <div className="min-h-screen bg-canvas">
      <div className="w-full px-4 py-6 lg:px-10">
        <div className="mb-5">
          <Volver href="/administracion/personas">Personal</Volver>
          <TituloPantalla className="mt-2">Cuadrillas y HH</TituloPantalla>
          <div className="mt-3"><SolapasHH vista="periodos" /></div>
        </div>

        {abierto && (
          <p className="mb-4 text-[13px] text-muted" data-testid="periodo-abierto">
            {rotuloPeriodo(abierto.periodo)} abierto
            {abierto.correcciones_pendientes > 0
              && ` · ${abierto.correcciones_pendientes} corrección${abierto.correcciones_pendientes === 1 ? '' : 'es'} de asistencia sin resolver`}
          </p>
        )}

        {periodos.error
          ? (
              <div data-testid="periodos-error">
                <Aviso tono="neg" titulo="No pude leer los períodos de HH">{periodos.error}</Aviso>
              </div>
            )
          : (periodos.data ?? []).length === 0
            ? <Vacio>Todavía no hay horas cargadas: no hay ningún período que cerrar.</Vacio>
            : (
                <TablaPeriodosHH
                  periodos={periodos.data ?? []}
                  puedeCerrar={puedeCerrar}
                  cerrar={cerrarPeriodo}
                  reabrir={reabrirPeriodo}
                />
              )}

        <p className="mt-4 text-[11px] leading-relaxed text-faint">
          Cerrar un período impide cargar, modificar o borrar horas de ese mes — es lo que hace que el
          total liquidado siga siendo el que la base devuelve. El sync del orquestador, que espeja
          fuentes externas, sigue escribiendo. Un cierre equivocado se revierte con «Reabrir», que
          borra el sello.
        </p>
      </div>
    </div>
  )
}
