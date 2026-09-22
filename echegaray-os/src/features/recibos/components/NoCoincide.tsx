'use client'

// M09 · «NO COINCIDE» — se avisa ANTES de firmar. El texto le llega a Administración en D11/D12
// («Observado · …») y el recibo no se puede firmar hasta que lo emitan de nuevo.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { C, R } from '@/shared/components/movil/tokens'
import { observarReciboAction } from '../acciones'

export function NoCoincide({ recibo }: { recibo: string }) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const boton = {
    height: 48, border: `1px solid ${C.lineaFuerte}`, background: C.surface, borderRadius: R.control,
    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, color: C.inkSuave,
    fontFamily: 'inherit', cursor: 'pointer', width: '100%',
  } as const

  if (!abierto) return <button type="button" style={boton} onClick={() => setAbierto(true)} data-testid="no-coincide">No coincide</button>

  const enviar = async () => {
    setEnviando(true)
    setError(null)
    const r = await observarReciboAction({ recibo, motivo: texto, reemitir: false })
    setEnviando(false)
    if (!r.ok) { setError(r.error); return }
    router.refresh()
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={3} data-testid="no-coincide-texto"
        placeholder="Qué no coincide: horas, días, un adelanto…"
        style={{ border: `1px solid ${C.lineaFuerte}`, borderRadius: R.control, padding: 12, fontSize: 15, fontFamily: 'inherit', resize: 'vertical' }} />
      {error && <div style={{ fontSize: 13, color: C.neg }}>{error}</div>}
      <button type="button" style={{ ...boton, opacity: texto.trim().length >= 3 && !enviando ? 1 : 0.5 }}
        disabled={texto.trim().length < 3 || enviando} onClick={enviar} data-testid="no-coincide-enviar">
        {enviando ? 'Enviando…' : 'Avisar a Administración'}
      </button>
    </div>
  )
}
