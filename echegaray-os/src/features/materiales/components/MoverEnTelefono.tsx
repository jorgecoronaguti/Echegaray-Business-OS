'use client'

import { useRouter } from 'next/navigation'
import type { Destino, Existencia, Lugar } from '../logica/stock'
import { MoverMaterial } from './MoverMaterial'

// Envoltorio del formulario para la pantalla del teléfono: al emitir, el remito es lo que sigue.
// Va a SU pantalla (que lo lee de la base) y no lo muestra desde memoria: lo que se imprime es la copia guardada.
export function MoverEnTelefono(props: { origen: string; lugares: Lugar[]; existencias: Existencia[]; destinos: Destino[] }) {
  const router = useRouter()
  return <MoverMaterial {...props} alHacer={(r) => router.push(`/campo/material/remitos/${r.id}`)} />
}
