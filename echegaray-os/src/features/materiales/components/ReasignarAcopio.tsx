'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Boton, CAMPO } from '@/shared/components/ds'
import { leerCantidad } from '../logica/stock'
import { reasignarAcopioAction } from '../services/stockAcciones'

// CAMBIAR EL DESTINO DE UN ACOPIO — pasarlo a otra obra o liberarlo (dueño, 30/09/2026).
//
// El material sigue en el Taller: sólo cambia para qué obra está guardado. Es una decisión con efecto en
// quién cuenta con ese material, así que pide la cantidad y el destino de forma explícita y la base deja
// quién y cuándo. Reasignar NO se hace solo nunca: por eso hay un botón, no un arrastre ni un automático.
// Sirve igual para el acopio de una obra (de = obra) que para «asignar» lo libre (de = null, se pasa a una obra).

export function ReasignarAcopio({ material, lugar, de, maximo, rotuloMaterial, obras, cara = 'escritorio', alCerrar }: {
  material: string
  lugar: string
  /** Obra del acopio de origen; `null` = lo libre (asignarlo a una obra). */
  de: string | null
  maximo: number
  rotuloMaterial: string
  obras: Array<{ id: string; rotulo: string }>
  cara?: 'escritorio' | 'telefono'
  alCerrar: () => void
}) {
  const router = useRouter()
  const [para, setPara] = useState('')
  const [texto, setTexto] = useState(String(maximo))
  const [nota, setNota] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pendiente, startTransition] = useTransition()
  const opciones = obras.filter((o) => o.id !== de)
  const tel = cara === 'telefono'

  const confirmar = () => {
    const n = leerCantidad(texto)
    if (n == null) return setError('Poné cuánto pasa a otro destino')
    if (n > maximo) return setError(`No hay tanto: son ${maximo}`)
    if (de == null && !para) return setError('Elegí la obra para la que lo guardás')
    setError(null)
    startTransition(async () => {
      const r = await reasignarAcopioAction({ material, lugar, de, para: para || null, cantidad: n, nota })
      if (r.error) return setError(r.error)
      alCerrar()
      router.refresh()
    })
  }

  return (
    <div className="flex flex-wrap items-center gap-2 pb-1 pt-1" data-testid="reasignar-form">
      <input inputMode="decimal" autoFocus aria-label={`Cuánto de ${rotuloMaterial} cambia de destino`} value={texto}
        onChange={(e) => setTexto(e.target.value)} className={`${CAMPO} !w-[88px] text-right font-mono`} data-testid="reasignar-cantidad" />
      <select aria-label="Nuevo destino" value={para} onChange={(e) => setPara(e.target.value)} className={`${CAMPO} !w-auto max-w-full`} data-testid="reasignar-para">
        {de != null && <option value="">Liberar: queda libre</option>}
        {de == null && <option value="">Elegí la obra</option>}
        {opciones.map((o) => <option key={o.id} value={o.id}>Para {o.rotulo}</option>)}
      </select>
      <input value={nota} maxLength={400} onChange={(e) => setNota(e.target.value)} placeholder="Motivo (opcional)"
        aria-label="Motivo del cambio" className={`${CAMPO} !w-[180px]`} data-testid="reasignar-nota" />
      <Boton type="button" variante="primaria" onClick={confirmar} disabled={pendiente} data-testid="reasignar-confirmar">{pendiente ? 'Guardando…' : 'Confirmar'}</Boton>
      <button type="button" onClick={alCerrar} disabled={pendiente}
        className={`${tel ? 'min-h-[44px] px-3 text-[14px]' : 'min-h-[28px] px-1.5 text-[12px]'} inline-flex items-center text-muted`}>No</button>
      {error && <span role="alert" className="w-full text-[11.5px] text-neg" data-testid="reasignar-error">{error}</span>}
    </div>
  )
}
