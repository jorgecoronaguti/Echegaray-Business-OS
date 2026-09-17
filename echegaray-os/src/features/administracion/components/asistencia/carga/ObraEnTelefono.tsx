'use client'

import { useRouter } from 'next/navigation'
import { ALTO } from './ControlesDeFila'

// EL FILTRO DE OBRA EN 390 PX ES UN DESPLEGABLE, NO SIETE RENGLONES DE PASTILLAS.
//
// Medido en la captura del 17/09/2026: con siete obras, `FiltrosSuaves` ocupaba 190 px de alto en el
// teléfono y empujaba a la primera persona fuera de la primera pantalla. En la compu las pastillas se
// quedan —publican cuánta gente hay en cada obra antes de elegir—; acá el número va dentro de la opción.
export function ObraEnTelefono({ opciones }: {
  opciones: { clave: string; etiqueta: string; cuenta?: number; href: string; activo: boolean }[]
}) {
  const router = useRouter()
  const activa = opciones.find((o) => o.activo) ?? opciones[0]
  return (
    <select
      value={activa?.clave} aria-label="Obra" data-testid="obra-en-telefono"
      onChange={(e) => { const o = opciones.find((x) => x.clave === e.target.value); if (o) router.push(o.href) }}
      className={`${ALTO} mb-3 w-full rounded-control border border-line bg-surface px-2 text-[16px] text-ink md:hidden`}
    >
      {opciones.map((o) => (
        <option key={o.clave} value={o.clave}>{o.etiqueta}{o.cuenta != null ? ` · ${o.cuenta}` : ''}</option>
      ))}
    </select>
  )
}
