'use client'

import { useRouter } from 'next/navigation'
import type { Destino } from '../logica/stock'
import { FormIngresarMaterial } from './FormIngresarMaterial'

/** Ingreso sin pedido en el teléfono: al guardar vuelve al stock, donde se ve el renglón recién sumado. */
export function IngresarEnTelefono({ destinos, lugarInicial }: { destinos: Destino[]; lugarInicial?: string }) {
  const router = useRouter()
  return <FormIngresarMaterial destinos={destinos} lugarInicial={lugarInicial} alHacer={() => { router.push('/campo/material/stock'); router.refresh() }} />
}
