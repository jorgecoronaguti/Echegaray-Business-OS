'use client'

// EL GRÁFICO DE BARRAS POR MES DE LA PANTALLA DE IMPUESTOS. SVG propio: el repo no tiene librería de
// gráficos y una sola forma (barras por mes, apiladas, con una línea opcional) no justifica sumar una.
//
// ═══ LAS REGLAS QUE CUMPLE (skill dataviz) ═══
//
// Un solo eje y que arranca en cero · barras finas con 2 px de aire entre tramos · lo pagado LLENO y
// lo que falta RAYADO (la diferencia no depende sólo del color: se ve en blanco y negro) · el mes
// actual marcado con una banda · leyenda siempre · el color es de la serie y el texto de los tokens
// de texto · valor al pasar el mouse o al TOCAR: el detalle se escribe debajo del gráfico y no en un
// globo flotante, porque en el teléfono un globo tapa la barra que se tocó.
//
// Es cliente sólo por dos cosas que hay que medir en el navegador: el ancho disponible y qué mes está
// elegido. Los números ya vienen calculados del servidor (`services/impuestosGrafico.ts`).
import { useEffect, useId, useRef, useState } from 'react'
import { plataCorta } from '@/shared/utils/format'

export type ColorSerie = 1 | 2 | 3 | 4 | 5

export interface Tramo { color: ColorSerie; valor: number; rayado?: boolean }
export interface Detalle { rotulo: string; valor: string; color?: ColorSerie; rayado?: boolean; linea?: boolean }
export interface ColumnaGrafico {
  clave: string
  etiqueta: string
  etiquetaLarga: string
  actual: boolean
  /** Apilados desde cero, en este orden. Sólo valores positivos. */
  tramos: Tramo[]
  /** Una barra de fondo detrás de los tramos (el impuesto del período). Puede ser negativa. */
  fondo?: { valor: number; color: ColorSerie } | null
  /** El punto de la línea (saldo a favor). null = sin dato ese mes: la línea se corta. */
  punto?: number | null
  detalle: Detalle[]
}
export interface EntradaLeyenda { rotulo: string; color?: ColorSerie; rayado?: boolean; linea?: boolean }

const rgb = (c: ColorSerie, a = 1) => `rgb(var(--os-serie-${c}-rgb) / ${a})`
const LINEA = 'rgb(var(--os-ink-soft-rgb))'
const M = { izq: 48, der: 8, arriba: 8, abajo: 24 }

function useAncho(inicial: number) {
  const ref = useRef<HTMLDivElement>(null)
  const [ancho, setAncho] = useState(inicial)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setAncho(Math.round(e.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return { ref, ancho }
}

/** La muestra de color de la leyenda y del detalle: el mismo relleno que la barra. */
export function Muestra({ color, rayado, linea }: { color?: ColorSerie; rayado?: boolean; linea?: boolean }) {
  if (linea) return <span aria-hidden className="inline-block h-0.5 w-3 bg-ink-soft align-middle" />
  if (!color) return null
  return (
    <span
      aria-hidden
      className="inline-block h-2.5 w-2.5 rounded-[2px] align-middle"
      style={rayado
        ? { background: `repeating-linear-gradient(135deg, ${rgb(color)} 0 1.5px, ${rgb(color, 0.2)} 1.5px 4px)` }
        : { background: rgb(color) }}
    />
  )
}

export function Leyenda({ entradas }: { entradas: EntradaLeyenda[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-muted">
      {entradas.map((e) => (
        <li key={e.rotulo} className="flex items-center gap-1.5"><Muestra {...e} />{e.rotulo}</li>
      ))}
    </ul>
  )
}

function Rayas({ id, color }: { id: string; color: ColorSerie }) {
  return (
    <pattern id={id} width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <rect width="5" height="5" fill={rgb(color, 0.18)} />
      <line x1="0" y1="0" x2="0" y2="5" stroke={rgb(color)} strokeWidth="1.8" />
    </pattern>
  )
}

export function GraficoMensual({ columnas, leyenda, titulo, testid, escala: esc, alto = 200 }: {
  columnas: ColumnaGrafico[]; leyenda: EntradaLeyenda[]; titulo: string; testid: string
  /** Viene del servidor (`escala` de `services/impuestosGrafico.ts`): la regla vive una vez y se prueba. */
  escala: { desde: number; hasta: number; marcas: number[] }
  alto?: number
}) {
  // Se arranca ANGOSTO y se agranda al medir. Arrancar en 720 hacía que el teléfono emulado midiera la
  // página a 740 px antes de hidratar y se quedara con ese ancho (medido: scrollWidth 740 a 390).
  const { ref, ancho } = useAncho(300)
  const uid = useId().replace(/:/g, '')
  const inicial = Math.max(0, columnas.findIndex((c) => c.actual))
  const [sel, setSel] = useState(inicial)

  const plotW = Math.max(ancho - M.izq - M.der, 10)
  const plotH = alto - M.arriba - M.abajo
  const y = (v: number) => M.arriba + plotH - ((v - esc.desde) / (esc.hasta - esc.desde || 1)) * plotH
  const paso = plotW / columnas.length
  const barra = Math.max(6, Math.min(32, paso * 0.62))
  // Angosto (teléfono): una etiqueta cada tres meses, contadas desde el mes actual para que ése siempre
  // tenga la suya y ninguna choque con la de al lado.
  const saltear = paso < 34
  const colores = [...new Set(columnas.flatMap((c) => [...c.tramos.filter((t) => t.rayado).map((t) => t.color), ...(c.fondo ? [c.fondo.color] : [])]))]
  const puntos = columnas.map((c, i) => (c.punto === null || c.punto === undefined ? null : { x: M.izq + paso * (i + 0.5), y: y(c.punto) }))
  const elegida = columnas[sel]

  return (
    <figure data-testid={testid} className="m-0">
      <div ref={ref} className="w-full min-w-0 overflow-hidden">
        <svg width={ancho} height={alto} role="img" aria-label={titulo} className="block overflow-visible">
          <defs>{colores.map((c) => <Rayas key={c} id={`${uid}-r${c}`} color={c} />)}</defs>
          {esc.marcas.map((m) => (
            <g key={m}>
              <line x1={M.izq} x2={ancho - M.der} y1={y(m)} y2={y(m)} className={m === 0 ? 'stroke-line-strong' : 'stroke-line-hairline'} strokeWidth={1} />
              <text x={M.izq - 8} y={y(m)} dy="0.32em" textAnchor="end" className="fill-faint text-[11px] tabular-nums">{m === 0 ? '0' : plataCorta(m)}</text>
            </g>
          ))}
          {columnas.map((c, i) => {
            const x0 = M.izq + paso * i
            const cx = x0 + paso / 2
            let base = 0
            return (
              <g key={c.clave}>
                {(c.actual || i === sel) && (
                  <rect x={x0 + 1} y={M.arriba} width={paso - 2} height={plotH} rx={4}
                    className={c.actual ? 'fill-surface-sunken' : 'fill-line-hairline'} opacity={c.actual ? 0.8 : 0.9} />
                )}
                {c.fondo && c.fondo.valor !== 0 && (
                  <rect x={cx - barra / 2} width={barra} rx={2}
                    y={Math.min(y(0), y(c.fondo.valor))} height={Math.abs(y(0) - y(c.fondo.valor))}
                    fill={`url(#${uid}-r${c.fondo.color})`} />
                )}
                {c.tramos.filter((t) => t.valor > 0).map((t, k) => {
                  const y1 = y(base + t.valor)
                  const h = Math.max(1, y(base) - y1 - (k > 0 ? 2 : 0))
                  base += t.valor
                  const ancho2 = c.fondo ? barra * 0.55 : barra
                  return <rect key={k} x={cx - ancho2 / 2} y={y1} width={ancho2} height={h} rx={2} fill={t.rayado ? `url(#${uid}-r${t.color})` : rgb(t.color)} />
                })}
                {(!saltear || (i - inicial) % 3 === 0) && (
                  <text x={cx} y={alto - 6} textAnchor="middle" className={`text-[11px] ${c.actual ? 'fill-ink font-semibold' : 'fill-faint'}`}>{c.etiqueta}</text>
                )}
                <rect
                  x={x0} y={M.arriba} width={paso} height={plotH + M.abajo} fill="transparent"
                  tabIndex={0} role="button" aria-label={`${c.etiquetaLarga}: ${c.detalle.map((d) => `${d.rotulo} ${d.valor}`).join(', ') || 'sin movimientos'}`}
                  aria-pressed={i === sel}
                  onPointerEnter={(e) => { if (e.pointerType === 'mouse') setSel(i) }}
                  onClick={() => setSel(i)} onFocus={() => setSel(i)}
                  className="cursor-pointer outline-none focus-visible:stroke-accent"
                />
              </g>
            )
          })}
          {puntos.some(Boolean) && (
            <g pointerEvents="none">
              <path fill="none" stroke={LINEA} strokeWidth={2}
                d={puntos.reduce((d, p, i) => (p ? `${d}${d && puntos[i - 1] ? 'L' : 'M'}${p.x},${p.y}` : d), '')} />
              {puntos.map((p, i) => p && <circle key={i} cx={p.x} cy={p.y} r={3.5} fill={LINEA} className="stroke-canvas" strokeWidth={2} />)}
            </g>
          )}
        </svg>
      </div>
      <figcaption className="mt-3 flex flex-col gap-2">
        <Leyenda entradas={leyenda} />
        <div aria-live="polite" data-testid={`${testid}-detalle`} className="min-h-[44px] text-[13px]">
          {elegida && (
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <span className="font-semibold text-ink">{elegida.etiquetaLarga}</span>
              {elegida.detalle.length ? elegida.detalle.map((d) => (
                <span key={d.rotulo} className="inline-flex items-center gap-1.5 text-muted">
                  <Muestra color={d.color} rayado={d.rayado} linea={d.linea} />{d.rotulo}
                  <span className="font-mono tabular-nums text-ink">{d.valor}</span>
                </span>
              )) : <span className="text-muted">sin movimientos</span>}
            </div>
          )}
        </div>
      </figcaption>
    </figure>
  )
}
