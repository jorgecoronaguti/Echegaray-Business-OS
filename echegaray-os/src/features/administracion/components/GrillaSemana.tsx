// LA GRILLA SEMANAL DE ASISTENCIA — una fila por persona, una columna por día.
//
// Lo que decide qué dice cada celda NO está acá: está en `asistenciaSemana.ts`, probado sin base.
// Este archivo sólo pinta.
//
// ═══ LOS COLORES SIGNIFICAN, Y POR ESO SON POCOS ═══
//
// Blanco la jornada normal, ámbar la que se pasó de la jornada pactada, rojo la falta DECLARADA, y
// gris lo que no se sabe. «Sin registrar» no es rojo a propósito: no es una ausencia, es la falta de
// una marca — el que no tiene teléfono se ve igual que el que faltó, y pintarlos igual convertiría
// esta pantalla en una máquina de fabricar novedades de liquidación.

import Link from 'next/link'
import { Estado, Num, Tabla, Td, Th, THead, Tr } from '@/shared/components/ds'
import { etiquetaDia, type Celda, type FilaSemana } from '../services/asistenciaSemana'

const HORAS = (n: number) => n.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 1 })

/** Qué se escribe en la celda y con qué aire. El texto SIEMPRE dice algo: una celda vacía obliga a
 *  quien mira a adivinar si el sistema no sabe o si no pasó nada. */
const PINTA: Record<Celda['estado'], { clase: string; vacio: string; titulo: string }> = {
  jornada: { clase: 'border-line bg-white text-ink', vacio: '—', titulo: 'Jornada completa' },
  extra: { clase: 'border-[#F3D9BC] bg-[#FEF6EE] font-medium text-warn', vacio: '—', titulo: 'Más horas que la jornada pactada de la obra' },
  en_curso: { clase: 'border-line bg-white text-ink', vacio: '· · ·', titulo: 'Entró y todavía no marcó la salida' },
  sin_cerrar: { clase: 'border-[#F3D9BC] bg-[#FEF6EE] text-warn', vacio: '!', titulo: 'Falta la salida de ese día' },
  falta: { clase: 'border-[#FADCD8] bg-[#FEF3F2] text-neg', vacio: 'falta', titulo: 'Ausencia declarada en las horas cargadas' },
  licencia: { clase: 'border-line bg-surface-quiet text-muted', vacio: 'lic.', titulo: 'Licencia declarada' },
  no_laborable: { clase: 'border-transparent bg-surface-sunken text-faint', vacio: '·', titulo: 'No laborable' },
  futuro: { clase: 'border-transparent bg-transparent text-faint', vacio: '', titulo: 'Todavía no pasó' },
  sin_registrar: { clase: 'border-dashed border-line bg-transparent text-faint', vacio: 's/reg', titulo: 'Sin marcas: no es una falta, es que no hay registro' },
}

function CeldaDia({ c }: { c: Celda }) {
  const p = PINTA[c.estado]
  return (
    <td className="px-1 py-1 text-center align-middle">
      <span
        data-testid="celda-dia" data-estado={c.estado} title={p.titulo}
        className={`inline-flex h-7 w-full min-w-[46px] items-center justify-center rounded-control border text-[12.5px] tabular-nums ${p.clase}`}
      >
        {c.horas !== null ? HORAS(c.horas) : p.vacio}
      </span>
    </td>
  )
}

export function GrillaSemana({ filas, dias }: { filas: FilaSemana[]; dias: string[] }) {
  return (
    <>
      {/* LA REFERENCIA ARRIBA DE LA TABLA: sin ella, «s/reg» y «falta» se leen como sinónimos, que
          es exactamente la confusión que esta pantalla no puede permitirse. */}
      <div className="mb-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted">
        <span><i className="mr-1.5 inline-block h-2 w-2 rounded-[2px] border border-line bg-white align-middle" />jornada</span>
        <span><i className="mr-1.5 inline-block h-2 w-2 rounded-[2px] border border-[#F3D9BC] bg-[#FEF6EE] align-middle" />con extra / sin cerrar</span>
        <span><i className="mr-1.5 inline-block h-2 w-2 rounded-[2px] border border-[#FADCD8] bg-[#FEF3F2] align-middle" />falta declarada</span>
        <span><i className="mr-1.5 inline-block h-2 w-2 rounded-[2px] border border-dashed border-line align-middle" />sin registro (no es una falta)</span>
        <span><i className="mr-1.5 inline-block h-2 w-2 rounded-[2px] bg-surface-sunken align-middle" />no laborable</span>
      </div>

      <Tabla testid="grilla-semana" minWidth={220 + dias.length * 60 + 220}>
        <THead>
          <Th>Persona</Th>
          {dias.map((d) => <Th key={d} num>{etiquetaDia(d)}</Th>)}
          <Th num>Total</Th>
          <Th>Estado</Th>
        </THead>
        <tbody>
          {filas.map((f) => (
            <Tr key={f.persona.persona_id} data-testid="fila-semana">
              <Td fuerte>
                <Link
                  href={`/administracion/personas/${f.persona.persona_id}`}
                  className="text-[13px] text-ink hover:underline"
                >
                  {f.persona.nombre_completo}
                </Link>
              </Td>
              {f.celdas.map((c) => <CeldaDia key={c.fecha} c={c} />)}
              <Td num className="w-[80px]">
                {/* CERO NO ES «NO TRABAJÓ»: es que no hay ninguna jornada cerrada esta semana. Por
                    eso el total en cero se escribe apagado y no como un número más. */}
                <Num className={f.total === 0 ? 'text-faint' : 'text-ink'}>{HORAS(f.total)}</Num>
              </Td>
              <Td className="w-[170px]">
                <Estado tono={f.estado.tono}>{f.estado.texto}</Estado>
              </Td>
            </Tr>
          ))}
        </tbody>
      </Tabla>
    </>
  )
}
