'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'

// LOS DOS NIVELES DE NAVEGACIÓN QUE EXISTEN — `design/system/LAYOUT_RESPONSIVE.md`.
//
// «Máximo dos niveles visibles; un tercero es texto subrayado». La regla no es de estilo: cada
// barra de navegación es una fila que le saca alto a la tabla que la persona vino a leer, y a
// partir de la tercera nadie sabe cuál lo llevó adonde está. Nivel 1 (áreas) vive en el header
// global. Nivel 2 son estos tabs. Nivel 3 es `SubTabs`, que NO es otra barra: es texto con un
// subrayado de 1,5px.
//
// El activo del nivel 2 se marca con la regla amarilla de 2px pisando el hairline de la barra
// (`margin-bottom:-1px`), que es lo que hace que el tab parezca continuar la superficie de abajo
// en vez de flotar sobre ella.

export type Tab = {
  href: string
  label: ReactNode
  activo?: boolean
  testid?: string
  /**
   * CONTADOR MONO A LA DERECHA DEL RÓTULO — `COMPONENTS.md` §Anatomía de ficha de entidad:
   * «nivel 2 de solapas con contador mono». Sólo cuando el número se sabe: `null` o ausente no
   * dibuja nada, porque un `0` al lado de «Documentos» dice que el legajo está vacío y eso es una
   * afirmación distinta de «todavía no lo miré».
   */
  cuenta?: number | null
}

// La separación ENTRE tabs es de 2px (especimen §04), no de 4: el padding de 14px de cada tab ya
// los separa de sobra, y el hueco extra rompía la sensación de fila continua sobre el hairline.
export function Tabs({ tabs, testid = 'tabs' }: { tabs: Tab[]; testid?: string }) {
  return (
    <nav
      data-testid={testid}
      className="-mb-px flex items-end gap-[2px] overflow-x-auto border-b border-line [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {tabs.map((t) => (
        // `prefetch={false}`: los tabs apuntan a rutas force-dynamic donde el prefetch dispara un
        // render RSC completo por tab visible — seis renders de servidor por página vista, para
        // nada. Ver el mismo motivo en `FilaWbs`.
        <Link
          key={t.href}
          href={t.href}
          prefetch={false}
          data-testid={t.testid}
          aria-current={t.activo ? 'page' : undefined}
          // 13px / padding 8px 11px — medido de los estilos inline del zip (`02 · Obra Resumen`,
          // `03 · Obra Tareas`: `fontSize:13px;padding:8px 11px`). Estaba en 14px / 14px / 9px, y
          // con seis solapas esos 3px de más por lado son 36px de fila que no dicen nada.
          className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-[11px] py-2 text-[13px] transition-colors ${
            t.activo
              ? 'border-marca font-medium text-ink'
              : 'border-transparent text-muted hover:text-ink'
          }`}
        >
          {t.label}
          {t.cuenta !== null && t.cuenta !== undefined && (
            <span className="font-mono text-[11.5px] tabular-nums text-faint">{t.cuenta}</span>
          )}
        </Link>
      ))}
    </nav>
  )
}

/**
 * Nivel 3. Texto con contador mono a la derecha; el activo se subraya en `ink` 1,5px.
 * Sin pastillas rellenas: una pastilla acá sería una tercera barra disfrazada.
 */
export function SubTabs({
  items,
  scroll = false,
  testid = 'subtabs',
}: {
  items: { href?: string; onClick?: () => void; label: ReactNode; cuenta?: number | null; activo?: boolean; testid?: string }[]
  /**
   * `true` cuando los `href` son ANCLAS DE LA MISMA PÁGINA (`#bloque-obras`).
   *
   * El default es `false` y ésa es la razón por la que existe este interruptor: `scroll={false}`
   * también cancela el salto al ancla, así que un índice de secciones construido con este
   * componente se dibujaba entero y no llevaba a ninguna parte al tocarlo. Para cambiar de
   * sub-vista sigue siendo `false`, que es lo correcto — el que mira la fila 200 del árbol tiene
   * que seguir mirándola.
   */
  scroll?: boolean
  testid?: string
}) {
  return (
    <div data-testid={testid} className="flex flex-wrap items-center gap-x-5 gap-y-2">
      {items.map((i, k) => {
        const contenido = (
          <>
            <span>{i.label}</span>
            {i.cuenta !== null && i.cuenta !== undefined && (
              <span className="font-mono text-[11.5px] tabular-nums text-faint">{i.cuenta}</span>
            )}
          </>
        )
        const clase = `inline-flex items-center gap-1.5 pb-[3px] text-[13px] transition-colors ${
          i.activo
            ? 'border-b-[1.5px] border-ink font-medium text-ink'
            : 'border-b-[1.5px] border-transparent text-muted hover:text-ink'
        }`
        return i.href ? (
          // `scroll={false}` por defecto: cambiar de sub-vista o de filtro no puede mandar la página
          // al tope — el que está mirando la fila 200 del árbol sigue mirando la fila 200.
          // `prefetch={false}`: mismo motivo que en Tabs — rutas dinámicas, el prefetch es un
          // render completo por ítem visible.
          <Link key={i.href} href={i.href} scroll={scroll} prefetch={false} data-testid={i.testid} aria-current={i.activo ? 'true' : undefined} className={clase}>
            {contenido}
          </Link>
        ) : (
          <button key={k} type="button" onClick={i.onClick} data-testid={i.testid} aria-pressed={i.activo} className={clase}>
            {contenido}
          </button>
        )
      })}
    </div>
  )
}
