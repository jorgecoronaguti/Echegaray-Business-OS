import type { ReactNode } from 'react'

// LA FRANJA DE ESTADO — medida sobre los mockups 03 y 07 (`07 · Obra Cronograma.dc.html`, bloque
// `kpis`), que MANDAN sobre la descripción de `design/system/COMPONENTS.md`.
//
// ═══ ES UNA TARJETA DE CELDAS, NO UNA BARRA SUELTA ═══
//
// El pie era una fila de cifras sobre el fondo de la página, separadas por aire. En el mockup es
// una tarjeta blanca —`border 1px #E7E6E2`, radio 10px— partida en celdas por un hairline más
// tenue que el borde exterior (#EFEEEA): el hairline es lo que dice dónde termina una métrica y
// empieza la otra cuando el rótulo de la siguiente es largo. Con aire solo, «Atrasadas / 4 de 8
// con base» y «Holgura» se leían como una sola frase.
//
// Valores literales del mockup, celda por celda:
//   celda    padding 11px 16px · flex:1 · minWidth 180px · borderRight 1px #EFEEEA
//   rótulo   10.5px · #91918B · letterSpacing .04em · SIN mayúsculas forzadas
//   cifra    IBM Plex Mono 20px/600 · lineHeight 1.15 · color del tono
//   contexto 11px · #91918B · en la misma línea de base que la cifra, gap 7px
//
// El rótulo NO va en versalitas: el mockup escribe «Fin de línea base», y en mayúsculas esa misma
// cifra pasa de dato al pie a título de sección.
//
// La cifra es MONO y de 20px: es el único número grande de la pantalla y se compara de un renglón
// al siguiente —«+16 d» contra «0 d»—, que es exactamente para lo que existe una tipografía de
// ancho fijo. Los 15px sans de antes desalineaban las unidades.

export type Metrica = { etiqueta: string; valor: ReactNode; contexto?: ReactNode; tono?: 'neg' | 'warn' | 'pos' }

const TONO = { neg: 'text-neg', warn: 'text-warn', pos: 'text-pos' } as const

export function Franja({ metricas, testid = 'franja' }: { metricas: Metrica[]; testid?: string }) {
  return (
    <div
      data-testid={testid}
      className="flex shrink-0 flex-wrap overflow-hidden rounded-card border border-line bg-surface"
    >
      {metricas.map((m) => (
        <div
          key={m.etiqueta}
          data-metrica={m.etiqueta}
          className="min-w-[180px] flex-1 border-r border-[color:var(--os-surface-sunken)] px-4 py-[11px] last:border-r-0"
        >
          <div className="text-[10.5px] tracking-[0.04em] text-faint">{m.etiqueta}</div>
          <div className="mt-0.5 flex flex-wrap items-baseline gap-x-[7px]">
            <span
              className={`whitespace-nowrap font-mono text-[20px] font-semibold leading-[1.15] tabular-nums ${
                m.tono ? TONO[m.tono] : 'text-ink'
              }`}
            >
              {m.valor}
            </span>
            {m.contexto && <span className="whitespace-nowrap text-[11px] text-faint">{m.contexto}</span>}
          </div>
        </div>
      ))}
    </div>
  )
}
