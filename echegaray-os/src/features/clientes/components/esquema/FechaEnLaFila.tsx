'use client'

// LA FECHA SE EDITA EN LA FILA (`32:99`, `32:200`, `32:227`).
//
//   chip     `border:1px solid #E7E6E2; background:#FFFFFF; borderRadius:6px; padding:5px 8px`
//   elegido  borde `#FDC900` sobre `#FFFDF5`, mono 600, y la fila lo corre 9px
//   previsto borde punteado `#D7D5CF` sobre `#FAFAF8` — todavía no hay fila en Cobranzas
//
// El dueño, textual: «necesito que la pantalla permita que si quiero editar edite ahí mismo». Así
// que el chip ES el control: al tocarlo se convierte en un `input[type=date]` nativo en el mismo
// lugar, y al elegir un día se guarda solo. No abre un diálogo, no navega, no hay «Guardar».
//
// EL CALENDARIO NATIVO ES A PROPÓSITO: es el único que ya sabe de husos, de teclado y de lector de
// pantalla, y en el teléfono del jefe de obra abre la rueda del sistema. Un calendario dibujado a
// mano acá sería trescientas líneas para empeorar las tres cosas.

import { useState } from 'react'
import { C, MONO } from '../canon/tokens'
import { Ico, P } from '../canon/Iconos'
import { diaMes } from '../../services/cobranzaFormato'

export function FechaEnLaFila({ fecha, onCambiar, tono = 'normal', deshabilitado = false, testid }: {
  fecha: string | null
  onCambiar: (iso: string) => void
  /** `elegido` = fila abierta en el panel; `previsto` = pago sin fila en Cobranzas todavía. */
  tono?: 'normal' | 'elegido' | 'previsto' | 'apagado'
  deshabilitado?: boolean
  testid?: string
}) {
  const [editando, setEditando] = useState(false)
  const borde = tono === 'elegido' ? `1px solid ${C.marca}`
    : tono === 'previsto' ? `1px dashed ${C.bordeFuerte}`
    : `1px solid ${C.borde}`
  const fondo = tono === 'elegido' ? C.marcaTenue : tono === 'previsto' ? C.tenueFondo : C.superficie

  if (editando && !deshabilitado) {
    return (
      <input
        type="date" autoFocus defaultValue={fecha?.slice(0, 10) ?? undefined}
        data-testid={testid ? `${testid}-input` : undefined}
        onBlur={() => setEditando(false)}
        onChange={(e) => {
          if (!e.target.value) return
          onCambiar(e.target.value)
          setEditando(false)
        }}
        style={{
          width: '100%', border: `1px solid ${C.marca}`, background: C.marcaTenue,
          borderRadius: '6px', padding: '4px 6px', fontFamily: MONO, fontSize: '12px',
          color: C.tinta,
        }}
      />
    )
  }

  return (
    <button
      type="button" onClick={() => setEditando(true)} disabled={deshabilitado}
      data-testid={testid} title={deshabilitado ? 'Un cobro ya registrado no se mueve desde acá' : 'Cambiar la fecha'}
      style={{
        display: 'flex', alignItems: 'center', gap: '7px', border: borde, background: fondo,
        borderRadius: '6px', padding: '5px 8px', cursor: deshabilitado ? 'default' : 'pointer',
        width: '100%', fontFamily: 'inherit',
      }}
    >
      <span style={{ display: 'flex', color: tono === 'elegido' ? C.warn : C.tenue }}>
        <Ico d={P.calendario} s={13} />
      </span>
      <span style={{
        fontFamily: MONO, fontSize: '12px',
        fontWeight: tono === 'elegido' ? 600 : 400,
        color: tono === 'apagado' || tono === 'previsto' ? C.tintaSuave : C.tinta,
      }}>{diaMes(fecha) ?? 'sin fecha'}</span>
    </button>
  )
}
