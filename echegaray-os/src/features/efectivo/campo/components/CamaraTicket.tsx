'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState, type ChangeEvent } from 'react'
import { useRouter } from 'next/navigation'
import { C, R } from '@/shared/components/movil/tokens'
import { Icono } from '@/shared/components/movil/Iconos'
import { MEDIA_ACEPTADOS } from '../../../administracion/services/comprobanteEntrada'
import { mandarFotos, type FotoElegida } from '../subida'

// M04 · LA FOTO DEL TICKET — la cámara como camino más corto.
//
// ═══ M05 NO ESTÁ, Y ES A PROPÓSITO (dueño, 22/09) ═══
//
// El mockup lee el ticket en el teléfono y pide confirmar comercio, total y fecha. La lectura la hace
// el worker de la VM DESPUÉS de subir, con el mismo circuito que Compras; inventar una lectura en el
// teléfono sería mostrar datos que nadie leyó. El camino queda: sacar la(s) foto(s) → «Listo» → la
// lista M06, que muestra el estado vivo de cada una (leyendo → en Compras / te piden un dato).
//
// El disparador amarillo es un `<input capture="environment">`: abre la cámara trasera sin pasar por
// ningún menú. «Galería» es el mismo input sin `capture`, para la foto que ya se sacó. Las fotos de
// una tanda viajan con el mismo lote: son el mismo ticket en partes o varios tickets juntos, y el
// circuito los lee como un fajo.

const ACEPTA_GALERIA = [...MEDIA_ACEPTADOS, '.heic', '.heif'].join(',')

export function CamaraTicket({ entrega, destino, volverA, alTerminar }: {
  entrega: string
  destino: string
  volverA: string
  alTerminar: string
}) {
  const router = useRouter()
  const [fotos, setFotos] = useState<FotoElegida[]>([])
  const [enviando, setEnviando] = useState(false)
  const [errores, setErrores] = useState<string[]>([])

  const agregar = (e: ChangeEvent<HTMLInputElement>) => {
    const nuevas = Array.from(e.target.files ?? []).map((archivo) => ({ id: crypto.randomUUID(), archivo }))
    setFotos((f) => [...f, ...nuevas])
    setErrores([])
    e.target.value = ''
  }

  const enviar = async () => {
    if (!fotos.length || enviando) return
    setEnviando(true)
    const r = await mandarFotos(entrega, fotos)
    setEnviando(false)
    if (r.entraron > 0 && !r.errores.length) {
      router.replace(alTerminar)
      router.refresh()
      return
    }
    setErrores(r.errores)
    // Lo que ya entró no se vuelve a mandar: queda en la tanda sólo lo que falló, con un `id` NUEVO.
    // El nombre del objeto es ese id y el bucket no pisa (`upsert: false`): reintentar con el mismo
    // chocaría contra la foto que sí subió aunque su renglón no haya entrado.
    const entraron = new Set(r.entraronIds)
    setFotos((f) => f.filter((x) => !entraron.has(x.id)).map((x) => ({ ...x, id: crypto.randomUUID() })))
  }

  return (
    <div style={{ minHeight: '100vh', background: C.ink, display: 'flex', flexDirection: 'column', color: C.surface }}>
      <div style={{ height: 56, display: 'flex', alignItems: 'center', gap: 8, padding: '0 8px 0 4px', flexShrink: 0 }}>
        <Link
          href={volverA}
          prefetch={false}
          aria-label="Cerrar sin mandar"
          data-testid="camara-cerrar"
          style={{ width: 48, height: 48, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.surface }}
        >
          <Icono nombre="cerrar" tamano={22} />
        </Link>
        <div style={{ fontSize: 15, fontWeight: 500 }}>Rendir un gasto</div>
        <div style={{ marginLeft: 'auto', fontSize: 12.5, color: C.faint, paddingRight: 8 }}>{destino}</div>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20, padding: '0 24px' }}>
        {fotos.length === 0 ? <Encuadre /> : <Tanda fotos={fotos} quitar={(id) => setFotos((f) => f.filter((x) => x.id !== id))} />}
        {fotos.length > 0 && (
          <div data-testid="camara-tanda" style={{ display: 'flex', alignItems: 'center', gap: 8, color: C.marca, fontSize: 12.5 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: C.marca }} />
            {fotos.length === 1 ? '1 foto en esta tanda' : `${fotos.length} fotos en esta tanda`}
          </div>
        )}
        {errores.length > 0 && (
          <div data-testid="camara-errores" style={{ fontSize: 13, lineHeight: 1.5, color: C.surface, background: C.neg, borderRadius: R.control, padding: '10px 12px' }}>
            {errores.map((e) => <div key={e}>{e}</div>)}
          </div>
        )}
      </div>

      <div style={{ padding: '0 24px 34px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <label data-testid="camara-galeria" style={{ ...CUADRADO, color: C.faint, fontSize: 11.5 }}>
          Galería
          <input type="file" accept={ACEPTA_GALERIA} multiple onChange={agregar} style={{ display: 'none' }} />
        </label>
        <label
          aria-label="Sacar la foto del ticket"
          data-testid="camara-disparador"
          style={{
            width: 76, height: 76, borderRadius: '50%', background: C.marca, border: '5px solid rgba(255,255,255,.22)',
            cursor: 'pointer', boxSizing: 'border-box',
          }}
        >
          <input type="file" accept="image/*" capture="environment" onChange={agregar} style={{ display: 'none' }} />
        </label>
        <button
          type="button"
          onClick={enviar}
          disabled={!fotos.length || enviando}
          data-testid="camara-listo"
          style={{ ...CUADRADO, border: 'none', fontSize: 13, fontWeight: 600, color: fotos.length ? C.surface : C.faint, fontFamily: 'inherit' }}
        >
          {enviando ? '…' : 'Listo'}
        </button>
      </div>
    </div>
  )
}

const CUADRADO = {
  width: 56, height: 56, borderRadius: 10, background: C.grafito, display: 'flex', alignItems: 'center',
  justifyContent: 'center', cursor: 'pointer',
} as const

/** El recuadro del mockup, antes de la primera foto. */
function Encuadre() {
  return (
    <div style={{
      width: '100%', aspectRatio: '3 / 4', maxHeight: '58vh', borderRadius: R.tarjeta, border: '2px solid rgba(255,255,255,.28)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12, color: C.faint,
    }}>
      <Icono nombre="foto" tamano={40} />
      <div style={{ fontSize: 13, textAlign: 'center', lineHeight: 1.5 }}>Encuadrá el ticket entero<br />con el total visible</div>
    </div>
  )
}

/** Las fotos de la tanda, cada una con su «quitar» de 44px. El HEIC no se previsualiza: se nombra. */
function Tanda({ fotos, quitar }: { fotos: FotoElegida[]; quitar: (id: string) => void }) {
  const urls = useMemo(
    () => new Map(fotos.map((f) => [f.id, /^image\/(jpeg|png|webp|gif)$/.test(f.archivo.type) ? URL.createObjectURL(f.archivo) : null])),
    [fotos],
  )
  useEffect(() => () => { for (const u of urls.values()) if (u) URL.revokeObjectURL(u) }, [urls])
  return (
    <div style={{ width: '100%', display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10 }}>
      {fotos.map((f) => (
        <div key={f.id} style={{ position: 'relative', aspectRatio: '3 / 4', borderRadius: R.controlChico, overflow: 'hidden', background: C.grafito }}>
          {urls.get(f.id)
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={urls.get(f.id)!} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : <div style={{ padding: 8, fontSize: 11, color: C.faint, wordBreak: 'break-all' }}>{f.archivo.name}</div>}
          <button
            type="button"
            onClick={() => quitar(f.id)}
            aria-label={`Quitar ${f.archivo.name}`}
            style={{
              position: 'absolute', top: 0, right: 0, width: 44, height: 44, border: 'none', background: 'transparent',
              display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end', padding: 6, color: C.surface, cursor: 'pointer',
            }}
          >
            <span style={{ width: 24, height: 24, borderRadius: 12, background: 'rgba(0,0,0,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icono nombre="cerrar" tamano={14} />
            </span>
          </button>
        </div>
      ))}
    </div>
  )
}
