// LOS PERÍODOS DE HH — un mes por fila, y el botón que los cierra.
//
// ═══ EL BOTÓN NO SE DIBUJA SI NO VA A FUNCIONAR ═══
//
// Cerrar exige permiso económico (Dirección o Administración) y que no queden correcciones de
// asistencia pendientes de ese mes. Las dos condiciones las valida la base adentro de la
// transacción; acá se usan para no ofrecer un botón que va a rebotar. Cuando no se ofrece, se dice
// POR QUÉ y con el número: «3 correcciones pendientes» manda a la bandeja, «sin permiso» no.

import Link from 'next/link'
import { BotonAccion, type ResultadoAccion } from '@/shared/components/ui'
import { Estado, Nulo, Num, Tabla, Td, Th, THead, Tr } from '@/shared/components/ds'
import { rotuloPeriodo, type PeriodoHH } from '../services/periodoHHService'

const HH = (n: number) => n.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 1 })

/** El período viaja en `args` de `BotonAccion` y NO en una arrow: una función nueva no cruza la
 *  frontera del servidor. `accion={() => cerrar(p.periodo)}` compila, pasa el build, y deja la
 *  pantalla en blanco en runtime. */
type AccionPeriodo = (periodo: string) => Promise<ResultadoAccion>

export function TablaPeriodosHH({
  periodos, puedeCerrar, cerrar, reabrir,
}: {
  periodos: PeriodoHH[]
  /** `ve_economia()` del usuario. La cerradura real está en la base: esto sólo evita ofrecer. */
  puedeCerrar: boolean
  cerrar: AccionPeriodo
  reabrir: AccionPeriodo
}) {
  return (
    <Tabla testid="tabla-periodos-hh" minWidth={860}>
      <THead>
        <Th>Período</Th>
        <Th num>Personas</Th>
        <Th num>HH normales</Th>
        <Th num>Extras</Th>
        <Th num>Correcciones</Th>
        <Th>Estado</Th>
        <Th>Acción</Th>
      </THead>
      <tbody>
        {periodos.map((p) => {
          const bloqueado = p.correcciones_pendientes > 0
          return (
            <Tr key={p.periodo} data-testid="fila-periodo">
              <Td fuerte>{rotuloPeriodo(p.periodo)}</Td>
              <Td num className="w-[90px]"><Num className="text-muted">{p.personas}</Num></Td>
              <Td num className="w-[110px]"><Num>{HH(p.hh_normales)}</Num></Td>
              <Td num className="w-[90px]">
                {p.hh_extras === 0 ? <Nulo>—</Nulo> : <Num className="text-warn">{HH(p.hh_extras)}</Num>}
              </Td>
              <Td num className="w-[130px]">
                {p.correcciones === 0
                  ? <Nulo>—</Nulo>
                  : (
                      <Link href="/administracion/asistencia" className="hover:underline" data-testid="ir-a-correcciones">
                        <Num className={bloqueado ? 'text-warn' : 'text-muted'}>{p.correcciones}</Num>
                        {bloqueado && <span className="ml-1 text-[10px] text-warn">{p.correcciones_pendientes} pend.</span>}
                      </Link>
                    )}
              </Td>
              <Td className="w-[130px]">
                <Estado tono={p.estado === 'cerrado' ? 'pos' : 'warn'}>
                  {p.estado === 'cerrado' ? 'Cerrado' : 'Abierto'}
                </Estado>
              </Td>
              <Td className="w-[210px]">
                {!puedeCerrar
                  ? <span className="text-[11px] text-faint">sólo Dirección o Administración</span>
                  : p.estado === 'cerrado'
                    ? (
                        <BotonAccion accion={reabrir} args={[p.periodo]} testid="reabrir-periodo">
                          Reabrir
                        </BotonAccion>
                      )
                    : bloqueado
                      ? (
                          <span className="text-[11px] text-warn" data-testid="cierre-bloqueado">
                            {p.correcciones_pendientes} corrección{p.correcciones_pendientes === 1 ? '' : 'es'} sin resolver
                          </span>
                        )
                      : (
                          <BotonAccion accion={cerrar} args={[p.periodo]} tono="fuerte" testid="cerrar-periodo">
                            Cerrar {rotuloPeriodo(p.periodo).split(' ')[0].toLowerCase()}
                          </BotonAccion>
                        )}
              </Td>
            </Tr>
          )
        })}
      </tbody>
    </Tabla>
  )
}
