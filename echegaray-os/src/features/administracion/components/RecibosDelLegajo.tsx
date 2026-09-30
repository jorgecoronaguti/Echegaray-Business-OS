'use client'

// LA SOLAPA «RECIBOS» DEL LEGAJO — todos los recibos de la persona, por período, en un solo lugar.
//
// Dueño, 30/09/2026: «los recibos de sueldo en blanco se accedan más fácilmente [...] una sección exclusiva que
// diga recibos (ahí deben ir los blancos y los firmados)». La regla de qué entra y cómo se ordena vive en
// `recibosDelLegajo.ts`; acá sólo se dibuja.
//
// UNA FILA, UNA ACCIÓN: período · de dónde viene · importe · lo que se hace con él. En el teléfono la fila se
// parte en dos renglones y todo el renglón del papel de la app es tocable; en la PC las mismas filas caen en
// columnas alineadas. El origen se rotula «Del estudio» / «De Liquidación»: así los nombra la app, y la palabra
// «negro» no se dice en pantalla.
//
// El detalle de un recibo de Liquidación (firma, foto del papel, reimprimir, archivar) es el MISMO componente
// que ya usa Retribución (`Fila` de RecibosEmitidos): no se duplica la lógica del ciclo.

import { useState } from 'react'
import { V } from '@/shared/components/v2/patron'
import { urlDeDrive } from '@/features/obras/services/driveUrl'
import { lecturaDelCiclo } from '@/shared/recibo/ciclo'
import { pesos } from './liquidacion/formato'
import { Fila } from './RecibosEmitidos'
import type { FilaDeRecibo } from '../services/recibosDelLegajo'
import type { RecibosDeLaSolapa } from '../services/recibosDelLegajoService'

const MONO = "'IBM Plex Mono', monospace"
const ORIGEN = { estudio: 'Del estudio', liquidacion: 'De Liquidación' } as const
const enlace = { color: V.tinta, textDecoration: 'underline', fontSize: '12.5px' } as const

export function RecibosDelLegajo({ datos }: { datos: RecibosDeLaSolapa }) {
  const [abierto, setAbierto] = useState<string | null>(null)
  if (!datos.puedeVer) return null
  return (
    <section data-testid="recibos-del-legajo">
      {datos.error && <p style={{ fontSize: '12.5px', color: V.warn, marginBottom: 8 }} data-testid="recibos-error">{datos.error}</p>}
      {!datos.error && datos.filas.length === 0 && (
        <p style={{ fontSize: '12.5px', color: V.apagado }} data-testid="recibos-vacio">Todavía no hay recibos en este legajo.</p>
      )}
      <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
        {datos.filas.map((f) => (
          <li key={f.clave} data-testid="recibo-fila" data-origen={f.origen} style={{ borderBottom: `1px solid ${V.lineaFila}` }}>
            <Linea f={f} abierto={abierto === f.clave} alternar={() => setAbierto(abierto === f.clave ? null : f.clave)} />
            {f.origen === 'liquidacion' && abierto === f.clave && (
              <div style={{ paddingBottom: 12 }}>
                <Fila r={f.recibo} abierto alternar={() => setAbierto(null)} />
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}

function Linea({ f, abierto, alternar }: { f: FilaDeRecibo; abierto: boolean; alternar: () => void }) {
  const importe = f.origen === 'estudio' ? f.neto : f.recibo.total
  const accion = f.origen === 'estudio'
    ? (f.driveFileId
      ? <a href={urlDeDrive(f.driveFileId, 'archivo')} target="_blank" rel="noreferrer" style={enlace} data-testid="recibo-abrir">Abrir PDF</a>
      : <span style={{ fontSize: '12.5px', color: V.tenue }}>Sin archivo</span>)
    : <span style={enlace}>{abierto ? 'Ocultar' : 'Ver'}</span>
  const interior = (
    <>
      <span style={{ gridArea: 'per', fontSize: '13px', color: V.tinta }}>{f.rotulo}</span>
      <span style={{ gridArea: 'ori', fontSize: '11.5px', color: V.apagado }}>
        {ORIGEN[f.origen]}
        {f.origen === 'liquidacion' && ` · ${lecturaDelCiclo(f.recibo).rotulo}`}
      </span>
      <span style={{ gridArea: 'imp', fontFamily: MONO, fontSize: '12.5px', textAlign: 'right', color: V.tinta }}>
        {importe == null ? '—' : pesos(importe)}
      </span>
      <span style={{ gridArea: 'acc', textAlign: 'right', minHeight: 24 }}>{accion}</span>
    </>
  )
  // GRILLA, NO TABLA: en 390 px son dos renglones (período+importe / origen+acción), en la PC cuatro columnas
  // alineadas. El renglón entero de una fila de Liquidación es un botón (objetivo táctil), el del estudio no:
  // ahí lo tocable es «Abrir PDF», que es una descarga y no debe dispararse por rozar la fila.
  const clase = 'grid w-full min-h-[44px] items-baseline gap-x-4 gap-y-0.5 py-2.5 '
    + "grid-cols-[minmax(0,1fr)_auto] [grid-template-areas:'per_imp'_'ori_acc'] "
    + "md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_120px_88px] md:[grid-template-areas:'per_ori_imp_acc']"
  return f.origen === 'liquidacion'
    ? <button type="button" onClick={alternar} aria-expanded={abierto} data-testid="recibo-fila-toque"
      className={clase} style={{ border: 0, background: 'none', textAlign: 'left', cursor: 'pointer', font: 'inherit' }}>{interior}</button>
    : <div className={clase}>{interior}</div>
}
