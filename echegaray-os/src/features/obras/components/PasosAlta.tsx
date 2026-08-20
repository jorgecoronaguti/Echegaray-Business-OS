// LA BARRA DE PASOS DEL ALTA — dónde estoy, qué ya pasé, y cómo vuelvo.
//
// Es la MISMA idea visual que la línea de ciclo de vida de la ficha de la obra (Previo › Inicio ›
// Desarrollo…), y a propósito: en este módulo «una fila de pastillas con una encendida» ya significa
// «acá estás dentro de una secuencia». Inventar un segundo dibujo para la misma idea obliga a
// aprenderla dos veces. Es además el único lugar donde el handoff permite el radio de 999px
// (`design/system/SPACING_BORDERS.md`: *"999px sólo pastillas de secuencia (ciclo de vida, pasos
// del alta)"*) — una pastilla en cualquier otro lado es un error.
//
// LOS PASOS SON NAVEGABLES HACIA ATRÁS Y HACIA ADELANTE una vez que la obra existe. No hay pasos
// «bloqueados»: la obra ya está guardada, así que saltar del 2 al 6 no puede perder nada. Antes de
// que exista, ninguno es alcanzable — no hay fila que editar.

import Link from 'next/link'
import { BotonEnlace, TituloPanel } from '@/shared/components/ds'
import { PASOS, urlPaso, type PasoAlta } from '../services/alta'

export function BarraDePasos({ obraId, actual }: { obraId: string | null; actual: PasoAlta }) {
  return (
    <ol className="mb-7 flex flex-wrap items-center gap-x-1.5 gap-y-2" data-testid="pasos-alta">
      {PASOS.map((p, k) => {
        const esActual = p.id === actual
        const alcanzable = Boolean(obraId)
        // El paso actual va en grafito sólido con texto blanco y NO en amarillo: el amarillo es la
        // acción primaria de la pantalla —«Guardar y seguir»— y dos amarillos en la misma vista no
        // son dos cosas importantes, son ninguna.
        const clase = esActual
          ? 'bg-accent font-medium text-white'
          : alcanzable
            ? 'border border-line text-muted transition-colors hover:border-line-strong hover:text-ink'
            : 'border border-line text-faint'
        const pastilla = (
          <span className={`inline-block rounded-full px-2.5 py-[3px] text-[11.5px] ${clase}`}>{p.label}</span>
        )
        return (
          <li key={p.id} className="flex items-center gap-1.5">
            {alcanzable && !esActual
              ? <Link href={urlPaso(obraId, p.id)} data-testid={`paso-${p.id}`}>{pastilla}</Link>
              : <span data-testid={`paso-${p.id}`} aria-current={esActual ? 'step' : undefined}>{pastilla}</span>}
            {k < PASOS.length - 1 && <span aria-hidden className="text-[11px] text-faint">›</span>}
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
    // 560px es el ancho de formulario del handoff (`LAYOUT_RESPONSIVE.md` §Anchos). Un campo de
    // texto estirado a 1.400px no se lee mejor: se lee peor, porque el ojo pierde el rótulo.
    <section data-testid={`cuerpo-${paso}`} className="w-[560px] max-w-full shrink-0">
      <TituloPanel>{def?.label}</TituloPanel>
      <p className="mb-4 mt-1.5 text-[12.5px] text-muted">{def?.ayuda}</p>
      {children}
      {pie && <div className="mt-5 flex flex-wrap items-center gap-5 text-[12.5px]">{pie}</div>}
    </section>
  )
}

/** Un enlace de navegación entre pasos. `fuerte` es la primaria del paso: hay UNA sola por pantalla,
 *  y en los pasos que guardan la primaria es el botón del formulario, no ésta. */
export function LinkPaso({
  obraId, paso, children, testid, fuerte = false,
}: {
  obraId: string | null
  paso: PasoAlta
  children: React.ReactNode
  testid?: string
  fuerte?: boolean
}) {
  if (fuerte) {
    return (
      <BotonEnlace href={urlPaso(obraId, paso)} variante="primaria" data-testid={testid}>{children}</BotonEnlace>
    )
  }
  return (
    <Link
      href={urlPaso(obraId, paso)}
      data-testid={testid}
      className="text-muted underline underline-offset-2 transition-colors hover:text-ink"
    >{children}</Link>
  )
}
