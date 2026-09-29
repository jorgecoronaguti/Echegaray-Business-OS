'use client'

// EL REMITO INTERNO, TAL COMO SALE EN PAPEL.
//
// Mismo mecanismo que el «Recibo en blanco» (dueño, 29/09/2026: «reusá el mecanismo»): estilos EN LÍNEA
// porque `imprimirHoja` copia el `outerHTML` a una ventana en blanco donde ninguna hoja de estilos de la app
// existe, logo por ruta absoluta que resuelve `imprimirHoja`, sin media queries. Marca: el GRAFITO ordena
// (rótulos, filetes) y el AMARILLO es una sola regla fina bajo el encabezado — nunca fondo de texto.
//
// SIN VALIDEZ FISCAL, Y EL PAPEL LO DICE. Es un comprobante de traslado entre depósitos propios, no una
// factura ni un remito «R» de ARCA: sin la leyenda, un tercero lo tomaría por documento de transporte de
// mercadería vendida. Todo lo que se ve viene de la copia guardada al emitirlo (rótulos y nombres), no de
// lo que hoy diga la obra: renombrar una obra no reescribe un papel que ya se firmó.

import type { RefObject } from 'react'
import { EMPLEADOR } from '@/features/administracion/services/reciboFormatoContador'
import { fechaCorta } from '@/features/administracion/components/liquidacion/cuadro/HojaDelRecibo'
import { V } from '@/shared/components/v2/patron'
import { numeroRemito, textoStock, type Remito } from '../logica/stock'

const GRAFITO = V.grafito
const GRIS = '#6B6B69'
const LINEA = '#D7D5CF'
const MONO = "'IBM Plex Mono', monospace"
const SIN_CORTE = { breakInside: 'avoid', pageBreakInside: 'avoid' } as const

const hora = (iso: string): string => new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Argentina/San_Juan' })
const dia = (iso: string): string => fechaCorta(new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Argentina/San_Juan' }))

export function HojaRemito({ hoja, remito }: { hoja?: RefObject<HTMLDivElement | null>; remito: Remito }) {
  return (
    <div ref={hoja} data-testid="remito-hoja" data-numero={remito.numero}
      style={{ border: `1px solid ${LINEA}`, borderRadius: 6, padding: 20, background: '#FFFFFF', color: '#1F1F1E', fontSize: '12px', lineHeight: 1.4, display: 'flex', flexDirection: 'column', gap: 16, boxSizing: 'border-box', maxWidth: '100%' }}>
      <header style={{ ...SIN_CORTE, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '4px 16px', paddingBottom: 12, borderBottom: `3px solid ${V.marca}` }}>
        <img src="/marca/logo.png" alt="Echegaray Construcciones S.A.S." height={64}
          style={{ height: 64, width: 'auto', display: 'block', margin: '-6px 0 -6px -10px' }} />
        <div style={{ textAlign: 'right', flex: '1 1 200px' }}>
          <div style={{ fontWeight: 700, fontSize: '13px' }}>{EMPLEADOR.razonSocial}</div>
          <div style={{ color: GRIS, whiteSpace: 'nowrap' }}>{`C.U.I.T.: ${EMPLEADOR.cuit}`}</div>
          <div style={{ color: GRIS }}>{EMPLEADOR.domicilio}</div>
        </div>
      </header>

      <div style={{ ...SIN_CORTE, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ fontWeight: 700, fontSize: '16px', letterSpacing: '.04em', color: GRAFITO }}>REMITO INTERNO DE MATERIAL</div>
        <div style={{ fontFamily: MONO, fontWeight: 700, fontSize: '16px', whiteSpace: 'nowrap' }}>{`N° ${numeroRemito(remito.numero)}`}</div>
      </div>

      <div style={{ ...SIN_CORTE, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', borderTop: `1px solid ${LINEA}`, borderLeft: `1px solid ${LINEA}` }}>
        <Celda rotulo="FECHA" valor={`${dia(remito.emitido_en)} · ${hora(remito.emitido_en)}`} nowrap />
        <Celda rotulo="ORIGEN" valor={remito.origen_rotulo} />
        <Celda rotulo="DESTINO" valor={remito.destino_rotulo} />
      </div>

      <table style={{ ...SIN_CORTE, width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: `2px solid ${GRAFITO}`, textAlign: 'left', fontSize: '10px', letterSpacing: '.04em', color: GRAFITO }}>
            <th style={{ padding: '4px 6px' }}>MATERIAL</th>
            <th style={{ padding: '4px 6px', textAlign: 'right', whiteSpace: 'nowrap' }}>CANTIDAD</th>
          </tr>
        </thead>
        <tbody>
          {remito.items.map((it, i) => (
            <tr key={`${it.material}-${i}`} style={{ borderBottom: `1px solid ${LINEA}`, breakInside: 'avoid' }}>
              <td style={{ padding: '6px', overflowWrap: 'anywhere' }}>{it.material}</td>
              <td style={{ padding: '6px', textAlign: 'right', fontFamily: MONO, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{textoStock(it.cantidad, it.unidad)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {remito.nota && (
        <div style={SIN_CORTE}>
          <div style={{ fontSize: '9px', color: GRIS, letterSpacing: '.04em' }}>OBSERVACIONES</div>
          <div style={{ overflowWrap: 'anywhere' }}>{remito.nota}</div>
        </div>
      )}

      <div style={{ ...SIN_CORTE, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 24, marginTop: 24 }}>
        <Firma rol="ENTREGA" nombre={remito.entrega_nombre} />
        <Firma rol="RECIBE" nombre={remito.recibe_nombre} />
      </div>

      <div style={{ ...SIN_CORTE, fontSize: '9px', color: GRIS }}>
        Comprobante interno de traslado entre depósitos de la empresa. No es un documento fiscal.
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

function Firma({ rol, nombre }: { rol: string; nombre: string | null }) {
  return (
    <div>
      <div style={{ height: 40, borderBottom: `1px solid ${GRAFITO}` }} />
      <div style={{ fontSize: '9px', color: GRIS, letterSpacing: '.04em', marginTop: 4 }}>{`${rol} · FIRMA`}</div>
      <div style={{ fontWeight: 600, minHeight: 16, overflowWrap: 'anywhere' }}>{nombre ?? ' '}</div>
    </div>
  )
}
