// LAS PIEZAS DEL PANEL LATERAL DE LA BASE MAESTRA — medidas de `17` y `18`, escritas una sola vez.
//
// Los dos paneles del canónico dibujan exactamente los mismos tres objetos: una tarjeta de cifra
// (`1fr 1fr`, rótulo 10px, valor mono 17px/600, pie 11px), un título de sección (12px/600 con 8px de
// aire debajo) y una fila de lista (`padding:8px 0` con divisor #F5F4F0). Copiarlos en cada archivo
// es cómo dos paneles que tienen que verse iguales empiezan a verse distinto.

import type { CSSProperties, ReactNode } from 'react'
import { C } from '@/shared/components/canon'

/** `17:196`, `18:189`. `padding:8px 0;borderBottom:1px solid #F5F4F0`. */
export const FILA_PANEL: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 9, padding: '8px 0', borderBottom: `1px solid ${C.lineaTenue}`,
}

export function Seccion({ titulo, children, testid }: { titulo: ReactNode; children: ReactNode; testid?: string }) {
  return (
    <section style={{ marginTop: 18 }} data-testid={testid}>
      <div style={{ fontSize: '12px', fontWeight: 600, color: C.tinta, marginBottom: 8 }}>{titulo}</div>
      {children}
    </section>
  )
}

/** Lo que dice una sección vacía: una línea, no un bloque. */
export function Linea({ children }: { children: ReactNode }) {
  return <p style={{ fontSize: '12px', color: C.apagado, margin: 0 }}>{children}</p>
}

/**
 * UNA TARJETA DE CIFRA. `background:#FAFAF8;border:1px solid #EFEEEA;borderRadius:8px;
 * padding:10px 11px` — y el par de colores cambia cuando la cifra tiene tono (el REAL DE OBRA de
 * `17`, que se tiñe con el desvío).
 */
export function Cifra({
  rotulo, pie, children, fondo = C.superficieTenue, borde = C.lineaBloque, color = C.tinta, tam = '17px', testid,
}: {
  rotulo: string
  pie: ReactNode
  children: ReactNode
  fondo?: string
  borde?: string
  color?: string
  tam?: string
  testid?: string
}) {
  return (
    <div data-testid={testid} style={{ background: fondo, border: `1px solid ${borde}`, borderRadius: 8, padding: '10px 11px', minWidth: 0 }}>
      <div style={{ fontSize: '10px', color: C.tenue, letterSpacing: '.05em' }}>{rotulo}</div>
      <div className="font-mono tabular-nums" style={{ fontSize: tam, fontWeight: 600, color, marginTop: 3 }}>
        {children}
      </div>
      <div style={{ fontSize: '11px', color: C.apagado, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {pie}
      </div>
    </div>
  )
}

/** La caja del panel: 372px en `18`, 392px en `17`. El resto es idéntico. */
export function CajaPanel({ ancho, children, testid }: { ancho: number; children: ReactNode; testid: string }) {
  return (
    <aside
      data-testid={testid}
      style={{
        width: ancho, flexShrink: 0, marginLeft: 12, background: C.superficie,
        border: `1px solid ${C.linea}`, borderRadius: 10, display: 'flex', flexDirection: 'column',
        overflow: 'hidden', alignSelf: 'flex-start', maxWidth: '100%',
      }}
    >
      {children}
    </aside>
  )
}
