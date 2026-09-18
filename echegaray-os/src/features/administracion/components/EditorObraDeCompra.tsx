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
//
// ═══ CMD/CTRL+Z Y CMD/CTRL+SHIFT+Z (dueño, 17/09/2026) ═══
//
// El guardado pasa por `useGuardadoDeshacible` —la misma pila que `InlineEdit` y que la fila
// (`ObraEnLinea`)—, y deshacer vuelve a llamar a la acción con `esperado`, así no pisa a nadie. Lo que
// NO se deshace es la escritura ya encolada del Sheet: se encola otra con la obra anterior.

import { useEffect, useRef, useState, useTransition } from 'react'
import { useEstadoDelServidor } from '@/shared/tiempo-real/useEstadoDelServidor'
import { useCeldaViva, useGuardadoDeshacible } from '@/shared/components/deshacer/DeshacerProvider'
import { C } from '@/shared/components/canon'
import { asignarObraDeCompra } from '../services/obraDeCompraActions'
import { type EstadoEnSheet, leyendaDeSheet, type Tono } from '../services/pagoDeCompra'

// ═══ LA LEYENDA DEL VIAJE AL SHEET (18/09/2026) ═══
//
// El worker existe desde el 15/09 y relee, escribe y relee. Lo que faltaba era que la pantalla lo
// dijera: «pendiente de Sheet», «✓ en Sheet» o el motivo por el que el Sheet no aceptó el cambio
// (alguien tocó la celda mientras tanto, la fila ya era otra compra). Sin eso, un rechazo se veía
// como una obra que desaparecía sola en el sync siguiente. Es la MISMA leyenda que la del pago.
const TONO: Record<string, string> = { ok: '#1F7A3F', falta: '#B42318', apagado: C.apagado }
const color = (t: Tono) => TONO[String(t)] ?? C.tinta

export function EditorObraDeCompra({
  fila, celda, opciones, editable, enSheet = 'sin_pedido', motivo = null,
}: {
  /** En qué punto del viaje al Sheet está la última obra pedida desde la app (leído de la cola). */
  enSheet?: EstadoEnSheet
  motivo?: string | null
  fila: number
  celda: string | null
  opciones: string[]
  editable: boolean
}) {
  // La obra la puede cambiar otro usuario: se adopta al releer (tiempo real, 16/09/2026).
  const [valor, setValor] = useEstadoDelServidor(celda ?? '')
  const [error, setError] = useState<string | null>(null)
  const [hecho, setHecho] = useState(false)
  const [pendiente, empezar] = useTransition()
  // LO QUE LA BASE TIENE HOY según este panel: el `esperado` de la próxima escritura, y el valor al que
  // vuelve un Cmd+Z.
  const [enBase, setEnBase] = useState(celda ?? '')
  const enBaseRef = useRef(enBase)
  const valorRef = useRef(valor)
  useEffect(() => { enBaseRef.current = enBase; valorRef.current = valor })
  const clave = `obra-de-la-compra-${fila}`
  // Lo que la cola dice del último pedido de esta fila. `null` = nadie la tocó desde la app.
  const leyenda = leyendaDeSheet(enSheet, motivo)

  async function escribir(nuevo: string, esperado?: string): Promise<{ ok: true } | { ok: false; error: string }> {
    const r = await asignarObraDeCompra(fila, nuevo, esperado ?? enBaseRef.current)
    if (!r.ok) return { ok: false, error: r.error }
    setEnBase(nuevo)
    return { ok: true }
  }

  const guardarDeshacible = useGuardadoDeshacible({
    clave,
    rotulo: `Obra de la fila ${fila}`,
    valorAnterior: enBase,
    guardar: (v, contexto) => escribir(v, contexto?.esperado),
    formato: (v) => (v === '' ? 'sin elegir' : v),
  })

  useCeldaViva(clave, { actual: () => valorRef.current, aplicar: (v) => setValor(v) })

  // TODOS LOS HOOKS ANTES DE ESTE CORTE: React los cuenta por orden, y un `return` en el medio
  // cambiaría ese orden entre un render y el siguiente.
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
      const r = await guardarDeshacible(valor)
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
          disabled={pendiente || valor === enBase}
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
      {leyenda && !hecho && (
        <p aria-live="polite" style={{ fontSize: 11, color: color(leyenda.tono), paddingTop: 6 }} data-testid="obra-en-sheet">
          {leyenda.texto}
        </p>
      )}
    </div>
  )
}
