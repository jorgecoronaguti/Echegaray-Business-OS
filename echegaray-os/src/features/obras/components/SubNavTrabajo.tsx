// EL NIVEL 3 DE TRABAJO — Ítems · Cronograma · Parte diario · Planilla · Subcontratos.
//
// ═══ PORTE LITERAL DEL DISEÑO «ERP Obras» (04 · 04b · M05) ═══
//
// Escritorio: dentro del bloque blanco de la cabecera, debajo de las solapas —`gap:14px` de ellas,
// `padding-bottom:2px`—. Texto 12,5px; la activa 500 con `inset 0 -1.5px 0 #1F1F1E`; las demás en
// `#6B6B67`. Un filete de 1×14 separa lo que sigue («Ver hasta», «Agrupar por»), y lo que va al
// final (el buscador) se empuja con `margin-left:auto`.
//
// Teléfono (M05): banda `#FAFAF8` de borde a borde con línea abajo, `padding:0 16px`, ítems
// `padding:9px 9px`, la activa 600 con la regla grafito de 2px. Los controles del escritorio no
// entran en 390: ahí los dibuja cada pantalla debajo de la banda (M05: buscador + filtros).
//
// Módulo SIN `'use client'`: lo montan Server Components (la página, la planilla) y componentes
// cliente (el árbol, el parte). `pantallasDeTrabajo` vive en `vistasObra`, también neutral.

import Link from 'next/link'
import type { ReactNode } from 'react'
import { C, MONO } from './canon/tokens'
import { pantallasDeTrabajo, type PantallaDeTrabajo } from '../services/vistasObra'

export function SubNavTrabajo({ obraId, sub, derecha, alFinal, contadores = {} }: {
  obraId: string
  sub: PantallaDeTrabajo | null
  /** Lo que sigue al filete: «Ver hasta», «Agrupar por», el navegador de día del parte. */
  derecha?: ReactNode
  /** Lo que se empuja al borde derecho (04: el buscador de 190px). */
  alFinal?: ReactNode
  /** Los contadores en faint al lado del rótulo, cuando la pantalla los trae. */
  contadores?: Partial<Record<string, number>>
}) {
  const items = pantallasDeTrabajo(obraId, sub)
  return (
    <>
      <div className="hidden md:flex" data-testid="subnav-trabajo" style={{
        background: C.superficie, alignItems: 'center', gap: '20px', padding: '14px 30px 2px',
        flexShrink: 0, flexWrap: 'wrap',
      }}>
        <nav style={{ display: 'flex', alignItems: 'center', gap: '16px', fontSize: '12.5px' }} data-testid="subtabs-tareas">
          {items.map((i) => (
            <Link key={i.id} href={i.href} prefetch={false} data-testid={`sub-${i.id}`}
              aria-current={i.activo ? 'page' : undefined}
              style={{
                whiteSpace: 'nowrap', paddingBottom: '2px',
                color: i.activo ? C.tinta : C.tintaSuave, fontWeight: i.activo ? 500 : 400,
                boxShadow: i.activo ? `inset 0 -1.5px 0 ${C.tinta}` : 'none',
              }}>
              {i.label}
              {contadores[i.id] != null && (
                <span style={{ fontFamily: MONO, fontSize: '11px', color: C.tenue, marginLeft: '5px' }}>
                  {contadores[i.id]}
                </span>
              )}
            </Link>
          ))}
        </nav>
        {derecha != null && (
          <>
            <div aria-hidden style={{ width: '1px', height: '14px', background: C.borde, flexShrink: 0 }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: C.tintaSuave, flexWrap: 'wrap' }}>
              {derecha}
            </div>
          </>
        )}
        {alFinal != null && <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}>{alFinal}</div>}
      </div>

      <div className="md:hidden" data-testid="subnav-trabajo-telefono" style={{
        display: 'flex', padding: '0 16px', background: C.tenueFondo, borderBottom: `1px solid ${C.borde}`,
        overflowX: 'auto', flexShrink: 0, scrollbarWidth: 'none',
      }}>
        {items.map((i) => (
          <Link key={i.id} href={i.href} prefetch={false} data-testid={`sub-telefono-${i.id}`}
            aria-current={i.activo ? 'page' : undefined}
            style={{
              padding: '9px 9px', fontSize: '12.5px', whiteSpace: 'nowrap', minHeight: '44px',
              display: 'inline-flex', alignItems: 'center',
              color: i.activo ? C.tinta : C.tintaSuave, fontWeight: i.activo ? 600 : 400,
              boxShadow: i.activo ? `inset 0 -2px 0 ${C.grafito}` : 'none',
            }}>{i.label}</Link>
        ))}
      </div>
    </>
  )
}
