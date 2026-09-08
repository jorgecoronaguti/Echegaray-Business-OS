// COMPRAS — la pestaña Compras del Sheet, dibujada con el PATRÓN v2.
//
// Contrato: `design_handoff_crm_v4/pantallas/Administración v4 · Pantallas.dc.html`, bloque
// «3 · COMPRAS · LA PESTAÑA DEL SHEET» (líneas 222-247).
//
// ═══ QUÉ CAMBIÓ EL 06/09/2026: SE FUE LA CAJA ═══
//
// Esta tabla era la única de las tres pantallas del canvas A que seguía corriendo por
// `shared/components/canon` —el zip de AGOSTO—, cuyo objeto central es la CAJA: `TarjetaTabla`
// declara `background:#FFFFFF;border:1px solid #E7E6E2;borderRadius:10px`, encabezado gris de 38px,
// rótulo de 10px/.05em y pie de totales adentro. El canvas la dibuja SIN caja, con cabecera de 30,
// rótulo 11px/600/.06em y fila de 44 — el criterio 3 del patrón: «sin cajas — filos, tipografía y
// números tabulares, el color sólo en la cifra».
//
// El ritmo NO se redeclara acá: sale de `ALTO_V2` (`shared/components/v2/patron.tsx`), que es la
// única constante del repositorio que puede decir cuánto mide una fila. `ritmo-vertical.test.ts`
// se pone rojo si este archivo escribe un alto propio.
//
// Con la caja se fue el PIE DE TOTALES del canon —el bloque gris con COMPROBANTES / SIN COMPROBANTE
// / SIN IMPUTAR / A PAGAR / TOTAL—. Lo reemplaza `PieCompras`, que es la línea del canvas (`v4A:245`)
// y vive DENTRO de la columna de la lista, no debajo del split: con el panel abierto, un pie a lo
// ancho de los dos decía «6 de 882» cruzando por debajo del panel y se leía como si lo describiera
// a él también.
//
// ═══ TRES COSAS QUE EL CANON PINTABA DE MÁS ═══
//
//   · EL ESTADO YA NO ES UNA PASTILLA. El canvas lo escribe como TEXTO de color (`v4A:223` «Pagado»
//     en #067647, `:229` «A pagar» en #B54708, «Proyectado» en #6B6B67, «Anulada» en #B42318). Los
//     cuatro colores son los mismos que ya devolvía `pastillaDe()`; lo que se retira es el fondo y
//     el borde, que en 947 filas son 947 cápsulas compitiendo con el importe.
//   · «SIN COMPROBANTE» BAJA DE ÁMBAR A APAGADO (`v4A:226`, `:232`: #91918B). El porte anterior lo
//     pintaba ámbar con un argumento correcto —sin papel el gasto no acredita IVA— y un efecto
//     equivocado: 876 de 882 filas no tienen comprobante, así que la columna entera quedaba ámbar y
//     el ámbar dejaba de significar «esto bloquea». Lo que sí bloquea se ve en el filtro «Sin
//     comprobante» y en el panel, donde la propiedad SIGUE en ámbar porque ahí habla de UNA compra.
//   · EL CHIP «ESTRUCTURA» PIERDE SU RECUADRO: el canvas lo escribe en 11px #91918B al lado del
//     destino (`v4A:227`), sin borde ni radio. Un recuadro alrededor de una palabra es una caja más.
//
// ═══ EL CUERPO ES EL DEL CANVAS: 13,5px ═══
//
// El canvas escribe `font-size:13.5px` en la fila (`v4A:223`) y `12px` sólo en el mono del
// comprobante (`v4A:223`) y en las dos palabras auxiliares —la unidad de negocio y «estructura», en
// 11px (`v4A:227`)—. El porte del 06/09 lo había dejado en 12,5/12 con un argumento de coherencia:
// que Personal y Proveedores ya estaban en 12,5 y tres hermanas con dos cuerpos se ven peor que la
// diferencia contra el zip. El dueño decidió lo contrario el mismo día —el canvas manda— y por eso
// el argumento queda escrito acá y no borrado: LA DEUDA ES REAL Y ES DE LAS OTRAS DOS. Personal y
// Proveedores siguen en 12,5px, así que hoy la pestaña tiene dos cuerpos y el que está bien es éste.
//
// ═══ EL BORDE IZQUIERDO ES DE LA SELECCIÓN, Y DE NADA MÁS ═══
//
// La fila tenía DOS señales compitiendo por el mismo `box-shadow` —el filo ámbar de «sin imputar» y
// el amarillo de «esto está abierto»— y la selección se compensaba además con un fondo #FEF9E6 que
// el canvas no dibuja. El canvas resuelve las dos cosas de otra manera y es mejor: el problema se
// dice DENTRO de la celda que lo tiene (destino en rojo más el ⚠, dos canales que no se pisan con
// nada), y el borde queda libre para lo único que no tiene dónde más decirse — cuál fila está
// abierta en el panel (`v4A:229`, `box-shadow:inset 2px 0 0 #FDC900`, sin fondo).
//
// Se pierde el barrido del borde para encontrar lo sin imputar. Hoy las 947 filas tienen destino,
// así que no se pierde nada medible; y el corte «Sin obra» del encabezado sigue siendo la puerta
// que las aísla con su número. Si el dueño extraña el filo ámbar, vuelve — pero entonces la
// selección se queda sin ningún canal y hay que darle otro.

// ═══ LA ÚLTIMA COLUMNA (26px) ES EL PAPEL, NO UN `⋯` ═══
//
// En el mockup ese `⋯` no tenía handler: era decorativo. Es el comprobante, en tinta cuando el
// vínculo es un hecho y apagado cuando es deducido. Ver `CeldaComprobante`.

import type { CSSProperties, ReactNode } from 'react'
import Link from 'next/link'
import { fechaCompleta, pesos } from '@/shared/components/canon/formato'
import { IconoProblema } from '@/shared/components/iconos'
import {
  ALTO_V2, CAJA_CONTENIDO, ENCABEZADO, FILO_ELEGIDA, RotuloCol, V,
} from '@/shared/components/v2/patron'
import { CintaHorizontal } from '@/shared/components/v2/CintaHorizontal'
import { esEstructura, pastillaDe, totalesDe } from '../services/comprasSheet'
import type { FilaConPapel } from '../services/comprasSheetService'
import { CeldaComprobante } from './CeldaComprobante'

/**
 * LA GRILLA DEL CANVAS, carácter por carácter (`v4A:222`), y sus dos variantes angostas. Literales
 * porque Tailwind escanea el TEXTO del archivo: una clase armada en runtime no se compila nunca y la
 * fila se dibuja sin grilla — defecto que sólo se ve mirando la pantalla.
 *
 * ═══ POR QUÉ HAY VARIANTES SI EL CANVAS DIBUJA UNA SOLA ═══
 *
 * Porque las columnas son TODAS inelásticas —los `minmax(150px,…)` declaran piso— y no ceden un
 * píxel. El canon resolvía eso metiendo la tabla en una caja con scroll propio; el v2 no tiene caja,
 * así que suelta columnas por media query (`25v2:154` — «nunca la identidad»).
 *
 * ═══ DE DÓNDE SALEN LOS DOS CORTES ═══
 *
 * `1459` no es un número redondo: es la cuenta. Con el panel abierto la lista sólo tiene
 * `ancho − 40 (padding de página) − 393 (panel: 344 + 24 de margen + 1 de filo + 24 de sangría)`, así
 * que las nueve columnas (914 + 112 de `gap` = 1026) recién entran desde 1026 + 393 + 40 = 1459. Por
 * debajo se sueltan CONCEPTO, COMPROBANTE y FORMA DE PAGO y quedan seis, que necesitan 648 y entran
 * con el panel abierto ya a 1081px. El costo es real y se declara: entre 1081 y 1459 con el panel
 * CERRADO las nueve entrarían y igual se ven seis — CSS no puede saber si el panel está abierto, y
 * equivocarse hacia el lado del recorte muestra menos columnas, mientras que equivocarse hacia el
 * otro CORTA el dato (`body` lleva `overflow-x: clip`, así que no aparece ni una barra que lo
 * delate).
 *
 * `767` es el teléfono: quedan de QUIÉN es el gasto y CUÁNTO es. Se va también el papel — 26px no son
 * un blanco para un dedo y el comprobante se abre desde el panel, que en el teléfono queda debajo.
 *
 * ═══ POR QUÉ EL CORTE PASÓ DE 1356 A 1459 (08/09/2026) ═══
 *
 * Entró «A pagar», 88px de fecha completa en mono tabular (`04/09/2026` mide 72px a 12px; 88 deja el
 * aire y es múltiplo de 8). Las columnas inelásticas pasan de 826 a 914 y los `gap` de 98 a 112:
 * 1026 que no ceden un píxel, así que el corte se recorre a 1026 + 393 + 40 = 1459. Dejarlo en 1356
 * abriría una franja de 103px donde las nueve columnas no entran y se dibujan igual — y `body` lleva
 * `overflow-x: clip`, así que el dato se corta sin una barra que lo delate.
 *
 * Y «A PAGAR» NO SE SUELTA EN EL PRIMER CORTE, a diferencia de las otras tres. Es el dato que el
 * dueño pidió ver (08/09) y con el panel abierto —que es como se usa la pantalla— el primer corte se
 * come casi todas las pantallas reales: soltarla ahí sería agregarla y esconderla. Las seis columnas
 * de la variante angosta suman 578 + 70 de `gap` = 648, y con el panel entran desde 1081, muy por
 * debajo de 1459.
 */
// ═══ LA CINTA: LA TABLA SE DESPLAZA ADENTRO SUYO, NUNCA LA PÁGINA (08/09/2026) ═══
//
// Medido en producción a 390px ANTES del arreglo: `document.body.scrollWidth` = 1046 contra 390 de
// pantalla, y `1046 = 20 (padding de página) + 1026` — exactamente los nueve tracks de `COLS`
// (914) más sus ocho `gap` (112). Al deslizar para ver el importe se iban de pantalla el header, la
// navegación y los chips. Ahora la fila vive dentro de `CintaHorizontal` (`overflow-x: auto`), la
// PÁGINA queda quieta y la columna PROVEEDOR se queda pegada a la izquierda para no perder de quién
// es la fila que se está mirando.
//
// ═══ LÍMITE MEDIDO Y NO ARREGLADO ACÁ: LOS CORTES POR ANCHO NO EXISTEN EN EL BUILD ═══
//
// Los `max-[1459px]:` y `max-[767px]:` de abajo NO llegan al CSS compilado. Verificado sobre el
// build propio del 08/09/2026: el CSS emitido en `.next/static/chunks` no contiene `767px` ni
// `1459px` en ninguna forma —ni `max-width:767px` ni sintaxis de rango—, mientras que el `grid-cols` SIN
// variante sí está. No es de este archivo: NINGÚN `max-[Npx]:` del repositorio aparece en ese CSS
// (`max-[1249px]` se usa 19 veces, `max-[559px]` 7). Corriendo Tailwind a mano sobre este mismo
// archivo las tres reglas se generan, así que el que las pierde es el pipeline del build, no el
// código. Por eso a 390px se dibujan las nueve columnas y no dos: LA CINTA ES LO QUE SOSTIENE LA
// PANTALLA HOY. Arreglar la extracción es otro trabajo y cambia seis pantallas a la vez.
const COLS
  = 'grid-cols-[minmax(150px,1.2fr)_minmax(120px,1fr)_112px_minmax(110px,1fr)_92px_88px_104px_112px_26px]'
  + ' max-[1459px]:grid-cols-[minmax(150px,1.2fr)_minmax(110px,1fr)_92px_88px_112px_26px]'
  + ' max-[767px]:grid-cols-[minmax(0,1fr)_112px]'

/**
 * Las celdas que se sueltan, y el corte en el que se van. EL `display` DE ESTAS CELDAS VA POR CLASE,
 * NUNCA INLINE: un `style={{ display: 'flex' }}` le gana a cualquier media query y la celda sigue
 * ocupando su ancho aunque la grilla ya no tenga su columna — la fila entera se corre.
 */
const SUELTA_ANCHO = 'max-[1459px]:hidden'
const SUELTA_TELEFONO = 'max-[767px]:hidden'

/**
 * LA FILA MIDE LO QUE MIDEN SUS COLUMNAS, Y POR ESO LA COLUMNA PEGADA FUNCIONA.
 *
 * Sin esto la fila es un bloque del ancho del contenedor (350px a 390) y sus nueve tracks se salen
 * de la caja: la cinta scrollea igual —el desbordamiento sí cuenta—, pero `position: sticky` se
 * limita al BLOQUE CONTENEDOR, o sea a esos 350px, y medido en el navegador la celda pegada se
 * soltaba a los 220px de recorrido y terminaba en x = −456. Con `min-content` la caja de la fila
 * pasa a valer la suma de los mínimos de sus tracks (914) más los `gap` (112) = 1026, que es el
 * recorrido entero.
 *
 * `min-w-min` (min-width) Y NO `w-min`: `width: min-content` clavaría la fila en 1026 también en
 * escritorio y las columnas `fr` dejarían de estirarse. Como mínimo no cambia nada donde ya entraba.
 *
 * Va por CLASE y no por `style`: la cabecera tiene que seguir escribiendo `style={ENCABEZADO}`
 * literal —`canonico-compras-v4.test.ts` lo exige para que nadie redeclare el ritmo del patrón— y
 * un `style` con spread lo rompía.
 */
const ANCHO_DE_LA_FILA = 'min-w-min'

/**
 * LA COLUMNA PROVEEDOR NO SE VA CON EL SCROLL. Dentro de la cinta, `left: 0` la deja pegada al
 * borde izquierdo mientras el resto se desplaza; el `z-index` la pone POR ENCIMA de las celdas que
 * pasan por debajo (el fondo lo pone cada celda, ver más abajo). En escritorio no cambia nada: sin
 * desplazamiento, una celda pegada está donde estaría igual.
 */
const PEGADA: CSSProperties = { position: 'sticky', left: 0, zIndex: 2 }

/** El `gap:14px` del canvas (`v4A:222`), en la cabecera y en la fila. */
const GAP = 'gap-[14px]'

/** El cuerpo de la celda. `v4A:223`. Una sola constante: ocho celdas con ocho literales se desfasan. */
const CUERPO = '13.5px'

/**
 * EL NOMBRE QUE ESA FECHA TIENE EN LA FUENTE, medido sobre la pestaña viva el 08/09/2026: es la
 * columna **Q** de «Compras», rótulo exacto `Fecha prevista de pago (día)`, y llega a
 * `compra_sheet.fecha_prevista` por `scripts/sync-compras.mjs`.
 *
 * Va en el `title` del rótulo y no en el rótulo mismo por dos razones. La primera es de ancho: trece
 * caracteres no entran en 88px. La segunda importa más — el dueño la pidió como «fecha a pagar»
 * (08/09, textual) y así se llama en la pantalla; pero quien compare contra el Sheet necesita saber
 * QUÉ columna está mirando, y un segundo nombre sin puente es el camino corto a dos verdades.
 *
 * NO ES «Fecha de caja» (AD), que es la otra candidata y la que NO se muestra: ésa es cuándo la
 * plata SALIÓ, no cuándo hay que pagar. Al 08/09 las dos coinciden en 925 de 927 filas, así que
 * elegir mal se vería igual de bien —y sería el mismo defecto por accidente que ya cazó
 * `compras-fila.mjs`. El filtro «Vencimiento» de esta misma pantalla lee `tramo_vencimiento` (AN),
 * cuya fórmula es `ARRAYFORMULA` sobre `$Q$4:$Q` (`lib/proveedores-aging.mjs`): el filtro y esta
 * columna son el MISMO concepto, y por eso no se inventa uno nuevo.
 *
 * ═══ LÍMITE CONOCIDO: «A PAGAR» YA SIGNIFICA OTRAS DOS COSAS EN ESTA PANTALLA ═══
 *
 * El chip de arriba («A pagar 35») filtra por ESTADO, y el pie («A pagar $…») suma PLATA. Con esta
 * columna el mismo rótulo dice además una FECHA. Se deja así porque es como lo pidió el dueño y
 * porque el contexto desambigua —una fecha bajo un encabezado de columna no se confunde con un
 * conteo ni con un importe—, pero queda escrito: si en la pantalla empieza a costar leerlo, el que
 * se renombra es ESTE rótulo («Fecha prevista», que es como se llama en el Sheet), no el chip ni el
 * pie, que son los que ya estaban.
 */
const ROTULO_SHEET = 'Compras · Q «Fecha prevista de pago (día)»'

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
      <CintaHorizontal testid="cinta-compras">
      <div className={`grid ${ANCHO_DE_LA_FILA} ${GAP} ${COLS}`} style={ENCABEZADO}>
        <span className="grid bg-canvas" style={PEGADA}><RotuloCol>Proveedor</RotuloCol></span>
        <span className={`grid ${SUELTA_ANCHO}`}><RotuloCol>Concepto</RotuloCol></span>
        <span className={`grid ${SUELTA_ANCHO}`}><RotuloCol>Comprobante</RotuloCol></span>
        <span className={`grid ${SUELTA_TELEFONO}`}><RotuloCol>Cliente / asignación</RotuloCol></span>
        <span className={`grid ${SUELTA_TELEFONO}`}><RotuloCol>Estado</RotuloCol></span>
        <span className={`grid ${SUELTA_TELEFONO}`} title={ROTULO_SHEET}><RotuloCol>A pagar</RotuloCol></span>
        <span className={`grid ${SUELTA_ANCHO}`}><RotuloCol>Forma de pago</RotuloCol></span>
        <RotuloCol derecha>Importe</RotuloCol>
        <span className={SUELTA_TELEFONO} />
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
            className={`group grid items-center ${ANCHO_DE_LA_FILA} ${GAP} ${CAJA_CONTENIDO} ${COLS} ${elegida ? '' : 'hover:bg-[#F2F1ED]'}`}
            style={{
              height: ALTO_V2.fila,
              borderBottom: `1px solid ${V.lineaFila}`,
              // EL FILO ES DE LA SELECCIÓN, Y NO LLEVA PADDING QUE LO COMPENSE. `inset` pinta hacia
              // adentro sin ocupar caja: la fila elegida y la que no arrancan en el mismo píxel, y
              // un `paddingLeft: 2` para «devolver» el espacio correría las ocho columnas dos píxeles
              // sólo en la fila abierta — el defecto que el canvas evita no dibujando ninguno.
              boxShadow: elegida ? FILO_ELEGIDA : undefined,
            }}
          >
            {/* `display: contents` — la fila entera abre el panel, salvo el papel, que es un botón
                y no puede vivir dentro de un enlace (HTML inválido y rompe el tabulador). */}
            <Link href={hrefDe(f.fila)} prefetch={false} style={{ display: 'contents' }}>
              {/* EL FONDO Y EL FILO NO SON COSMÉTICA. Sin fondo, las celdas que pasan por debajo
                  al desplazarse se leen encimadas con el nombre; y sin repetir `FILO_ELEGIDA` acá,
                  el filo amarillo de la fila abierta —que se pinta en el fondo de la FILA— queda
                  tapado por este fondo opaco en TODOS los anchos. */}
              <span
                className="truncate bg-canvas group-hover:bg-[#F2F1ED]"
                data-testid="compra-proveedor"
                style={{
                  ...PEGADA,
                  fontSize: CUERPO,
                  fontWeight: 500,
                  color: f.proveedor ? V.tinta : V.tenue,
                  boxShadow: elegida ? FILO_ELEGIDA : undefined,
                }}
              >
                {f.proveedor ?? 'sin proveedor'}
              </span>

              <span className={`truncate ${SUELTA_ANCHO}`} style={{ fontSize: CUERPO, color: V.tintaSuave }}>
                {f.concepto ?? f.detalle_obra ?? 'sin concepto'}
              </span>

              <span
                className={`truncate font-mono ${SUELTA_ANCHO}`}
                style={{ fontSize: '12px', color: f.comprobante ? V.tintaSuave : V.tenue }}
                data-testid={f.comprobante ? undefined : 'compra-sin-comprobante'}
              >
                {f.comprobante ? `${f.tipo ? `${f.tipo} ` : ''}${f.comprobante}` : 'sin comprobante'}
              </span>

              {/* «Sin imputar» en rojo con su ⚠: hoy las 947 filas tienen destino, así que este
                  camino no se ve — existe porque el día que alguien cargue una sin imputar tiene
                  que gritarlo, no esconderlo. */}
              <span className={`flex min-w-0 items-baseline gap-[7px] ${SUELTA_TELEFONO}`}>
                {f.unidad_negocio && (
                  <span className="shrink-0" style={{ fontSize: '11px', color: V.tenue }}>{f.unidad_negocio}</span>
                )}
                <span className="truncate" style={{ fontSize: CUERPO, color: obra ? V.tintaSuave : V.neg }}>
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

              <span
                className={`truncate ${SUELTA_TELEFONO}`}
                style={{ fontSize: CUERPO, color: estado.color }}
                data-testid="estado-compra"
              >
                {estado.texto}
              </span>

              {/* CUÁNDO HAY QUE PAGARLA. Mono tabular para que las nueve fechas de la pantalla
                  alineen por el día, y VACÍA cuando el Sheet no la trae: un «—» en una columna de
                  fechas se lee como un dato de la fuente, y en la fuente hay una celda vacía. El
                  `title` la fecha en la que la fila cae dentro del filtro «Vencimiento». */}
              <span
                className={`font-mono tabular-nums ${SUELTA_TELEFONO}`}
                style={{ fontSize: '12px', color: f.anulada ? V.tenue : V.tintaSuave }}
                data-testid="compra-a-pagar"
                data-fecha-prevista={f.fecha_prevista ?? undefined}
                title={f.tramo_vencimiento ?? undefined}
              >
                {fechaCompleta(f.fecha_prevista)}
              </span>

              {/* NO BLOQUEA NADA y por eso es apagado, no ámbar: sin forma de pago la compra existe
                  igual; lo único que no se puede es proyectar cuándo sale la plata. */}
              <span className={`truncate ${SUELTA_ANCHO}`} style={{ fontSize: CUERPO, color: f.tipo_pago ? V.tintaSuave : V.tenue }}>
                {f.tipo_pago || 'sin cargar'}
              </span>

              <span
                className="flex min-w-0 flex-col items-end gap-px font-mono tabular-nums"
                style={{ fontSize: CUERPO, textAlign: 'right' }}
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

            <span className={`flex ${SUELTA_TELEFONO}`}>
              <CeldaComprobante adjuntos={f.adjuntos} />
            </span>
          </div>
        )
      })}
      </CintaHorizontal>

      {!filas.length && (
        <div data-testid="compras-vacio" style={{ padding: '24px 2px', fontSize: '12.5px', color: V.apagado }}>
          Nada coincide.
        </div>
      )}
    </div>
  )
}

/**
 * EL PIE DE LA LISTA — `v4A:245`, dentro de la columna de la lista y no debajo del split.
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
