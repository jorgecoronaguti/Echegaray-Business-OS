// LA BARRA DE NIVEL 3 DE «TRABAJO» — PORTE LITERAL de la banda que repiten los mockups 03, 05 y 06.
//
// ES LA ÚNICA. Hasta el 25/08/2026 había una segunda, `SubTabsTrabajo`, construida sobre `SubTabs`
// del design system y usada por UNA pantalla —Subcontratos—, que por eso se veía distinta de las
// otras cuatro del mismo nivel. Cuando el mockup y el design system difieren manda el mockup, así
// que sobrevivió ésta y la otra se retiró. Los ítems ya no se escriben acá: salen de
// `pantallasDeTrabajo`, que los emite una sola vez para toda la obra.
//
//   banda     `background:#FAFAF8; borderBottom:1px solid #E7E6E2; padding:0 20px; gap:14px`
//   solapa    12,5px, `padding:9px 10px`; activa 600 con `boxShadow:inset 0 -2px 0 #30302F`
//
// EL SUBRAYADO ES GRAFITO Y NO AMARILLO, y no es un descuido del zip: el amarillo está reservado
// para el nivel 2 (las seis solapas de la obra) y para la única primaria de la pantalla. Dos
// amarillos apilados en dos niveles de navegación hacen que el ojo no sepa cuál manda.
//
// LOS CONTROLES DE LA DERECHA los pone cada pantalla (`derecha`): en la 03 son el buscador, los
// cuatro filtros y el conmutador de dependencias; en la 05, el navegador de día; en la 06, el
// buscador y sus tres filtros. Todos viven en el MISMO renglón que las solapas, que es lo que hace
// que la banda mida una línea y no dos.

import Link from 'next/link'
import type { ReactNode } from 'react'
import { C } from './canon/tokens'
import { pantallasDeTrabajo, type PantallaDeTrabajo } from '../services/vistasObra'

export function SubNavTrabajo({ obraId, sub, derecha }: {
  obraId: string
  /** Cuál de las cuatro se está mirando. `null` cuando ninguna lo está. */
  sub: PantallaDeTrabajo | null
  derecha?: ReactNode
}) {
  const items = pantallasDeTrabajo(obraId, sub)
  return (
    <div data-testid="subnav-trabajo" style={{
      background: C.tenueFondo, borderBottom: `1px solid ${C.borde}`, display: 'flex',
      alignItems: 'center', gap: '14px', padding: '0 20px', flexShrink: 0, flexWrap: 'wrap',
    }}>
      <nav style={{ display: 'flex', alignItems: 'stretch' }} data-testid="subtabs-tareas">
        {items.map((i) => (
          <Link key={i.id} href={i.href} prefetch={false} data-testid={`sub-${i.id}`}
            aria-current={i.activo ? 'page' : undefined}
            style={{
              fontSize: '12.5px', padding: '9px 10px', whiteSpace: 'nowrap',
              color: i.activo ? C.tinta : C.tintaSuave, fontWeight: i.activo ? 600 : 400,
              boxShadow: i.activo ? `inset 0 -2px 0 ${C.grafito}` : 'none',
            }}>{i.label}</Link>
        ))}
      </nav>
      {derecha != null && (
        <div style={{
          marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 0',
          flexWrap: 'wrap', justifyContent: 'flex-end',
        }}>{derecha}</div>
      )}
    </div>
  )
}
