'use client'

import { useState, type ReactNode } from 'react'

// UN BLOQUE QUE EN EL TELÉFONO ARRANCA PLEGADO (dueño, 23/09/2026: vistas mobile por nivel).
//
// Capturado a 390 en Compras: los once filtros ocupaban la pantalla entera antes de la primera
// compra. En escritorio no cambia nada (`md:` los muestra siempre y el botón no existe). Bajo `md`
// se ve un botón de 44 px con el rótulo y el bloque aparece al tocarlo. Sin JavaScript el bloque
// queda plegado: el rótulo dice qué hay adentro, así que no se pierde nada, sólo hay que tocar.
export function PlegadoEnTelefono({ rotulo, children, testid = 'plegado-telefono' }: {
  rotulo: string
  children: ReactNode
  testid?: string
}) {
  const [abierto, setAbierto] = useState(false)
  return (
    <div data-testid={testid}>
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        data-testid={`${testid}-boton`}
        className="flex min-h-[44px] w-full items-center justify-between rounded-control border border-line bg-surface px-3 text-[13.5px] text-ink md:hidden"
      >
        <span>{rotulo}</span>
        <span aria-hidden className="text-faint">{abierto ? '▴' : '▾'}</span>
      </button>
      <div className={abierto ? 'mt-2 md:mt-0' : 'max-md:hidden'}>{children}</div>
    </div>
  )
}
