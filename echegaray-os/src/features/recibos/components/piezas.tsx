// LAS PIEZAS DEL RECIBO QUE SE REPITEN EN ESCRITORIO, TELÉFONO E IMPRESIÓN — sin estado, sin hooks.
//
// El documento (D12) es el mismo en las tres caras: lo que ve Administración antes de mandarlo, lo
// que la persona abre desde «Ver el recibo completo» y lo que sale por la impresora. Un solo
// componente para que el papel impreso y la pantalla no puedan decir cosas distintas.

import type { CSSProperties, ReactNode } from 'react'
import { V } from '@/shared/components/v2/patron'
import { leerTrazo, miles, periodoLargo, type FotoDeRecibo, type Tono } from '../logica'

export const MONO = "'IBM Plex Mono', monospace"
/** Los dos grises del diseño que no son token de V: el fondo del panel y el separador arrastrable. */
export const QUIETO = '#FAFAF8'
export const DIVISOR = '#EFEEEA'

export const COLOR_TONO: Record<Tono, string> = { pos: V.pos, warn: V.warn, neg: V.neg, tenue: V.tenue }

/** El punto de 7 px y el texto del estado, en el color del tono (D11, D13). */
export function Punto({ tono, children, fuerte }: { tono: Tono; children: ReactNode; fuerte?: boolean }) {
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: COLOR_TONO[tono], flexShrink: 0 }} />
      <span style={{ color: COLOR_TONO[tono], fontWeight: fuerte ? 500 : undefined, overflow: 'hidden', textOverflow: 'ellipsis' }}>{children}</span>
    </span>
  )
}

/** La firma con el dedo, dibujada desde el trazo validado. Nunca `innerHTML`. */
export function Trazo({ svg, alto = 60, testid }: { svg: string | null; alto?: number; testid?: string }) {
  const t = leerTrazo(svg)
  if (!t) return <span style={{ fontSize: '12px', color: V.tenue }}>sin trazo</span>
  return (
    <svg data-testid={testid} viewBox={`0 0 ${t.ancho} ${t.alto}`} height={alto} style={{ display: 'block', maxWidth: '100%' }}
      role="img" aria-label="Firma con el dedo">
      <path d={t.d} fill="none" stroke={V.tinta} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

const rotuloCampo: CSSProperties = {
  fontFamily: MONO, fontSize: '10.5px', letterSpacing: '.06em', color: V.tenue, textTransform: 'uppercase',
}
const renglon = (alto: number): CSSProperties => ({
  display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 150px', gap: 18, minHeight: alto, alignItems: 'center',
})

export interface DatosDelDocumento {
  /** `null` = todavía no se emitió: el número lo pone la base al emitir. */
  codigo: string | null
  personaNombre: string
  desde: string
  hasta: string
  obra: string | null
  foto: FotoDeRecibo
  /** La firma del trabajador, si la hizo con el dedo. */
  trazo?: string | null
}

const horasTexto = (h: number | null) => (h == null ? '' : ` · ${String(h).replace('.', ',')} hs`)

/** D12 · EL DOCUMENTO. El importe y la composición salen de la foto, nunca se escriben acá. */
export function DocumentoRecibo({ d, testid = 'documento-recibo' }: { d: DatosDelDocumento; testid?: string }) {
  const f = d.foto
  return (
    <div data-testid={testid} data-recibo-papel style={{
      background: '#FFFFFF', border: `1px solid ${V.lineaFuerte}`, borderRadius: 10, padding: '26px 28px',
      display: 'flex', flexDirection: 'column', gap: 20, color: V.tinta,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 20, paddingBottom: 16, borderBottom: `1px solid ${V.linea}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- el isotipo oficial también sale en la impresión */}
          <img src="/marca/isotipo.png" alt="" style={{ width: 26, height: 26, objectFit: 'contain', display: 'block' }} />
          <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2 }}>
            <div style={{ fontSize: '11.5px', fontWeight: 600, letterSpacing: '.04em' }}>ECHEGARAY CONSTRUCCIONES</div>
            <div style={{ fontSize: '11px', color: V.tenue }}>San Juan · Argentina</div>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ ...rotuloCampo, fontSize: '11px' }}>Recibo</div>
          <div style={{ fontFamily: MONO, fontSize: '13px', fontWeight: 500 }}>{d.codigo ?? 'se numera al emitir'}</div>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: '16px 24px' }}>
        <Campo rotulo="Recibí de">Echegaray Construcciones</Campo>
        <Campo rotulo="Período">{periodoLargo(d.desde, d.hasta)}</Campo>
        <Campo rotulo="Nombre" fuerte>{d.personaNombre}</Campo>
        <Campo rotulo="Obra">{d.obra ?? <span style={{ color: V.tenue }}>sin horas imputadas a una obra</span>}</Campo>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', paddingTop: 8, borderTop: `1px solid ${V.linea}` }}>
        <Linea texto={`Quincena${horasTexto(f.horas)}`} importe={miles(f.bruto)} />
        {f.adelanto > 0 && <Linea texto="Adelantos" importe={`− ${miles(f.adelanto)}`} />}
        {f.yaTransferido > 0 && <Linea texto="Ya transferido" importe={`− ${miles(f.yaTransferido)}`} />}
        <div data-testid="recibo-total" style={{ ...renglon(44), borderTop: `1px solid ${V.grafito}`, fontSize: '15px', fontWeight: 600 }}>
          <div>Total a pagar</div><div style={{ textAlign: 'right', fontFamily: MONO }}>$ {miles(f.total)}</div>
        </div>
        <div style={{ ...renglon(34), fontSize: '12.5px', color: V.apagado }}>
          <div>Por banco {miles(f.porBanco)} · en efectivo {miles(f.enEfectivo)}</div><div />
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 24, paddingTop: 20, borderTop: `1px solid ${V.linea}` }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ paddingTop: 40, borderBottom: `1px solid ${V.lineaFuerte}`, display: 'flex', alignItems: 'flex-end' }}>
            {d.trazo ? <Trazo svg={d.trazo} alto={52} testid="recibo-trazo" /> : null}
          </div>
          <div style={{ fontSize: '11.5px', color: V.apagado }}>Firma del trabajador</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ paddingTop: 56, borderBottom: `1px solid ${V.lineaFuerte}` }} />
          <div style={{ fontSize: '11.5px', color: V.apagado }}>Por la empresa · aclaración</div>
        </div>
      </div>
    </div>
  )
}

function Campo({ rotulo, fuerte, children }: { rotulo: string; fuerte?: boolean; children: ReactNode }) {
  return (
    <div>
      <div style={rotuloCampo}>{rotulo}</div>
      <div style={{ fontSize: '13.5px', fontWeight: fuerte ? 500 : undefined }}>{children}</div>
    </div>
  )
}

function Linea({ texto, importe }: { texto: string; importe: string }) {
  return (
    <div style={{ ...renglon(38), borderBottom: `1px solid ${V.lineaFila}`, fontSize: '13.5px' }}>
      <div>{texto}</div><div style={{ textAlign: 'right', fontFamily: MONO }}>{importe}</div>
    </div>
  )
}

/** El botón de contorno del diseño (Imprimir, Descargar PDF, Observar). */
export const BOTON_CONTORNO: CSSProperties = {
  padding: '9px 14px', lineHeight: '18px', border: `1px solid ${V.lineaFuerte}`, borderRadius: 6, display: 'inline-flex',
  alignItems: 'center', fontSize: '13px', color: V.tintaSuave, background: '#FFFFFF', cursor: 'pointer', textDecoration: 'none',
}
/** El botón grafito del diseño (Enviar a firmar, Archivar firmado). */
export const BOTON_GRAFITO: CSSProperties = {
  padding: '9px 18px', lineHeight: '18px', background: V.grafito, color: '#FFFFFF', borderRadius: 6, border: 0, display: 'inline-flex',
  alignItems: 'center', fontSize: '13.5px', fontWeight: 500, cursor: 'pointer', textDecoration: 'none',
}
