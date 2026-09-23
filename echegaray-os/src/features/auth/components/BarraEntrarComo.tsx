'use client'

import { useEntrarComo } from './useEntrarComo'

// LA FRANJA DE «ENTRANDO COMO», DIBUJADA EN TODAS LAS PANTALLAS.
//
// Grafito sólido con tinta blanca, no el `warn` de la lente: la lente es una anomalía de PANTALLA
// (se ve distinto, no se escribe); esto es una sesión REAL a nombre de otro, con permisos reales y
// escritura real. Las dos franjas no pueden parecerse, porque lo que se puede hacer debajo de cada una
// es opuesto. El amarillo de la marca no entra: es identidad, no estado.
//
// «Volver a mi cuenta» es la única acción y está siempre a un clic, en 1440 y en 390. Vencida la
// entrada (cuatro horas), la franja lo dice y sigue ofreciendo volver: nunca se queda alguien adentro
// de la cuenta de otro sin la salida a la vista.

export function BarraEntrarComo({ nombre, nivel, vencida }: { nombre: string; nivel: string; vencida: boolean }) {
  const entrada = useEntrarComo()
  return (
    <div
      data-testid="aviso-entrar-como"
      role="status"
      className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line-strong bg-ink px-3 py-1.5 text-white sm:px-6 lg:px-10"
    >
      <span className="text-[12px] font-semibold uppercase tracking-[0.04em]">
        Estás entrando como {nombre} <span className="font-normal normal-case tracking-normal opacity-80">({nivel})</span>
      </span>
      <span className="order-last w-full text-[11px] leading-snug opacity-80 sm:order-none sm:w-auto sm:flex-1">
        {vencida
          ? 'La entrada venció: volvé a tu cuenta.'
          : 'Sesión real: ves lo que esa persona ve y lo que hagas queda a su nombre.'}
      </span>
      <button
        type="button"
        disabled={entrada.pendiente}
        onClick={entrada.volver}
        data-testid="volver-a-mi-cuenta"
        className="rounded-md border border-white/40 bg-surface px-2.5 py-1 text-[12px] font-semibold text-ink hover:bg-surface-quiet disabled:opacity-60"
      >
        {entrada.pendiente ? 'Volviendo…' : 'Volver a mi cuenta'}
      </button>
      {entrada.error && <span role="alert" className="text-[11.5px] text-warn">{entrada.error}</span>}
    </div>
  )
}
