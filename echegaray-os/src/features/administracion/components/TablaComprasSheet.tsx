// 24 · COMPRAS — la pestaña Compras del Sheet, con la geometría del canónico.
//
// `echegaray-design-v2/24 · Compras.dc.html`, línea 156:
//   `62px minmax(0,1.2fr) minmax(0,1.4fr) minmax(0,1.1fr) 116px 116px 26px`
//
// ═══ LO QUE AGREGA LA v2 (25/08/2026) ═══
//
// `24 · Compras v2` declara que la tabla «conserva la estructura real del Sheet Flujo de Fondos:
// Unidad de Negocio · Cliente/Asignación · Forma de Pago · Deuda Parcial · Tipo de Costo». No son
// cinco columnas nuevas —la tabla se volvería ilegible—: la v2 las APILA dentro de las celdas que
// ya existen, igual que el número de comprobante bajo el concepto. Acá se portan las dos que van en
// la fila:
//
//   · la UNIDAD DE NEGOCIO delante del destino, en 11px apagado (897 de 897 filas la tienen: Civil
//     540, Estructura 219, Impuestos 72, Mantenimiento 54, Financiero 12);
//   · la DEUDA PARCIAL bajo el importe, en ámbar y sólo cuando es mayor que cero — 22 filas.
//
// Y el chip «estructura» al lado de `F931`, `Taller` y `Almacen`, que no son obras sino costo de la
// empresa (la regla vive en `services/comprasSheet.ts`, no acá).
//
// Forma de Pago y Tipo de Costo NO entran a la fila: la v2 las pone en el panel de detalle.
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
import { esEstructura, pastillaDe, totalesDe } from '../services/comprasSheet'
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
            <Link href={hrefDe(f.fila)} prefetch={false} style={{ display: 'contents' }}>
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
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, minWidth: 0 }}>
                {f.unidad_negocio && (
                  <span style={{ fontSize: 11, color: C.tenue, flexShrink: 0 }}>{f.unidad_negocio}</span>
                )}
                <CeldaTexto color={obra ? C.tinta : '#B42318'}>
                  {obra || 'sin imputar'}
                </CeldaTexto>
                {!obra && (
                  <span title="Sin imputar a obra" style={{ display: 'flex', color: '#B42318', flexShrink: 0 }}>
                    <IcoAlerta s={13} />
                  </span>
                )}
                {esEstructura(obra) && (
                  <span
                    title="Costo de la empresa, no de una obra"
                    style={{
                      fontSize: 10, color: C.apagado, border: `1px solid ${C.linea}`,
                      borderRadius: 5, padding: '1px 5px', flexShrink: 0, whiteSpace: 'nowrap',
                    }}
                  >
                    estructura
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', minWidth: 0 }}>
                <Pastilla estado={f.estado} />
              </div>
              <div style={{
                display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1, minWidth: 0,
                fontFamily: 'var(--font-plex-mono)', fontSize: 12, textAlign: 'right',
              }}
              >
                <Importe f={f} />
                {/* LO QUE TODAVÍA SE DEBE, y sólo cuando se debe algo. `saldo_pendiente` en 0 no es
                    «debe 0»: es que no debe nada, y dibujarlo diría lo contrario de lo que pasa. */}
                {f.saldo_pendiente != null && f.saldo_pendiente > 0 && (
                  <span title="Deuda parcial" style={{ fontSize: 10.5, color: '#B54708' }}>
                    debe {pesos(f.saldo_pendiente)}
                  </span>
                )}
              </div>
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
