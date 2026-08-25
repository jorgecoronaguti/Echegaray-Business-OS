// EL VOCABULARIO MEDIDO DEL PATRÓN DE SECCIÓN v2 — `22 · Proveedores v2.dc.html`.
//
// ═══ POR QUÉ NO SE REUSA `shared/components/canon` ═══
//
// Porque el canon de agosto es el zip ANTERIOR y su objeto central es la CAJA: `TarjetaTabla`
// declara `background:#FFFFFF;border:1px solid #E7E6E2;borderRadius:10px`, encabezado gris de 38px
// y pie de totales adentro. El zip v2 borra la caja entera —criterio 3 del patrón: «sin cajas;
// filos, tipografía y números tabulares»— y además corre los valores que sí sobreviven: el divisor
// de fila pasa de #F1F0EC a #EDECE8 y el hover de #FAFAF8 a #F2F1ED. Dibujar v2 a través de un
// componente que declara lo contrario es exactamente el error que ya costó cuatro entregas.
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
  /** Divisor entre filas de una tabla. `22v2:69`, `:125`. */
  lineaFila: '#EDECE8',
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

  /** Lo que bloquea: la cifra, el filo y el dato que falta. `22v2:70`, `:415`. */
  warn: '#B54708',
  /** Un comprobante sin obra imputada. `22v2:442`. */
  neg: '#B42318',
} as const

/** Alto de fila, medido. Trabajo 38, tabla 40, encabezado de columnas 26. `22v2:69`, `:115`, `:125`. */
export const ALTO_V2 = { trabajo: 38, fila: 40, encabezado: 26 } as const

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

/** Rótulo de columna: 10px, versalitas, interletrado .06em, pegado al borde. `22v2:116`. */
export function RotuloCol({ children, derecha }: { children?: ReactNode; derecha?: boolean }) {
  return (
    <span
      style={{
        fontSize: '10px', letterSpacing: '.06em', textTransform: 'uppercase',
        color: V.tenue, paddingBottom: 6, textAlign: derecha ? 'right' : undefined,
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}
    >
      {children}
    </span>
  )
}

/** La línea de encabezado de una tabla sin caja: sólo el filo inferior más fuerte. `22v2:115`. */
export const ENCABEZADO: CSSProperties = {
  display: 'grid', gap: 14, alignItems: 'end',
  height: ALTO_V2.encabezado, borderBottom: `1px solid ${V.lineaFuerte}`,
  // El filo va POR AFUERA del alto, como en el mockup: 26 + 1 = 27. Ver `CAJA_CONTENIDO`.
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
 * EL PANEL LATERAL DEL v2: 372px, filo izquierdo, y NADA MÁS. `22v2:148`.
 *
 * No es una tarjeta: no tiene fondo propio, ni borde completo, ni radio, ni sombra. La jerarquía la
 * da la indentación (24px a cada lado del filo), que es el criterio 4 del patrón.
 *
 * En pantalla angosta baja debajo de la lista con un filo superior en vez del lateral: un panel de
 * 372px fijo al lado de una tabla estrangula el nombre, y el nombre es lo único que identifica una
 * fila.
 */
export function PanelFilo({ children, testid }: { children: ReactNode; testid?: string }) {
  return (
    <aside
      data-testid={testid}
      className="w-full shrink-0 border-t pt-4 lg:ml-6 lg:box-content lg:w-[372px] lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0"
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
 *   panel lateral (ancho total)  421px   396px   −25
 *   lista del maestro (ancho)   1059px  1084px   +25
 *   fila de tabla (alto)           41px    40px   −1
 *   encabezado de columnas         27px    26px   −1
 *   fila de «lo que pide trabajo»  39px    38px   −1
 *
 * Una sola causa: el `.dc.html` no declara `box-sizing`, así que corre con el DEFAULT DE CSS
 * —`content-box`— donde `width:372px` es el CONTENIDO y el padding de 24 y el borde de 1 se SUMAN
 * por afuera (372+24+1+24 de margen = 421). El preflight de Tailwind pone `border-box` en todo, y
 * ahí los mismos 372px se los comen el padding y el borde desde adentro: el panel queda 25px más
 * angosto y esos 25px se los lleva la lista. Idéntico con `height:40px` + `borderBottom:1px`: 41 en
 * el mockup, 40 en la app.
 *
 * Se corrige donde nace —en las cuatro declaraciones que fijan alto o ancho junto a un borde— y no
 * compensando bloque por bloque con números mágicos: sumarle 25 al ancho y 1 a cada alto dejaría
 * cuatro constantes que ya no se parecen a las del zip, y el próximo que compare el archivo con la
 * pantalla no entendería de dónde salieron.
 */
export const CAJA_CONTENIDO = 'box-content'
