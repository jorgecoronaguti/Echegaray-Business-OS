'use client'

// M09 · M10 · M11 — EL RECIBO DE LA QUINCENA EN EL TELÉFONO: leerlo, firmarlo con el dedo, o subir el papel.
//
// Hasta hoy esto no existía: la empresa emitía el recibo, imprimía el papel y la persona no veía nada en su
// teléfono. De la conformidad no quedaba ningún rastro digital.
//
// LAS DOS FORMAS DE FIRMA CONVIVEN (dueño, 22/09): el trazo con el dedo y la foto del papel firmado. No se
// elige una — quien firma en papel sube la foto, y quien firma con el dedo no lleva ningún papel.
//
// EL LIENZO ES EL MISMO QUE LA CONFORMIDAD DEL EFECTIVO (`shared/firma/firma.ts`): un `<canvas>` con pointer
// events, y lo que viaja es un SVG de un path — no una imagen del canvas, que pesaría diez veces más y
// dependería de la densidad de la pantalla.

import { useCallback, useEffect, useRef, useState, type PointerEvent as EventoPuntero } from 'react'
import { useRouter } from 'next/navigation'
import { C, R } from '@/shared/components/movil/tokens'
import { BotonAncho, Tarjeta } from '@/shared/components/movil/Piezas'
import { firmaValida, svgDeFirma, type Trazo } from '@/shared/firma/firma'
import { dondeSeFirmo, trazoDibujable } from '@/shared/recibo/ciclo'
import type { MiReciboDeQuincena } from '../services/miReciboDeQuincena'
import {
  firmarMiReciboAction, observarMiReciboAction, subirPapelDeMiReciboAction,
} from '../services/miReciboActions'

const MONO = "'IBM Plex Mono', monospace"

/** El botón secundario del teléfono: alto 48, contorno, para «No coincide» y «Rehacer». */
function Contorno({ children, onClick, activo = true, testid }: {
  children: React.ReactNode; onClick?: () => void; activo?: boolean; testid?: string
}) {
  return (
    <button type="button" onClick={onClick} disabled={!activo} data-testid={testid}
      style={{
        width: '100%', minHeight: 48, borderRadius: R.control, background: C.surface,
        border: `1px solid ${C.lineaFuerte}`, color: activo ? C.inkSuave : C.faint,
        fontSize: 15, cursor: activo ? 'pointer' : 'not-allowed',
      }}>
      {children}
    </button>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// M09 · «Estoy de acuerdo · firmar» y «No coincide»
// ═══════════════════════════════════════════════════════════════════════════════════════════════

export function AccionesDeMiRecibo({ recibo }: { recibo: MiReciboDeQuincena }) {
  const router = useRouter()
  const [reclamando, setReclamando] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  const reclamar = async () => {
    setEnviando(true)
    setError(null)
    const r = await observarMiReciboAction({ recibo: recibo.id, motivo })
    setEnviando(false)
    if (!r.ok) { setError(r.error); return }
    setReclamando(false)
    router.refresh()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {error && <div data-testid="mi-recibo-error" style={{ fontSize: 13, color: C.neg, lineHeight: 1.5 }}>{error}</div>}
      {reclamando ? (
        <>
          <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3}
            data-testid="mi-recibo-motivo" placeholder="¿Qué no coincide con lo que trabajaste?"
            style={{
              width: '100%', borderRadius: R.control, border: `1px solid ${C.lineaFuerte}`,
              padding: 12, fontSize: 15, color: C.ink, background: C.surface, resize: 'none',
            }} />
          <BotonAncho tipo="button" testid="mi-recibo-reclamar" activo={!!motivo.trim() && !enviando} onClick={reclamar}>
            {enviando ? 'Enviando…' : 'Avisar que no coincide'}
          </BotonAncho>
          <Contorno onClick={() => setReclamando(false)} activo={!enviando} testid="mi-recibo-cancelar">Volver</Contorno>
        </>
      ) : (
        <>
          <BotonAncho tipo="button" alto={56} testid="mi-recibo-firmar"
            onClick={() => router.push(`/mi-informacion/recibos/firmar?recibo=${recibo.id}`)}>
            Estoy de acuerdo · firmar
          </BotonAncho>
          <Contorno onClick={() => setReclamando(true)} testid="mi-recibo-no-coincide">No coincide</Contorno>
          {/* M11 · PARA QUIEN FIRMA EN PAPEL. No es la opción por defecto, pero existe y se llega desde acá. */}
          <button type="button" data-testid="mi-recibo-papel"
            onClick={() => router.push(`/mi-informacion/recibos/papel?recibo=${recibo.id}`)}
            style={{ border: 0, background: 'none', padding: '6px 0', fontSize: 13, color: C.muted, textDecoration: 'underline', cursor: 'pointer' }}>
            Ya lo firmé en papel: subir la foto
          </button>
        </>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// M10 · FIRMADO — el comprobante de que firmó, con su trazo y su sello de tiempo
// ═══════════════════════════════════════════════════════════════════════════════════════════════

export function MiReciboFirmado({ recibo }: { recibo: MiReciboDeQuincena }) {
  const firma = trazoDibujable(recibo.trazo)
  const donde = dondeSeFirmo(recibo)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Tarjeta fondo={C.posFondo} borde={C.posBorde} relleno={18} testid="mi-recibo-firmado">
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: C.pos }} />
          <div style={{ fontSize: 15, fontWeight: 600, color: C.pos }}>
            {recibo.estado === 'archivado' ? 'Firmado y archivado' : 'Firmado'}
          </div>
        </div>
        <div style={{ fontSize: 13.5, color: C.inkSuave, lineHeight: 1.5, marginTop: 10 }}>
          {[recibo.codigo, `quincena ${recibo.quincenaDesde.slice(8, 10)}–${recibo.quincenaHasta.slice(8, 10)}/${recibo.quincenaHasta.slice(5, 7)}`]
            .filter(Boolean).join(' · ')}
        </div>
        {donde && <div style={{ fontSize: 12.5, color: C.muted, marginTop: 4 }}>{donde}</div>}
        {recibo.papelSubidoEn && (
          <div style={{ fontSize: 12.5, color: C.muted, marginTop: 4 }}>También subiste la foto del papel firmado.</div>
        )}
      </Tarjeta>

      {firma && (
        <Tarjeta relleno={18} testid="mi-recibo-trazo">
          <div style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: '.06em', color: C.faint, textTransform: 'uppercase' }}>
            Tu firma
          </div>
          <div style={{ height: 96, background: C.quiet, border: `1px solid ${C.divisorSuave}`, borderRadius: R.control, display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 12 }}>
            {/* EL SVG NO SE INYECTA: se dibuja el `path` que `trazoDibujable` saca del texto guardado. */}
            <svg viewBox={`0 0 ${firma.ancho} ${firma.alto}`} width={220} height={Math.round(220 * firma.alto / firma.ancho)}
              fill="none" stroke={C.ink} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round"
              role="img" aria-label="Tu firma" style={{ display: 'block' }}>
              <path d={firma.d} />
            </svg>
          </div>
        </Tarjeta>
      )}

      <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.5 }}>
        El firmado queda en tu legajo y ya lo tiene Administración. No hace falta llevar el papel.
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// M10 · EL LIENZO
// ═══════════════════════════════════════════════════════════════════════════════════════════════

export function FirmarMiRecibo({ recibo, volverA }: { recibo: string; volverA: string }) {
  const router = useRouter()
  const lienzo = useRef<HTMLCanvasElement | null>(null)
  const trazos = useRef<Trazo[]>([])
  const dibujando = useRef(false)
  const [valida, setValida] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // El canvas se dimensiona a su caja real × densidad: si no, la firma sale borrosa y corrida del dedo.
  const ajustar = useCallback(() => {
    const c = lienzo.current
    if (!c) return
    const caja = c.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    c.width = Math.round(caja.width * dpr)
    c.height = Math.round(caja.height * dpr)
    const ctx = c.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.lineWidth = 2.4
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = C.ink
    for (const t of trazos.current) {
      if (!t.length) continue
      ctx.beginPath()
      ctx.moveTo(t[0].x, t[0].y)
      for (const p of t.slice(1)) ctx.lineTo(p.x, p.y)
      ctx.stroke()
    }
  }, [])

  useEffect(() => {
    ajustar()
    window.addEventListener('resize', ajustar)
    return () => window.removeEventListener('resize', ajustar)
  }, [ajustar])

  const punto = (e: EventoPuntero<HTMLCanvasElement>) => {
    const caja = e.currentTarget.getBoundingClientRect()
    return {
      x: Math.max(0, Math.min(caja.width, e.clientX - caja.left)),
      y: Math.max(0, Math.min(caja.height, e.clientY - caja.top)),
    }
  }

  const empezar = (e: EventoPuntero<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    dibujando.current = true
    trazos.current.push([punto(e)])
  }

  const mover = (e: EventoPuntero<HTMLCanvasElement>) => {
    if (!dibujando.current) return
    const actual = trazos.current[trazos.current.length - 1]
    const p = punto(e)
    const previo = actual[actual.length - 1]
    actual.push(p)
    const ctx = e.currentTarget.getContext('2d')
    if (!ctx) return
    ctx.beginPath()
    ctx.moveTo(previo.x, previo.y)
    ctx.lineTo(p.x, p.y)
    ctx.stroke()
  }

  const terminar = () => {
    dibujando.current = false
    setValida(firmaValida(trazos.current))
  }

  const rehacer = () => {
    trazos.current = []
    setValida(false)
    setError(null)
    const c = lienzo.current
    c?.getContext('2d')?.clearRect(0, 0, c.width, c.height)
  }

  const confirmar = async () => {
    const c = lienzo.current
    if (!c) return
    const caja = c.getBoundingClientRect()
    const svg = svgDeFirma(trazos.current, caja.width, caja.height)
    if (!svg) { setError('Firmá arriba de la línea: el trazo es muy corto.'); return }
    setEnviando(true)
    setError(null)
    const r = await firmarMiReciboAction({ recibo, trazo: svg })
    if (!r.ok) { setEnviando(false); setError(r.error); return }
    router.replace(volverA)
    router.refresh()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{
        minHeight: 300, background: C.surface, border: `1px solid ${C.lineaFuerte}`, borderRadius: R.tarjeta,
        position: 'relative', overflow: 'hidden',
      }}>
        <canvas ref={lienzo} data-testid="lienzo-firma-recibo" aria-label="Recuadro para firmar con el dedo"
          onPointerDown={empezar} onPointerMove={mover} onPointerUp={terminar} onPointerCancel={terminar}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', touchAction: 'none', cursor: 'crosshair' }} />
        <div style={{ position: 'absolute', bottom: 18, left: 24, right: 24, borderBottom: `1px solid ${C.linea}`, pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: 22, left: 0, right: 0, textAlign: 'center', fontSize: 11.5, color: C.faint, pointerEvents: 'none' }}>
          firmá arriba de la línea
        </div>
      </div>
      {error && <div data-testid="firma-recibo-error" style={{ fontSize: 13, color: C.neg, lineHeight: 1.5 }}>{error}</div>}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <div style={{ flex: 1 }}><Contorno onClick={rehacer} activo={!enviando} testid="firma-recibo-rehacer">Rehacer</Contorno></div>
        <div style={{ flex: 1.4 }}>
          <BotonAncho tipo="button" alto={52} activo={valida && !enviando} onClick={confirmar} testid="firma-recibo-confirmar">
            {enviando ? 'Guardando…' : 'Confirmar'}
          </BotonAncho>
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// M11 · SUBIR EL RECIBO DE PAPEL
// ═══════════════════════════════════════════════════════════════════════════════════════════════

const ACEPTADOS = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf']
const TECHO_BYTES = 10 * 1024 * 1024

export function SubirPapelDelRecibo({ recibo, volverA }: { recibo: string; volverA: string }) {
  const router = useRouter()
  const [archivo, setArchivo] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [subiendo, setSubiendo] = useState(false)

  const elegir = (f: File | null) => {
    setError(null)
    if (!f) { setArchivo(null); return }
    // HEIC llega con `type` vacío desde algunos iPhone: se acepta por extensión y se manda como jpeg.
    const tipo = f.type || (/\.hei[cf]$/i.test(f.name) ? 'image/heic' : '')
    if (!ACEPTADOS.includes(tipo)) { setError('Mandá una foto (JPG, PNG o HEIC) o un PDF.'); return }
    if (f.size > TECHO_BYTES) { setError('La foto pesa más de 10 MB: sacala de nuevo con menos calidad.'); return }
    setArchivo(f)
  }

  // PRIMERO EL OBJETO, DESPUÉS LA FILA — el mismo orden que la rendición de efectivo: una fila que apunta a
  // una foto que no llegó es una conformidad que nadie puede mirar. Y el archivo NO pasa por la Server
  // Action: tiene techo de 1 MB y una foto de celular pesa hasta 5.
  const enviar = async () => {
    if (!archivo) return
    setSubiendo(true)
    setError(null)
    try {
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setError('Tu sesión venció. Volvé a entrar y probá otra vez.'); setSubiendo(false); return }
      const tipo = archivo.type || 'image/jpeg'
      const ext = tipo === 'application/pdf' ? 'pdf' : tipo.split('/')[1]?.replace('jpeg', 'jpg') ?? 'jpg'
      const ruta = `${user.id}/recibo/${recibo}-${Date.now()}.${ext}`
      const { error: falla } = await supabase.storage.from('comprobantes')
        .upload(ruta, archivo, { contentType: tipo, upsert: false })
      if (falla) { setError(`No se pudo subir la foto: ${falla.message}`); setSubiendo(false); return }
      const r = await subirPapelDeMiReciboAction({ recibo, ruta })
      if (!r.ok) { setError(r.error); setSubiendo(false); return }
      router.replace(volverA)
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo subir la foto.')
      setSubiendo(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <label data-testid="papel-elegir" style={{
        minHeight: 220, border: `1.5px dashed ${C.lineaFuerte}`, borderRadius: R.tarjeta, background: C.surface,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14,
        cursor: 'pointer', padding: 18, textAlign: 'center',
      }}>
        <input type="file" accept="image/*,application/pdf" capture="environment" style={{ display: 'none' }}
          onChange={(e) => elegir(e.target.files?.[0] ?? null)} />
        <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke={C.faint} strokeWidth="1.3"
          strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ display: 'block' }}>
          <rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="12" cy="12" r="3" />
        </svg>
        <div style={{ fontSize: 13.5, color: C.muted, lineHeight: 1.5 }}>
          {archivo ? archivo.name : <>La hoja entera, plana<br />y con la firma visible</>}
        </div>
      </label>
      {error && <div data-testid="papel-error" style={{ fontSize: 13, color: C.neg, lineHeight: 1.5 }}>{error}</div>}
      <BotonAncho tipo="button" alto={56} activo={!!archivo && !subiendo} onClick={enviar} testid="papel-enviar">
        {subiendo ? 'Subiendo…' : 'Enviar'}
      </BotonAncho>
    </div>
  )
}
