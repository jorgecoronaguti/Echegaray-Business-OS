import { ETAPAS, ETAPA_LABEL } from '../types'

/** La línea de ciclo de vida. Es el estado de la obra, y ese estado gobierna qué habilita el módulo:
 *  una obra en «previo» sin línea base sellada no debería pasar a ejecución. */
export function CicloDeVida({ etapa }: { etapa: string | null }) {
  // Ninguna etapa resaltada cuando nadie la declaró: se ven las cinco en gris y se entiende que
  // falta definirla, en vez de afirmar uno de los cinco estados sin que nadie lo haya dicho.
  const i = etapa ? ETAPAS.indexOf(etapa as (typeof ETAPAS)[number]) : -1
  return (
    <ol className="flex flex-wrap items-center gap-1.5">
      {ETAPAS.map((e, k) => (
        <li key={e} className="flex items-center gap-1.5">
          <span className={`rounded-full px-2.5 py-1 text-[11px] ${k < i ? 'bg-surface-quiet text-muted' : k === i ? 'bg-accent font-medium text-white' : 'border border-line text-faint'}`}>
            {ETAPA_LABEL[e]}
          </span>
          {k < ETAPAS.length - 1 && <span className="text-faint">›</span>}
        </li>
      ))}
    </ol>
  )
}

