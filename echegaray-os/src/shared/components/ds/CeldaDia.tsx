import type { ReactNode } from 'react'
import { decidirCeldaDia, tituloDeCertificado, tituloDeTardanza, type EntradaCeldaDia, type TonoPresencia } from './celdaDia'

// LA CELDA DE UN DÍA — dos capas apiladas en 44 × 44 px. Qué va en cada capa lo decide
// `decidirCeldaDia` (celdaDia.ts, con sus tests); acá sólo se pinta.
//
//   ┌──────┐
//   │  ●   │  ← PRESENCIA: estado, color semántico (verde fichó · rojo ausencia · neutro licencia).
//   │ 8,0  │  ← HORAS: cantidad, monoespaciada, tinta. Sin color de estado.
//   └──────┘
//
// LA PRESENCIA ES UNA INSIGNIA SUPERPUESTA, NO UNA FILA MÁS. Apiladas, los 14 px del símbolo
// empujaban el número 7 px por debajo del eje de su propia fila: en la captura de producción del
// dueño (08/09/2026) el nombre estaba en y=448, el total en y=456 y el número en y=463, y la fila
// se leía torcida. Ahora la capa de arriba va en `position: absolute` y la de horas queda centrada
// en los 44 px — el número, el nombre, el desplegable, el total y «corregir» en la misma línea.
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
  entrada, children, testid, estado, className, conflicto, tituloConflicto, horasVacias,
}: {
  entrada: EntradaCeldaDia
  /** LA CAPA DE HORAS QUEDÓ VACÍA. Con `children` —el `<input>` de la grilla— el componente no
   *  puede verlo: lo que hay adentro del campo lo sabe el consumidor. Sin dato manda lo que decidió
   *  `decidirCeldaDia`. Es lo que decide si el símbolo va centrado o arriba. */
  horasVacias?: boolean
  /** La presencia declarada y las horas del día se contradicen (ver `combinarCeldaDia`). Se pinta
   *  un marco `neg` —rojo sólo para problemas, y esto SÍ es un problema: una de las dos
   *  afirmaciones se liquida—. Silenciarlo sería elegir una sin decirlo. */
  conflicto?: boolean
  /** La frase que dice las dos afirmaciones sin elegir. Va al `title` en lugar del normal. */
  tituloConflicto?: string | null
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
  // ═══ SIN NÚMERO, LA LETRA VA AL CENTRO (dueño, 08/09/2026: «se ve mal la L») ═══
  // Cinco «L» seguidas en el borde superior de sus celdas se leen corridas contra los números de
  // las filas vecinas. Cuando el símbolo es lo único que la celda muestra, ocupa el lugar del
  // número y su mismo tamaño; el `<input>` sigue existiendo detrás y se puede escribir encima.
  const centrado = capas.arriba.centrado && horasVacias !== false
  return (
    <span
      data-testid={testid ?? 'celda-dia'}
      data-presencia={entrada.presencia}
      data-estado={estado}
      data-sin-cargar={capas.abajo.sinCargar ? 'si' : undefined}
      data-conflicto={conflicto ? 'si' : undefined}
      data-tardanza={tituloDeTardanza(entrada.tardanza) ? 'si' : undefined}
      data-certificado={tituloDeCertificado(entrada) ? 'si' : undefined}
      title={(conflicto && tituloConflicto) || capas.titulo || undefined}
      className={`relative inline-flex h-11 w-11 flex-col items-center justify-center rounded-control border ${
        conflicto
          ? 'border-neg bg-neg-soft'
          : capas.abajo.sinCargar ? 'border-dashed border-line' : 'border-transparent'
      } ${className ?? ''}`}
    >
      {/* Superpuesta y fuera del flujo: exista o no el símbolo, la capa de horas no se mueve ni un
          píxel. Los 10 px la dejan arriba del número sin taparlo; centrada, toma los 12,5 px del
          número al que reemplaza para caer en la misma línea que sus vecinos. */}
      <span
        data-capa="presencia"
        data-centrado={centrado ? 'si' : undefined}
        aria-label={capas.arriba.titulo || undefined}
        className={`pointer-events-none absolute flex items-center justify-center font-semibold leading-none ${
          centrado ? 'inset-0 text-[12.5px]' : 'inset-x-0 top-[3px] h-2.5 text-[10px]'
        } ${PRESENCIA[capas.arriba.tono]}`}
      >
        {capas.arriba.simbolo}
      </span>
      {/* LA TARDANZA: un glifo chico arriba a la derecha, ámbar (vino, pero pierde plata). El detalle
          va al `title` de la celda: en 44 px no entra una palabra. */}
      {tituloDeTardanza(entrada.tardanza) && (
        <span
          data-capa="tardanza"
          aria-label={tituloDeTardanza(entrada.tardanza)}
          className="pointer-events-none absolute right-[3px] top-[2px] text-[9px] font-semibold leading-none text-warn"
        >
          ▲
        </span>
      )}
      {/* EL CERTIFICADO: un clip chico abajo a la derecha, en tinta apagada —no es un estado, es
          «hay papel»—. El nombre del archivo va al `title` de la celda. */}
      {tituloDeCertificado(entrada) && (
        <svg
          data-capa="certificado" aria-label={tituloDeCertificado(entrada)}
          className="pointer-events-none absolute bottom-[2px] right-[3px] h-[9px] w-[9px] text-muted"
          viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"
        >
          <path d="M10.5 5.5 6 10a1.5 1.5 0 0 0 2.1 2.1l5-5a3 3 0 0 0-4.2-4.2l-5.5 5.5a4.5 4.5 0 0 0 6.4 6.4L13 11.6" />
        </svg>
      )}
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
