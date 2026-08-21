'use client'

import { EstadoError } from '@/shared/components/estado'

// CLIENTES. Vive fuera de `/administracion/**` pero comparte su barra de área (así lo monta
// `clientes/layout.tsx`), y por la misma razón conserva su propio boundary: el error de la cartera
// o de una ficha no debe borrar la navegación de Administración.
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <EstadoError error={error} reset={reset} />
}
