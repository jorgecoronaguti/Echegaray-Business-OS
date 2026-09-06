// COMPRAS — la pestaña Compras del Sheet, dibujada con el PATRÓN v2.
//
// Contrato: `design_handoff_crm_v4/pantallas/Administración v4 · Pantallas.dc.html`, bloque
// «3 · COMPRAS · LA PESTAÑA DEL SHEET» (líneas 208-245).
//
// ═══ QUÉ CAMBIÓ EL 06/09/2026: SE FUE LA CAJA ═══
//
// Esta tabla era la única de las tres pantallas del canvas A que seguía corriendo por
// `shared/components/canon` —el zip de AGOSTO—, cuyo objeto central es la CAJA: `TarjetaTabla`
// declara `background:#FFFFFF;border:1px solid #E7E6E2;borderRadius:10px`, encabezado gris de 38px,
// rótulo de 10px/.05em, fila de 46 y pie de totales adentro. El canvas la dibuja SIN caja, con
// cabecera de 30, rótulo 11px/600/.06em y fila de 44 — el criterio 3 del patrón: «sin cajas —
// filos, tipografía y números tabulares, el color sólo en la cifra».
//
// El ritmo NO se redeclara acá: sale de `ALTO_V2` (`shared/components/v2/patron.tsx`), que es la
// única constante del repositorio que puede decir cuánto mide una fila. `ritmo-vertical.test.ts`
// se pone rojo si este archivo escribe un alto propio.
//
// Con la caja se fue el PIE DE TOTALES del canon —el bloque gris con COMPROBANTES / SIN COMPROBANTE
// / SIN IMPUTAR / A PAGAR / TOTAL—. Lo reemplaza `PieCompras`, que es la línea del canvas (`:246`)
// y vive DENTRO de la columna de la lista, no debajo del split: con el panel abierto, un pie a lo
// ancho de los dos decía «6 de 882» cruzando por debajo del panel y se leía como si lo describiera
// a él también.
//
// ═══ TRES COSAS QUE EL CANON PINTABA DE MÁS ═══
//
//   · EL ESTADO YA NO ES UNA PASTILLA. El canvas lo escribe como TEXTO de color (`:216` «Pagado» en
//     #067647, `:224` «A pagar» en #B54708, «Proyectado» en #6B6B67, «Anulada» en #B42318). Los
//     cuatro colores son los mismos que ya devolvía `pastillaDe()`; lo que se retira es el fondo y
//     el borde, que en 947 filas son 947 cápsulas compitiendo con el importe.
//   · «SIN COMPROBANTE» BAJA DE ÁMBAR A APAGADO (`:220`, `:230`: #91918B). El porte anterior lo
//     pintaba ámbar con un argumento correcto —sin papel el gasto no acredita IVA— y un efecto
//     equivocado: 876 de 882 filas no tienen comprobante, así que la columna entera quedaba ámbar y
//     el ámbar dejaba de significar «esto bloquea». Lo que sí bloquea se ve en el filtro «Sin
//     comprobante» y en el panel, donde la propiedad SIGUE en ámbar (`:265`) porque ahí habla de UNA
//     compra.
//   · EL CHIP «ESTRUCTURA» PIERDE SU RECUADRO: el canvas lo escribe en 11px #91918B al lado del
//     destino (`:221`), sin borde ni radio. Un recuadro alrededor de una palabra es una caja más.
//
// ═══ LA ÚLTIMA COLUMNA (26px) ES EL PAPEL, NO UN `⋯` ═══
//
// En el mockup ese `⋯` no tenía handler: era decorativo. Es el comprobante, en tinta cuando el
// vínculo es un hecho y apagado cuando es deducido. Ver `CeldaComprobante`.

import type { ReactNode } from 'react'
import Link from 'next/link'
import { pesos } from '@/shared/components/canon/formato'
import { IconoProblema } from '@/shared/components/iconos'
import { ALTO_V2, CAJA_CONTENIDO, ENCABEZADO, FILO_BLOQUEA, RotuloCol, V } from '@/shared/components/v2/patron'
import { esEstructura, pastillaDe, totalesDe } from '../services/comprasSheet'
import type { FilaConPapel } from '../services/comprasSheetService'
import { CeldaComprobante } from './CeldaComprobante'

/**
 * LA GRILLA DEL CANVAS, carácter por carácter (`v4A:208`), y sus dos variantes angostas. Literales
 * porque Tailwind escanea el texto del archivo: una clase armada en runtime no se compila nunca y
 * la fila se dibuja SIN grilla, defecto que sólo se ve mirando la pantalla.
 *
 * ═══ POR QUÉ HAY VARIANTES SI EL CANVAS DIBUJA UNA SOLA ═══
 *
 * Porque la grilla ancha necesita 924px y a 390 no cede: medido en producción el 06/09/2026,
 * `document.body.scrollWidth` daba 416 contra un viewport de 390 con el panel abierto — 26px de
 * desborde lateral, y el texto «Ver las a pagar →» del panel cortado contra el borde. El canon
 * resolvía eso metiendo la tabla en una caja con scroll propio; el v2 no tiene caja, así que suelta
 * columnas por media query (`25v2:154` — «nunca la identidad»). A 1249 se van CONCEPTO y FORMA DE
 * PAGO; a 767 quedan proveedor, importe y papel: de quién es el gasto, cuánto es, y si hay papel.
 */
const COLS
  = 'grid-cols-[minmax(150px,1.2fr)_minmax(120px,1fr)_112px_minmax(110px,1fr)_92px_104px_112px_26px]'
  + ' max-[1249px]:grid-cols-[minmax(150px,1.2fr)_112px_minmax(110px,1fr)_92px_112px_26px]'
  + ' max-[767px]:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_26px]'

/**
 * Las celdas que se sueltan, y el corte en el que se van. EL `display` DE ESTAS CELDAS VA POR CLASE,
 * NUNCA INLINE: un `style={{ display: 'flex' }}` le gana a cualquier media query y la celda sigue
 * ocupando su ancho aunque la grilla ya no tenga su columna — la fila se corre entera.
 */
const SUELTA_TABLET = 'max-[1249px]:hidden'
const SUELTA_TELEFONO = 'max-[767px]:hidden'

/**
 * EL IMPORTE. Una fila anulada se dibuja apagada y tachada: existe en la pestaña, no es un gasto.
 * Un total ausente NO se dibuja como $0 — un cero es una afirmación y un vacío es una ausencia.
 */
function Importe({ f }: { f: FilaConPapel }) {
  if (f.total == null) return <span style={{ color: V.tenue }}>sin importe</span>
  return (
    <span style={{
      color: f.anulada ? V.tenue : f.total < 0 ? '#067647' : V.tinta,
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
  return (
    <div data-testid="tabla-compras-sheet">
      <div className={`grid gap-[14px] ${COLS}`} style={ENCABEZADO}>
        <RotuloCol>Proveedor</RotuloCol>
        <span className={`grid ${SUELTA_TABLET}`}><RotuloCol>Concepto</RotuloCol></span>
        <span className={`grid ${SUELTA_TELEFONO}`}><RotuloCol>Comprobante</RotuloCol></span>
        <span className={`grid ${SUELTA_TELEFONO}`}><RotuloCol>Cliente / asignación</RotuloCol></span>
        <span className={`grid ${SUELTA_TELEFONO}`}><RotuloCol>Estado</RotuloCol></span>
        <span className={`grid ${SUELTA_TABLET}`}><RotuloCol>Forma de pago</RotuloCol></span>
        <RotuloCol derecha>Importe</RotuloCol>
        <span />
      </div>

      {filas.map((f) => {
        const obra = f.obra_texto?.trim()
        const estado = pastillaDe(f.estado)
        const elegida = seleccionada === f.fila
        return (
          <div
            key={f.fila}
            role="row"
            data-testid={`compra-${f.fila}`}
            data-seleccionada={elegida ? '' : undefined}
            className={`grid items-center gap-[14px] ${CAJA_CONTENIDO} ${COLS} ${elegida ? '' : 'hover:bg-[#F2F1ED]'}`}
            style={{
              height: ALTO_V2.fila,
              borderBottom: `1px solid ${V.lineaFila}`,
              background: elegida ? V.seleccion : undefined,
              // Estado y selección por canales distintos: el filo ámbar dice «esto bloquea» y
              // sobrevive a la selección, que se expresa sólo con el fondo (`22v2:422`).
              boxShadow: obra ? undefined : FILO_BLOQUEA,
            }}
          >
            {/* `display: contents` — la fila entera abre el panel, salvo el papel, que es un botón
                y no puede vivir dentro de un enlace (HTML inválido y rompe el tabulador). */}
            <Link href={hrefDe(f.fila)} prefetch={false} style={{ display: 'contents' }}>
              <span className="truncate" style={{ fontSize: '12.5px', fontWeight: 500, color: f.proveedor ? V.tinta : V.tenue }}>
                {f.proveedor ?? 'sin proveedor'}
              </span>

              <span className={`truncate ${SUELTA_TABLET}`} style={{ fontSize: '12px', color: V.tintaSuave }}>
                {f.concepto ?? f.detalle_obra ?? 'sin concepto'}
              </span>

              <span
                className={`truncate font-mono ${SUELTA_TELEFONO}`}
                style={{ fontSize: '11.5px', color: f.comprobante ? V.tintaSuave : V.tenue }}
                data-testid={f.comprobante ? undefined : 'compra-sin-comprobante'}
              >
                {f.comprobante ? `${f.tipo ? `${f.tipo} ` : ''}${f.comprobante}` : 'sin comprobante'}
              </span>

              {/* «Sin imputar» en rojo con su ⚠: hoy las 947 filas tienen destino, así que este
                  camino no se ve — existe porque el día que alguien cargue una sin imputar tiene
                  que gritarlo, no esconderlo. */}
              <span className={`flex items-baseline gap-[7px] min-w-0 ${SUELTA_TELEFONO}`}>
                {f.unidad_negocio && (
                  <span className="shrink-0" style={{ fontSize: '11px', color: V.tenue }}>{f.unidad_negocio}</span>
                )}
                <span className="truncate" style={{ fontSize: '12px', color: obra ? V.tintaSuave : V.neg }}>
                  {obra || 'sin imputar'}
                </span>
                {!obra && (
                  <span title="Sin imputar a obra" className="flex shrink-0" style={{ color: V.neg }}>
                    <IconoProblema className="h-[13px] w-[13px]" />
                  </span>
                )}
                {esEstructura(obra) && (
                  <span
                    className="shrink-0 whitespace-nowrap"
                    title="Costo de la empresa, no de una obra"
                    style={{ fontSize: '11px', color: V.tenue }}
                  >
                    estructura
                  </span>
                )}
              </span>

              <span className={`truncate ${SUELTA_TELEFONO}`} style={{ fontSize: '12px', color: estado.color }} data-testid="estado-compra">
                {estado.texto}
              </span>

              {/* NO BLOQUEA NADA y por eso es apagado, no ámbar: sin forma de pago la compra existe
                  igual; lo único que no se puede es proyectar cuándo sale la plata. */}
              <span className={`truncate ${SUELTA_TABLET}`} style={{ fontSize: '12px', color: f.tipo_pago ? V.tintaSuave : V.tenue }}>
                {f.tipo_pago || 'sin cargar'}
              </span>

              <span
                className="flex min-w-0 flex-col items-end gap-px font-mono tabular-nums"
                style={{ fontSize: '12px', textAlign: 'right' }}
              >
                <Importe f={f} />
                {/* LO QUE TODAVÍA SE DEBE, y sólo cuando se debe algo. `saldo_pendiente` en 0 no es
                    «debe 0»: es que no debe nada, y dibujarlo diría lo contrario de lo que pasa. */}
                {f.saldo_pendiente != null && f.saldo_pendiente > 0 && (
                  <span title="Deuda parcial" style={{ fontSize: '10.5px', color: V.warn }}>
                    debe {pesos(f.saldo_pendiente)}
                  </span>
                )}
              </span>
            </Link>

            <CeldaComprobante adjuntos={f.adjuntos} />
          </div>
        )
      })}

      {!filas.length && (
        <div data-testid="compras-vacio" style={{ padding: '24px 2px', fontSize: '12.5px', color: V.apagado }}>
          Nada coincide.
        </div>
      )}
    </div>
  )
}

/**
 * EL PIE DE LA LISTA — `v4A:246`, dentro de la columna de la lista y no debajo del split.
 *
 * Suma LO QUE SE ESTÁ VIENDO, que es lo que dice el rótulo del canvas: «Total de lo que hay en
 * pantalla». Los conteos de la población entera son otra cosa y viven arriba, en los chips.
 */
export function PieCompras({
  filas, total, children,
}: {
  filas: FilaConPapel[]
  /** La población entera de la pestaña — el «882» del canvas. */
  total: number
  /** El contexto del recorte: qué filtro está puesto y cómo se sale de él. */
  children?: ReactNode
}) {
  const t = totalesDe(filas)
  return (
    <div
      data-testid="pie-compras"
      className="flex flex-wrap items-baseline gap-x-[22px] gap-y-1"
      style={{ marginTop: 14, fontSize: '12.5px', color: V.apagado }}
    >
      <span>
        <span className="font-mono tabular-nums">{filas.length}</span> de{' '}
        <span className="font-mono tabular-nums" style={{ color: V.tinta }} data-testid="pie-poblacion">{total}</span>
      </span>
      <span>
        A pagar{' '}
        <span className="font-mono tabular-nums" style={{ color: V.warn, fontWeight: 500 }} data-testid="pie-a-pagar">
          {pesos(t.aPagar)}
        </span>
      </span>
      <span>
        Total de lo que hay en pantalla{' '}
        <span className="font-mono tabular-nums" style={{ color: V.tinta, fontWeight: 500 }} data-testid="pie-total">
          {pesos(t.total)}
        </span>
      </span>
      {/* EL TOTAL NO SUMA LO QUE NO TIENE IMPORTE, y eso se dice. La suma trata el `null` como 0
          porque no puede hacer otra cosa; callarlo hace que el total se lea como si estuviera
          completo, y el que lo compare contra el Sheet no va a saber por qué no cierra. */}
      {t.sinImporte > 0 && (
        <span style={{ fontSize: '11.5px', color: V.tenue }} data-testid="compras-sin-importe">
          <span className="font-mono tabular-nums">{t.sinImporte}</span>
          {t.sinImporte === 1 ? ' sin importe cargado: queda' : ' sin importe cargado: quedan'} fuera de la suma
        </span>
      )}
      {children}
    </div>
  )
}
