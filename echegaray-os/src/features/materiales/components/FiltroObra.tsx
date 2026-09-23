'use client'

import { useRouter } from 'next/navigation'
import { hrefMaterialEscritorio, type Filtro } from '../logica/pedidos'
import type { ObraElegible } from './FormPedirMaterial'

// EL FILTRO POR OBRA — va donde las demás pantallas de Herramientas ponen el buscador (D06 pone sus
// filtros ahí: uno u otro, nunca los dos). El estado viaja en la URL: la vista filtrada se pasa por chat.
export function FiltroObra({ obras, filtro }: { obras: ObraElegible[]; filtro: Filtro }) {
  const router = useRouter()
  return (
    <select
      aria-label="Obra"
      value={filtro.obra ?? ''}
      onChange={(e) => router.push(hrefMaterialEscritorio({ ...filtro, obra: e.target.value || null }))}
      className="h-[28px] max-w-[260px] rounded-control border border-line-strong bg-surface px-2 text-[12.5px] text-ink"
      data-testid="filtro-obra"
    >
      <option value="">Todas las obras</option>
      {obras.map((o) => (
        <option key={o.id} value={o.id}>{o.nombre}</option>
      ))}
    </select>
  )
}
