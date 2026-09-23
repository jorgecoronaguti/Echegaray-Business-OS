'use client'

import { usePathname } from 'next/navigation'
import { itemActivoDeBarra, type ItemBarraTelefono } from '@/features/auth/types/barraTelefono'
import { BarraContextos } from './movil/Piezas'

// LA BARRA DE ABAJO DEL TELÉFONO EN LAS PANTALLAS DE ESCRITORIO (dueño, 23/09/2026).
//
// Se dibuja SÓLO por debajo de `md` (768px): es la misma pieza que usan el empleado y el jefe
// (`BarraContextos`), con los destinos que `barraTelefonoDe(rol)` decide en el servidor. Qué ítem se
// enciende lo decide `itemActivoDeBarra`, que es puro y está probado; acá sólo se lee la ruta.
//
// POR ANCHO Y NO POR USER-AGENT a propósito: el header esconde sus solapas con la misma regla
// (`hidden md:flex`), así que nunca hay dos navegaciones de nivel 1 a la vez ni ninguna.
export function BarraTelefono({ items }: { items: ItemBarraTelefono[] }) {
  const ruta = usePathname()
  if (items.length === 0) return null
  const activo = itemActivoDeBarra(ruta, items)
  return (
    <div className="md:hidden" data-testid="barra-telefono">
      <BarraContextos
        testid="barra-telefono-nav"
        items={items.map((i) => ({
          href: i.href, label: i.label, icono: i.icono, activo: activo === i.clave, testid: `barra-${i.clave}`,
        }))}
      />
    </div>
  )
}
