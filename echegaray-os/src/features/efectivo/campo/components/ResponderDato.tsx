'use client'

import { useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { C, R } from '@/shared/components/movil/tokens'
import { responderObservacionAction } from '../acciones'
import { Caja, Contorno, Pie, Primario, Rotulo } from './Piezas'

// M07 · EL DATO QUE FALTA — el campo, «Enviar el dato» y «No tengo el ticket».
//
// «No tengo el ticket» no descarta nada: descartar es de Administración
// (`descartar_comprobante_rendicion`). Lo que hace es CONTESTAR eso mismo, con la misma función que
// contesta el dato: quien pidió lo lee y decide. Un botón que prometiera borrar el gasto sería un
// botón que la base rechaza.

const SIN_TICKET = 'No tengo el ticket.'

export function ResponderDato({ ticket, volverA, children }: { ticket: string; volverA: string; children?: ReactNode }) {
  const router = useRouter()
  const [dato, setDato] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const mandar = async (texto: string) => {
    setEnviando(true)
    setError(null)
    const r = await responderObservacionAction({ ticket, dato: texto })
    if (!r.ok) { setEnviando(false); setError(r.error); return }
    router.replace(volverA)
    router.refresh()
  }

  return (
    <>
      <Caja gap={9} relleno="14px 16px">
        <Rotulo>El dato que falta</Rotulo>
        <input
          value={dato}
          onChange={(e) => setDato(e.target.value)}
          placeholder="escribilo como figura en el ticket"
          maxLength={300}
          data-testid="dato-observado"
          style={{
            height: 48, border: `1px solid ${C.grafito}`, borderRadius: R.control, padding: '0 13px', fontSize: 15,
            color: C.ink, background: C.surface, fontFamily: 'inherit', outline: 'none',
          }}
        />
        {children}
      </Caja>
      {error && <div data-testid="dato-error" style={{ fontSize: 13, color: C.neg, lineHeight: 1.5 }}>{error}</div>}
      <Pie>
        <Primario activo={!!dato.trim() && !enviando} onClick={() => mandar(dato)} testid="dato-enviar">
          {enviando ? 'Enviando…' : 'Enviar el dato'}
        </Primario>
        <Contorno activo={!enviando} onClick={() => mandar(SIN_TICKET)} testid="dato-sin-ticket">No tengo el ticket</Contorno>
      </Pie>
    </>
  )
}
