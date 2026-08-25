'use client'

import { EstadoError } from '@/shared/components/estado'

// LO DEL JEFE DE OBRA — su obra, sus frentes, su gente.
//
// ═══ SIN ESTE ARCHIVO, UNA EXCEPCIÓN LO SACABA DE SU PRODUCTO ═══
//
// Las seis pantallas manejan bien el error DEVUELTO por cada lectura —`primerError` en «Hoy» es
// exactamente eso—, pero eso sólo cubre lo que Supabase contesta. Una excepción que nadie atrapa
// —un `undefined` en un cálculo, un `fetch failed` que revienta el `Promise.all`— subía hasta
// `src/app/error.tsx`, que es el error del ERP de escritorio: reemplaza el árbol entero, así que
// desaparecían el header, la barra de contextos y el botón de volver. El jefe quedaba parado en la
// obra, con una pantalla que no era la suya y sin forma de retroceder.
//
// Acá el error se atrapa DENTRO de `(jefe)/layout.tsx`: el marco sobrevive, la barra sigue ahí y
// «Reintentar» vuelve a montar sólo la pantalla que falló.
//
// Es la cara que se usa en obra y con mala señal: `fetch failed` no es el caso raro, es el habitual.
// Por eso el cartel dice si se llegó o no a la base, igual que en `(empleado)`.
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <EstadoError error={error} reset={reset} />
}
