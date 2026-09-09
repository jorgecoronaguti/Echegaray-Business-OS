// LA REJILLA DE LAS TRES SOLAPAS NUEVAS, UNA SOLA VEZ.
//
// El mockup v2 dibuja el mismo objeto en las pantallas 7, 8 y 12: una grilla CSS con encabezado de
// columna en versalita mono, filas de 46–58 px separadas por un filo, y una fila de total cerrada
// por arriba con el grafito. Copiarla tres veces garantizaba que la cuarta pantalla la corriera un
// píxel; y `ds/Tabla` no sirve acá porque es `<table>` con anchos automáticos, y el mockup fija las
// columnas al píxel para que los números queden en la misma vertical entre cuadros.
//
// Los valores salen de `design/Liquidación de horas v2.dc.html`, líneas 525-547 y 684-694.

import type { CSSProperties, ReactNode } from 'react'
import { V } from '@/shared/components/v2/patron'

export const MONO = "'IBM Plex Mono', monospace"

/** El contenedor de un cuadro: radio 10, filo `line-2`, sin sombra y sin gradiente. `dc:525`. */
export function Cuadro({ children, ancho, testid }: {
  children: ReactNode; ancho?: number | string; testid?: string
}) {
  return (
    <div
      data-testid={testid}
      style={{
        width: ancho ?? '100%', maxWidth: '100%', background: '#FFFFFF',
        border: `1px solid ${V.lineaFuerte}`, borderRadius: 10, padding: 28,
        display: 'flex', flexDirection: 'column', gap: 16,
      }}
    >
      {children}
    </div>
  )
}

/** El título de un bloque dentro del cuadro. 12,5 px / 600. `dc:544`. */
export const TituloBloque = ({ children }: { children: ReactNode }) => (
  <div style={{ fontSize: '12.5px', fontWeight: 600, color: V.tinta }}>{children}</div>
)

const grilla = (columnas: string, alto: number): CSSProperties => ({
  display: 'grid', gridTemplateColumns: columnas, gap: 14, minHeight: alto, alignItems: 'center',
  borderBottom: `1px solid ${V.linea}`,
})

/** El encabezado de columnas: mono 9,5 px, versalita, alineado abajo. `dc:526`. */
export function Encabezado({ columnas, celdas }: { columnas: string; celdas: ReactNode[] }) {
  return (
    <div style={{
      ...grilla(columnas, 34), alignItems: 'end', paddingBottom: 9,
      fontFamily: MONO, fontSize: '9.5px', letterSpacing: '.04em', color: V.tenue,
      textTransform: 'uppercase',
    }}>
      {celdas.map((c, i) => (
        <div key={i} style={i === 0 ? undefined : { textAlign: 'right' }}>{c}</div>
      ))}
    </div>
  )
}

/** Una fila. `tenue` la baja de peso: es la línea de agregado, no un dato más. */
export function Fila({ columnas, celdas, alto = 52, tenue = false, testid }: {
  columnas: string; celdas: ReactNode[]; alto?: number; tenue?: boolean; testid?: string
}) {
  return (
    <div data-testid={testid} style={{
      ...grilla(columnas, alto),
      ...(tenue ? { fontSize: '11.5px', color: V.tenue } : null),
    }}>
      {celdas.map((c, i) => (
        <div key={i} style={i === 0 ? { minWidth: 0 } : { textAlign: 'right' }}>{c}</div>
      ))}
    </div>
  )
}

/** La fila de total: cerrada por arriba con el grafito, sin filo abajo. `dc:547`. */
export function Total({ columnas, celdas, testid }: {
  columnas: string; celdas: ReactNode[]; testid?: string
}) {
  return (
    <div data-testid={testid} style={{
      display: 'grid', gridTemplateColumns: columnas, gap: 14, minHeight: 52, alignItems: 'center',
      borderTop: `1px solid ${V.grafito}`, fontWeight: 600, color: V.tinta,
    }}>
      {celdas.map((c, i) => (
        <div key={i} style={i === 0 ? { minWidth: 0 } : { textAlign: 'right' }}>{c}</div>
      ))}
    </div>
  )
}

/** El cuerpo con números tabulares. Todo número comparable los lleva (§2 del handoff). */
export const Cuerpo = ({ children }: { children: ReactNode }) => (
  <div style={{
    display: 'flex', flexDirection: 'column', fontSize: '12.5px',
    fontVariantNumeric: 'tabular-nums', color: V.tinta,
  }}>
    {children}
  </div>
)

/** Un dato que no existe. Gris `faint`, nunca cero y nunca rojo: no es un problema, es un hueco. */
export const Hueco = ({ children = '—' }: { children?: ReactNode }) => (
  <span style={{ color: V.tenue }}>{children}</span>
)

/** El encabezado numerado de una pantalla del mockup. `dc:519`. */
export function Titulo({ numero, titulo, bajada }: {
  numero: string; titulo: string; bajada: string
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap', paddingBottom: 12 }}>
      <span style={{ fontFamily: MONO, fontSize: '12px', color: V.tenue }}>{numero}</span>
      <span style={{ fontSize: '14.5px', fontWeight: 600, color: V.tinta }}>{titulo}</span>
      <span style={{ fontSize: '12.5px', color: V.apagado }}>— {bajada}</span>
    </div>
  )
}

/** Miles a la argentina, sin decimales. Los pesos de esta pantalla no se cuentan en centavos. */
export const miles = (n: number | null | undefined, decimales = 0): string =>
  n == null || !Number.isFinite(Number(n))
    ? '—'
    : Number(n).toLocaleString('es-AR', { minimumFractionDigits: decimales, maximumFractionDigits: decimales })
