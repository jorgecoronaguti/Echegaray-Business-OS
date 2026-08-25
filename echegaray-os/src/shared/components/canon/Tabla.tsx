import type { CSSProperties, ReactNode } from 'react'
import { ALTO, C, PIE_TOTALES, TARJETA, rotuloColumna } from './estilos'
import { EnvoltorioAncho } from './EnvoltorioAncho'

// LA TABLA DE LAS PANTALLAS DE ADMINISTRACIÓN — portada de los `.dc.html`, no derivada del DS.
//
// ═══ POR QUÉ ES UNA GRILLA Y NO UNA `<table>` ═══
//
// Porque el mockup lo es: `display:grid;gridTemplateColumns:minmax(0,1.6fr) minmax(0,1.1fr) 128px
// 106px 84px 52px 56px 26px`. Esa mezcla de fracciones y píxeles fijos es lo que hace que la columna
// de ESTADO mida siempre 128px mientras el nombre del presupuesto se estira, y que el ancho no
// dependa del contenido de las filas. Una `<table>` reparte por contenido: la misma columna cambia
// de ancho al filtrar, y dos pantallas con la misma columna la dibujan distinta.
//
// El costo de la decisión, declarado: se pierde la semántica de tabla para un lector de pantalla.
// Se compensa con `role="table"/"row"/"columnheader"/"cell"`, que es lo que la grilla necesita para
// seguir siendo una tabla para quien no la ve.
//
// ═══ EL HOVER VA POR CLASE, EL RESTO INLINE ═══
//
// `style-hover="background:#FAFAF8"` del mockup no se puede escribir en un objeto `style`. Va como
// `hover:bg-[#FAFAF8]`. Y por eso la fila NO seleccionada no lleva `background` inline: un
// `background:transparent` en el atributo le gana a cualquier clase de hover y la fila quedaría
// muerta al pasar el mouse. El mockup escribe `transparent`; acá se omite, que es lo mismo pintado
// y además deja vivo el hover.

export function TarjetaTabla({
  children,
  style,
  testid,
  cols,
}: {
  children: ReactNode
  style?: CSSProperties
  testid?: string
  /**
   * LA MISMA cadena que reciben `EncabezadoCanon` y `FilaCanon`. Con ella la caja se vuelve su
   * propio contenedor de scroll por debajo de `lg` y reserva el ancho con el que la grilla todavía
   * se lee (ver `ancho-minimo.ts` y `.canon-scroll-x` en `globals.css`). Sin ella la tabla no
   * scrollea y a 390 px las columnas fraccionales se van a cero: el dato no se corre, se corta.
   */
  cols?: string
}) {
  return (
    <div data-testid={testid} role="table" style={{ ...TARJETA, flex: 1, minWidth: 0, ...style }}>
      {cols ? <EnvoltorioAncho cols={cols}>{children}</EnvoltorioAncho> : children}
    </div>
  )
}


/** Una columna del encabezado: rótulo, alineación y si va en el tamaño chico de las tablas anidadas. */
export interface ColumnaCanon {
  rotulo: ReactNode
  alineacion?: 'izquierda' | 'derecha' | 'centro'
  /** El rótulo no se dibuja pero la columna existe (la de acciones al final). */
  vacia?: boolean
}

export function EncabezadoCanon({
  cols,
  columnas,
  alto = ALTO.encabezado,
  padding = 14,
  chico = false,
}: {
  cols: string
  columnas: ColumnaCanon[]
  alto?: number
  padding?: number
  /** Las tablas anidadas de `16`, `23` y `26` usan 9,5px y cierran con el divisor de fila. */
  chico?: boolean
}) {
  return (
    <div
      role="row"
      style={{
        display: 'grid',
        gridTemplateColumns: cols,
        gap: 10,
        alignItems: 'end',
        height: alto,
        borderBottom: `1px solid ${chico ? C.lineaFila : C.linea}`,
        background: C.superficieTenue,
        padding: `0 ${padding}px`,
      }}
    >
      {columnas.map((c, i) =>
        c.vacia ? (
          <span key={i} role="columnheader" />
        ) : (
          <span key={i} role="columnheader" style={rotuloColumna(c.alineacion, chico)}>
            {c.rotulo}
          </span>
        ),
      )}
    </div>
  )
}

export function FilaCanon({
  cols,
  alto = ALTO.fila,
  padding = 14,
  seleccionada = false,
  fondo,
  divisor = C.lineaFila,
  onClick,
  children,
  testid,
  ...resto
}: {
  cols: string
  alto?: number
  padding?: number
  seleccionada?: boolean
  /** Sólo para la fila de RUBRO de `15`, que va en `#FCFCFA` esté o no seleccionada. */
  fondo?: string
  divisor?: string
  onClick?: () => void
  children: ReactNode
  testid?: string
} & Omit<React.HTMLAttributes<HTMLDivElement>, 'onClick' | 'style' | 'children'>) {
  const pintada = seleccionada ? C.seleccion : fondo
  return (
    <div
      {...resto}
      role="row"
      data-testid={testid}
      data-seleccionada={seleccionada ? '' : undefined}
      onClick={onClick}
      style={{
        display: 'grid',
        gridTemplateColumns: cols,
        gap: 10,
        alignItems: 'center',
        height: alto,
        borderBottom: `1px solid ${divisor}`,
        padding: `0 ${padding}px`,
        ...(pintada ? { background: pintada } : null),
      }}
      className={`${onClick ? 'cursor-pointer' : ''} ${pintada ? '' : 'hover:bg-[#FAFAF8]'}`}
    >
      {children}
    </div>
  )
}

/** Una celda de texto que se recorta con puntos suspensivos en vez de desbordar la columna. */
export function CeldaTexto({
  children,
  tam = '12px',
  color = C.tintaSuave,
  peso,
  mono = false,
  alineacion,
  titulo,
}: {
  children: ReactNode
  tam?: string
  color?: string
  peso?: number
  mono?: boolean
  alineacion?: 'derecha' | 'centro'
  titulo?: string
}) {
  return (
    <span
      role="cell"
      title={titulo}
      className={mono ? 'font-mono tabular-nums' : undefined}
      style={{
        fontSize: tam,
        color,
        fontWeight: peso,
        minWidth: 0,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        textAlign: alineacion === 'derecha' ? 'right' : alineacion === 'centro' ? 'center' : undefined,
      }}
    >
      {children}
    </span>
  )
}

/**
 * EL PIE DE TOTALES. Cada par es rótulo en 11px `tenue` + valor en mono. `fuerte` sube el valor a
 * 13px/600, que es como el zip marca el total que manda de cada pantalla (`24` TOTAL DEL MES,
 * `25` CONTRATADO).
 */
export function PieCanon({ totales }: { totales: { rotulo: string; valor: ReactNode; color?: string; fuerte?: boolean; testid?: string }[] }) {
  return (
    <div style={PIE_TOTALES}>
      {totales.map((t) => (
        <div key={t.rotulo}>
          <span style={{ fontSize: '11px', color: C.tenue }}>{t.rotulo} </span>
          <span
            data-testid={t.testid}
            className="font-mono tabular-nums"
            style={{ fontSize: t.fuerte ? '13px' : '12px', fontWeight: t.fuerte ? 600 : undefined, color: t.color ?? C.tinta }}
          >
            {t.valor}
          </span>
        </div>
      ))}
    </div>
  )
}

/**
 * EL VACÍO DE LA TABLA. El zip escribe «Nada coincide.» en 12,5px `apagado` con `padding:26px 14px`
 * DENTRO de la caja — no una ilustración ni un bloque aparte. Cuando la lista está vacía porque no
 * hay nada cargado (y no porque se filtró), el texto lo decide la pantalla: son cosas distintas.
 */
export function VacioCanon({ children, testid }: { children: ReactNode; testid?: string }) {
  return (
    <div data-testid={testid} style={{ padding: '26px 14px', fontSize: '12.5px', color: C.apagado }}>
      {children}
    </div>
  )
}
