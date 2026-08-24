import type { CSSProperties, ReactNode } from 'react'

// LA LISTA DEL CANÓNICO — porte literal, no una tabla reinterpretada.
//
// ═══ QUÉ SE MIDIÓ Y DE DÓNDE ═══
//
// Los canónicos `00 · Home Navegación`, `17 · Base Maestra Tareas`, `19 · Personal Cartera` y
// `22/25 · Cartera` dibujan TODOS la misma caja, con los mismos números:
//
//   contenedor   `background:#FFFFFF;border:1px solid #E7E6E2;borderRadius:10px;overflow:hidden`
//   encabezado   `display:grid;gridTemplateColumns:<cols>;gap:10px;alignItems:end;height:38px;
//                 borderBottom:1px solid #E7E6E2;background:#FAFAF8;padding:0 14px`
//   rótulo       `fontSize:10px;color:#91918B;letterSpacing:.05em;paddingBottom:8px`
//   fila         `display:grid;…;alignItems:center;height:48px (19) / 46px (00) / 44px (17);
//                 borderBottom:1px solid #F1F0EC;padding:0 14px` · hover `#FAFAF8`
//   seleccionada `background:#FEF9E6`
//   pie          `display:flex;gap:26px;justifyContent:flex-end;padding:11px 16px;background:#FAFAF8`
//
// ═══ POR QUÉ NO ES `ds/Tabla` ═══
//
// `ds/Tabla` dice, textual, *«Las tablas no van en caja: hairline superior + divisores de fila»*, y
// dibuja el encabezado a 32px sin fondo. Es una decisión legítima del sistema anterior y el canónico
// la contradice punto por punto: caja con radio 10, encabezado de 38px sobre `#FAFAF8`, pie de
// marcador adentro de la caja. **Gana el mockup** (briefing del porte literal), y no se toca
// `ds/Tabla` porque la usan pantallas de otros frentes: acá vive la versión canónica y allá la que
// queda hasta que su pantalla se porte.
//
// ═══ Y POR QUÉ ES UNA GRILLA Y NO UNA `<table>` ═══
//
// Porque el mockup es una grilla: `display:grid` con `gridTemplateColumns` fijos permite que una
// celda tenga DOS renglones (obra arriba, cuadrilla abajo en el 19) sin romper la alineación de la
// columna, que es exactamente lo que una `<table>` no puede hacer sin celdas anidadas. Los roles ARIA
// devuelven la semántica de tabla al lector de pantalla.
//
// `cols` viaja por prop y no por contexto: estos componentes se usan desde server components, y un
// contexto de React obligaría a marcar toda la lista como `'use client'`.

/** El contenedor: caja blanca, hairline, radio 10, y nada se derrama fuera. */
export function ListaCanon({
  children, testid, className = '',
}: { children: ReactNode; testid?: string; className?: string }) {
  return (
    <div
      role="table"
      data-testid={testid}
      className={`min-w-0 flex-1 overflow-hidden rounded-[10px] border border-line bg-surface ${className}`}
    >
      {children}
    </div>
  )
}

const grilla = (cols: string): CSSProperties => ({ gridTemplateColumns: cols, gap: '10px' })

/** El encabezado de 38px sobre `#FAFAF8`. Los rótulos se alinean ABAJO (`alignItems:end`). */
export function CabezaCanon({ cols, children }: { cols: string; children: ReactNode }) {
  return (
    <div
      role="row"
      style={grilla(cols)}
      className="grid h-[38px] items-end border-b border-line bg-surface-quiet px-[14px]"
    >
      {children}
    </div>
  )
}

/** Un rótulo de columna. `alinear` sigue al dato que encabeza: los números van a la derecha. */
export function RotuloCanon({
  children, alinear = 'left',
}: { children?: ReactNode; alinear?: 'left' | 'right' | 'center' }) {
  const a = alinear === 'right' ? 'text-right' : alinear === 'center' ? 'text-center' : ''
  return (
    <span role="columnheader" className={`pb-[8px] text-[10px] tracking-[0.05em] text-faint ${a}`}>
      {children}
    </span>
  )
}

/**
 * Una fila. `alto` en px porque el canónico lo fija por pantalla —48 en el 19, 46 en el 00, 44 en
 * el 17— y no es un valor de sistema: es densidad decidida por lo que cada fila tiene que mostrar.
 */
export function FilaCanon({
  cols, alto = 48, seleccionada, onClick, children, testid, className = '',
}: {
  cols: string
  alto?: number
  seleccionada?: boolean
  onClick?: () => void
  children: ReactNode
  testid?: string
  className?: string
}) {
  return (
    <div
      role="row"
      data-testid={testid}
      data-seleccionada={seleccionada ? '' : undefined}
      onClick={onClick}
      style={{ ...grilla(cols), height: `${alto}px` }}
      // #F1F0EC y #FEF9E6 van literales: son los valores MEDIDOS del canónico y no existen como
      // token (`--os-marca-soft` es #FEF4CF, más saturado — la selección del mockup es más pálida).
      className={`grid items-center border-b border-[#F1F0EC] px-[14px] last:border-0 ${
        seleccionada ? 'bg-[#FEF9E6]' : 'hover:bg-surface-quiet'
      } ${onClick ? 'cursor-pointer' : ''} ${className}`}
    >
      {children}
    </div>
  )
}

/** Lo que dice la lista cuando ningún filtro deja nada: una línea, dentro de la caja. */
export function VacioCanon({ children, testid }: { children: ReactNode; testid?: string }) {
  return (
    <div data-testid={testid} className="px-[14px] py-[26px] text-[12.5px] text-muted">
      {children}
    </div>
  )
}

export interface MetricaCanon {
  /** En VERSALITAS, como el canónico: `PLANTEL`, `EN OBRA HOY`, `SIN ASIGNAR`. */
  rotulo: string
  /** Ya formateado. `null` no se dibuja como 0: se pasa la palabra que corresponda. */
  valor: string
  /** El único color que el canónico usa acá es el ámbar de lo que falta. */
  tono?: 'ink' | 'warn' | 'pos' | 'neg'
}

const TINTA: Record<NonNullable<MetricaCanon['tono']>, string> = {
  ink: 'text-ink', warn: 'text-warn', pos: 'text-pos', neg: 'text-neg',
}

/**
 * EL PIE ES UN MARCADOR, y va ADENTRO de la caja sobre `#FAFAF8` (canónicos 17 y 19). Fuera de la
 * caja quedaba flotando sobre el canvas y se leía como pie de página, no como total de la lista.
 */
export function PieCanon({ metricas, testid }: { metricas: MetricaCanon[]; testid?: string }) {
  return (
    <div
      data-testid={testid}
      className="flex flex-wrap justify-end gap-x-[26px] gap-y-1 bg-surface-quiet px-4 py-[11px]"
    >
      {metricas.map((m) => (
        <div key={m.rotulo}>
          <span className="text-[11px] text-faint">{m.rotulo} </span>
          <span className={`font-mono text-[12px] tabular-nums ${TINTA[m.tono ?? 'ink']}`}>{m.valor}</span>
        </div>
      ))}
    </div>
  )
}
