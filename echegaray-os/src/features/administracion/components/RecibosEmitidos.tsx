'use client'

// LOS RECIBOS EMITIDOS, EN EL LEGAJO DE LA PERSONA — qué se le entregó, y el mismo papel de vuelta.
//
// Dueño, 22/09/2026: *«deben ir guardandose en los legajos correspondientes»*. Esto es ese lado: la lista de
// lo que se aceptó e imprimió —quincena, horas, banco, efectivo, total, quién lo emitió y cuándo— y el botón
// que vuelve a imprimirlo.
//
// ═══ LA REIMPRESIÓN SALE IGUAL PORQUE NO RECALCULA ═══
//
// Dibuja `HojaDelRecibo` con los renglones SELLADOS que trae la base, los mismos que salieron ese día. No
// mira la liquidación de la quincena: si las horas se corrigieron después, el papel que la persona firmó
// sigue diciendo lo que decía. La copia lleva al pie cuándo se emitió el original, para que dos papeles del
// mismo recibo no se lean como dos pagos.
//
// ═══ POR QUÉ ESTÁ EN «RETRIBUCIÓN» Y NO EN «DOCUMENTOS» ═══
//
// Un recibo dice cuánta plata cobró la persona. «Documentos» la abre el jefe de obra —es el legajo de
// papeles: DNI, alta temprana, EPP— y la Liquidación no es suya. «Retribución» ya tiene la puerta correcta
// (`liquidaSueldos`, la misma que cierra el módulo donde se emite), y es la cara de la plata del legajo.
// La tabla de la base lo cierra otra vez con `liquida_sueldos()`, que es la cerradura que vale.

import { useRef, useState } from 'react'
import { V } from '@/shared/components/v2/patron'
import { pesos } from './liquidacion/formato'
import {
  HojaDelRecibo, fechaCorta, imprimirHoja, tituloDelRecibo,
} from './liquidacion/cuadro/HojaDelRecibo'
import type { ReciboEnElLegajo } from '../services/reciboEmitido'
import type { RecibosDelLegajo } from '../services/recibosEmitidosService'

const MONO = "'IBM Plex Mono', monospace"
const cifra = (n: number | null): string => (n == null ? '—' : pesos(n))
const horasDichas = (n: number | null): string => (n == null ? '—' : `${String(n).replace('.', ',')} h`)

/** «22/09/2026 14:05». El sello viaja en UTC y se escribe en la hora de San Juan, que es cuando se imprimió. */
function momento(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 'sin fecha'
  return d.toLocaleString('es-AR', {
    timeZone: 'America/Argentina/San_Juan', day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

export function RecibosEmitidos({ datos }: { datos: RecibosDelLegajo }) {
  const [abierto, setAbierto] = useState<string | null>(null)
  if (!datos.puedeVer) return null
  return (
    <section data-testid="recibos-emitidos" style={{ marginTop: 32 }}>
      <h3 style={{ fontSize: '13px', fontWeight: 600, color: V.tinta, marginBottom: 2 }}>Recibos emitidos</h3>
      <p style={{ fontSize: '11.5px', color: V.apagado, marginBottom: 10, maxWidth: 720, lineHeight: 1.5 }}>
        Lo que se aceptó e imprimió desde Liquidación, con las cifras tal como salieron. La reimpresión no
        recalcula: sale el mismo papel. El PDF no queda guardado acá — queda en la máquina de quien imprimió.
      </p>
      {datos.error && (
        <p style={{ fontSize: '12.5px', color: V.warn, lineHeight: 1.5 }} data-testid="recibos-emitidos-error">{datos.error}</p>
      )}
      {!datos.error && datos.recibos.length === 0 && (
        <p style={{ fontSize: '12.5px', color: V.apagado }}>Todavía no se le emitió ningún recibo desde el OS.</p>
      )}
      {datos.recibos.map((r) => (
        <Fila key={r.id} r={r} abierto={abierto === r.id} alternar={() => setAbierto(abierto === r.id ? null : r.id)} />
      ))}
    </section>
  )
}

function Fila({ r, abierto, alternar }: { r: ReciboEnElLegajo; abierto: boolean; alternar: () => void }) {
  const hoja = useRef<HTMLDivElement>(null)
  const [bloqueada, setBloqueada] = useState(false)
  return (
    <div data-testid="recibo-emitido" style={{ borderBottom: `1px solid ${V.lineaFila}`, padding: '10px 0' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '4px 16px', fontSize: '13px', color: V.tinta }}>
        <span style={{ minWidth: 170 }}>
          {`${fechaCorta(r.quincenaDesde)} al ${fechaCorta(r.quincenaHasta)}`}
          {/* EL ÚLTIMO DE LA QUINCENA. Los anteriores no se esconden: también se entregaron. */}
          {!r.esUltimo && <span style={{ fontSize: '11px', color: V.apagado }}> · anterior</span>}
        </span>
        <span style={{ fontFamily: MONO, fontSize: '12.5px', color: V.apagado }}>{horasDichas(r.horas)}</span>
        <span style={{ fontFamily: MONO, fontSize: '12.5px', color: V.apagado }}>{`banco ${cifra(r.banco)}`}</span>
        <span style={{ fontFamily: MONO, fontSize: '12.5px', color: V.apagado }}>{`efectivo ${cifra(r.efectivo)}`}</span>
        <span style={{ fontFamily: MONO, fontWeight: 600, marginLeft: 'auto' }}>{cifra(r.total)}</span>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px 12px', marginTop: 4 }}>
        <span style={{ fontSize: '11px', color: V.tenue }}>
          {`Emitido ${momento(r.emitidoEn)} por ${r.emitidoPor ?? 'sin identificar'}`}
        </span>
        <button type="button" onClick={alternar} data-testid="recibo-ver"
          style={{ border: 0, background: 'none', padding: 0, fontSize: '11.5px', color: V.tinta, textDecoration: 'underline', cursor: 'pointer' }}>
          {abierto ? 'Ocultar el papel' : 'Ver el papel'}
        </button>
        <button type="button" data-testid="recibo-reimprimir"
          onClick={() => setBloqueada(!imprimirHoja(hoja.current, tituloDelRecibo(r.nombre, r.quincenaDesde, r.quincenaHasta)))}
          style={{ border: 0, background: 'none', padding: 0, fontSize: '11.5px', color: V.tinta, textDecoration: 'underline', cursor: 'pointer' }}>
          Reimprimir
        </button>
        {bloqueada && (
          <span style={{ fontSize: '11.5px', color: V.warn }} data-testid="recibo-reimprimir-bloqueada">
            El navegador bloqueó la ventana. Permití las ventanas emergentes de app.ecsas.com.ar.
          </span>
        )}
      </div>
      {/* EL PAPEL SIEMPRE EN EL ÁRBOL Y OCULTO CUANDO NO SE MIRA: `imprimirHoja` copia el HTML de este nodo,
          así que reimprimir sin abrirlo tiene que encontrarlo dibujado. `display: none` no lo quita del DOM. */}
      <div style={{ display: abierto ? 'block' : 'none', marginTop: 12, maxWidth: 640 }}>
        <HojaDelRecibo
          hoja={hoja} nombre={r.nombre} categoria={r.categoria}
          quincena={{ desde: r.quincenaDesde, hasta: r.quincenaHasta }}
          recibo={{ horas: r.renglones.horas, medios: r.renglones.medios, total: r.total }}
          pie={`Copia del recibo emitido el ${momento(r.emitidoEn)}${r.emitidoPor ? ` por ${r.emitidoPor}` : ''}.`}
        />
      </div>
    </div>
  )
}
