'use client'

import { EstadoError } from '@/shared/components/estado'

// EL ÁREA DE GESTIÓN. Cubre obras, control de obras, flujo de caja, integraciones, reportes y todo
// lo que cuelga de `(main)` sin un boundary más cercano.
//
// Que exista ACÁ y no sólo en la raíz importa: este boundary vive DENTRO de `(main)/layout.tsx`, así
// que el encabezado y la navegación global siguen dibujados mientras se muestra el error. Quien
// mira no queda encerrado en una pantalla suelta — puede irse a otra área con un clic.
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <EstadoError error={error} reset={reset} />
}
