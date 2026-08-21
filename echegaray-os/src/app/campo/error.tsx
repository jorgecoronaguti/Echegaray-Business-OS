'use client'

import { EstadoError } from '@/shared/components/estado'

// CAMPO — el parte de obra y la carga de impedimentos desde el teléfono.
//
// Acá una pantalla en blanco cuesta un parte que no se carga. El error dice qué falló y deja
// Reintentar a mano: la conexión de obra se cae y vuelve, y el segundo intento suele andar.
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <EstadoError error={error} reset={reset} />
}
