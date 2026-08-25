// LA BARRA DE SOLAPAS DE LA FICHA DE CLIENTE — `26:77`, y calcada en `28:66`, `31:44`, `32:40`.
//
//   ítem     `display:flex; alignItems:center; gap:6px; fontSize:13px; padding:8px 11px`
//   activa   `color:#1F1F1E; fontWeight:600; boxShadow:inset 0 -2px 0 #FDC900`
//   inactiva `color:#6B6B67`, y en hover pasa a `#1F1F1E`
//   contador mono 10,5px — `#6B6B67` en la activa, `#91918B` en las demás
//
// ═══ POR QUÉ NO ES `SubTabs` DEL DESIGN SYSTEM ═══
//
// `shared/components/ds/Navegacion.tsx` dibuja el nivel 3 con `border-b-[1.5px] border-ink`,
// `gap-x-5` y sin relleno: subrayado GRAFITO y fino, separación por hueco. El zip usa una barra
// AMARILLA de 2px pegada al filo de la cabecera y las solapas separadas por su propio `padding`.
// Son dos formas distintas de la misma idea, y el mockup es el que manda (BRIEFING, «gana el
// mockup»). No se toca `SubTabs`: lo usan otras diez pantallas que sí son del DS.
//
// Sin `'use client'`: son enlaces, y el hover se resuelve con una clase de Tailwind para que la
// ficha —Server Component— pueda importar este componente.

import Link from 'next/link'
import { C, MONO } from './tokens'

export interface Solapa {
  href: string
  label: string
  /** `null` cuando contar no aporta: un «0» al lado de «Cuenta corriente» se lee como saldo. */
  cuenta?: number | null
  activo: boolean
  testid?: string
}

export function SolapasFicha({ items, testid = 'solapas-cliente' }: {
  items: Solapa[]
  testid?: string
}) {
  return (
    <div
      data-testid={testid}
      style={{ display: 'flex', alignItems: 'stretch', overflowX: 'auto' }}
    >
      {items.map((i) => (
        <Link
          key={i.href}
          href={i.href}
          // `scroll={false}`: cambiar de cara no puede mandar la página al tope.
          // `prefetch={false}`: son rutas dinámicas y cada prefetch es un render completo.
          scroll={false}
          prefetch={false}
          data-testid={i.testid}
          aria-current={i.activo ? 'page' : undefined}
          className={i.activo ? undefined : 'hover:!text-[#1F1F1E]'}
          style={{
            display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', padding: '8px 11px',
            whiteSpace: 'nowrap', cursor: 'pointer',
            color: i.activo ? C.tinta : C.tintaSuave,
            fontWeight: i.activo ? 600 : 400,
            boxShadow: i.activo ? `inset 0 -2px 0 ${C.marca}` : undefined,
          }}
        >
          {i.label}
          {i.cuenta != null && (
            <span style={{ fontFamily: MONO, fontSize: '10.5px', color: i.activo ? C.tintaSuave : C.tenue }}>
              {i.cuenta}
            </span>
          )}
        </Link>
      ))}
    </div>
  )
}
