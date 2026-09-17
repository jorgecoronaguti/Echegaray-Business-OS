'use client'

// «QUÉ HACER» EN EL PANEL DE LA DEUDA — la nota del Sheet, editable sin salir del proveedor.
//
// Va arriba del detalle porque es la instrucción («pagar con cheque a 15», «no es prioridad») que se lee
// ANTES de mirar las líneas. Se edita en el panel y no en la fila de la tabla: la fila es un enlace
// entero y un campo adentro competiría con el clic que abre el detalle.
//
// Guardar NO cambia la nota al instante: la pide al Sheet. Mientras el worker no la escribió se ve
// «esperando al Sheet»; si el dueño la cambió allá en el medio, gana el Sheet y se muestra qué dice.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Boton, CAMPO } from '@/shared/components/ds'
import { V } from '@/shared/components/v2/patron'
import { pedirNotaProveedor } from '../../services/notaProveedorActions'
import type { NotaDeProveedor } from '../../services/notasDeDeuda'

export function NotaQueHacer({ nota }: { nota: NotaDeProveedor }) {
  const router = useRouter()
  const [texto, setTexto] = useState(nota.pendiente ?? nota.nota)
  const [error, setError] = useState<string | null>(null)
  const [enviando, iniciar] = useTransition()
  const cambio = texto.trim() !== (nota.pendiente ?? nota.nota)

  const guardar = () => iniciar(async () => {
    setError(null)
    const r = await pedirNotaProveedor({ proveedor: nota.proveedorSheet, nota: texto, anterior: nota.nota })
    if (!r.ok) {
      setError(r.error)
      if (r.actual !== undefined) setTexto(r.actual)
      return
    }
    router.refresh()
  })

  return (
    <div data-testid="nota-que-hacer" style={{ marginBottom: 16 }}>
      <label htmlFor="nota-que-hacer" style={{ display: 'block', fontSize: '10px', letterSpacing: '.06em', textTransform: 'uppercase', color: V.tenue, marginBottom: 4 }}>
        Qué hacer
      </label>
      <textarea
        id="nota-que-hacer"
        data-testid="nota-que-hacer-campo"
        value={texto}
        maxLength={500}
        rows={2}
        disabled={enviando || nota.pendiente !== null}
        onChange={(e) => setTexto(e.target.value)}
        placeholder="Sin nota"
        className={`${CAMPO} h-auto py-2 leading-[18px]`}
        style={{ resize: 'vertical' }}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, minHeight: 32 }}>
        {nota.pendiente !== null
          ? <span data-testid="nota-pendiente" style={{ fontSize: '11.5px', color: V.apagado }}>Esperando que el Sheet la confirme</span>
          : (
              <Boton variante="primaria" type="button" onClick={guardar} disabled={!cambio || enviando} data-testid="nota-guardar">
                {enviando ? 'Enviando…' : 'Guardar'}
              </Boton>
            )}
        <span style={{ fontSize: '11px', color: V.tenue }}>{`En el Sheet: ${nota.proveedorSheet}`}</span>
      </div>
      {(error ?? nota.rechazo) && (
        <p data-testid="nota-conflicto" style={{ fontSize: '11.5px', color: V.warn, marginTop: 4 }}>
          {error ?? nota.rechazo}
        </p>
      )}
    </div>
  )
}
