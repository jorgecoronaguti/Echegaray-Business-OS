'use client'

// LA ACCIÓN SOBRE UNA FILA, EN EL LENGUAJE DEL ERP OBRAS — la misma mecánica que `BotonAccion`
// (`useActionState`, el error se muestra al lado y nunca se traga), con el botón secundario del zip:
// blanco, borde `C.borde`, 12.5px, radio 6. `peligro` es texto y borde de la familia `neg`: quitar
// borra, y es el único caso que se pinta de rojo.
//
// Existe porque `BotonAccion` es del DS genérico (`border-line`, `text-[12px]`) y dentro del 08 se
// leía como una pieza de otra pantalla.

import { useActionState, useState, type ReactNode } from 'react'
import type { ResultadoAccion } from '@/shared/components/ui'
import { C } from './tokens'

export function AccionFila<A extends unknown[] = []>({
  accion, args, children, testid, tono = 'neutro', alto = 28, confirmar,
}: {
  accion: (...args: A) => Promise<ResultadoAccion>
  args?: A
  children: ReactNode
  testid?: string
  /** `discreto`: texto tenue sin borde, para acciones que se repiten en cada fila de una lista larga. */
  tono?: 'neutro' | 'peligro' | 'discreto'
  /** Si viene, el primer toque sólo pregunta («¿Quitar? Sí»): borrar un dato real no va de un toque. */
  confirmar?: string
  /** 28 en la fila del escritorio · 44 en la hoja del teléfono. */
  alto?: 28 | 44
}) {
  const [estado, ejecutar, pendiente] = useActionState<ResultadoAccion | null, FormData>(
    () => accion(...((args ?? []) as A)),
    null,
  )
  const peligro = tono === 'peligro'
  const discreto = tono === 'discreto'
  const [armado, setArmado] = useState(false)
  if (confirmar && !armado) {
    return (
      <button type="button" data-testid={testid ? `${testid}-pedir` : undefined} onClick={() => setArmado(true)} style={{
        font: 'inherit', fontSize: '12.5px', border: 'none', background: 'none', padding: '4px 0', cursor: 'pointer',
        color: discreto ? C.tenue : peligro ? C.neg : C.tintaMedia, whiteSpace: 'nowrap',
      }}>{children}</button>
    )
  }
  return (
    <form action={ejecutar} style={{ display: 'inline-flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px' }}>
      <button
        type="submit"
        disabled={pendiente}
        data-testid={testid}
        style={{
          // El atajo `font` va PRIMERO: detrás pisaría el tamaño y el peso.
          font: 'inherit', fontSize: alto === 44 ? '14px' : '12.5px', fontWeight: alto === 44 ? 500 : 400,
          height: `${alto}px`, padding: alto === 44 ? '0 16px' : '0 10px', borderRadius: '6px',
          border: `1px solid ${peligro || (discreto && confirmar) ? C.negBorde : C.borde}`, background: C.superficie,
          color: peligro || (discreto && confirmar) ? C.neg : C.tintaMedia, cursor: pendiente ? 'default' : 'pointer',
          opacity: pendiente ? 0.5 : 1, whiteSpace: 'nowrap', width: alto === 44 ? '100%' : undefined,
        }}
      >
        {pendiente ? '…' : confirmar ?? children}
      </button>
      {confirmar && !pendiente && (
        <button type="button" onClick={() => setArmado(false)} style={{ font: 'inherit', fontSize: '12.5px', border: 'none', background: 'none', padding: 0, cursor: 'pointer', color: C.tenue }}>No</button>
      )}
      {estado?.ok === false && (
        <span data-testid={testid ? `${testid}-error` : undefined} style={{ fontSize: '12px', color: C.neg }}>{estado.error}</span>
      )}
    </form>
  )
}
