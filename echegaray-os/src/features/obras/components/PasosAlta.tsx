// LA BARRA DE PASOS DEL ALTA — dónde estoy, qué ya pasé, y cómo vuelvo.
//
// Es la MISMA idea visual que la línea de ciclo de vida de la ficha de la obra (Previo › Inicio ›
// Desarrollo…), y a propósito: en este módulo «una fila de pastillas con una encendida» ya significa
// «acá estás dentro de una secuencia». Inventar un segundo dibujo para la misma idea obliga a
// aprenderla dos veces.
//
// LOS PASOS SON NAVEGABLES HACIA ATRÁS Y HACIA ADELANTE una vez que la obra existe. No hay pasos
// «bloqueados»: la obra ya está guardada, así que saltar del 2 al 6 no puede perder nada. Antes de
// que exista, ninguno es alcanzable — no hay fila que editar.

import Link from 'next/link'
import { PASOS, urlPaso, type PasoAlta } from '../services/alta'

export function BarraDePasos({ obraId, actual }: { obraId: string | null; actual: PasoAlta }) {
  return (
    <ol className="mb-5 flex flex-wrap items-center gap-1.5" data-testid="pasos-alta">
      {PASOS.map((p, k) => {
        const esActual = p.id === actual
        const alcanzable = Boolean(obraId)
        const clase = esActual
          ? 'bg-accent font-medium text-white'
          : alcanzable
            ? 'border border-line text-muted hover:bg-surface-quiet'
            : 'border border-line text-faint'
        const pastilla = (
          <span className={`rounded-full px-2.5 py-1 text-[11px] ${clase}`}>{p.label}</span>
        )
        return (
          <li key={p.id} className="flex items-center gap-1.5">
            {alcanzable && !esActual
              ? <Link href={urlPaso(obraId, p.id)} data-testid={`paso-${p.id}`}>{pastilla}</Link>
              : <span data-testid={`paso-${p.id}`} aria-current={esActual ? 'step' : undefined}>{pastilla}</span>}
            {k < PASOS.length - 1 && <span className="text-faint">›</span>}
          </li>
        )
      })}
    </ol>
  )
}

/** El marco de un paso: su ayuda arriba, el trabajo en el medio, la navegación abajo. */
export function Paso({
  paso, children, pie,
}: {
  paso: PasoAlta
  children: React.ReactNode
  /** Lo que va debajo del formulario: saltar, seguir, volver. */
  pie?: React.ReactNode
}) {
  const def = PASOS.find((p) => p.id === paso)
  return (
    <section data-testid={`cuerpo-${paso}`} className="max-w-2xl">
      <h2 className="text-[13px] font-medium text-ink">{def?.label}</h2>
      <p className="mb-3 text-[12px] text-muted">{def?.ayuda}</p>
      {children}
      {pie && <div className="mt-4 flex flex-wrap items-center gap-4 text-[12px]">{pie}</div>}
    </section>
  )
}

/** Un enlace de navegación entre pasos. Discreto: el botón que manda es el de guardar. */
export function LinkPaso({
  obraId, paso, children, testid, fuerte = false,
}: {
  obraId: string | null
  paso: PasoAlta
  children: React.ReactNode
  testid?: string
  fuerte?: boolean
}) {
  return (
    <Link
      href={urlPaso(obraId, paso)}
      data-testid={testid}
      className={fuerte
        ? 'rounded-control bg-slate-900 px-3.5 py-1.5 text-[13px] font-medium text-white hover:bg-slate-700'
        : 'text-muted underline underline-offset-2 hover:text-ink'}
    >{children}</Link>
  )
}
