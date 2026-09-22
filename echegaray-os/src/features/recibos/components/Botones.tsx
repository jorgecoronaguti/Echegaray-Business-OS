'use client'

// LOS BOTONES QUE ESCRIBEN, DE ESCRITORIO: «Enviar a firmar» (D11, D12), «Archivar firmado» y
// «Observar y pedir de nuevo» (D13), y el «Imprimir / Descargar PDF» que abre el diálogo del navegador.
//
// Cada uno dice el resultado de la base con sus palabras: lo emitido y lo rechazado con su motivo.
// Un botón que se apaga sin decir por qué enseña a no confiar en los que sí andan.

import { useState, useTransition } from 'react'
import { ALTO_V2 } from '@/shared/components/v2/patron'
import { useRouter } from 'next/navigation'
import { V } from '@/shared/components/v2/patron'
import { archivarReciboAction, emitirRecibosAction, observarReciboAction, type Resultado } from '../acciones'
import { BOTON_CONTORNO, BOTON_GRAFITO, Punto } from './piezas'

function Mensaje({ r }: { r: Resultado | null }) {
  if (!r) return null
  return (
    <div data-testid="recibos-resultado" role="status"
      style={{ fontSize: '12.5px', lineHeight: 1.45, color: r.ok ? V.pos : V.neg, maxWidth: 560 }}>
      {r.ok ? r.mensaje : r.error}
    </div>
  )
}

/** Emite la quincena entera (sin `persona`) o a una persona. */
export function EnviarAFirmar({ desde, hasta, persona = null, activo, porQueNo, testid = 'enviar-a-firmar' }: {
  desde: string; hasta: string; persona?: string | null; activo: boolean; porQueNo?: string; testid?: string
}) {
  const router = useRouter()
  const [pendiente, empezar] = useTransition()
  const [r, setR] = useState<Resultado | null>(null)
  const enviar = () => empezar(async () => {
    const res = await emitirRecibosAction({ desde, hasta, persona })
    setR(res)
    if (res.ok) router.refresh()
  })
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-start' }}>
      <button type="button" data-testid={testid} onClick={enviar} disabled={!activo || pendiente} title={activo ? undefined : porQueNo}
        style={{ ...BOTON_GRAFITO, padding: '8px 16px', lineHeight: '18px', fontSize: '13px', opacity: activo && !pendiente ? 1 : 0.45, cursor: activo ? 'pointer' : 'not-allowed' }}>
        {pendiente ? 'Emitiendo…' : 'Enviar a firmar'}
      </button>
      <Mensaje r={r} />
    </div>
  )
}

/** Imprimir y «Descargar PDF» son el mismo diálogo del navegador: el PDF se guarda desde ahí. */
export function Imprimir({ texto = 'Imprimir', testid }: { texto?: string; testid?: string }) {
  return (
    <button type="button" data-testid={testid} onClick={() => window.print()} style={BOTON_CONTORNO}>{texto}</button>
  )
}

export const CONTROLES = [
  { clave: 'quincena', texto: 'Es el recibo de esta quincena' },
  { clave: 'importe', texto: 'El importe coincide con el emitido' },
  { clave: 'firma', texto: 'La firma está en el lugar y se lee' },
  { clave: 'aclaracion', texto: 'Está la aclaración de la empresa' },
] as const

/**
 * D13 · VERIFICAR Y ARCHIVAR. Los cuatro controles los marca quien verifica y viajan con el recibo.
 * «Archivar» se enciende con los cuatro; lo que falta se dice en naranja, como en el diseño.
 */
export function VerificarYArchivar({ recibo, puedeArchivar, porQueNo, puedeObservar }: {
  recibo: string; puedeArchivar: boolean; porQueNo: string | null; puedeObservar: boolean
}) {
  const router = useRouter()
  const [pendiente, empezar] = useTransition()
  const [marcados, setMarcados] = useState<Record<string, boolean>>({})
  const [observando, setObservando] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [r, setR] = useState<Resultado | null>(null)
  const todos = CONTROLES.every((c) => marcados[c.clave])
  const correr = (f: () => Promise<Resultado>) => empezar(async () => {
    const res = await f()
    setR(res)
    if (res.ok) router.refresh()
  })
  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column' }} data-testid="verificar">
        {CONTROLES.map((c, i) => (
          <label key={c.clave} style={{
            minHeight: ALTO_V2.recibo, display: 'flex', alignItems: 'center', gap: 12, fontSize: '13.5px', cursor: 'pointer',
            borderBottom: i < CONTROLES.length - 1 ? `1px solid ${V.lineaFila}` : undefined,
          }}>
            <input type="checkbox" data-testid={`control-${c.clave}`} checked={!!marcados[c.clave]} disabled={!puedeArchivar}
              onChange={(e) => setMarcados({ ...marcados, [c.clave]: e.target.checked })} style={{ position: 'absolute', opacity: 0, width: 1, height: 1 }} />
            <Punto tono={marcados[c.clave] ? 'pos' : 'warn'}>
              {marcados[c.clave] ? c.texto : c.clave === 'aclaracion' ? 'Falta la aclaración de la empresa' : c.texto}
            </Punto>
          </label>
        ))}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '14px 16px', background: '#FAFAF8', border: `1px solid ${V.linea}`, borderRadius: 10 }}>
        <div style={{ fontSize: '12.5px', fontWeight: 600 }}>Al archivar</div>
        <div style={{ fontSize: '12.5px', color: V.tintaSuave, lineHeight: 1.45 }}>
          El firmado reemplaza al emitido en el legajo. El emitido queda como versión anterior: no se borra.
        </div>
      </div>
      {observando && (
        <textarea data-testid="motivo-observacion" value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3}
          placeholder="Qué hay que corregir (lo lee la persona)"
          style={{ border: `1px solid ${V.lineaFuerte}`, borderRadius: 6, padding: 10, fontSize: '13px', fontFamily: 'inherit', resize: 'vertical' }} />
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 'auto', flexWrap: 'wrap' }}>
        <button type="button" data-testid="archivar-firmado" disabled={!puedeArchivar || !todos || pendiente}
          title={!puedeArchivar ? porQueNo ?? undefined : !todos ? 'Marcá los cuatro controles' : undefined}
          onClick={() => correr(() => archivarReciboAction({ recibo, verificacion: marcados }))}
          style={{ ...BOTON_GRAFITO, opacity: puedeArchivar && todos && !pendiente ? 1 : 0.45 }}>
          Archivar firmado
        </button>
        <button type="button" data-testid="observar-recibo" disabled={!puedeObservar || pendiente}
          onClick={() => (observando ? correr(() => observarReciboAction({ recibo, motivo, reemitir: true })) : setObservando(true))}
          style={{ ...BOTON_CONTORNO, color: V.warn, opacity: puedeObservar ? 1 : 0.45 }}>
          {observando ? 'Observar y emitir de nuevo' : 'Observar y pedir de nuevo'}
        </button>
      </div>
      {!puedeArchivar && porQueNo && <div style={{ fontSize: '12px', color: V.apagado }}>{porQueNo}</div>}
      <Mensaje r={r} />
    </>
  )
}
