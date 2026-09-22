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

// ═══ ABRIR UNA COMPRA YA NO MANDA LA LISTA AL PRINCIPIO — 15/09/2026 ═══
//
// Pedido del dueño, textual: *«tiene un bug que vuelve para arriba toda la lista cuando hacés click
// la compra»*.
//
// LA CAUSA RAÍZ es el comportamiento por defecto de `<Link>`: Next.js restaura el scroll al tope en
// cada navegación salvo que se le diga `scroll={false}`. Y acá TODA la selección es una navegación,
// a propósito —el estado vive en la URL (`?s=<fila>`) para que el panel se comparta con un enlace y
// vuelva con «atrás»—, así que cada clic en una fila era un `push` y cada `push` un salto al tope.
// Con 200 filas dibujadas, elegir la fila 180 devolvía a la 1.
//
// NO se arregla moviendo la selección a estado de cliente: eso mataría el enlace profundo, que es
// una capacidad que la pantalla ya tiene y que nadie pidió perder. Se arregla donde está el defecto:
// la navegación sigue, el salto no. `scroll={false}` va en los DOS enlaces de la fila; uno solo
// dejaría la mitad de la fila con el defecto y la otra sin él, que es peor que tenerlo entero.
//
// `revalidatePath` del guardado de obra NO scrollea: refresca el árbol en el lugar, sin navegar.

// ═══ LA ÚLTIMA COLUMNA (26px) ES EL PAPEL, NO UN `⋯` ═══
//
// En el mockup ese `⋯` no tenía handler: era decorativo. Es el comprobante, en tinta cuando el
// vínculo es un hecho y apagado cuando es deducido. Ver `CeldaComprobante`.

import type { CSSProperties, ReactNode } from 'react'
import Link from 'next/link'
import { fechaDdMmAa, pesos } from '@/shared/components/canon/formato'
import { IconoProblema } from '@/shared/components/iconos'
import {
  ALTO_V2, CAJA_CONTENIDO, ENCABEZADO, FILO_ELEGIDA, RotuloCol, V,
} from '@/shared/components/v2/patron'
import { CintaHorizontal } from '@/shared/components/v2/CintaHorizontal'
import { estaPagada, pastillaDe, totalesDe } from '../services/comprasSheet'
import { ObraEnLinea } from './ObraEnLinea'
import type { FilaConPapel } from '../services/comprasSheetService'
import { CeldaComprobante } from './CeldaComprobante'
import { MedioDeLaFila } from './MedioDeLaFila'

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
// ═══ LOS CORTES POR ANCHO ESTUVIERON APAGADOS EN TODO EL REPO HASTA EL 08/09/2026 ═══
//
// Medido en producción y en build propio: ninguna variante de ancho del repositorio llegaba al CSS
// —ni la de 1459px ni la de 767px de acá, ni las 19 de 1249px del resto—, así que a 390px se
// dibujaban las nueve columnas y no dos. La causa era un cache de unidades de Tailwind envenenado
// por dos clases escritas dentro de COMENTARIOS con la N o los puntos suspensivos sin resolver: el
// extractor lee el archivo crudo. El porqué completo y el control que lo impide vuelvan a apagarse
// están en `src/shared/components/v2/cortes-por-ancho-llegan-al-css.test.ts`.
//
// LA CINTA SIGUE SIENDO NECESARIA: con los cortes vivos, a 390px quedan dos columnas y la página no
// desborda, pero entre 768px y 1459px la fila reducida todavía puede no entrar.
// ═══ LA GRILLA DEL 15/09/2026: LA OBRA ES UN CONTROL Y LAS FECHAS SON DOS ═══
//
// Dos cambios del dueño, y los dos mueven la cuenta del corte:
//
//   · La columna de la obra deja de ser texto y pasa a ser el DESPLEGABLE que la cambia sin abrir el
//     panel. Un `<select>` con «OB-0012 · SAN FRANCISCO» adentro no vive en 110px: su piso sube a
//     168, que es lo que mide el rótulo más largo del catálogo antes de recortarse.
//   · «A pagar» (la fecha prevista, Q) se va y entran las DOS que el dueño pidió ver: la FECHA DEL
//     COMPROBANTE (`fecha`, columna de la factura) y la FECHA DE PAGO (`fecha_caja`, AD · cuándo
//     salió la plata). No son tres columnas de fecha: son dos, y `fecha_prevista` baja al panel, que
//     es donde vive el resto de las propiedades de una compra. El filtro «Vencimiento» sigue leyendo
//     `tramo_vencimiento`, que es el ARRAYFORMULA sobre esa misma Q — el concepto no se perdió.
//
// LA CUENTA DEL CORTE, otra vez: diez tracks (150+120+112+168+92+72+72+104+112+26 = 1028) más nueve
// `gap` de 14 (126) = 1154, y con el panel abierto la lista sólo tiene `ancho − 40 − 393`. Las diez
// entran recién desde 1154 + 393 + 40 = 1587. Por debajo se sueltan CONCEPTO, COMPROBANTE y FORMA DE
// PAGO y quedan siete (692 + 84 = 776, que con el panel entran ya a 1209).
//
// EN EL TELÉFONO QUEDAN DOS, Y LA SEGUNDA ES LA OBRA. Antes eran proveedor e importe; el dueño pidió
// poder imputar desde el teléfono, así que el desplegable ocupa la segunda columna y el importe baja
// a un segundo renglón DENTRO de la celda del proveedor (el mismo recurso que ya usa la deuda
// parcial). No se pierde ningún dato: se apilan dos que antes iban al lado.
// LA CUENTA NO SE DECLARA A OJO: la hace `grilla-v2-en-telefono.test.ts`. El desplegable declara su
// piso de 140px y el nombre queda fraccional, así que de los 350 útiles de un teléfono de 390 el
// control se lleva 140, el `gap` 14, y al proveedor le quedan 196 — muy por encima de `PISO_NOMBRE`.
// Escribirle un piso en px al nombre sería peor: dos pisos fijos suman y dejan de ceder.
const COLS
  = 'grid-cols-[minmax(150px,1.2fr)_minmax(120px,1fr)_112px_minmax(168px,1fr)_92px_72px_72px_104px_112px_26px]'
  + ' max-[1587px]:grid-cols-[minmax(150px,1.2fr)_minmax(168px,1fr)_92px_72px_72px_112px_26px]'
  + ' max-[767px]:grid-cols-[minmax(0,1fr)_minmax(140px,1fr)]'

/**
 * Las celdas que se sueltan, y el corte en el que se van. EL `display` DE ESTAS CELDAS VA POR CLASE,
 * NUNCA INLINE: un `style={{ display: 'flex' }}` le gana a cualquier media query y la celda sigue
 * ocupando su ancho aunque la grilla ya no tenga su columna — la fila entera se corre.
 */
const SUELTA_ANCHO = 'max-[1587px]:hidden'
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
 * EL NOMBRE QUE CADA FECHA TIENE EN LA FUENTE, para que quien compare contra el Sheet sepa qué
 * columna está mirando. Van en el `title` del rótulo y no en el rótulo: no entran en 72px.
 *
 * ═══ LA PESTAÑA NO TIENE UNA FECHA DE PAGO. MEDIDO EL 15/09/2026, NO DEDUCIDO ═══
 *
 * El dueño pidió «la fecha de la factura y la fecha de pago». La segunda NO EXISTE como dato, y la
 * candidata obvia es una trampa: `fecha_caja` (AD · «Fecha de caja») parece ser cuándo salió la
 * plata y no lo es. Contra la base viva, sobre las 891 filas no anuladas:
 *
 *   · `fecha_caja` es IGUAL a `fecha_prevista` en 889 de 891. Las 2 que difieren es sólo porque Q
 *     está vacía y AD la rellena — no porque digan cosas distintas.
 *   · Las 41 compras PENDIENTES tienen las dos cargadas, y 40 de ellas con fecha FUTURA.
 *   · `scripts/sync-compras.mjs` ya las escribía como intercambiables: `fecha_caja ?? fecha_prevista`.
 *
 * Una columna «Pagado el» alimentada por AD habría afirmado 41 pagos que no ocurrieron, 40 de ellos
 * con fecha del mes que viene. Es la Regla de Oro 2 —presentar una estimación como un hecho— en la
 * pantalla desde la que se decide a quién pagar. Y ningún test de campo lo habría visto: verificar
 * que la celda lee `f.fecha_caja` es verdad y es irrelevante si `fecha_caja` no significa «pagado».
 *
 * ═══ QUÉ SE MUESTRA ENTONCES ═══
 *
 * La única fecha que la fuente relaciona con el pago es Q, `fecha_prevista`, y SIGNIFICA DOS COSAS
 * SEGÚN EL ESTADO: en las 850 pagadas es el día en que se pagó; en las 41 pendientes es cuándo se
 * PREVÉ pagar. Esa ambigüedad está en la fuente y no se arregla desde acá — pero se DECLARA en vez
 * de esconderse: la fecha de una fila no pagada se dibuja apagada y su `title` dice que es prevista.
 * Así la columna responde lo que el dueño pidió sin afirmar un pago que nadie registró.
 *
 * LO QUE FALTA PARA TENER LA FECHA DE VERDAD está fuera de esta pantalla: hoy ninguna tabla del OS
 * ata un pago a una fila de `compra_sheet`, así que el día que salió la plata sólo vive en el banco.
 */
const ROTULO_FECHA = 'Compras · fecha del comprobante'
/** Lo que dice el `title` de la celda cuando la compra SÍ está paga. */
const ROTULO_PAGO = 'Compras · Q «Fecha prevista de pago (día)» — en una fila paga, el día del pago'
/** Y lo que dice cuando NO: la misma columna, otro significado. Se declara, no se esconde. */
const ROTULO_PREVISTA = 'PREVISTA: esta compra todavía no está paga. La plata no salió.'

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
  filas, seleccionada, hrefDe, opcionesObra, obraEditable, entregaDe,
}: {
  filas: FilaConPapel[]
  seleccionada?: number
  hrefDe: (fila: number) => string
  /** Los rótulos elegibles de la columna «Obra». Mismos que el panel: `getOpcionesDeObra`. */
  opcionesObra: string[]
  /** `false` = la base todavía no tiene la columna Obra: se muestra el rótulo, no un control muerto. */
  obraEditable: boolean
  /** Clave de la fila → entrega de efectivo que rinde (ER-0147). Vacío = sin el dato: dice «a rendir» a secas. */
  entregaDe?: ReadonlyMap<string, string>
}) {
  return (
    <div data-testid="tabla-compras-sheet">
      <CintaHorizontal
        testid="cinta-compras"
        cabecera={(
          <div className={`grid ${ANCHO_DE_LA_FILA} ${GAP} ${COLS}`} style={ENCABEZADO}>
            <span className="grid bg-canvas" style={PEGADA}><RotuloCol>Proveedor</RotuloCol></span>
            <span className={`grid ${SUELTA_ANCHO}`}><RotuloCol>Concepto</RotuloCol></span>
            <span className={`grid ${SUELTA_ANCHO}`}><RotuloCol>Comprobante</RotuloCol></span>
            <span className="grid"><RotuloCol>Obra</RotuloCol></span>
            <span className={`grid ${SUELTA_TELEFONO}`}><RotuloCol>Estado</RotuloCol></span>
            <span className={`grid ${SUELTA_TELEFONO}`} title={ROTULO_FECHA}><RotuloCol>Fecha</RotuloCol></span>
            <span className={`grid ${SUELTA_TELEFONO}`} title={ROTULO_PAGO}><RotuloCol>Pago</RotuloCol></span>
            <span className={`grid ${SUELTA_ANCHO}`}><RotuloCol>Forma de pago</RotuloCol></span>
            <span className={`grid ${SUELTA_TELEFONO}`}><RotuloCol derecha>Importe</RotuloCol></span>
            <span className={SUELTA_TELEFONO} />
          </div>
        )}
      >

      {filas.map((f) => {
        const estado = pastillaDe(f.estado)
        // ¿SALIÓ LA PLATA? Decide cómo se dibuja la columna de pago — ver `ROTULO_PREVISTA`. El
        // criterio vive en el servicio y no acá: la lista, el chip «A pagar» y el pie tienen que
        // estar de acuerdo sobre qué es una compra paga.
        const pagada = estaPagada(f.estado)
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
            {/* ═══ LA FILA SE PARTE EN DOS ENLACES, Y NO ES COSMÉTICA (15/09/2026) ═══

                El desplegable de la obra NO PUEDE VIVIR DENTRO DE UN `<a>`: es HTML inválido, el
                clic que abre la lista navegaría al panel y el tabulador se rompe. Es exactamente el
                motivo por el que el papel de la última columna ya estaba afuera. Con `display:
                contents` los dos enlaces desaparecen de la grilla y las diez celdas siguen siendo
                hijas directas de la fila, así que el orden visual no cambia.

                `scroll={false}` EN LOS DOS: ver el bloque de arriba. Es el arreglo del defecto que
                mandaba la lista al principio al abrir una compra. */}
            <Link href={hrefDe(f.fila)} prefetch={false} scroll={false} style={{ display: 'contents' }}>
              {/* EL FONDO Y EL FILO NO SON COSMÉTICA. Sin fondo, las celdas que pasan por debajo
                  al desplazarse se leen encimadas con el nombre; y sin repetir `FILO_ELEGIDA` acá,
                  el filo amarillo de la fila abierta —que se pinta en el fondo de la FILA— queda
                  tapado por este fondo opaco en TODOS los anchos. */}
              <span
                className="flex min-w-0 flex-col justify-center bg-canvas group-hover:bg-[#F2F1ED]"
                data-testid="compra-proveedor"
                style={{
                  ...PEGADA,
                  fontWeight: 500,
                  boxShadow: elegida ? FILO_ELEGIDA : undefined,
                }}
              >
                <span className="truncate" style={{ fontSize: CUERPO, color: f.proveedor ? V.tinta : V.tenue }}>
                  {f.proveedor ?? 'sin proveedor'}
                </span>
                {/* EL IMPORTE EN EL TELÉFONO, debajo del nombre. Su columna se suelta a 767px para
                    que entre el desplegable de la obra, y el número que decide no puede irse de la
                    pantalla: se apila, como ya se apila la deuda parcial. Se dibuja SÓLO acá abajo
                    de 768 (`hidden` por defecto), así que en escritorio no hay dos importes. */}
                <span className="hidden max-[767px]:block" style={{ fontSize: '11px', fontWeight: 400 }} data-testid="compra-importe-telefono">
                  <Importe f={f} />
                </span>
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
            </Link>

            {/* LA OBRA: UN CONTROL, FUERA DEL ENLACE. Cambia la imputación sin abrir el panel y sin
                navegar — si navegara, la lista se recargaría entera y volvería al principio, que es
                el defecto que esta misma entrega arregla. */}
            <span className="flex min-w-0 items-center" data-testid="compra-obra">
              <ObraEnLinea
                fila={f.fila}
                celda={f.obra?.celda ?? null}
                rotulo={f.obra?.rotulo ?? null}
                inferida={f.obra?.origen === 'inferida'}
                opciones={opcionesObra}
                editable={obraEditable}
                cuerpo={CUERPO}
              />
              {/* LO QUE LA CELDA NO SE PUDO CREER. `obra_inconsistencia` lo escribe el sync cuando el
                  texto elegido contradice la Unidad de negocio: se muestra, no se corrige. */}
              {f.obra?.inconsistencia && (
                <span title={f.obra.inconsistencia} className="flex shrink-0" style={{ color: V.neg }}>
                  <IconoProblema className="h-[13px] w-[13px]" />
                </span>
              )}
            </span>

            <Link href={hrefDe(f.fila)} prefetch={false} scroll={false} style={{ display: 'contents' }}>
              <span
                className={`truncate ${SUELTA_TELEFONO}`}
                style={{ fontSize: CUERPO, color: estado.color }}
                data-testid="estado-compra"
              >
                {estado.texto}
              </span>

              {/* LAS DOS FECHAS DEL CICLO DEL GASTO. Mono tabular y alineadas a la derecha para que
                  las doscientas de la pantalla alineen por el día, y VACÍAS cuando el Sheet no las
                  trae: un «—» en una columna de fechas se lee como un dato de la fuente, y en la
                  fuente hay una celda vacía. */}
              <span
                className={`text-right font-mono tabular-nums ${SUELTA_TELEFONO}`}
                style={{ fontSize: '12px', color: f.anulada ? V.tenue : V.tintaSuave }}
                data-testid="compra-fecha"
                data-fecha={f.fecha ?? undefined}
              >
                {fechaDdMmAa(f.fecha)}
              </span>

              {/* LA FECHA DEL PAGO, Y SU LÍMITE DECLARADO EN LA PROPIA CELDA. Ver el bloque de
                  arriba: la fuente no tiene «cuándo salió la plata», tiene la fecha PREVISTA, que en
                  una fila paga coincide con el día del pago y en una impaga es una intención. Por eso
                  la fila impaga se dibuja APAGADA y en bastardilla y su `title` lo dice con todas las
                  letras — 41 de 891 filas están en ese caso y 40 con fecha futura. Pintarlas iguales
                  sería la pantalla afirmando 41 pagos que no ocurrieron. */}
              <span
                className={`text-right font-mono tabular-nums ${SUELTA_TELEFONO}`}
                style={{
                  fontSize: '12px',
                  color: f.anulada || !pagada ? V.tenue : V.tintaSuave,
                  fontStyle: pagada ? undefined : 'italic',
                }}
                data-testid="compra-fecha-pago"
                data-pagada={pagada ? 'si' : 'no'}
                data-fecha-prevista={f.fecha_prevista ?? undefined}
                title={pagada ? ROTULO_PAGO : `${ROTULO_PREVISTA}${f.tramo_vencimiento ? ` · ${f.tramo_vencimiento}` : ''}`}
              >
                {fechaDdMmAa(f.fecha_prevista)}
              </span>

              <MedioDeLaFila tipoPago={f.tipo_pago} entrega={f.clave ? entregaDe?.get(f.clave) : null} className={`truncate ${SUELTA_ANCHO}`} cuerpo={CUERPO} />

              <span
                className={`flex min-w-0 flex-col items-end gap-px font-mono tabular-nums ${SUELTA_TELEFONO}`}
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
