'use client'

import { useState, type Dispatch, type SetStateAction } from 'react'
import { alRecibirDelServidor, huellaDe, nacer } from './estadoDelServidor'

/**
 * `useState` para un valor que VIENE DEL SERVIDOR y otro usuario puede cambiar: cuando la página se
 * vuelve a leer (tiempo real) y el valor cambió, el control lo adopta. Ver `estadoDelServidor.ts`.
 *
 * Reemplaza `useState(inicial)` en todo control que MUESTRA un dato guardado. Un borrador de formulario
 * que nadie más edita puede seguir con `useState`.
 */
export function useEstadoDelServidor<T>(
  delServidor: T, huella: (v: T) => string = huellaDe,
): [T, Dispatch<SetStateAction<T>>] {
  const h = huella(delServidor)
  const [estado, setEstado] = useState(() => nacer(delServidor, h))
  // Se ajusta DURANTE el render (patrón de React para derivar de props): sin fotograma con el valor viejo.
  const nuevo = alRecibirDelServidor(estado, delServidor, h)
  if (nuevo) setEstado(nuevo)
  const setValor: Dispatch<SetStateAction<T>> = (v) =>
    setEstado((e) => ({ ...e, valor: typeof v === 'function' ? (v as (x: T) => T)(e.valor) : v }))
  return [nuevo ? nuevo.valor : estado.valor, setValor]
}
