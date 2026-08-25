'use client'

// EL CHIP DE FILTRO QUE NO VIAJA EN LA URL — `17` línea 74, `18` línea 76.
//
// ═══ POR QUÉ NO ES `ChipsCanon` NI `ds/Filtros` ═══
//
// Los dos dibujan un `<Link>`: el filtro cambia la dirección. Los chips de estas dos pantallas
// recortan una lista que YA está en el navegador y el canónico los implementa como estado del
// componente (`onClick={{ v.go }}` → `setState`). Un enlace acá haría un viaje al servidor por cada
// clic sobre datos que no cambiaron, y —peor— prometería una lista que mañana es otra: «Con desvío»
// depende de lo que la base diga en este momento.
//
// La GEOMETRÍA es idéntica a la de `ChipsCanon`, medida del mismo zip:
//   `fontSize:12px;border:1px solid …;borderRadius:6px;padding:4px 9px;gap:5px`
//   activo #30302F sobre #30302F con texto blanco · inactivo #E7E6E2 sobre blanco con texto #3A3A38

import type { ReactNode } from 'react'

export function ChipCorte({
  activo, onClick, children, testid,
}: {
  activo: boolean
  onClick: () => void
  children: ReactNode
  testid?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testid}
      aria-pressed={activo}
      className={`inline-flex items-center gap-[5px] rounded-[6px] border px-[9px] py-[4px] text-[12px] transition-colors ${
        activo
          ? 'border-[#30302F] bg-[#30302F] text-white'
          : 'border-[#E7E6E2] bg-white text-[#3A3A38] hover:border-[#D7D5CF]'
      }`}
    >
      {children}
    </button>
  )
}
