import type { ReactNode } from 'react'

// LA FRANJA DE ESTADO — `design/system/COMPONENTS.md` §Status bar.
//
// 56px, hairline arriba, SIN fondo propio: es el pie de la pantalla, no una barra flotante. Seis
// métricas como `etiqueta 10px faint / valor 14–16px 600 / contexto 11px`.
//
// «Sin cards, sin gráficos, sin números gigantes». Las tres cosas que un pie de métricas atrae y
// las tres que lo arruinan: seis tarjetas son seis cajas para leer una cifra cada una, un gráfico
// de 56px de alto no dice nada, y un número de 40px convierte el pie en el centro de la pantalla
// cuando el centro es el trabajo de arriba.

export type Metrica = { etiqueta: string; valor: ReactNode; contexto?: ReactNode; tono?: 'neg' | 'warn' | 'pos' }

const TONO = { neg: 'text-neg', warn: 'text-warn', pos: 'text-pos' } as const

export function Franja({ metricas, testid = 'franja' }: { metricas: Metrica[]; testid?: string }) {
  return (
    <div
      data-testid={testid}
      className="sticky bottom-0 z-[5] flex h-statusbar shrink-0 items-center gap-x-10 gap-y-1 overflow-x-auto border-t border-line bg-surface px-4 lg:px-10 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {metricas.map((m) => (
        <div key={m.etiqueta} className="shrink-0 whitespace-nowrap" data-metrica={m.etiqueta}>
          <div className="text-[10px] uppercase tracking-[0.06em] text-faint">{m.etiqueta}</div>
          <div className="flex items-baseline gap-1.5">
            <span className={`text-[15px] font-semibold leading-tight ${m.tono ? TONO[m.tono] : 'text-ink'}`}>{m.valor}</span>
            {m.contexto && <span className="text-[11px] text-faint">{m.contexto}</span>}
          </div>
        </div>
      ))}
    </div>
  )
}
