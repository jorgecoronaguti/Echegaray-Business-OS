'use client'

import { EstadoError } from '@/shared/components/estado'

// LA RED DE MÁS AFUERA DENTRO DEL LAYOUT RAÍZ.
//
// Cubre lo que ningún `error.tsx` más cercano atrapa: el fallo del layout de un grupo —`(main)`,
// `(empleado)`, `(auth)`— y las pantallas sueltas de la raíz. Un error del layout NO lo captura el
// boundary de su propio segmento (el boundary vive dentro de ese layout), y sin este archivo la
// pantalla quedaba en blanco: exactamente lo que el dueño describe como *«no responde, nada»*.
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <EstadoError error={error} reset={reset} />
}
