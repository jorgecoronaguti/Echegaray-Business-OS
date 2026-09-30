'use client'

// «perdido 24/09» ES UN BOTÓN (dueño, 30/09/2026): vuelve a considerar el presentismo a esa persona.
//
// Un paso de confirmación liviano —el motivo es opcional—, porque devuelve plata (0425 en el blanco) y no es
// un clic que deba salir de un roce. Después la celda dice «restituido · quién» con la salida de deshacer.
// Lo que se restituye lo decide el servidor (`restituirPresentismo`): acá no viaja ninguna fecha.
//
// Quien no puede editar (quincena cerrada) ve el texto plano: el botón no existe donde la base diría que no.

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { V } from '@/shared/components/v2/patron'
import { fechasCortas, type RestitucionDePresentismo } from '../../../services/presentismo'
import { deshacerRestitucion, restituirPresentismo } from '../../../services/presentismoRestitucionActions'

const BOTON = {
  border: `1px solid ${V.warn}`, borderRadius: 6, background: 'transparent', color: V.warn,
  fontSize: 12, fontWeight: 500, padding: '2px 8px', cursor: 'pointer', whiteSpace: 'nowrap',
} as const

/** El objetivo táctil de 44 px sólo en pantallas táctiles: el primer dibujo es igual en servidor y navegador. */
function useTactil(): boolean {
  const [t, setT] = useState(false)
  useEffect(() => { setT(window.matchMedia('(pointer: coarse)').matches) }, [])
  return t
}

export interface VentanaRestitucion { personaId: string; nombre: string; desde: string; hasta: string }

export function BotonRestituir({ v, perdido, titulo, testid }: {
  v: VentanaRestitucion; perdido: readonly string[]; titulo: string; testid: string
}) {
  const [abierto, setAbierto] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [enCurso, empezar] = useTransition()
  const router = useRouter()
  const alto = useTactil() ? 44 : undefined
  const confirmar = () => empezar(async () => {
    const r = await restituirPresentismo({ persona_id: v.personaId, desde: v.desde, hasta: v.hasta, motivo: motivo.trim() || undefined })
    if (!r.ok) { setError(r.error); return }
    setAbierto(false); setError(null); router.refresh()
  })
  return (
    <div style={{ position: 'relative', textAlign: 'right' }}>
      <button type="button" data-testid={`${testid}-restituir`} data-presentismo="perdido" title={titulo}
        aria-label={`Restituir el presentismo a ${v.nombre}`} onClick={() => setAbierto(true)}
        style={{ ...BOTON, minHeight: alto }}>
        perdido {fechasCortas(perdido)}
      </button>
      {abierto && (
        <div role="dialog" aria-label={`Restituir presentismo a ${v.nombre}`} data-testid={`${testid}-confirmar`}
          style={{ position: 'absolute', right: 0, top: '100%', zIndex: 20, width: 260, padding: 10, textAlign: 'left',
            background: '#fff', border: `1px solid ${V.lineaFuerte}`, borderRadius: 8, boxShadow: '0 4px 14px rgba(0,0,0,.12)' }}>
          <div style={{ fontSize: 12, color: V.tinta, marginBottom: 6 }}>
            ¿Restituir el presentismo a {v.nombre}? Se perdona {fechasCortas(perdido)} y cobra el 0425 en el blanco.
          </div>
          <input value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={300} placeholder="Motivo (opcional)"
            aria-label="Motivo de la restitución"
            style={{ width: '100%', boxSizing: 'border-box', fontSize: 12, padding: '4px 6px', border: `1px solid ${V.lineaFuerte}`, borderRadius: 4 }} />
          {error && <div role="alert" style={{ fontSize: 11, color: V.neg, marginTop: 4 }}>{error}</div>}
          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', marginTop: 8 }}>
            <button type="button" onClick={() => { setAbierto(false); setError(null) }} disabled={enCurso}
              style={{ ...BOTON, minHeight: alto, borderColor: V.lineaFuerte, color: V.apagado }}>Cancelar</button>
            <button type="button" data-testid={`${testid}-confirmar-si`} onClick={confirmar} disabled={enCurso}
              style={{ ...BOTON, minHeight: alto, background: V.marca, borderColor: V.marca, color: V.tinta }}>
              {enCurso ? 'Restituyendo…' : 'Restituir'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/** «restituido · Jorge» + deshacer. Sólo lectura (sin `v`) cuando la quincena no se edita. */
export function MarcaDeRestituido({ r, v, cuenta, testid }: {
  r: RestitucionDePresentismo; v: VentanaRestitucion | null; cuenta: string; testid: string
}) {
  const [error, setError] = useState<string | null>(null)
  const [enCurso, empezar] = useTransition()
  const router = useRouter()
  const alto = useTactil() ? 44 : undefined
  const deshacer = () => empezar(async () => {
    if (!v) return
    const res = await deshacerRestitucion({ persona_id: v.personaId, desde: v.desde, hasta: v.hasta })
    if (!res.ok) { setError(res.error); return }
    setError(null); router.refresh()
  })
  const detalle = `Restituido por ${r.por} el ${r.en.slice(0, 10)} (perdonó ${fechasCortas(r.fechas)})${r.motivo ? ` · ${r.motivo}` : ''}`
  return (
    <div data-testid={testid} data-presentismo="restituido" title={`${cuenta}. ${detalle}`}
      style={{ textAlign: 'right', fontSize: 11, lineHeight: '13px', color: V.pos }}>
      <div style={{ whiteSpace: 'nowrap' }}>restituido · {r.por}</div>
      {v && (
        <button type="button" data-testid={`${testid}-deshacer`} onClick={deshacer} disabled={enCurso}
          style={{ background: 'none', border: 0, padding: 0, minHeight: alto, color: V.apagado, textDecoration: 'underline', fontSize: 11, cursor: 'pointer' }}>
          {enCurso ? 'deshaciendo…' : 'deshacer'}
        </button>
      )}
      {error && <div role="alert" style={{ color: V.neg }}>{error}</div>}
    </div>
  )
}
