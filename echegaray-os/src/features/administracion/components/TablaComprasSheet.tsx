// 24 · COMPRAS — la pestaña Compras del Sheet, con la geometría del canónico.
//
// `echegaray-design-v2/24 · Compras.dc.html`, línea 156:
//   `62px minmax(0,1.2fr) minmax(0,1.4fr) minmax(0,1.1fr) 116px 116px 26px`
//
// ═══ AHORA LA TERCERA COLUMNA SÍ DICE «CONCEPTO» ═══
//
// La versión anterior de esta tabla la rotulaba «COMPROBANTE» con un motivo correcto: el libro de
// ARCA no trae el detalle de lo comprado, así que «Hormigón H17 · 6 m³» era dato inventado del
// mockup y dibujar una columna vacía habría hecho parecer que faltaba cargar algo inexistente.
// Leyendo la PESTAÑA eso deja de ser cierto: «Concepto» y «Detalles / Obra» son dos columnas reales
// que el dueño llena. El canónico se puede portar tal cual porque ahora hay con qué.
//
// El número de comprobante no se pierde: va debajo del concepto, en mono, que es como se lo compara
// contra el papel.
//
// ═══ LA ÚLTIMA COLUMNA (26px) ES EL PAPEL, NO UN `⋯` ═══
//
// En el mockup ese `⋯` no tiene handler: es decorativo. Se reemplaza por el comprobante, que es lo
// que el dueño pidió que estuviera en la fila. Ver `CeldaComprobante`.

import Link from 'next/link'
import {
  ALTO, C, CeldaTexto, EncabezadoCanon, FilaCanon, PieCanon, TarjetaTabla, VacioCanon,
  IcoAlerta, diaMes, entero, pesos,
} from '@/shared/components/canon'
import { pastillaDe, totalesDe } from '../services/comprasSheet'
import type { FilaConPapel } from '../services/comprasSheetService'
import { CeldaComprobante } from './CeldaComprobante'

/** `24`, línea 156. */
const COLS = '62px minmax(0,1.2fr) minmax(0,1.4fr) minmax(0,1.1fr) 116px 116px 26px'

/** La pastilla del canónico: 11px, radio 11, borde propio. Líneas 118-121. */
function Pastilla({ estado }: { estado: string | null }) {
  const p = pastillaDe(estado)
  return (
    <span
      data-testid="estado-compra"
      style={{
        fontSize: 11, fontWeight: 500, color: p.color, background: p.fondo,
        border: `1px solid ${p.borde}`, borderRadius: 11, padding: '1.5px 8px', whiteSpace: 'nowrap',
      }}
    >
      {p.texto}
    </span>
  )
}

/**
 * EL IMPORTE. Una fila anulada se dibuja apagada y tachada: existe en la pestaña, no es un gasto.
 * Un total ausente NO se dibuja como $0 — un cero es una afirmación y un vacío es una ausencia.
 */
function Importe({ f }: { f: FilaConPapel }) {
  if (f.total == null) return <span style={{ color: C.tenue }}>sin importe</span>
  return (
    <span style={{
      color: f.anulada ? C.tenue : f.total < 0 ? '#067647' : C.tinta,
      textDecoration: f.anulada ? 'line-through' : undefined,
    }}
    >
      {pesos(f.total)}
    </span>
  )
}

export function TablaComprasSheet({
  filas, seleccionada, hrefDe,
}: {
  filas: FilaConPapel[]
  seleccionada?: number
  hrefDe: (fila: number) => string
}) {
  const t = totalesDe(filas)
  return (
    <TarjetaTabla testid="tabla-compras-sheet" cols={COLS}>
      <EncabezadoCanon
        cols={COLS}
        columnas={[
          { rotulo: 'FECHA' }, { rotulo: 'PROVEEDOR' }, { rotulo: 'CONCEPTO' }, { rotulo: 'OBRA' },
          { rotulo: 'ESTADO' }, { rotulo: 'MONTO', alineacion: 'derecha' }, { vacia: true, rotulo: '' },
        ]}
      />

      {filas.map((f) => {
        const obra = f.obra_texto?.trim()
        return (
          <FilaCanon
            key={f.fila}
            cols={COLS}
            alto={ALTO.fila}
            seleccionada={seleccionada === f.fila}
            testid={`compra-${f.fila}`}
          >
            <Link href={hrefDe(f.fila)} style={{ display: 'contents' }}>
              <span style={{ fontFamily: 'var(--font-plex-mono)', fontSize: 11.5, color: C.tintaSuave }}>
                {f.fecha ? diaMes(f.fecha) : '—'}
              </span>
              <CeldaTexto>{f.proveedor ?? 'sin proveedor'}</CeldaTexto>
              <div style={{ minWidth: 0 }}>
                <CeldaTexto>{f.concepto ?? f.detalle_obra ?? 'sin concepto'}</CeldaTexto>
                {f.comprobante && (
                  <span style={{ fontFamily: 'var(--font-plex-mono)', fontSize: 10.5, color: C.tenue }}>
                    {f.tipo ? `${f.tipo} ` : ''}{f.comprobante}
                  </span>
                )}
              </div>
              {/* «Sin imputar» en rojo con su ⚠, igual que el canónico (líneas 106-112). Hoy las 882
                  filas tienen obra, así que este camino no se ve — existe porque el día que alguien
                  cargue una sin imputar tiene que gritarlo, no esconderlo. */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                <CeldaTexto color={obra ? C.tinta : '#B42318'}>
                  {obra || 'sin imputar'}
                </CeldaTexto>
                {!obra && (
                  <span title="Sin imputar a obra" style={{ display: 'flex', color: '#B42318', flexShrink: 0 }}>
                    <IcoAlerta s={13} />
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', minWidth: 0 }}>
                <Pastilla estado={f.estado} />
              </div>
              <span style={{ fontFamily: 'var(--font-plex-mono)', fontSize: 12, textAlign: 'right' }}>
                <Importe f={f} />
              </span>
            </Link>
            <CeldaComprobante adjuntos={f.adjuntos} />
          </FilaCanon>
        )
      })}

      {!filas.length && <VacioCanon testid="compras-vacio">Nada coincide.</VacioCanon>}

      <PieCanon
        totales={[
          { rotulo: 'COMPROBANTES', valor: entero(t.nTotal), testid: 'pie-n' },
          { rotulo: 'SIN COMPROBANTE', valor: entero(t.nSinComprobante), color: '#B42318', testid: 'pie-sin-papel' },
          { rotulo: 'SIN IMPUTAR', valor: entero(t.nSinObra), color: '#B42318', testid: 'pie-sin-obra' },
          { rotulo: 'A PAGAR', valor: pesos(t.aPagar), color: '#B54708', testid: 'pie-a-pagar' },
          { rotulo: 'TOTAL', valor: pesos(t.total), fuerte: true, testid: 'pie-total' },
        ]}
      />
    </TarjetaTabla>
  )
}
