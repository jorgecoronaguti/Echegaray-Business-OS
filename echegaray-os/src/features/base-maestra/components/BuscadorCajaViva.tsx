'use client'

// EL BUSCADOR DEL CANÓNICO 17/18: CAJA, Y ADEMÁS SINCRONIZA LA URL.
//
// El zip lo dibuja con caja (`border:1px solid #E7E6E2;borderRadius:6px;padding:4px 8px`) y lo
// implementa como estado del componente: `onInput` → `setState`, sin tocar la dirección. Portado tal
// cual, una búsqueda dejaría de poder compartirse y el botón de atrás no volvería a ninguna parte —
// que es una capacidad que estas dos pantallas YA tenían y que el mockup no podía saber.
//
// Así que son las dos cosas a la vez, cada una haciendo lo suyo:
//   el filtrado   INMEDIATO y local — no espera al servidor, no parpadea
//   la URL        se actualiza en diferido (`replace`, sin apilar historial)
//
// El control es el de `canon` (medido del zip) y el sincronizador es el de `BuscadorVivo`, con sus
// dos defectos ya pagados adentro. Acá no hay lógica nueva: hay una composición.

import { BuscadorCaja } from '@/shared/components/canon'
import { useUrlQ } from './BuscadorVivo'

export function BuscadorCajaViva({
  value, onChange, placeholder, ancho, testid,
}: {
  value: string
  onChange: (v: string) => void
  placeholder: string
  ancho: number
  testid?: string
}) {
  useUrlQ(value)
  return (
    <BuscadorCaja value={value} onChange={onChange} placeholder={placeholder} ancho={ancho} testid={testid} />
  )
}
