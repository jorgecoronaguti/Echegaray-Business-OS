// EL VOCABULARIO MEDIDO DEL PATRÓN DE SECCIÓN — `22 · Proveedores v2.dc.html` para el color y la
// estructura; `design_handoff_crm_v4/` para el RITMO VERTICAL (alto de fila, cabecera y rótulo),
// que el dueño pidió por el zip el 06/09/2026 contra la cláusula «gana el componente existente».
//
// ═══ POR QUÉ NO SE REUSA `shared/components/canon` ═══
//
// Porque el canon de agosto es el zip ANTERIOR y su objeto central es la CAJA: `TarjetaTabla`
// declara `background:#FFFFFF;border:1px solid #E7E6E2;borderRadius:10px`, encabezado gris de 38px
// y pie de totales adentro. El zip v2 borra la caja entera —criterio 3 del patrón: «sin cajas;
// filos, tipografía y números tabulares»— y además corre los valores que sí sobreviven: el divisor
// el hover pasa de #FAFAF8 a #F2F1ED. Dibujar v2 a través de un componente que declara lo
// contrario es exactamente el error que ya costó cuatro entregas.
//
// (El divisor de fila SÍ volvió al `#F1F0EC` del canon: lo devolvió el v4, no el canon. Ver `V`.)
//
// Los valores salieron de LEER los `style=""` inline del `.dc.html`, donde el atributo ES el valor
// computado. Cada uno cita su línea.

import type { CSSProperties, ReactNode } from 'react'

/** La paleta del v2, con la línea del mockup de la que sale cada valor. */
export const V = {
  /** Fondo de la aplicación. `22v2:23`. */
  fondo: '#F7F7F5',
  /** Títulos, nombres de fila, verbos. `22v2:65`, `:73`, `:76`. */
  tinta: '#1F1F1E',
  /** Valor secundario de celda (el CUIT cargado). `22v2:415`. */
  tintaSuave: '#3A3A38',
  /** «Qué bloquea», notas de pie de bloque, acciones terciarias. `22v2:75`, `:200`. */
  apagado: '#6B6B67',
  /** Rótulos de columna, metadatos, resúmenes. `22v2:66`, `:116`. */
  tenue: '#91918B',
  /** Icono de fila del maestro. `22v2:127`. */
  inerte: '#C4C2BB',
  /** Icono de la fila de trabajo. `22v2:72`. */
  inerteTrabajo: '#A8A69F',
  /** Conteo de una solapa inactiva y del filtro. `22v2:113`, `:380`. */
  cuentaApagada: '#C9C4C2',
  /** Lupa del buscador. `22v2:91`. */
  lupa: '#B5B3AC',

  /** Borde de bloque y del panel lateral. `22v2:25`, `:148`. */
  linea: '#E7E6E2',
  /**
   * Divisor entre filas de una tabla: el token `--os-hairline-soft`. `v4A:84`, `v4B:97`.
   *
   * El v2 de agosto lo había corrido a `#EDECE8`; el v4 lo devuelve a `#F1F0EC` en los seis
   * canvas sin una sola excepción, que es además el valor que `shared/components/canon` nunca
   * dejó de declarar. No es un color nuevo: es el token que ya vivía en `globals.css`.
   */
  lineaFila: '#F1F0EC',
  /** Divisor entre filas de un panel. `22v2:171`, `:184`. */
  lineaPanel: '#F3F2EE',
  /** Cierre del encabezado de columnas y foco del buscador. `22v2:115`, `:388`. */
  lineaFuerte: '#D7D5CF',

  /** El amarillo del isotipo y su hover medido. `22v2:94`. */
  marca: '#FDC900',
  marcaHover: '#EEBE00',
  /** El grafito: subrayado de la solapa activa. `22v2:361`. */
  grafito: '#30302F',
  /** Fila seleccionada. `22v2:420`. */
  seleccion: '#FEF9E6',
  /** Hover de fila. `22v2:69`. */
  hover: '#F2F1ED',

  /**
   * Estado positivo REAL: al día, conciliado, consumo dentro del presupuesto. Nunca decorativo.
   * README §2 del handoff de Liquidación; `liqhs v2:499` (consumo 31 %).
   */
  pos: '#067647',
  /** Lo que bloquea: la cifra, el filo y el dato que falta. `22v2:70`, `:415`. */
  warn: '#B54708',
  /** Un comprobante sin obra imputada. `22v2:442`. */
  neg: '#B42318',
} as const

/**
 * EL RITMO VERTICAL — UNA CONSTANTE CON UN VALOR POR FAMILIA, NO UN NÚMERO PROMEDIADO.
 *
 * ═══ POR QUÉ NO ALCANZA UN SOLO ALTO ═══
 *
 * El handoff v4 (`/home/jorge/crmadmin/design_handoff_crm_v4/`) NO dibuja una densidad única, y
 * quien la busque va a encontrar cuatro números y va a promediar. No se promedia: cada canvas es
 * la pantalla que gobierna, y el número sale de ESA pantalla.
 *
 *   canvas                                  fila            qué es
 *   `Administración v4 · Pantallas` :84     44px ×17        Personal · Proveedores · Compras
 *   `CRM v4 · Pantallas`            :92     48px            la fila de cliente, que tiene hijas
 *   `CRM v4 · Pantallas`            :97     38px            la obra colgada del cliente
 *   `CRM v4 · Pantallas`            :192    46px ×14        las caras del eje Cliente
 *
 * El README del zip dice «fila de tabla 52–54px de alto mínimo» y ninguna pantalla lo cumple. No
 * es una contradicción a resolver por votación: el `54` es de la tabla de certificados de D1
 * (`Lo que faltaba:513`, `min-height:54px`, fila de DOS líneas) y el `52` de los paneles de esa
 * misma entrega (`:343`, `:369`). La línea 53 del README generalizó a todo el zip una medida que
 * pertenece a una tabla concreta. La regla que sí es universal —y se cumple en los seis canvas—
 * es la cabecera: 30px, 11px/600/.06em, filo `#D7D5CF`.
 *
 * Los lienzos «· una pantalla» dibujan 66–68px (`Proveedores · una pantalla:297`) para las mismas
 * listas. No mandan: son del handoff ANTERIOR —el README v4 los llama así— y el canvas A los
 * reemplaza explícitamente («las tres pantallas de nivel 2 que no son Clientes»).
 *
 * ═══ POR QUÉ EL BORDE NO DESALINEA ═══
 *
 * Los cuatro valores son el CONTENIDO, no la caja: el `.dc.html` corre en `content-box` y el
 * `border-bottom:1px` se suma por afuera. Fila y cabecera lo suman igual —`CAJA_CONTENIDO` en una,
 * `boxSizing:'content-box'` en la otra—, así que subir los números no puede correr una respecto de
 * la otra. La fila elegida sigue diciéndose sólo con `box-shadow: inset`, que no ocupa espacio.
 */
export const ALTO_V2 = {
  /** La banda «lo que pide trabajo». Del v2 de agosto: el v4 borró la banda y no la redibuja. */
  trabajo: 38,
  /** Lista de nivel 2 de Administración: Personal, Proveedores, Compras. `v4A:84`. */
  fila: 44,
  /** La fila de cliente, que es maestra: debajo le cuelgan sus obras. `v4B:92`. */
  cliente: 48,
  /** Las caras del eje Cliente: presupuestos, documentos, cuenta corriente, actividad. `v4B:192`. */
  cara: 46,
  /** La obra colgada de su cliente — más chica que la madre, no igual. `v4B:97`. */
  hija: 38,
  /**
   * LA MISMA OBRA CUANDO ADEMÁS LLEVA SUS ÓRDENES DE COMPRA DEBAJO DEL NOMBRE. Derivado, no
   * dibujado: la hija más el renglón de los números (12px ⇒ caja de 16px, y 2 de aire entre las
   * dos líneas). Eran 54 con los números en 10,5px; el dueño no los podía leer («quiero que se
   * vean las OC») y el cuerpo subió a 12.
   *
   * Los números NO caben al lado del nombre —medido a 1440 el 10/09/2026 con «ME - PLAYÓN DE
   * AZUFRE» y sus dos OC—, y estrangular la celda de al lado no es una opción: Contratado es plata.
   * Va como `minHeight`: con tres órdenes que se apilen en una pantalla angosta, la fila crece.
   */
  hijaConOrdenes: 56,
  /** La cabeza de un bloque que se despliega — no un renglón de lista. `21v2:99`. */
  cabezaBloque: 44,
  /** Cabecera de columnas. Universal en los seis canvas. `v4A:81`, `v4B:88`. */
  encabezado: 30,
} as const

/**
 * EL FILO ÁMBAR ES «ESTO BLOQUEA», NO «ESTO ESTÁ ELEGIDO».
 *
 * El mockup lo dice con todas las letras (`22v2:422`): estado y selección son dos significados y
 * viajan por canales distintos —el filo dice que falta algo y sobrevive a la selección, que se
 * expresa sólo con el fondo—. Si compartieran canal, elegir una fila borraría su problema.
 */
export const FILO_BLOQUEA = `inset 2px 0 0 ${V.warn}`
/** El filo de la fila elegida en la cola: amarillo de marca, no ámbar de problema. `22v2:456`. */
export const FILO_ELEGIDA = `inset 2px 0 0 ${V.marca}`

/**
 * Rótulo de columna: 11px en peso 600, versalitas, interletrado .06em. `v4A:81`, `v4B:88`.
 *
 * El peso es la mitad del cambio: a 10px en peso 400 el rótulo se lee como un dato más y la
 * cabecera deja de separar. Los seis canvas del v4 lo escriben en 600 sin excepción.
 */
export function RotuloCol(
  // `titulo` es la DEFINICIÓN de la columna, no una descripción: un rótulo de una o dos palabras
  // —«Contratado», «Últ. mov.»— no puede cargar solo con decir de qué fuente sale su número.
  { children, derecha, centro, titulo }:
  { children?: ReactNode; derecha?: boolean; centro?: boolean; titulo?: string },
) {
  return (
    <span
      title={titulo}
      style={{
        fontSize: '11px', fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase',
        color: V.tenue, textAlign: derecha ? 'right' : centro ? 'center' : undefined,
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}
    >
      {children}
    </span>
  )
}

/** La línea de encabezado de una tabla sin caja: sólo el filo inferior más fuerte. `v4A:81`. */
export const ENCABEZADO: CSSProperties = {
  // `center`, no `end`: el canvas lo declara centrado en los seis lienzos. El `alignItems:'end'`
  // más el `paddingBottom:6` del rótulo eran la compensación de una cabecera de 26px demasiado
  // baja para centrar nada; con los 30 del v4 el ajuste sobra y falsea la posición.
  display: 'grid', gap: 14, alignItems: 'center',
  height: ALTO_V2.encabezado, borderBottom: `1px solid ${V.lineaFuerte}`,
  // El filo va POR AFUERA del alto, como en el mockup: 30 + 1 = 31. Ver `CAJA_CONTENIDO`.
  boxSizing: 'content-box',
}

/** La nota al pie de un bloque: 11px, 1.6 de interlínea, 720px de ancho de lectura. `22v2:144`. */
export function NotaBloque({ children, testid }: { children: ReactNode; testid?: string }) {
  return (
    <p
      data-testid={testid}
      style={{
        fontSize: '11px', lineHeight: 1.6, color: V.tenue,
        marginTop: 12, maxWidth: 720, textWrap: 'pretty',
      }}
    >
      {children}
    </p>
  )
}

/** El rótulo en versalitas de una sección del panel. `22v2:180`, `:246`. */
export function RotuloPanel({ children, cuenta }: { children: ReactNode; cuenta?: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
      <span style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '.06em', color: V.tenue }}>
        {children}
      </span>
      {cuenta != null && (
        <span className="font-mono tabular-nums" style={{ fontSize: '11px', color: V.lupa }}>{cuenta}</span>
      )}
    </div>
  )
}

/**
 * EL PANEL LATERAL DEL v2: 344px, filo izquierdo, y NADA MÁS. `v4A:255`.
 *
 * No es una tarjeta: no tiene fondo propio, ni borde completo, ni radio, ni sombra. La jerarquía la
 * da la indentación (24px a cada lado del filo), que es el criterio 4 del patrón.
 *
 * En pantalla angosta baja debajo de la lista con un filo superior en vez del lateral: un panel de
 * 344px fijo al lado de una tabla estrangula el nombre, y el nombre es lo único que identifica una
 * fila.
 *
 * ═══ 344 Y NO 372, Y EL ZIP NO ES UNÁNIME ═══
 *
 * 372 venía del v2 de AGOSTO (`22v2:148`). El handoff v4 no lo escribe en ningún lienzo: dibuja 344
 * en las dos pantallas del canvas de Administración (`v4A:255` Compras, `Personal:58`), 340 en
 * Proveedores, 360 en Pendientes y 376 en el CRM. Siete anchos para el mismo objeto son un zip que
 * se contradice, no una decisión de diseño, y ahí manda la regla de desempate del handoff: lo
 * cosmético lo resuelve el repo con UNA definición. Se toma el 344 del canvas que el dueño pidió
 * cerrar; los 4px contra Proveedores son el precio de que el panel exista una sola vez.
 */
export function PanelFilo({ children, testid }: { children: ReactNode; testid?: string }) {
  return (
    <aside
      data-testid={testid}
      className="w-full shrink-0 border-t pt-4 lg:ml-6 lg:box-content lg:w-[344px] lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0"
      style={{ borderColor: V.linea, display: 'flex', flexDirection: 'column', minWidth: 0 }}
    >
      {children}
    </aside>
  )
}

/**
 * `box-sizing: content-box` — LA UNIDAD QUE EXPLICA TODO EL CORRIMIENTO CONTRA EL MOCKUP.
 *
 * ═══ LO MEDIDO (25/08/2026, mockup y app a 1520×900, lado a lado) ═══
 *
 *   bloque                      mockup    app     Δ
 *   panel lateral (ancho total)  421px   396px   −25   (medido cuando el panel era de 372)
 *   lista del maestro (ancho)   1059px  1084px   +25
 *   fila de tabla (alto)           41px    40px   −1
 *   encabezado de columnas         27px    26px   −1
 *   fila de «lo que pide trabajo»  39px    38px   −1
 *
 * Esos altos son los del v2 de agosto, que el ritmo del v4 ya reemplazó (ver `ALTO_V2`). Lo que la
 * medición prueba y sigue vigente es la CAUSA, no los números: mientras el borde se sume por
 * afuera en la fila y en la cabecera, cambiar los altos no las desalinea entre sí.
 *
 * Una sola causa: el `.dc.html` no declara `box-sizing`, así que corre con el DEFAULT DE CSS
 * —`content-box`— donde el `width` declarado es el CONTENIDO y el padding de 24 y el borde de 1 se
 * SUMAN por afuera (344+24+1+24 de margen = 393). El preflight de Tailwind pone `border-box` en
 * todo, y ahí los mismos píxeles se los comen el padding y el borde desde adentro: el panel queda
 * 25px más
 * angosto y esos 25px se los lleva la lista. Idéntico con `height:40px` + `borderBottom:1px`: 41 en
 * el mockup, 40 en la app.
 *
 * Se corrige donde nace —en las cuatro declaraciones que fijan alto o ancho junto a un borde— y no
 * compensando bloque por bloque con números mágicos: sumarle 25 al ancho y 1 a cada alto dejaría
 * cuatro constantes que ya no se parecen a las del zip, y el próximo que compare el archivo con la
 * pantalla no entendería de dónde salieron.
 */
export const CAJA_CONTENIDO = 'box-content'
