'use client'

// «FIRMÓ EN PAPEL» — lo que hace Administración cuando la persona firmó el recibo en la mano, no en el teléfono.
//
// Dueño, 30/09/2026: «¿qué pasa cuando ya se firma de manera personal, no virtual?». Dos caminos y un solo
// resultado (`firmado_papel`): sacar/subir la foto del papel, o marcar sin foto («el papel queda archivado en
// la oficina»). El segundo deja anotado quién lo marcó y cuándo, porque sin foto es la palabra de quien
// marca y eso tiene que poder verse en el legajo.
//
// La foto NO pasa por la Server Action (techo de 1 MB; una foto de celular pesa hasta 5): la sube el
// navegador al bucket y después se anota, el mismo orden que usa el teléfono de la persona. `capture` abre la
// cámara trasera en el celular; en la PC abre el selector de archivos.

import { useState, useTransition } from 'react'
import { V } from '@/shared/components/v2/patron'
import { marcarReciboFirmadoEnPapel, subirPapelDelReciboFirmado } from '../services/cicloDelReciboActions'

const ACEPTADOS = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf']
const TECHO_BYTES = 10 * 1024 * 1024

// 44 px de alto: es un toque de pulgar en el teléfono, y en la PC no estorba.
const BOTON = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minHeight: 44, padding: '0 16px',
  borderRadius: 6, fontSize: '13px', cursor: 'pointer', border: `1px solid ${V.lineaFuerte}`,
  background: '#FFFFFF', color: V.tinta, fontWeight: 600,
} as const

export function FirmoEnPapel({ reciboId, alTerminar }: {
  reciboId: string
  alTerminar: (r: { ok: boolean; texto: string }) => void
}) {
  const [abierto, setAbierto] = useState(false)
  const [subiendo, setSubiendo] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pendiente, empezar] = useTransition()
  const ocupado = subiendo || pendiente

  const sinFoto = () => {
    setError(null)
    empezar(async () => {
      const r = await marcarReciboFirmadoEnPapel(reciboId)
      if (!r.ok) { setError(r.error); return }
      setAbierto(false)
      alTerminar({ ok: true, texto: r.mensaje ?? 'Listo.' })
    })
  }

  const conFoto = async (f: File | null) => {
    if (!f) return
    setError(null)
    // HEIC llega con `type` vacío desde algunos iPhone: se acepta por extensión.
    const tipo = f.type || (/\.hei[cf]$/i.test(f.name) ? 'image/heic' : '')
    if (!ACEPTADOS.includes(tipo)) { setError('Mandá una foto (JPG, PNG o HEIC) o un PDF.'); return }
    if (f.size > TECHO_BYTES) { setError('La foto pesa más de 10 MB: sacala de nuevo con menos calidad.'); return }
    setSubiendo(true)
    try {
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setError('Tu sesión venció. Volvé a entrar y probá otra vez.'); return }
      const ext = tipo === 'application/pdf' ? 'pdf' : tipo.split('/')[1]?.replace('jpeg', 'jpg') ?? 'jpg'
      const ruta = `${user.id}/recibo/${reciboId}-${Date.now()}.${ext}`
      const { error: falla } = await supabase.storage.from('comprobantes').upload(ruta, f, { contentType: tipo, upsert: false })
      if (falla) { setError(`No se pudo subir la foto: ${falla.message}`); return }
      const r = await subirPapelDelReciboFirmado({ recibo: reciboId, ruta })
      if (!r.ok) { setError(r.error); return }
      setAbierto(false)
      alTerminar({ ok: true, texto: r.mensaje ?? 'Listo.' })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo subir la foto.')
    } finally {
      setSubiendo(false)
    }
  }

  if (!abierto) {
    return (
      <button type="button" data-testid="recibo-firmo-en-papel" onClick={() => setAbierto(true)}
        style={{ border: 0, background: 'none', padding: 0, fontSize: '11.5px', color: V.tinta, textDecoration: 'underline', cursor: 'pointer' }}>
        Firmó en papel
      </button>
    )
  }
  return (
    <span data-testid="recibo-firmo-en-papel-opciones" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, width: '100%' }}>
      <label style={{ ...BOTON, opacity: ocupado ? 0.5 : 1 }}>
        {subiendo ? 'Subiendo…' : 'Sacar o subir foto del papel'}
        <input type="file" accept="image/*,application/pdf" capture="environment" disabled={ocupado}
          data-testid="recibo-papel-foto" style={{ display: 'none' }}
          onChange={(e) => { void conFoto(e.target.files?.[0] ?? null); e.target.value = '' }} />
      </label>
      <button type="button" data-testid="recibo-papel-sin-foto" disabled={ocupado} onClick={sinFoto}
        style={{ ...BOTON, opacity: ocupado ? 0.5 : 1 }}>
        Marcar sin foto
      </button>
      <button type="button" disabled={ocupado} onClick={() => { setAbierto(false); setError(null) }}
        style={{ border: 0, background: 'none', minHeight: 44, padding: '0 8px', fontSize: '12px', color: V.apagado, cursor: 'pointer' }}>
        Cancelar
      </button>
      <span style={{ width: '100%', fontSize: '11.5px', color: V.apagado }}>
        Sin foto: el papel queda archivado en la oficina y queda anotado quién lo marcó.
      </span>
      {error && <span data-testid="recibo-papel-error" style={{ width: '100%', fontSize: '11.5px', color: V.warn }}>{error}</span>}
    </span>
  )
}
