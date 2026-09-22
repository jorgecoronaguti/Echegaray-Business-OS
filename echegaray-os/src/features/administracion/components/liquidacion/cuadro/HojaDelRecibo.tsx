'use client'

// EL PAPEL — un solo dibujo, para el recibo que se está armando y para el que ya se emitió.
//
// ═══ POR QUÉ ESTÁ ACÁ Y NO ADENTRO DE `ArmarRecibo` ═══
//
// Dueño, 22/09/2026: el recibo aceptado se guarda «en los legajos correspondientes» y se puede volver a
// imprimir. Una reimpresión que salga DISTINTA del papel que la persona firmó no es una reimpresión: es otro
// recibo. Con dos dibujos —uno en Liquidación y otro en la ficha— eso pasa el día que alguien mueve un
// renglón de un lado. Hay uno solo, y los dos lo llaman con los mismos renglones.
//
// La ficha le pasa los renglones SELLADOS de `recibo_liquidacion`, no la línea de la quincena: acá no se
// calcula nada, se dibuja lo que se recibe.

import { V } from '@/shared/components/v2/patron'
import type { ReciboArmado } from '../../../services/reciboDeLaQuincena'
import { pesos } from '../formato'

const MONO = "'IBM Plex Mono', monospace"
export const fechaCorta = (iso: string): string => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`
const plata = (n: number | null): string => (n == null ? 'sin dato' : pesos(n))

/** El nombre que el diálogo de impresión propone al guardar como PDF. Uno solo, para los dos caminos. */
export const tituloDelRecibo = (nombre: string, desde: string, hasta: string): string =>
  `Recibo ${nombre} ${fechaCorta(desde)} al ${fechaCorta(hasta)}`

/**
 * IMPRIME SÓLO EL RECIBO, EN SU PROPIA VENTANA. Devuelve `false` si el navegador bloqueó la ventana.
 *
 * Antes se ocultaba la app con `visibility: hidden` y el recibo iba `position: fixed`. Eso deja el alto del
 * cuadro entero —y Chrome repite los elementos fijos en cada hoja—: salían páginas en blanco y el recibo
 * repetido (auditoría 22/09/2026). Una ventana con el recibo solo imprime una hoja.
 */
export function imprimirHoja(nodo: HTMLElement | null, titulo: string): boolean {
  if (!nodo) return false
  const v = window.open('', '_blank', 'width=900,height=1000')
  // VENTANA BLOQUEADA: el navegador puede negarla y antes no pasaba NADA, sin decir por qué.
  if (!v) return false
  // LA RUTA DEL LOGO TIENE QUE SER ABSOLUTA: la ventana nace en `about:blank`, donde `/marca/logo.png` no
  // resuelve contra nada y el recibo saldría sin logo (dueño, 22/09/2026: «poneles el logo de la empresa
  // arriba cuando se arme el pdf»).
  const html = nodo.outerHTML.replace(/src="\//g, `src="${window.location.origin}/`)
  // Y SE IMPRIME CUANDO LA IMAGEN YA ESTÁ: `print()` apenas se escribe el documento sale con el hueco del
  // logo vacío. Lo dispara el `onload` de la ventana, que espera a las imágenes.
  v.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${titulo}</title>`
    + '<style>@page { size: A4; margin: 16mm } '
    + "body { margin: 0; font-family: 'IBM Plex Sans', system-ui, sans-serif; color: #1F1F1E }"
    + '</style></head><body onload="window.focus(); window.print()">' + html + '</body></html>')
  v.document.close()
  return true
}

/**
 * EL RECIBO, TAL COMO SALE.
 *
 * `pie` escribe debajo de las firmas de dónde salió este papel: en la reimpresión dice cuándo se emitió el
 * original, para que dos copias del mismo recibo no se lean como dos pagos.
 */
export function HojaDelRecibo({ hoja, nombre, categoria, quincena, recibo, borde = true, pie }: {
  hoja?: React.RefObject<HTMLDivElement | null>
  nombre: string
  categoria: string | null
  quincena: { desde: string; hasta: string }
  recibo: ReciboArmado
  borde?: boolean
  pie?: string
}) {
  const nada = recibo.horas.length === 0 && recibo.medios.length === 0
  return (
    <div ref={hoja} data-recibo-imprimible data-testid="recibo-hoja"
      style={{ border: borde ? `1px solid ${V.lineaFila}` : 0, borderRadius: 6, padding: '20px 20px 24px', background: '#FFFFFF', color: '#1F1F1E', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
        <div>
          {/* EL LOGO, ARRIBA (dueño, 22/09/2026). Ya trae el nombre de la empresa, así que no se repite
              escrito. Va como `<img>` y no como `next/image` a propósito: lo que se imprime es una COPIA
              del HTML de este recuadro, y el marcado que genera `next/image` (srcset, carga diferida) no
              sobrevive a esa copia — saldría el hueco vacío. */}
          <img src="/marca/logo.png" alt="Echegaray Construcciones S.A.S." height={92}
            style={{ height: 92, width: 'auto', display: 'block' }} />
          <div style={{ fontSize: '11.5px', color: '#6B6B69', marginTop: 6 }}>San Juan · Argentina</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '15px', fontWeight: 600 }}>Recibo de pago</div>
          <div style={{ fontSize: '11.5px', color: '#6B6B69' }}>{`Quincena ${fechaCorta(quincena.desde)} al ${fechaCorta(quincena.hasta)}`}</div>
        </div>
      </header>

      <div style={{ fontSize: '13px', lineHeight: 1.5 }}>
        <div><span style={{ color: '#6B6B69' }}>Nombre </span><strong>{nombre}</strong></div>
        {categoria && <div><span style={{ color: '#6B6B69' }}>Categoría </span>{categoria}</div>}
      </div>

      {recibo.horas.length > 0 && (
        <Bloque titulo="Trabajo de la quincena">
          {recibo.horas.map((r) => (
            <Linea key={r.rotulo} rotulo={r.rotulo} importe={r.horas == null ? 'sin dato' : `${String(r.horas).replace('.', ',')} h`} />
          ))}
        </Bloque>
      )}

      {recibo.medios.length > 0 && (
        <Bloque titulo="Cómo se paga">
          {recibo.medios.map((r, i) => (
            <Linea key={`${r.rotulo}-${i}`} rotulo={r.rotulo} importe={plata(r.importe)} sub={r.sub} />
          ))}
        </Bloque>
      )}

      {recibo.medios.some((r) => !r.sub) && (
        <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1.5px solid #1F1F1E', paddingTop: 8, fontSize: '14px', fontWeight: 600 }}>
          <span>Total</span>
          <span style={{ fontFamily: MONO }} data-testid="recibo-total">{plata(recibo.total)}</span>
        </div>
      )}

      {nada && <div style={{ fontSize: '12.5px', color: '#6B6B69' }}>Tildá al menos un concepto.</div>}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginTop: 28, fontSize: '11.5px', color: '#6B6B69' }}>
        <div style={{ borderTop: '1px solid #1F1F1E', paddingTop: 6 }}>Recibí conforme · firma</div>
        <div style={{ borderTop: '1px solid #1F1F1E', paddingTop: 6 }}>Aclaración y fecha</div>
      </div>

      {pie && <div style={{ fontSize: '10.5px', color: '#8A8A87' }} data-testid="recibo-pie">{pie}</div>}
    </div>
  )
}

function Bloque({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: '10.5px', letterSpacing: '0.08em', textTransform: 'uppercase', color: '#6B6B69', borderBottom: '1px solid #D9D8D4', paddingBottom: 4, marginBottom: 4 }}>{titulo}</div>
      {children}
    </div>
  )
}

function Linea({ rotulo, detalle, importe, sub }: { rotulo: string; detalle?: string; importe: string; sub?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: sub ? '2px 0 2px 14px' : '6px 0', fontSize: sub ? '12px' : '13px', color: sub ? '#6B6B69' : '#1F1F1E' }}>
      <span>
        {rotulo}
        {detalle && <span style={{ color: '#6B6B69', marginLeft: 8, fontSize: '12px' }}>{detalle}</span>}
      </span>
      <span style={{ fontFamily: MONO }}>{importe}</span>
    </div>
  )
}
