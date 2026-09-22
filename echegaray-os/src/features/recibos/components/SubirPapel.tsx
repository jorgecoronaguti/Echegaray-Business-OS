'use client'

// M11 · SUBIR EL RECIBO DE PAPEL — la foto del papel ya firmado.
//
// ═══ LA FOTO VA DEL NAVEGADOR AL BUCKET, NO POR LA SERVER ACTION ═══
//
// Una foto de celular pesa 3–5 MB y el cuerpo de una Server Action tiene 1 MB de techo (el 500
// «Body exceeded 1 MB limit» de Compras, 25/08). El navegador sube a `recibos/<uid>/recibo/…` con la
// sesión de la persona —la policy del bucket exige esa carpeta— y la acción recibe sólo la ruta. Si la
// base rechaza el renglón, el archivo se borra acá: una foto que nadie apunta es basura en el bucket.
//
// Lo usan el teléfono (la persona) y D12/D13 (Administración, que sube el papel que le trajeron).

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { C, R } from '@/shared/components/movil/tokens'
import { registrarPapelReciboAction } from '../acciones'
import { PAPEL_MAX_BYTES, TIPOS_DEL_PAPEL, rutaDelPapel } from '../logica'

type Paso = { que: 'elegir' } | { que: 'subiendo' } | { que: 'error'; error: string } | { que: 'listo'; mensaje: string }

const kB = (n: number) => `${Math.max(1, Math.round(n / 1024)).toLocaleString('es-AR')} kB`

export function SubirPapel({ recibo, volverA, compacto = false }: { recibo: string; volverA?: string; compacto?: boolean }) {
  const router = useRouter()
  const input = useRef<HTMLInputElement | null>(null)
  const [archivo, setArchivo] = useState<File | null>(null)
  const [vista, setVista] = useState<string | null>(null)
  const [paso, setPaso] = useState<Paso>({ que: 'elegir' })

  const elegir = (f: File | null) => {
    setPaso({ que: 'elegir' })
    if (!f) return
    if (!(TIPOS_DEL_PAPEL as readonly string[]).includes(f.type)) { setPaso({ que: 'error', error: 'Tiene que ser una foto (JPG, PNG, HEIC) o un PDF.' }); return }
    if (f.size > PAPEL_MAX_BYTES) { setPaso({ que: 'error', error: 'La foto no puede pesar más de 10 MB.' }); return }
    setArchivo(f)
    setVista(f.type.startsWith('image/') && f.type !== 'image/heic' && f.type !== 'image/heif' ? URL.createObjectURL(f) : null)
  }

  const enviar = async () => {
    if (!archivo) return
    setPaso({ que: 'subiendo' })
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const ruta = user ? rutaDelPapel(user.id, recibo, archivo.type, Date.now()) : null
    if (!ruta) { setPaso({ que: 'error', error: 'Hace falta volver a entrar.' }); return }
    const { error } = await supabase.storage.from('recibos').upload(ruta, archivo, { contentType: archivo.type, upsert: false })
    if (error) { setPaso({ que: 'error', error: `No se pudo subir: ${error.message}` }); return }
    const r = await registrarPapelReciboAction({ recibo, ruta })
    if (!r.ok) {
      await supabase.storage.from('recibos').remove([ruta])
      setPaso({ que: 'error', error: r.error })
      return
    }
    setPaso({ que: 'listo', mensaje: r.mensaje ?? 'Enviado.' })
    if (volverA) router.replace(volverA)
    router.refresh()
  }

  const subiendo = paso.que === 'subiendo'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, flex: 1, minHeight: 0 }} data-testid="subir-papel">
      <button type="button" onClick={() => input.current?.click()} disabled={subiendo} data-testid="elegir-foto-papel"
        style={{
          flex: 1, minHeight: compacto ? 150 : 260, border: `1.5px dashed ${C.lineaFuerte}`, borderRadius: R.tarjeta,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14,
          background: C.surface, cursor: 'pointer', fontFamily: 'inherit', overflow: 'hidden', padding: 0,
        }}>
        {vista
          // eslint-disable-next-line @next/next/no-img-element -- vista previa local (blob:), no pasa por el optimizador
          ? <img src={vista} alt="La foto elegida" style={{ maxWidth: '100%', maxHeight: compacto ? 150 : 320, objectFit: 'contain' }} />
          : (
            <>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke={C.faint} strokeWidth="1.6" strokeLinecap="round" aria-hidden>
                <rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="12" cy="12" r="3" />
              </svg>
              <span style={{ fontSize: 13.5, color: C.muted, textAlign: 'center', lineHeight: 1.5 }}>
                {archivo ? archivo.name : <>La hoja entera, plana<br />y con la firma visible</>}
              </span>
            </>
          )}
      </button>
      <input ref={input} type="file" accept={TIPOS_DEL_PAPEL.join(',')} capture="environment" hidden
        onChange={(e) => elegir(e.target.files?.[0] ?? null)} data-testid="input-foto-papel" />

      {archivo && (
        <div style={{ background: C.surface, border: `1px solid ${C.linea}`, borderRadius: R.tarjeta, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10.5, letterSpacing: '.06em', color: C.faint, textTransform: 'uppercase' }}>
            {subiendo ? 'Subiendo' : paso.que === 'listo' ? 'Enviado' : 'Lista para enviar'}
          </div>
          <div style={{ height: 10, background: C.pista, borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ width: subiendo ? '62%' : paso.que === 'listo' ? '100%' : '0%', height: '100%', background: C.grafito, transition: 'width 1.2s ease' }} />
          </div>
          <div style={{ fontSize: 12.5, color: C.muted }}>1 de 1 · {kB(archivo.size)}</div>
        </div>
      )}
      {paso.que === 'error' && <div data-testid="papel-error" style={{ fontSize: 13, color: C.neg, lineHeight: 1.5 }}>{paso.error}</div>}
      {paso.que === 'listo' && <div data-testid="papel-listo" style={{ fontSize: 13, color: C.pos, lineHeight: 1.5 }}>{paso.mensaje}</div>}

      <button type="button" onClick={enviar} disabled={!archivo || subiendo || paso.que === 'listo'} data-testid="enviar-papel"
        style={{
          height: 56, borderRadius: R.control, border: 0, fontSize: 16, fontWeight: 600, fontFamily: 'inherit',
          background: archivo && !subiendo && paso.que !== 'listo' ? C.marca : C.inerte,
          color: archivo && !subiendo && paso.que !== 'listo' ? C.ink : C.faint,
          cursor: archivo && !subiendo ? 'pointer' : 'default',
        }}>
        {subiendo ? 'Enviando…' : 'Enviar'}
      </button>
    </div>
  )
}
