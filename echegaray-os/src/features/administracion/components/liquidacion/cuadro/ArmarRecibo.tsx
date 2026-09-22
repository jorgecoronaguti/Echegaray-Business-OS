'use client'

// «RECIBO» EN EL PANEL DE LA PERSONA — se tilda qué lleva, se ve cómo queda, se imprime o se guarda en PDF.
//
// Dueño, 22/09/2026 (textual en `reciboDeLaQuincena.ts`): el recibo sale del panel de cada persona en
// Liquidación, sin esperar a que la quincena cierre, y se va armando: horas en blanco, horas en negro,
// efectivo, depósito en banco. Reemplaza a la página aparte de recibos, que no se parecía a nada del cuadro.
//
// No guarda nada en la base: el papel es lo que se imprime. «Guardar PDF» es el diálogo de impresión con
// «Guardar como PDF» (el patrón de la planilla de Herramientas): la app no genera PDF en el servidor.

import { useRef, useState } from 'react'
import { V } from '@/shared/components/v2/patron'
import { pesos } from '../formato'
import type { FilaDelEspejo } from '../../../services/espejoDeJornales'
import {
  armarRecibo, conceptosDisponibles, eleccionInicial,
  type ConceptoDelRecibo, type EleccionDelRecibo,
} from '../../../services/reciboDeLaQuincena'
import { rotuloCategoria } from './CeldaTarifa'
import { tipoDeLiquidacion } from '../../../services/liquidacionPorTipo'

const MONO = "'IBM Plex Mono', monospace"
const fecha = (iso: string): string => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`
const plata = (n: number | null): string => (n == null ? 'sin dato' : pesos(n))

// SIN BLANCO NI NEGRO (dueño, 22/09/2026): el papel dice horas totales, depositado y efectivo. El reparto es
// una cuenta interna y se mira en el panel de Liquidación, no en lo que firma la persona.
const OPCIONES: { clave: ConceptoDelRecibo; rotulo: string }[] = [
  { clave: 'horas', rotulo: 'Horas trabajadas' },
  { clave: 'banco', rotulo: 'Depósito en banco' },
  { clave: 'efectivo', rotulo: 'Efectivo' },
  { clave: 'pagado', rotulo: 'Lo ya pagado y lo que resta' },
]

/**
 * IMPRIME SÓLO EL RECIBO, EN SU PROPIA VENTANA.
 *
 * Antes se ocultaba la app con `visibility: hidden` y el recibo iba `position: fixed`. Eso deja el alto del
 * cuadro entero —y Chrome repite los elementos fijos en cada hoja—: salían páginas en blanco y el recibo
 * repetido (auditoría 22/09/2026). Una ventana con el recibo solo imprime una hoja, y su título es el nombre
 * que el diálogo propone al guardar como PDF.
 */
function imprimir(nodo: HTMLElement | null, titulo: string): boolean {
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

export function ArmarRecibo({ fila, quincena }: {
  fila: FilaDelEspejo
  quincena: { desde: string; hasta: string }
}) {
  // MENSUAL vs JORNALERO lo decide la misma función que el cuadro: una quincena cerrada tampoco trae el
  // detalle de blanco y negro, y sin esto el panel le decía «cobra por mes» a un jornalero.
  const mensual = tipoDeLiquidacion(fila) === 'mensual'
  const disponibles = conceptosDisponibles(fila.linea, mensual)
  const [eleccion, setEleccion] = useState<EleccionDelRecibo>(() => eleccionInicial(fila.linea, mensual))
  const recibo = armarRecibo(fila.linea, eleccion, pesos, mensual)
  const hoja = useRef<HTMLDivElement>(null)
  const [bloqueada, setBloqueada] = useState(false)
  const nada = recibo.horas.length === 0 && recibo.medios.length === 0

  return (
    <section data-testid="armar-recibo" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <fieldset style={{ border: 0, padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <legend style={{ fontSize: '11px', letterSpacing: '0.06em', textTransform: 'uppercase', color: V.apagado, marginBottom: 6 }}>
          Qué lleva el recibo
        </legend>
        {OPCIONES.map(({ clave, rotulo }) => {
          const motivo = disponibles[clave]
          return (
            <label key={clave} style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 32, fontSize: '13px', color: motivo ? V.apagado : V.tinta, cursor: motivo ? 'default' : 'pointer' }}>
              <input type="checkbox" checked={!motivo && eleccion[clave]} disabled={!!motivo}
                onChange={(x) => setEleccion({ ...eleccion, [clave]: x.target.checked })}
                data-testid={`recibo-opcion-${clave}`} style={{ width: 16, height: 16 }} />
              <span>{rotulo}</span>
              {motivo && <span style={{ fontSize: '11.5px' }}>· {motivo}</span>}
            </label>
          )
        })}
      </fieldset>

      {/* EL PAPEL, tal como sale. */}
      <div ref={hoja} data-recibo-imprimible data-testid="recibo-hoja"
        style={{ border: `1px solid ${V.lineaFila}`, borderRadius: 6, padding: '20px 20px 24px', background: '#FFFFFF', color: '#1F1F1E', display: 'flex', flexDirection: 'column', gap: 16 }}>
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
            <div style={{ fontSize: '11.5px', color: '#6B6B69' }}>{`Quincena ${fecha(quincena.desde)} al ${fecha(quincena.hasta)}`}</div>
          </div>
        </header>

        <div style={{ fontSize: '13px', lineHeight: 1.5 }}>
          <div><span style={{ color: '#6B6B69' }}>Nombre </span><strong>{fila.nombre}</strong></div>
          {fila.categoria && <div><span style={{ color: '#6B6B69' }}>Categoría </span>{rotuloCategoria(fila.categoria)}</div>}
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
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <button type="button" disabled={nada} onClick={() => setBloqueada(!imprimir(hoja.current, `Recibo ${fila.nombre} ${fecha(quincena.desde)} al ${fecha(quincena.hasta)}`))} data-testid="recibo-imprimir"
          style={{ padding: '9px 16px', lineHeight: '20px', borderRadius: 6, border: 0, background: V.grafito, color: '#FFFFFF', fontSize: '13px', fontWeight: 600, cursor: nada ? 'default' : 'pointer', opacity: nada ? 0.5 : 1 }}>
          Imprimir
        </button>
        <button type="button" disabled={nada} onClick={() => setBloqueada(!imprimir(hoja.current, `Recibo ${fila.nombre} ${fecha(quincena.desde)} al ${fecha(quincena.hasta)}`))} data-testid="recibo-pdf"
          style={{ padding: '9px 16px', lineHeight: '20px', borderRadius: 6, border: `1px solid ${V.lineaFuerte}`, background: '#FFFFFF', color: V.tinta, fontSize: '13px', cursor: nada ? 'default' : 'pointer', opacity: nada ? 0.5 : 1 }}>
          Guardar PDF
        </button>
        <span style={{ fontSize: '11.5px', color: V.apagado }}>Para el PDF, elegí «Guardar como PDF» en el diálogo.</span>
        {bloqueada && (
          <div style={{ width: '100%', fontSize: '12.5px', color: V.warn, lineHeight: 1.5 }} data-testid="recibo-bloqueada">
            El navegador bloqueó la ventana de impresión. Permití las ventanas emergentes de app.ecsas.com.ar y probá de nuevo.
          </div>
        )}
      </div>
    </section>
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
