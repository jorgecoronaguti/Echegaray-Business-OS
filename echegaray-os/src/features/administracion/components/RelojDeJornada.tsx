'use client'

import { useEffect, useState } from 'react'
import { jornadaLarga, minutosDesde, reloj } from '../services/presencia'

// EL RELOJ DE LA JORNADA — corre en el navegador y sólo en el navegador.
//
// ═══ LA HORA NO SE CALCULA EN EL RENDER ═══
//
// `Date.now()` mientras se dibuja es impuro por dos motivos que acá se tocan: el servidor y el
// cliente calcularían números distintos —error de hidratación en cada fila— y React lo prohíbe de
// entrada (`react-hooks/purity`). Así que el primer dibujo, en las DOS puntas, es un guión; el
// `useEffect` pone la hora apenas monta y la sigue moviendo. Un parpadeo de un cuadro contra un
// reloj que no puede desincronizarse.
//
// SE ACTUALIZA CADA 30 SEGUNDOS, no cada uno. Lo que se lee es «hace cuánto que entró», y a esa
// pregunta el segundero no le agrega nada: sólo gasta batería en el teléfono del jefe de obra.
//
// A LAS 9 HORAS SE MARCA en `warn`. No es una alarma de horas extra —eso lo liquida Administración—:
// es que a esa altura casi siempre lo que pasó es que alguien se olvidó de marcar la salida.

export function RelojDeJornada({ entrada }: { entrada: string | null }) {
  const [t, setT] = useState<number | null>(null)
  useEffect(() => {
    // El primer valor va por un timer y no derecho acá: un `setState` síncrono adentro del efecto
    // encadena un render de más por cada fila de la lista, y ésta puede tener treinta.
    const primero = setTimeout(() => setT(Date.now()), 0)
    const id = setInterval(() => setT(Date.now()), 30_000)
    return () => { clearTimeout(primero); clearInterval(id) }
  }, [])

  const m = t == null ? null : minutosDesde(entrada, t)
  const largo = jornadaLarga(m)
  return (
    <span
      data-testid="reloj-jornada"
      data-minutos={m ?? ''}
      className={`font-mono text-[14px] tabular-nums ${largo ? 'text-warn' : 'text-ink'}`}
      title={largo ? 'Más de 9 horas: puede ser una salida sin registrar' : undefined}
    >
      {reloj(m)}
    </span>
  )
}

/** El punto que late al lado de quien está adentro. Es la única animación de la pantalla, y está
 *  porque «activo» es un estado que cambia solo: sin nada que se mueva, la pantalla parece vieja. */
export function PuntoActivo() {
  return (
    <span aria-hidden data-testid="punto-activo" className="relative inline-flex h-2 w-2">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-pos opacity-60" />
      <span className="relative inline-flex h-2 w-2 rounded-full bg-pos" />
    </span>
  )
}
