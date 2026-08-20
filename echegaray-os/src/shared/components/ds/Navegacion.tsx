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

export type Tab = { href: string; label: ReactNode; activo?: boolean; testid?: string }

export function Tabs({ tabs, testid = 'tabs' }: { tabs: Tab[]; testid?: string }) {
  return (
    <nav
      data-testid={testid}
      className="-mb-px flex items-end gap-1 overflow-x-auto border-b border-line [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {tabs.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          data-testid={t.testid}
          aria-current={t.activo ? 'page' : undefined}
          className={`shrink-0 whitespace-nowrap border-b-2 px-3.5 py-[9px] text-[14px] transition-colors ${
            t.activo
              ? 'border-marca font-medium text-ink'
              : 'border-transparent text-muted hover:text-ink'
          }`}
        >
          {t.label}
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
  testid = 'subtabs',
}: {
  items: { href?: string; onClick?: () => void; label: ReactNode; cuenta?: number | null; activo?: boolean; testid?: string }[]
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
          <Link key={i.href} href={i.href} data-testid={i.testid} aria-current={i.activo ? 'true' : undefined} className={clase}>
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
