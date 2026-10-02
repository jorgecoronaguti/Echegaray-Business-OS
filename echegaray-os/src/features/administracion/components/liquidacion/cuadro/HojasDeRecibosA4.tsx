'use client'

// LOS RECIBOS EN LOTE, TAL COMO SALEN: A4 HORIZONTAL, CUATRO POR HOJA (2 × 2), con líneas de corte finas.
//
// Dueño, 01/10/2026: *«un formato horizontal para meter 4 en una hoja A4 y de manera masiva»*. Cada recuadro es
// la versión compacta de `HojaDelRecibo`: mismos renglones (`recibo.horas` / `recibo.medios`, ya armados y
// sellados), mismo logo arriba a la izquierda (regla del dueño: logo en todo exportable) y las firmas con DNI.
// Acá no se calcula nada: se dibuja lo que se recibe, igual que la reimpresión de la ficha.
//
// Medidas en `mm` y colores del papel en hex a propósito: es lo que se IMPRIME en otra ventana, donde no existen
// las variables del tema (misma razón que en `HojaDelRecibo`). Una hoja = 194 mm de alto útil (210 − 2 × 8 de
// margen) menos 2 mm de holgura, para que el navegador no empuje una página en blanco al final.

import type { ReciboArmado } from '../../../services/reciboDeLaQuincena'
import { rotuloDelNumero } from '@/shared/recibo/codigoDeRecibo'
import { fechaCorta, lineaDeHoras, MONO, plata } from './HojaDelRecibo'
import { enHojas, RECIBOS_POR_HOJA } from './lotesDeRecibos'

export interface ReciboParaLaHoja {
  personaId: string
  nombre: string
  categoria: string | null
  recibo: ReciboArmado
  /**
   * El número que le dio la base al guardarlo (RP-000123). La vista previa no lo tiene —el lote todavía no se
   * guardó— y el papel dice «N° al guardar»: nunca un número previsto, que otro recibo puede ganar antes.
   */
  codigo?: string | null
}

const CORTE = '1px dashed #B5B4AF'
const GRIS = '#6B6B69'

/** El ancho útil de la hoja (297 − 2 × 8 de margen), en mm y en px de pantalla: la vista previa escala contra esto. */
export const ANCHO_DE_HOJA_MM = 281
export const ANCHO_DE_HOJA_PX = (ANCHO_DE_HOJA_MM * 96) / 25.4

export function HojasDeRecibosA4({ hoja, recibos, quincena, vista = false }: {
  hoja?: React.RefObject<HTMLDivElement | null>
  recibos: readonly ReciboParaLaHoja[]
  quincena: { desde: string; hasta: string }
  /**
   * LA VISTA PREVIA EN PANTALLA: cada hoja se dibuja como un papel (fondo blanco, borde, separadas). Es el MISMO
   * componente que va a la impresora —sin esto la vista previa sería un dibujo parecido, no la hoja—; lo único que
   * cambia es el marco, que en el papel no existe.
   */
  vista?: boolean
}) {
  const hojas = enHojas(recibos, RECIBOS_POR_HOJA)
  const marco = vista
    ? { width: `${ANCHO_DE_HOJA_MM}mm`, background: '#FFFFFF', border: '1px solid #D9D8D4', marginBottom: 16, boxSizing: 'content-box' as const }
    : {}
  return (
    <div ref={hoja} data-testid={vista ? 'hojas-recibos-vista' : 'hojas-recibos-a4'}>
      {hojas.map((cuatro, h) => (
        <div key={cuatro[0].personaId} data-hoja={h + 1}
          style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr', height: '192mm', breakAfter: h < hojas.length - 1 ? 'page' : 'auto', pageBreakAfter: h < hojas.length - 1 ? 'always' : 'auto', ...marco }}>
          {cuatro.map((r, i) => (
            // LA LÍNEA DE CORTE ES EL BORDE INTERIOR: derecha en la columna izquierda, abajo en la fila de arriba.
            <div key={r.personaId} data-recibo-compacto
              style={{ boxSizing: 'border-box', padding: '4mm 6mm', borderRight: i % 2 === 0 ? CORTE : 0, borderBottom: i < 2 ? CORTE : 0, overflow: 'hidden' }}>
              <ReciboCompacto r={r} quincena={quincena} />
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

function ReciboCompacto({ r, quincena }: { r: ReciboParaLaHoja; quincena: { desde: string; hasta: string } }) {
  const { recibo } = r
  const hayTotal = recibo.medios.some((m) => !m.sub)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2.2mm', height: '100%', fontSize: '10.5px', lineHeight: 1.35 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        {/* `<img>` y no `next/image`: se imprime una COPIA del HTML (ver `HojaDelRecibo`). Mismo margen
            negativo que el recibo grande, a escala, para alinear el dibujo con el texto. */}
        <img src="/marca/logo.png" alt="Echegaray Construcciones S.A.S." height={46}
          style={{ height: 46, width: 'auto', display: 'block', margin: '-4px 0 -5px -8px' }} />
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '12px', fontWeight: 600 }}>Recibo de pago</div>
          <div style={{ color: GRIS }}>{`Quincena ${fechaCorta(quincena.desde)} al ${fechaCorta(quincena.hasta)}`}</div>
          <div style={{ color: GRIS, fontFamily: MONO, fontSize: '9.5px' }} data-recibo-numero>{rotuloDelNumero(r.codigo)}</div>
        </div>
      </header>
      <div>
        <div><span style={{ color: GRIS }}>Nombre </span><strong style={{ fontSize: '12px' }}>{r.nombre}</strong></div>
        {r.categoria && <div><span style={{ color: GRIS }}>Categoría </span>{r.categoria}</div>}
      </div>
      <div style={{ borderTop: '1px solid #D9D8D4' }}>
        {recibo.horas.map((x) => (
          <Renglon key={x.rotulo} rotulo={x.rotulo} {...lineaDeHoras(x)} sub={x.sub} />
        ))}
        {recibo.medios.map((x, i) => (
          <Renglon key={`${x.rotulo}-${i}`} rotulo={x.rotulo} importe={plata(x.importe)} sub={x.sub} />
        ))}
      </div>
      {hayTotal && (
        <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1.5px solid #1F1F1E', paddingTop: 3, fontSize: '12.5px', fontWeight: 600 }}>
          <span>Total</span>
          <span style={{ fontFamily: MONO }}>{plata(recibo.total)}</span>
        </div>
      )}
      {/* LAS FIRMAS AL PIE DEL RECUADRO: `marginTop: auto` las deja siempre en el mismo lugar del papel. */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1.3fr 1fr', gap: 10, marginTop: 'auto', paddingTop: '7mm', color: GRIS, fontSize: '9.5px' }}>
        <div style={{ borderTop: '1px solid #1F1F1E', paddingTop: 2 }}>Firma</div>
        <div style={{ borderTop: '1px solid #1F1F1E', paddingTop: 2 }}>Aclaración</div>
        <div style={{ borderTop: '1px solid #1F1F1E', paddingTop: 2 }}>DNI</div>
      </div>
    </div>
  )
}

function Renglon({ rotulo, detalle, importe, sub }: { rotulo: string; detalle?: string; importe: string; sub?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: sub ? '0 0 0 10px' : '1.5px 0', color: sub ? GRIS : '#1F1F1E' }}>
      <span>{rotulo}{detalle && <span style={{ color: GRIS, marginLeft: 6 }}>{detalle}</span>}</span>
      <span style={{ fontFamily: MONO }}>{importe}</span>
    </div>
  )
}
