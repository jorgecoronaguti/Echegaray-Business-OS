// HH POR OBRA · ESTA SEMANA — el aside del canónico 21.
//
// SALE DE LA MISMA LECTURA QUE LA COLUMNA HH SEMANA, sin una consulta propia. Es la condición para
// que exista: dos consultas distintas sobre `registros_hh` con dos ventanas parecidas terminarían
// mostrando 829 en la tabla y 833 en el aside, y nadie sabría cuál creerle.
//
// LA BARRA ES RELATIVA A LA OBRA QUE MÁS HH SE LLEVÓ, no a un objetivo. No hay HH previstas por
// obra y semana en ninguna tabla, así que una barra «sobre lo planificado» sería inventar el
// denominador. Lo que la barra compara es una obra contra otra, que es exactamente la pregunta que
// contesta el bloque: dónde se está gastando la gente esta semana.

import { BarraAvance } from '@/shared/components/ds'

const horas = (n: number) => n.toLocaleString('es-AR', { maximumFractionDigits: 0 })

export function HHPorObraSemana({
  porObra, rotuloVentana, fueraDeCuadrilla,
}: {
  porObra: { obraId: string | null; nombre: string | null; horas: number }[]
  rotuloVentana: string
  /** Cuántas personas con HH esta semana no integran ninguna cuadrilla. Explica por qué el total
   *  del aside puede ser mayor que la suma de la columna HH SEMANA. */
  fueraDeCuadrilla: number
}) {
  if (porObra.length === 0) return null
  const mayor = porObra[0].horas || 1

  return (
    <section
      data-testid="hh-por-obra"
      className="w-full rounded-card border border-line bg-surface p-4 lg:w-[300px]"
    >
      <h2 className="text-[12.5px] font-medium text-ink">HH por obra · {rotuloVentana}</h2>
      <ul className="mt-3 flex flex-col gap-3">
        {porObra.map((o) => (
          <li key={o.obraId ?? 'sin-obra'}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 truncate text-[12.5px] text-ink-soft">
                {/* SIN OBRA NO ES UNA OBRA LLAMADA «sin obra»: son horas imputadas sin obra
                    canónica, y esconderlas haría que el reparto no cierre con el total. */}
                {o.nombre ?? <span className="text-faint">sin obra imputada</span>}
              </span>
              <span className="shrink-0 font-mono text-[12px] font-medium tabular-nums text-ink">
                {horas(o.horas)}
              </span>
            </div>
            <div className="mt-1.5">
              <BarraAvance pct={Math.round((o.horas / mayor) * 100)} />
            </div>
          </li>
        ))}
      </ul>
      {fueraDeCuadrilla > 0 && (
        <p className="mt-3 text-[11px] leading-relaxed text-faint" data-testid="hh-fuera-de-cuadrilla">
          {fueraDeCuadrilla === 1
            ? '1 persona con HH esta semana no integra ninguna cuadrilla'
            : `${fueraDeCuadrilla} personas con HH esta semana no integran ninguna cuadrilla`}
          , así que sus horas están acá y no en ninguna fila de la tabla.
        </p>
      )}
    </section>
  )
}
