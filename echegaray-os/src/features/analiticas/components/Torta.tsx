// LA TORTA (dona) DE ANALÍTICAS — parte de un total de un vistazo, y nada más que eso.
//
// ═══ CUÁNDO SÍ Y CUÁNDO NO (dueño, 18/09/2026: «más gráficos de torta … según sea más sencillo») ═══
//
// Torta sólo para PARTE DE UN TOTAL con 6 porciones como máximo y un total dicho en texto. No para
// comparar valores parecidos (un ojo no separa 23 % de 27 %: va barra), no para tiempo (columna), no
// para comparar obras o clientes entre sí (barra), no con 2 porciones (un indicador), no con más de 6.
// Junto a cada gráfico de Analíticas está escrito por qué es torta o por qué sigue siendo barra.
//
// ═══ LAS REGLAS DE CADA TORTA ═══
//
//   · leyenda siempre; etiqueta directa en la porción cuando son 4 o menos y la porción tiene lugar;
//   · un color por rubro, FIJO, el mismo que en las barras (`RUBRO_COLOR`): si una obra no tiene un
//     rubro, las demás porciones no se repintan;
//   · tooltip nativo (`<title>`) con el valor y el porcentaje; el total en texto al centro;
//   · las porciones suman EXACTAMENTE el total que la pantalla dice arriba: un rubro `null` se dice,
//     no se dibuja como cero. Un total nulo no dibuja nada: dice «sin movimiento».
//
// Sin librerías: es un SVG con arcos. Se lee a 390 px porque el ancho es el del contenedor.
import type { Rubro } from '../services/presupuesto'
import { millones, pctEntero } from '../services/formato'

/** LA IDENTIDAD DE CADA RUBRO, una vez: la clase de fondo (barras) y el color (tortas SVG). */
export const RUBRO_COLOR: Record<Rubro, { clase: string; hex: string; rotulo: string }> = {
  manoObra: { clase: 'bg-rubro-mo', hex: 'var(--os-rubro-mo)', rotulo: 'mano de obra' },
  materiales: { clase: 'bg-rubro-materiales', hex: 'var(--os-rubro-materiales)', rotulo: 'materiales' },
  subcontratos: { clase: 'bg-rubro-subcontratistas', hex: 'var(--os-rubro-subcontratistas)', rotulo: 'subcontratistas' },
  otros: { clase: 'bg-rubro-otros', hex: 'var(--os-rubro-otros)', rotulo: 'otros' },
}

/** El orden fijo en que se apilan y se cortan los rubros, en toda la pantalla. */
export const ORDEN_RUBROS: Rubro[] = ['manoObra', 'materiales', 'subcontratos', 'otros']

export interface Porcion { clave: string; rotulo: string; valor: number; color: string; clase?: string }

const polar = (cx: number, cy: number, r: number, a: number) => [cx + r * Math.cos(a), cy + r * Math.sin(a)] as const

function arco(cx: number, cy: number, r0: number, r1: number, a0: number, a1: number): string {
  const grande = a1 - a0 > Math.PI ? 1 : 0
  const [x0, y0] = polar(cx, cy, r1, a0); const [x1, y1] = polar(cx, cy, r1, a1)
  const [x2, y2] = polar(cx, cy, r0, a1); const [x3, y3] = polar(cx, cy, r0, a0)
  return `M ${x0} ${y0} A ${r1} ${r1} 0 ${grande} 1 ${x1} ${y1} L ${x2} ${y2} A ${r0} ${r0} 0 ${grande} 0 ${x3} ${y3} Z`
}

/** Los arcos de cada porción, en orden, desde las 12 en punto. Función pura: el render no muta nada. */
function arcosDe(porciones: Porcion[], suma: number, cx: number, cy: number, r0: number, r1: number) {
  const sep = porciones.length > 1 ? 0.012 : 0 // el hueco entre porciones: separación por superficie, sin borde
  const out: { p: Porcion; d: string; lx: number; ly: number; pct: number; ang: number }[] = []
  let a = -Math.PI / 2
  for (const p of porciones) {
    const ang = (p.valor / suma) * Math.PI * 2
    const a0 = a + sep, a1 = a + ang - sep
    a += ang
    const [lx, ly] = polar(cx, cy, (r0 + r1) / 2, (a0 + a1) / 2)
    out.push({ p, d: a1 > a0 ? arco(cx, cy, r0, r1, a0, a1) : '', lx, ly, pct: p.valor / suma, ang })
  }
  return out
}

/**
 * `porciones`: sólo las que tienen valor (> 0). `total` es el que la pantalla dice arriba; las porciones
 * lo tienen que sumar, y si no, `nota` lo explica. `ausentes`: rubros sin dato, nombrados debajo y no
 * dibujados como cero.
 */
export function Torta({ porciones, total, titulo, ausentes = [], nota, testid, tam = 168 }: {
  porciones: Porcion[]
  total: number | null
  titulo: string
  ausentes?: string[]
  nota?: string
  testid?: string
  tam?: number
}) {
  const suma = porciones.reduce((a, p) => a + p.valor, 0)
  if (total == null || suma <= 0) {
    return <div className="text-[12.5px] text-faint" data-testid={testid}>{titulo}: sin movimiento</div>
  }
  const cx = tam / 2, cy = tam / 2, r1 = tam / 2 - 2, r0 = tam / 2 * 0.58
  const arcos = arcosDe(porciones, suma, cx, cy, r0, r1)
  return (
    <figure className="flex flex-wrap items-center gap-x-6 gap-y-3" data-testid={testid}>
      <svg width={tam} height={tam} viewBox={`0 0 ${tam} ${tam}`} role="img" aria-label={`${titulo}: ${millones(total)}`}>
        {arcos.map(({ p, d, lx, ly, pct, ang }) => (
          <g key={p.clave}>
            <path d={d} fill={p.color} data-rubro={p.clave}>
              <title>{`${p.rotulo}: ${millones(p.valor)} · ${pctEntero(pct)}`}</title>
            </path>
            {/* Etiqueta directa sólo donde entra: con 4 porciones o menos y una porción de al menos 9 %. */}
            {porciones.length <= 4 && ang > Math.PI * 0.18 ? (
              <text x={lx} y={ly} textAnchor="middle" dominantBaseline="central" fontSize="10.5" fill="#fff" style={{ pointerEvents: 'none' }}>
                {pctEntero(pct)}
              </text>
            ) : null}
          </g>
        ))}
        <text x={cx} y={cy - 6} textAnchor="middle" fontSize="12.5" fontWeight={600} fill="currentColor" className="text-ink">{millones(total)}</text>
        <text x={cx} y={cy + 9} textAnchor="middle" fontSize="9.5" fill="currentColor" className="text-faint">total</text>
      </svg>
      <figcaption className="flex min-w-0 flex-col gap-1.5 text-[11.5px]">
        <div className="text-[12.5px] font-medium text-ink">{titulo}</div>
        {porciones.map((p) => (
          <div key={p.clave} className="flex items-center gap-2 tabular-nums text-muted">
            <span className={`size-2.5 rounded-[2px] ${p.clase ?? ''}`} style={p.clase ? undefined : { background: p.color }} />
            <span className="text-ink">{p.rotulo}</span>
            <span>{millones(p.valor)} · {pctEntero(p.valor / suma)}</span>
          </div>
        ))}
        {ausentes.length ? <div className="text-faint">{ausentes.join(' · ')}: sin movimiento</div> : null}
        {nota ? <div className="text-faint">{nota}</div> : null}
      </figcaption>
    </figure>
  )
}

/** Las porciones de un gasto por rubro, en el orden fijo y con el color fijo; los `null` van a `ausentes`. */
export function porcionesDeRubros(g: Partial<Record<Rubro, number | null>>): { porciones: Porcion[]; ausentes: string[] } {
  const porciones: Porcion[] = []
  const ausentes: string[] = []
  for (const k of ORDEN_RUBROS) {
    const v = g[k]
    const c = RUBRO_COLOR[k]
    if (v != null && v > 0) porciones.push({ clave: k, rotulo: c.rotulo, valor: v, color: c.hex, clase: c.clase })
    else if (v == null) ausentes.push(c.rotulo)
  }
  return { porciones, ausentes }
}
