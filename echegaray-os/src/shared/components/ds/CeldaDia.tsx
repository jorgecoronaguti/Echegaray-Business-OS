import type { ReactNode } from 'react'
import { decidirCeldaDia, type EntradaCeldaDia, type TonoPresencia } from './celdaDia'

// LA CELDA DE UN DÍA — dos capas apiladas en 44 × 44 px. Qué va en cada capa lo decide
// `decidirCeldaDia` (celdaDia.ts, con sus tests); acá sólo se pinta.
//
//   ┌──────┐
//   │  ●   │  ← PRESENCIA: estado, color semántico (verde fichó · rojo ausencia · neutro licencia)
//   │ 8,0  │  ← HORAS: cantidad, monoespaciada, tinta. Sin color de estado.
//   └──────┘
//
// 44 px porque es el objetivo táctil mínimo en el teléfono y porque la grilla de quincena ya mide
// sus columnas así: la celda no cambia el ancho de la tabla.
//
// El marco punteado es NEUTRO (`border-line`) y aparece sólo cuando hay horas por cargar en un día
// hábil ya pasado. Antes era rojo, y el rojo es sólo para problemas: que Administración no haya
// cargado todavía no es una falta de la persona.
//
// Tokens únicamente. Ningún hex acá.

const PRESENCIA: Record<TonoPresencia, string> = {
  pos: 'text-pos',
  neg: 'text-neg',
  neutro: 'text-muted',
  ninguno: 'text-transparent',
}

const HORAS = {
  tinta: 'text-ink',
  inerte: 'text-faint',
  vacio: 'text-faint',
} as const

export function CeldaDia({
  entrada, children, testid, estado, className,
}: {
  entrada: EntradaCeldaDia
  /** Reemplaza la capa de horas —la grilla editable mete acá su `<input>`—. La capa de presencia
   *  y el marco los sigue decidiendo la función: el editor no puede cambiar lo que el día dice. */
  children?: ReactNode
  testid?: string
  /** El estado tal como lo nombra la pantalla que la usa, a `data-estado`: es lo que los tests
   *  leen sin mirar color. */
  estado?: string
  className?: string
}) {
  const capas = decidirCeldaDia(entrada)
  return (
    <span
      data-testid={testid ?? 'celda-dia'}
      data-presencia={entrada.presencia}
      data-estado={estado}
      data-sin-cargar={capas.abajo.sinCargar ? 'si' : undefined}
      title={capas.titulo || undefined}
      className={`inline-flex h-11 w-11 flex-col items-center justify-start rounded-control border ${
        capas.abajo.sinCargar ? 'border-dashed border-line' : 'border-transparent'
      } ${className ?? ''}`}
    >
      {/* Alto fijo aunque no haya símbolo: la capa de horas queda a la misma altura en todas las
          celdas de la fila, con o sin presencia. */}
      <span
        data-capa="presencia"
        aria-label={capas.arriba.titulo || undefined}
        className={`flex h-3.5 shrink-0 items-center text-[10px] font-semibold leading-none ${PRESENCIA[capas.arriba.tono]}`}
      >
        {capas.arriba.simbolo}
      </span>
      {children ?? (
        <span
          data-capa="horas"
          className={`flex h-7 items-center font-mono text-[12.5px] tabular-nums leading-none ${HORAS[capas.abajo.tono]}`}
        >
          {capas.abajo.texto}
        </span>
      )}
    </span>
  )
}
