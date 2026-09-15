'use client'

// ELEGIR LA OBRA DE UNA COMPRA EN EL PANEL — el mismo desplegable que la columna «Obra» del Sheet.
//
// ═══ LO QUE ESTE CONTROL NO PROMETE ═══
//
// Guardar deja la elección en el OS (`compra_sheet`) y ENCOLA la escritura de la celda del Sheet
// (`compra_obra_cambio`). Al 15/09/2026 no existe todavía el proceso que toma esa cola y escribe la
// celda, así que decir «quedó en el Sheet» sería afirmar un efecto que no ocurrió. El mensaje dice lo
// que pasó de verdad. El sync horario no la borra: superpone los cambios pendientes a lo que lee.
//
// Sin la migración 20260915T0700 no hay RPC ni columnas: el control no se dibuja como si anduviera,
// dice por qué no está.

import { useState, useTransition } from 'react'
import { C } from '@/shared/components/canon'
import { asignarObraDeCompra } from '../services/obraDeCompraActions'

export function EditorObraDeCompra({
  fila, celda, opciones, editable,
}: {
  fila: number
  celda: string | null
  opciones: string[]
  editable: boolean
}) {
  const [valor, setValor] = useState(celda ?? '')
  const [error, setError] = useState<string | null>(null)
  const [hecho, setHecho] = useState(false)
  const [pendiente, empezar] = useTransition()

  if (!editable) {
    return (
      <p style={{ fontSize: 11.5, color: C.tenue, paddingTop: 14, textWrap: 'pretty' }} data-testid="obra-compra-no-editable">
        La obra se va a poder elegir acá cuando la base tenga la columna Obra (migración pendiente).
        Mientras tanto se imputa en la pestaña Compras.
      </p>
    )
  }

  // La celda actual puede no estar entre las opciones (una obra fusionada, un texto que no se
  // entendió): se muestra igual para no perderla al abrir el panel.
  const lista = celda && !opciones.includes(celda) ? [celda, ...opciones] : opciones

  function guardar() {
    setError(null)
    setHecho(false)
    empezar(async () => {
      const r = await asignarObraDeCompra(fila, valor, celda ?? '')
      if (!r.ok) { setError(r.error); return }
      setHecho(true)
    })
  }

  return (
    <div style={{ paddingTop: 14 }}>
      <label htmlFor={`obra-compra-${fila}`} style={{ fontSize: 11.5, color: C.tenue }}>Obra</label>
      <div style={{ display: 'flex', gap: 8, paddingTop: 4 }}>
        <select
          id={`obra-compra-${fila}`}
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          data-testid="obra-compra-select"
          style={{ flex: 1, minWidth: 0, border: `1px solid ${C.linea}`, borderRadius: 6, padding: '4px 8px', fontSize: 12 }}
        >
          <option value="">sin elegir (se infiere de J y K)</option>
          {lista.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
        <button
          type="button"
          onClick={guardar}
          disabled={pendiente || valor === (celda ?? '')}
          data-testid="obra-compra-guardar"
          style={{
            border: `1px solid ${C.linea}`, borderRadius: 6, padding: '2px 10px', background: C.superficie,
            fontSize: 12, color: C.tinta, cursor: pendiente ? 'wait' : 'pointer',
          }}
        >
          Guardar
        </button>
      </div>
      {error && <p style={{ fontSize: 11.5, color: '#B42318', paddingTop: 6 }} data-testid="obra-compra-error">{error}</p>}
      {hecho && (
        <p style={{ fontSize: 11.5, color: C.apagado, paddingTop: 6 }} data-testid="obra-compra-guardada">
          Quedó guardada en el OS y en cola para el Sheet: el worker relee la fila y escribe la celda Obra sólo si sigue siendo la misma compra.
        </p>
      )}
    </div>
  )
}
