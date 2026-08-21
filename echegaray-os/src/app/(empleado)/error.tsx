'use client'

import { EstadoError } from '@/shared/components/estado'

// LO DEL EMPLEADO — su día, su información y su trabajo.
//
// Es la cara que se usa desde el teléfono, en obra y con mala señal: el caso `fetch failed` no es
// raro acá, es el habitual. Por eso el cartel dice si se llegó o no a la base y ofrece Reintentar,
// en vez de dejar una lista vacía que se lee como «no tenés nada asignado».
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <EstadoError error={error} reset={reset} />
}
