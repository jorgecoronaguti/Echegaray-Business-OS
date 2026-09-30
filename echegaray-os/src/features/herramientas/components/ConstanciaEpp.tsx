'use client'

// LA CONSTANCIA DE ENTREGA DE EPP Y ROPA — el papel que firma el trabajador (Res. SRT 299/2011, Anexo).
//
// ═══ POR QUÉ ASÍ ═══
// El historial del legajo ya sabía qué se le entregó a quién; faltaba el papel que la norma exige y que la
// ART pide en una inspección. Se arma acá, desde lo que la persona TIENE hoy, con el mismo mecanismo que el
// recibo y el remito: hoja con estilos EN LÍNEA (`imprimirHoja` copia el HTML a una ventana en blanco donde
// ninguna hoja de estilos existe), logo por ruta absoluta, grafito que ordena y una regla fina amarilla.
//
// LA FIRMA es la del módulo Efectivo (`FirmaEnElPanel`: canvas con el dedo → SVG), no una copia. No se
// guarda: viaja en el papel impreso. Sin firma se imprime la línea en blanco, para firmarla a mano.
//
// LO QUE LA BASE NO SABE NO SE INVENTA: el certificado/norma de cada elemento no se carga en ningún lado;
// sale como casilla en blanco. Un elemento anterior al sistema sale «sin fecha registrada», no con hoy.

import { useMemo, useRef, useState } from 'react'
import { EMPLEADOR } from '@/features/administracion/services/reciboFormatoContador'
import { imprimirHoja } from '@/features/administracion/components/liquidacion/cuadro/HojaDelRecibo'
import { FirmaEnElPanel } from '@/features/efectivo/components/FirmaEnElPanel'
import { imagenDeFirma } from '@/features/efectivo/logica/firmaImagen'
import { V } from '@/shared/components/v2/patron'
import { filasDeConstancia, type FilaConstancia, type ItemTenido } from '../logica/constancia'
import { diaMesAnio } from './formato'

const GRIS = '#6B6B69'
const LINEA = '#D7D5CF'
const MONO = "'IBM Plex Mono', monospace"
const SIN_CORTE = { breakInside: 'avoid', pageBreakInside: 'avoid' } as const

export interface Trabajador { nombre: string; dni: string | null; cuil: string | null }

export function HojaConstanciaEpp({ hoja, trabajador, filas, firma, emitida }: {
  hoja?: React.RefObject<HTMLDivElement | null>
  trabajador: Trabajador
  filas: FilaConstancia[]
  firma: string | null
  /** La fecha de emisión (ISO). La decide quien imprime, no la hoja: así es testeable y estable. */
  emitida: string
}) {
  const img = imagenDeFirma(firma)
  return (
    <div ref={hoja} data-testid="constancia-hoja"
      style={{ border: `1px solid ${LINEA}`, borderRadius: 6, padding: 20, background: '#FFFFFF', color: '#1F1F1E', fontSize: '12px', lineHeight: 1.4, display: 'flex', flexDirection: 'column', gap: 16, boxSizing: 'border-box', maxWidth: '100%' }}>
      <header style={{ ...SIN_CORTE, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '4px 16px', paddingBottom: 12, borderBottom: `3px solid ${V.marca}` }}>
        <img src="/marca/logo.png" alt="Echegaray Construcciones S.A.S." height={64} style={{ height: 64, width: 'auto', display: 'block', margin: '-6px 0 -6px -10px' }} />
        <div style={{ textAlign: 'right', flex: '1 1 200px' }}>
          <div style={{ fontWeight: 700, fontSize: '13px' }}>{EMPLEADOR.razonSocial}</div>
          <div style={{ color: GRIS, whiteSpace: 'nowrap' }}>{`C.U.I.T.: ${EMPLEADOR.cuit}`}</div>
          <div style={{ color: GRIS }}>{EMPLEADOR.domicilio}</div>
        </div>
      </header>

      <div style={SIN_CORTE}>
        <div style={{ fontWeight: 700, fontSize: '15px', letterSpacing: '.04em', color: V.grafito }}>CONSTANCIA DE ENTREGA DE ELEMENTOS DE PROTECCIÓN PERSONAL Y ROPA DE TRABAJO</div>
        <div style={{ color: GRIS, fontSize: '11px' }}>Resolución SRT 299/2011</div>
      </div>

      <div style={{ ...SIN_CORTE, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', borderTop: `1px solid ${LINEA}`, borderLeft: `1px solid ${LINEA}` }}>
        <Celda rotulo="TRABAJADOR" valor={trabajador.nombre} />
        <Celda rotulo="DNI" valor={trabajador.dni ?? ' '} nowrap />
        <Celda rotulo="C.U.I.L." valor={trabajador.cuil ?? ' '} nowrap />
        <Celda rotulo="FECHA DE EMISIÓN" valor={diaMesAnio(emitida)} nowrap />
      </div>

      <table style={{ ...SIN_CORTE, width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: `2px solid ${V.grafito}`, textAlign: 'left', fontSize: '10px', letterSpacing: '.04em', color: V.grafito }}>
            {['ELEMENTO', 'MARCA / MODELO', 'TALLE', 'CERTIF. (SÍ / NO)', 'FECHA DE ENTREGA'].map((t) => <th key={t} style={{ padding: '4px 6px' }}>{t}</th>)}
            <th style={{ padding: '4px 6px', textAlign: 'right' }}>CANT.</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => (
            <tr key={f.activoId} style={{ borderBottom: `1px solid ${LINEA}`, breakInside: 'avoid' }}>
              <td style={{ padding: '6px', overflowWrap: 'anywhere' }}>{f.descripcion}<div style={{ fontSize: '9px', color: GRIS }}>{f.tipo}</div></td>
              <td style={{ padding: '6px', overflowWrap: 'anywhere' }}>{f.marcaModelo ?? ''}</td>
              <td style={{ padding: '6px' }}>{f.talle ?? ''}</td>
              <td style={{ padding: '6px', color: GRIS }}>{' '}</td>
              <td style={{ padding: '6px', whiteSpace: 'nowrap' }}>{f.anterior ? 'sin fecha registrada' : diaMesAnio(f.fecha!)}</td>
              <td style={{ padding: '6px', textAlign: 'right', fontFamily: MONO, fontVariantNumeric: 'tabular-nums' }}>{f.cantidad}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ ...SIN_CORTE, fontSize: '11px' }}>
        El trabajador declara haber recibido los elementos detallados, en condiciones de uso, con la capacitación
        sobre su correcto uso y conservación, y se compromete a utilizarlos y a solicitar su reposición cuando se deterioren.
      </div>

      <div style={{ ...SIN_CORTE, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 24, marginTop: 16 }}>
        <div>
          <div style={{ height: 48, borderBottom: `1px solid ${V.grafito}`, display: 'flex', alignItems: 'flex-end' }}>
            {img && <img src={img} alt="Firma del trabajador" data-testid="constancia-firma" style={{ maxHeight: 46, maxWidth: '100%' }} />}
          </div>
          <div style={{ fontSize: '9px', color: GRIS, letterSpacing: '.04em', marginTop: 4 }}>TRABAJADOR · FIRMA Y ACLARACIÓN</div>
          <div style={{ fontWeight: 600, overflowWrap: 'anywhere' }}>{trabajador.nombre}</div>
        </div>
        <div>
          <div style={{ height: 48, borderBottom: `1px solid ${V.grafito}` }} />
          <div style={{ fontSize: '9px', color: GRIS, letterSpacing: '.04em', marginTop: 4 }}>EMPLEADOR · FIRMA Y ACLARACIÓN</div>
          <div style={{ fontWeight: 600 }}>{EMPLEADOR.razonSocial}</div>
        </div>
      </div>
    </div>
  )
}

function Celda({ rotulo, valor, nowrap }: { rotulo: string; valor: string; nowrap?: boolean }) {
  return (
    <div style={{ padding: '5px 8px', minWidth: 0, borderRight: `1px solid ${LINEA}`, borderBottom: `1px solid ${LINEA}` }}>
      <div style={{ fontSize: '9px', color: GRIS, letterSpacing: '.04em' }}>{rotulo}</div>
      <div style={{ fontWeight: 600, ...(nowrap ? { whiteSpace: 'nowrap' } : { overflowWrap: 'anywhere' }) }}>{valor}</div>
    </div>
  )
}

/** La fecha de hoy en Argentina, como ISO con la hora de San Juan ya resuelta. */
const hoyISO = () => new Date().toISOString()

/**
 * El panel del legajo: elegir qué se firma, firmar con el dedo e imprimir. Se abre EN la solapa (no hay
 * otra página): el papel siempre está en el árbol, oculto hasta que se imprime (`imprimirHoja` copia su HTML).
 */
export function PanelConstancia({ trabajador, tiene, alCerrar }: { trabajador: Trabajador; tiene: ItemTenido[]; alCerrar: () => void }) {
  const hoja = useRef<HTMLDivElement | null>(null)
  const [marcadas, setMarcadas] = useState<Set<string>>(() => new Set(tiene.map((t) => t.activoId)))
  const [firma, setFirma] = useState<string | null>(null)
  const [bloqueada, setBloqueada] = useState(false)
  const emitida = useMemo(hoyISO, [])
  const filas = useMemo(() => filasDeConstancia(tiene, marcadas), [tiene, marcadas])

  const alternar = (id: string) => setMarcadas((m) => { const n = new Set(m); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const imprimir = () => setBloqueada(!imprimirHoja(hoja.current, `Constancia EPP ${trabajador.nombre}`))

  return (
    <section data-testid="panel-constancia" className="flex min-w-0 flex-col gap-4" style={{ border: `1px solid ${V.linea}`, borderRadius: 6, padding: 16 }}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-2">
        <h2 style={{ fontSize: '14px', fontWeight: 600, color: V.tinta }}>Constancia de entrega</h2>
        <span style={{ fontSize: '12.5px', color: V.tenue }}>Res. SRT 299/2011 · la firma viaja en el papel, no se guarda</span>
        <button type="button" onClick={alCerrar} style={{ marginLeft: 'auto', fontSize: '12.5px', color: V.apagado, textDecoration: 'underline' }}>cerrar</button>
      </div>
      <div className="flex flex-col" data-testid="constancia-items">
        {tiene.map((t) => (
          <label key={t.activoId} className="flex items-center gap-3" style={{ minHeight: 32, fontSize: '13px', color: V.tinta }}>
            <input type="checkbox" checked={marcadas.has(t.activoId)} onChange={() => alternar(t.activoId)} style={{ width: 16, height: 16, accentColor: V.grafito }} />
            <span>{t.nombre}{t.talle ? ` · talle ${t.talle}` : ''}</span>
            <span style={{ color: V.tenue, fontVariantNumeric: 'tabular-nums' }}>× {t.cantidad}</span>
          </label>
        ))}
      </div>
      <FirmaEnElPanel rotulo="Firma del trabajador" onCambio={setFirma} />
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={imprimir} disabled={filas.length === 0} data-testid="imprimir-constancia"
          style={{ height: 36, padding: '0 14px', borderRadius: 6, background: V.marca, color: V.tinta, fontSize: '13px', fontWeight: 600, opacity: filas.length ? 1 : 0.5 }}>
          Imprimir / guardar PDF
        </button>
        {bloqueada && <span role="alert" style={{ fontSize: '12.5px', color: V.warn }}>El navegador bloqueó la ventana de impresión. Permitila y probá de nuevo.</span>}
      </div>
      <div style={{ position: 'absolute', left: -9999, top: 0, width: 760 }} aria-hidden>
        <HojaConstanciaEpp hoja={hoja} trabajador={trabajador} filas={filas} firma={firma} emitida={emitida} />
      </div>
    </section>
  )
}
