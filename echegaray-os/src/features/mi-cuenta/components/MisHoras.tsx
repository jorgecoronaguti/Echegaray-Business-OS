// LAS HORAS DEL PERÍODO — la tabla en escritorio, la lista en el teléfono.
//
// ═══ POR QUÉ SON DOS MARCADOS Y NO UNA TABLA QUE SE ENCOGE ═══
//
// `LAYOUT_RESPONSIVE.md`: en mobile *"la tabla se vuelve lista de dos datos por fila"*. Una tabla de
// cinco columnas en 390px obliga a arrastrarla de costado para llegar a las HH — que es EL dato que
// el operario abrió la pantalla para mirar. La lista pone la actividad y la obra a la izquierda y
// las horas a la derecha, y no se arrastra nada.
//
// Las dos leen EL MISMO `ResumenHoras`: no hay dos cálculos, hay dos dibujos del mismo resultado.

import { Nulo, Num, Tabla, THead, Th, Tr, Td, FilaTotal, Vacio } from '@/shared/components/ds'
import { TIPO_HORA_LABEL, type TipoHora } from '@/features/obras/services/tipoHora'
import { fecha } from '@/features/obras/components/formato'
import { hh, type ResumenHoras } from '../services/horas'

const tipoDe = (t: string) => TIPO_HORA_LABEL[t as TipoHora] ?? t

export function MisHoras({ r }: { r: ResumenHoras }) {
  if (r.filas.length === 0) {
    return (
      <Vacio>
        No hay horas imputadas a tu nombre en este período. Las carga el jefe de obra desde la obra.
      </Vacio>
    )
  }

  const dias = `${r.dias} día${r.dias === 1 ? '' : 's'} trabajado${r.dias === 1 ? '' : 's'}`

  return (
    <>
      <ul className="border-t border-line sm:hidden" data-testid="lista-mis-horas">
        {r.filas.map((f) => (
          <li key={f.id} className="flex items-center gap-3 border-b border-[#EFEEEA] py-3">
            <Num className="w-[52px] shrink-0 !text-[12px] text-muted">{fecha(f.fecha)}</Num>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13.5px] text-ink">
                {f.actividad ?? <Nulo>sin actividad imputada</Nulo>}
                {f.tipo_hora !== 'normal' && <span className="text-muted"> · {tipoDe(f.tipo_hora)}</span>}
              </span>
              <span className="mt-0.5 block truncate text-[11.5px] text-faint">{f.obra ?? 'sin obra'}</span>
            </span>
            <Num className="shrink-0 !text-[13px] text-ink">{hh(f.horas)}</Num>
          </li>
        ))}
      </ul>

      <div className="hidden sm:block">
        <Tabla testid="tabla-mis-horas" minWidth={720}>
          <THead>
            <Th className="w-[110px]">Fecha</Th>
            <Th className="w-[280px]">Obra</Th>
            <Th>Actividad</Th>
            <Th className="w-[130px]">Tipo</Th>
            <Th num className="w-[100px]">HH</Th>
          </THead>
          <tbody>
            {r.filas.map((f) => (
              <Tr key={f.id}>
                <Td num className="text-muted">{fecha(f.fecha)}</Td>
                <Td fuerte>{f.obra ?? <Nulo>sin obra</Nulo>}</Td>
                {/* «sin actividad imputada» y no un guión: una hora sin actividad no consume plan de
                    ninguna tarea, y es un aviso para quien la cargó. */}
                <Td>{f.actividad ?? <Nulo>sin actividad imputada</Nulo>}</Td>
                <Td className={f.tipo_hora === 'normal' ? 'text-muted' : 'text-ink'}>{tipoDe(f.tipo_hora)}</Td>
                <Td num>{hh(f.horas)}</Td>
              </Tr>
            ))}
          </tbody>
          <tfoot>
            <FilaTotal>
              <td className="pr-3 text-[12.5px] font-normal text-muted" colSpan={4}>
                Total del período · {dias}
              </td>
              <td className="pl-3 text-right font-mono text-[14px] tabular-nums">{hh(r.trabajadas)}</td>
            </FilaTotal>
          </tfoot>
        </Tabla>
      </div>

      {/* EL TOTAL TAMBIÉN EN EL TELÉFONO. La `tfoot` vive dentro de la tabla, que en mobile no se
          dibuja: sin este renglón, la lista mostraría los días sueltos y ningún total. */}
      <div className="flex items-baseline justify-between border-t border-line-strong py-3 sm:hidden">
        <span className="text-[12.5px] text-muted">Total del período · {dias}</span>
        <Num className="!text-[14px] font-semibold text-ink">{hh(r.trabajadas)}</Num>
      </div>
    </>
  )
}
