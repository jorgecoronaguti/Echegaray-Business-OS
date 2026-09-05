// COMPRAS — la pestaña Compras del Sheet, con la geometría del handoff v4.
//
// `design_handoff_crm_v4/pantallas/Administración v4 · Pantallas.dc.html`, bloque «3 · COMPRAS»:
//   `minmax(150px,1.2fr) minmax(120px,1fr) 112px minmax(110px,1fr) 92px 104px 112px 26px`
//
// ═══ QUÉ CAMBIÓ RESPECTO DEL PORTE ANTERIOR (04/09/2026) ═══
//
// La fila tenía siete columnas y abría con FECHA. La v4 la lleva a ocho y cambia dos cosas:
//
//   · EL COMPROBANTE SUBE A COLUMNA PROPIA. Estaba apilado bajo el concepto, en 10,5px, y es el
//     dato con el que se compara la fila contra el papel. Más importante: 876 de 882 filas NO
//     tienen comprobante, y ese es el trabajo pendiente más grande de la pantalla — apilado abajo
//     no se ve, y en su columna se lee de un vistazo cuál falta, en ámbar (sin comprobante el gasto
//     no acredita IVA).
//   · FORMA DE PAGO SUBE A COLUMNA PROPIA. Estaba sólo en el panel, y es lo que decide cuándo sale
//     la plata: una compra a cheque 60d y una a transferencia no pesan igual en la caja de esta
//     semana aunque el importe sea el mismo.
//   · LA FECHA BAJA AL PANEL. Es lo que se sacrifica para que entren las dos anteriores: la lista
//     ya viene ordenada por fecha y el día exacto se lee en la propiedad «Fecha» del panel. Es la
//     única pérdida de este cambio y se declara.
//
// La UNIDAD DE NEGOCIO sigue delante del destino en 11px apagado (897 de 897 filas la tienen), la
// DEUDA PARCIAL sigue bajo el importe en ámbar y sólo cuando es mayor que cero, y el chip
// «estructura» sigue al lado de `F931`, `Taller` y `Almacen`, que no son obras sino costo de la
// empresa (la regla vive en `services/comprasSheet.ts`, no acá).
//
// ═══ LA ÚLTIMA COLUMNA (26px) ES EL PAPEL, NO UN `⋯` ═══
//
// En el mockup ese `⋯` no tiene handler: es decorativo. Se reemplaza por el comprobante, que es lo
// que el dueño pidió que estuviera en la fila. Ver `CeldaComprobante`.

import Link from 'next/link'
import {
  ALTO, C, CeldaTexto, EncabezadoCanon, FilaCanon, PieCanon, TarjetaTabla, VacioCanon,
  IcoAlerta, entero, pesos,
} from '@/shared/components/canon'
import { esEstructura, pastillaDe, totalesDe } from '../services/comprasSheet'
import type { FilaConPapel } from '../services/comprasSheetService'
import { CeldaComprobante } from './CeldaComprobante'

/** El handoff v4, bloque «3 · COMPRAS». Ocho columnas; la última es el papel. */
const COLS = 'minmax(150px,1.2fr) minmax(120px,1fr) 112px minmax(110px,1fr) 92px 104px 112px 26px'

/** La pastilla del canónico: 11px, radio 11, borde propio. */
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
          { rotulo: 'PROVEEDOR' }, { rotulo: 'CONCEPTO' }, { rotulo: 'COMPROBANTE' },
          { rotulo: 'CLIENTE / ASIGNACIÓN' }, { rotulo: 'ESTADO' }, { rotulo: 'FORMA DE PAGO' },
          { rotulo: 'IMPORTE', alineacion: 'derecha' }, { vacia: true, rotulo: '' },
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
              <CeldaTexto>{f.proveedor ?? 'sin proveedor'}</CeldaTexto>
              <CeldaTexto>{f.concepto ?? f.detalle_obra ?? 'sin concepto'}</CeldaTexto>
              {/* SIN COMPROBANTE EL GASTO NO ACREDITA IVA: por eso va en ámbar y no en gris. Es el
                  único dato de la fila cuya ausencia cuesta plata. */}
              <span
                className="font-mono"
                style={{
                  fontSize: 11.5, color: f.comprobante ? C.tintaSuave : '#B54708',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}
                data-testid={f.comprobante ? undefined : 'compra-sin-comprobante'}
              >
                {f.comprobante ? `${f.tipo ? `${f.tipo} ` : ''}${f.comprobante}` : 'sin comprobante'}
              </span>
              {/* «Sin imputar» en rojo con su ⚠: hoy las 882 filas tienen destino, así que este
                  camino no se ve — existe porque el día que alguien cargue una sin imputar tiene
                  que gritarlo, no esconderlo. */}
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
              {/* NO BLOQUEA NADA y por eso es apagado, no ámbar: sin forma de pago la compra existe
                  igual; lo único que no se puede es proyectar cuándo sale la plata. */}
              <CeldaTexto color={f.tipo_pago ? C.tintaSuave : C.tenue}>
                {f.tipo_pago || 'sin cargar'}
              </CeldaTexto>
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
