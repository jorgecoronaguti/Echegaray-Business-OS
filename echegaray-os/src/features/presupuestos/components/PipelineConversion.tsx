// 13 · EL PIPELINE DE CINCO PASOS — dónde estás en la cadena que va del análisis a la obra.
//
// No es decoración. La conversión es el único punto del sistema donde una estructura ECONÓMICA
// (rubro → partida → análisis) se vuelve una estructura OPERATIVA (obra → frente → actividad), y
// esa es la idea más difícil de todo el módulo. El pipeline la dibuja: lo de la izquierda es lo
// que ya se decidió, lo de la derecha es lo que va a pasar con lo que se genere acá.

const PASOS = [
  { n: 1, titulo: 'Base maestra', sub: 'análisis y rendimientos' },
  { n: 2, titulo: 'Presupuesto', sub: 'cantidad × análisis × precio' },
  { n: 3, titulo: 'Conversión', sub: 'acá estás' },
  { n: 4, titulo: 'Plan de obra', sub: 'WBS, frentes, dependencias' },
  { n: 5, titulo: 'Ejecución', sub: 'avance y HH reales' },
] as const

const ACTUAL = 3

export function PipelineConversion() {
  return (
    <ol className="flex flex-wrap items-center gap-x-2 gap-y-3 border-b border-line py-3.5" data-testid="pipeline">
      {PASOS.map((p, i) => {
        const activo = p.n === ACTUAL
        return (
          <li key={p.n} className="flex items-center gap-2">
            {i > 0 && <span aria-hidden className="text-[13px] text-faint">→</span>}
            <span
              aria-hidden
              className={`flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full text-[11px] font-medium ${
                activo ? 'bg-marca text-[color:var(--os-on-marca)]' : 'bg-surface-sunken text-muted'
              }`}
            >
              {p.n}
            </span>
            <span className="min-w-0">
              <span className={`block text-[12.5px] leading-tight ${activo ? 'font-semibold text-ink' : 'text-muted'}`}>
                {p.titulo}
              </span>
              {/* El subtítulo sólo del paso ACTIVO (Design 23/08). Los cinco a la vez son 22 palabras
                  permanentes explicando una cadena que el número y el orden ya dicen; el del paso en
                  el que estás es el único que contesta «¿y acá qué hago?». */}
              {activo && <span className="block text-[10.5px] leading-tight text-faint">{p.sub}</span>}
            </span>
          </li>
        )
      })}
    </ol>
  )
}
