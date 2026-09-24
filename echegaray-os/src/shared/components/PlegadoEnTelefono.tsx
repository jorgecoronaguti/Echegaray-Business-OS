'use client'

import { useState, type ReactNode } from 'react'

// UN BLOQUE QUE EN EL TELÉFONO ARRANCA PLEGADO (dueño, 23/09/2026: vistas mobile por nivel).
//
// Capturado a 390 en Compras: los once filtros ocupaban la pantalla entera antes de la primera
// compra. En escritorio no cambia nada (`md:` los muestra siempre y el botón no existe). Bajo `md`
// se ve un botón de 44 px con el rótulo y el bloque aparece al tocarlo. Sin JavaScript el bloque
// queda plegado: el rótulo dice qué hay adentro, así que no se pierde nada, sólo hay que tocar.
//
// UN SOLO CONTROL PARA TODOS LOS RECORTES (24/09/2026). Plantel, Compras y Proveedores tenían en el
// teléfono dos y tres hileras de pastillas antes de la primera fila. Ahora cada una los pliega acá, y
// el botón dice LO QUE ESTÁ PUESTO (`resumen`) para que plegado no signifique escondido.
export function PlegadoEnTelefono({ rotulo, resumen, children, testid = 'plegado-telefono' }: {
  rotulo: ReactNode
  /** Lo elegido, a la derecha del rótulo y apagado: «Plantel 17 · Todas las obras». */
  resumen?: ReactNode
  children: ReactNode
  testid?: string
}) {
  const [abierto, setAbierto] = useState(false)
  return (
    <div data-testid={testid} className="max-md:mb-3">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        data-testid={`${testid}-boton`}
        className="flex min-h-[44px] w-full items-center gap-2 rounded-[12px] border border-line bg-surface px-3.5 text-left text-[14px] text-ink md:hidden"
      >
        <span className="shrink-0 font-medium">{rotulo}</span>
        {resumen != null && (
          <span className="min-w-0 flex-1 truncate text-right text-[13px] text-muted" data-testid={`${testid}-resumen`}>{resumen}</span>
        )}
        <span aria-hidden className={`text-faint ${resumen != null ? '' : 'ml-auto'}`}>{abierto ? '▴' : '▾'}</span>
      </button>
      <div className={abierto ? 'mt-2 md:mt-0' : 'max-md:hidden'}>{children}</div>
    </div>
  )
}
