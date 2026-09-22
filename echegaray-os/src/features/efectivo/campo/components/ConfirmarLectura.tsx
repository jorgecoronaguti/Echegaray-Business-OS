'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { C } from '@/shared/components/movil/tokens'
import { confirmarLecturaAction, rehacerFotoAction } from '../acciones'
import { Contorno, Pie, Primario } from './Piezas'

// M05 · LOS DOS BOTONES DE «LO QUE LEYÓ, A CONFIRMAR».
//
// «Está bien · enviar» es lo que destraba la escritura en Compras: hasta acá el worker leyó el ticket y
// no escribió nada. «Sacar la foto de nuevo» descarta ESTE ticket y devuelve a la cámara — no deja un
// ticket fantasma esperando a alguien que ya decidió que la foto no servía.
//
// Los dos van en el tercio inferior y miden 56 y 48, como el resto del teléfono.

export function ConfirmarLectura({ ticket, alTerminar, aLaCamara }: {
  ticket: string
  /** Adónde se sigue: el próximo a confirmar, o la lista. */
  alTerminar: string
  aLaCamara: string
}) {
  const router = useRouter()
  const [haciendo, setHaciendo] = useState<'enviar' | 'rehacer' | null>(null)
  const [error, setError] = useState<string | null>(null)

  const correr = async (que: 'enviar' | 'rehacer') => {
    if (haciendo) return
    setHaciendo(que)
    setError(null)
    const r = que === 'enviar' ? await confirmarLecturaAction(ticket) : await rehacerFotoAction(ticket)
    if (!r.ok) { setHaciendo(null); setError(r.error); return }
    router.replace(que === 'enviar' ? alTerminar : aLaCamara)
    router.refresh()
  }

  return (
    <Pie>
      {error && <div data-testid="confirmar-error" style={{ fontSize: 13, color: C.neg, lineHeight: 1.5 }}>{error}</div>}
      <Primario activo={!haciendo} onClick={() => correr('enviar')} testid="confirmar-esta-bien">
        {haciendo === 'enviar' ? 'Enviando…' : 'Está bien · enviar'}
      </Primario>
      <Contorno activo={!haciendo} onClick={() => correr('rehacer')} testid="confirmar-rehacer-foto">
        {haciendo === 'rehacer' ? 'Descartando…' : 'Sacar la foto de nuevo'}
      </Contorno>
    </Pie>
  )
}
