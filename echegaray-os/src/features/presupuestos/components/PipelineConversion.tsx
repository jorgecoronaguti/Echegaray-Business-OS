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
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b border-line py-3.5">
      {/* LA TAXONOMÍA DEL CANON 13: lo hecho lleva tilde, el paso actual va en pastilla con su
          número y su nombre, lo que falta queda en gris. El canon dibuja cuatro pasos de un asistente
          que CREA la obra; acá los pasos son otros —la cadena real que va del análisis a la ejecución,
          y la obra ya existe cuando se llega— así que se adopta la forma, no el contenido. Lo que el
          canon modela y esta pantalla no hace está declarado en el informe: no se dibujan pasos que
          nadie puede caminar. */}
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-3" data-testid="pipeline">
        {PASOS.map((p, i) => {
          const activo = p.n === ACTUAL
          const hecho = p.n < ACTUAL
          return (
            <li key={p.n} className="flex items-center gap-2">
              {i > 0 && <span aria-hidden className="text-[13px] text-faint">→</span>}
              <span
                className={`flex items-center gap-2 rounded-control ${activo ? 'bg-surface-quiet py-1 pl-1 pr-3' : ''}`}
                data-paso={p.n}
                data-estado={hecho ? 'hecho' : activo ? 'actual' : 'pendiente'}
              >
                <span
                  aria-hidden
                  className={`flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full text-[11px] font-medium ${
                    activo ? 'bg-marca text-[color:var(--os-on-marca)]'
                      : hecho ? 'bg-pos-soft text-pos'
                      : 'bg-surface-sunken text-faint'
                  }`}
                >
                  {hecho ? '✓' : p.n}
                </span>
                <span className="min-w-0">
                  <span className={`block text-[12.5px] leading-tight ${
                    activo ? 'font-semibold text-ink' : hecho ? 'text-muted' : 'text-faint'
                  }`}>
                    {p.titulo}
                  </span>
                  {/* El subtítulo sólo del paso ACTIVO (Design 23/08). Los cinco a la vez son 22
                      palabras permanentes explicando una cadena que el número y el orden ya dicen;
                      el del paso en el que estás es el único que contesta «¿y acá qué hago?». */}
                  {activo && <span className="block text-[10.5px] leading-tight text-faint">{p.sub}</span>}
                </span>
              </span>
            </li>
          )
        })}
      </ol>

      <div className="flex items-center gap-3" data-testid="pipeline-avance">
        <span className="text-[12px] text-muted">Paso {ACTUAL} de {PASOS.length}</span>
        <span aria-hidden className="h-[5px] w-[120px] overflow-hidden rounded-full bg-surface-sunken">
          <span
            className="block h-full rounded-full bg-marca"
            style={{ width: `${(ACTUAL / PASOS.length) * 100}%` }}
          />
        </span>
      </div>
    </div>
  )
}
