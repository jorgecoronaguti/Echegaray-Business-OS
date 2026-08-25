'use client'

// EL PANEL DEL IMPEDIMENTO — el canónico 23/08 (pantalla 11), con los datos que EXISTEN.
//
// El canónico dibuja un panel lateral con la acción primaria arriba, un bloque de datos, un recuadro
// de impacto en HH y días, un historial y un campo de comentario. De esos cinco, tres se pueden
// llenar con hechos y dos no:
//
//   · IMPACTO EN HH: NO HAY FUENTE. Ninguna tabla ata una hora imputada a un impedimento —no existe
//     `restriccion_id` en ninguna migración—. El panel lo dice con esas palabras en vez de mostrar
//     un número lindo: un «48 HH» calculado por regla de tres sería exactamente el dato fabricado
//     que la regla 1 prohíbe. Lo que SÍ es un hecho es hace cuántos días venció el compromiso, y eso
//     se muestra.
//   · COMENTARIOS Y ADJUNTOS: no hay tabla de comentarios ni de evidencia sobre `obra_restriccion`.
//     Un campo de texto que no persiste es peor que no tenerlo: alguien escribe, se va, y cree que
//     quedó anotado. No se dibuja.
//
// EL HISTORIAL ES EL QUE LA FILA DECLARA. No hay log de eventos: hay fechas —necesidad, compromiso,
// liberación— y esas fechas SON la historia del impedimento. Se muestran en orden, sin inventar
// autores ni horas que nadie registró.

import { BotonAccion, type ResultadoAccion } from '@/shared/components/ui'
import { Estado, Nulo, PanelDetalle, Timeline, type Evento } from '@/shared/components/ds'
import { diasDeAtraso, impedimentoAbierto, impedimentoVencido } from '../../../../orquestador/lib/obra-operacion.mjs'
import { TIPO_RESTRICCION_LABEL, type Restriccion } from '../types'
import { fecha } from './formato'

/** Una fila del bloque de datos: rótulo fijo a la izquierda, valor a la derecha. */
function Dato({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-3 border-b border-[#F5F4F0] py-2" data-testid="dato-impedimento">
      <span className="w-[104px] shrink-0 text-[11.5px] text-muted">{k}</span>
      <span className="min-w-0 flex-1 text-[12.5px] text-ink">{children}</span>
    </div>
  )
}

export function PanelImpedimento({
  impedimento: r, actividadNombre, hoyIso, liberar, onCerrar,
}: {
  impedimento: Restriccion
  /** El nombre de la actividad que frena, ya resuelto. `null` = no cuelga de ninguna. */
  actividadNombre: string | null
  hoyIso: string
  liberar: (restriccionId: string) => Promise<ResultadoAccion>
  onCerrar: () => void
}) {
  const abierto = impedimentoAbierto(r) as boolean
  const vencido = impedimentoVencido(r, hoyIso) as boolean
  const atraso = diasDeAtraso(r, hoyIso) as number | null

  // La historia sale de las fechas de la propia fila, de la más vieja a la más nueva. Las que no
  // están simplemente no producen evento: un «—» en una línea de tiempo es ruido.
  const eventos: Evento[] = [
    r.fecha_necesidad && { id: 'necesidad', fecha: fecha(r.fecha_necesidad), tipo: 'necesidad', texto: 'Se necesitaba resuelto para esta fecha.' },
    r.fecha_compromiso && {
      id: 'compromiso',
      fecha: fecha(r.fecha_compromiso),
      tipo: 'compromiso',
      texto: vencido ? 'Fecha comprometida para destrabarlo. Venció.' : 'Fecha comprometida para destrabarlo.',
      tono: vencido ? ('neg' as const) : undefined,
    },
    r.fecha_liberacion && { id: 'liberacion', fecha: fecha(r.fecha_liberacion), tipo: 'liberado', texto: 'Se marcó resuelto.' },
  ].filter(Boolean) as Evento[]

  return (
    <PanelDetalle
      testid="panel-impedimento"
      titulo={r.descripcion}
      estado={
        <Estado
          tono={!abierto ? 'pos' : vencido ? 'neg' : 'pendiente'}
          clave={!abierto ? 'liberado' : vencido ? 'vencido' : 'abierto'}
        >
          {!abierto ? 'Resuelto' : vencido ? 'Vencido' : 'Abierto'}
        </Estado>
      }
      onCerrar={onCerrar}
      pie={
        abierto ? (
          <BotonAccion accion={liberar} args={[r.id]} testid="resolver-impedimento" tono="fuerte">
            Resolver
          </BotonAccion>
        ) : (
          <span className="text-[12px] text-faint">
            Resuelto{r.fecha_liberacion ? ` el ${fecha(r.fecha_liberacion)}` : ''}. La fila queda como historia de la obra.
          </span>
        )
      }
    >
      <div className="flex flex-col gap-4 px-4 py-3 lg:px-5">
        <div>
          <Dato k="Actividad">{actividadNombre ?? <Nulo>no frena una actividad en particular</Nulo>}</Dato>
          <Dato k="Tipo">{TIPO_RESTRICCION_LABEL[r.tipo] ?? r.tipo}</Dato>
          <Dato k="Responsable">
            {r.responsable ?? <span className="text-warn">sin responsable</span>}
          </Dato>
          <Dato k="Compromiso">
            <span className={vencido ? 'font-medium text-neg' : ''}>
              {r.fecha_compromiso ? fecha(r.fecha_compromiso) : <Nulo>sin fecha</Nulo>}
            </span>
          </Dato>
        </div>

        {/* EL IMPACTO SE DIBUJA SÓLO SI HAY ATRASO MEDIDO. `null` días no es 0 días: es «no hay
            compromiso vencido», y un recuadro rojo con un 0 adentro alarmaría sobre nada. */}
        <div className="rounded-lg border border-line bg-[#FAFAF8] px-3 py-2.5" data-testid="impacto-impedimento">
          <div className="text-[11.5px] font-semibold text-ink">Impacto</div>
          <div className="mt-2 flex gap-8">
            <div>
              <div className="text-[10.5px] text-faint">Atraso</div>
              <div className={`font-mono text-[14px] font-semibold tabular-nums ${atraso == null ? 'text-faint' : 'text-neg'}`}>
                {atraso == null ? 'sin atraso' : `${atraso} d`}
              </div>
            </div>
            <div>
              <div className="text-[10.5px] text-faint">HH detenidas</div>
              {/* No hay fuente que ate una hora imputada a un impedimento. Se dice, no se estima. */}
              <div className="text-[12px] text-faint" data-testid="hh-impedimento">
                sin HH imputadas al impedimento
              </div>
            </div>
          </div>
        </div>

        <div>
          <div className="mb-1.5 text-[12px] font-semibold text-ink">Historial</div>
          <Timeline
            eventos={eventos}
            testid="historial-impedimento"
            vacio="Este impedimento no tiene fechas cargadas: no hay historia que mostrar."
          />
        </div>
      </div>
    </PanelDetalle>
  )
}
