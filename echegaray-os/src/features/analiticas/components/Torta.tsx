// LA TORTA DE ANALÍTICAS — el gráfico de «de qué está hecho» del diseño v9.
//
// Geometría LITERAL del archivo aprobado (`Analíticas v9 · Todas las pantallas.dc.html`, función
// `arco`): viewBox 160×160, radio 76, arranca arriba (−90°) y gira a favor del reloj; el centro lo
// tapa un círculo de radio 44 del color del fondo, con el total adentro. La leyenda es una grilla de
// cuatro columnas —chip, rótulo, monto, porcentaje— con filas de 32 px y un filo entre ellas.
//
// Los colores NO son hex: cada gajo trae una clase de token (`text-warn`, `text-dato-referencia`…) y
// el gajo se pinta con `fill-current` y el chip con `bg-current`. Un token, dos usos, sin repetir el
// color en dos lados.
//
// Un gajo en cero NO se dibuja (el arco de 0° es una línea): se lista igual en la leyenda si quien
// llama lo pasa, porque «no hay» es un dato y se dice con su palabra.
import { millones, pctEntero } from '../services/formato'

export interface Gajo {
  rotulo: string
  monto: number
  /** Token de color, como clase de texto: `text-accent`, `text-warn`, `text-dato-referencia`. */
  color: string
  /** Una palabra cuando no hay plata: se escribe en vez de `$ 0,00 M`. */
  falta?: string
}

const C = 80
const R = 76

/** El `d` de un gajo entre dos ángulos (radianes). Copiado del diseño para que el dibujo sea el mismo. */
export function arco(a0: number, a1: number): string {
  const p = (a: number): [number, number] => [C + R * Math.cos(a), C + R * Math.sin(a)]
  if (a1 - a0 >= Math.PI * 2 - 0.0001) return `M${C} ${C - R} A${R} ${R} 0 1 1 ${C - 0.01} ${C - R} Z`
  const [x0, y0] = p(a0)
  const [x1, y1] = p(a1)
  return `M${C} ${C} L${x0.toFixed(2)} ${y0.toFixed(2)} A${R} ${R} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)} Z`
}

/** Los gajos con plata, cada uno con su `d` y su parte del total. */
export function gajosDe(gajos: Gajo[]): { gajo: Gajo; d: string; parte: number }[] {
  const total = gajos.reduce((s, g) => s + Math.max(g.monto, 0), 0)
  if (total <= 0) return []
  let ang = -Math.PI / 2
  return gajos.filter((g) => g.monto > 0).map((g) => {
    const a0 = ang
    const a1 = ang + (g.monto / total) * Math.PI * 2
    ang = a1
    return { gajo: g, d: arco(a0, a1), parte: g.monto / total }
  })
}

export function Torta({ gajos, centro, centroNota }: { gajos: Gajo[]; centro: string | null; centroNota: string }) {
  const trozos = gajosDe(gajos)
  const total = gajos.reduce((s, g) => s + Math.max(g.monto, 0), 0)
  return (
    <div className="grid items-center gap-6 lg:grid-cols-[160px_minmax(0,360px)] lg:gap-9">
      <div className="relative size-[160px]">
        <svg viewBox="0 0 160 160" className="block size-full" role="img" aria-label={centroNota}>
          {trozos.map((t) => (
            <path key={t.gajo.rotulo} d={t.d} className={`${t.gajo.color} fill-current stroke-surface`} strokeWidth={1.5} />
          ))}
          {trozos.length === 0 ? <circle cx={C} cy={C} r={R} className="fill-line" /> : null}
          <circle cx={C} cy={C} r={44} className="fill-surface" />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5">
          <div className={`text-[15px] font-semibold tracking-[-0.02em] tabular-nums ${centro == null ? 'text-faint' : 'text-ink'}`}>{centro ?? 'sin registrar'}</div>
          <div className="text-[10.5px] text-faint">{centroNota}</div>
        </div>
      </div>
      <div className="flex min-w-0 flex-col">
        {gajos.map((g) => (
          <div key={g.rotulo} className="grid h-8 grid-cols-[12px_minmax(0,1fr)_auto_48px] items-center gap-2.5 border-b border-line">
            <span className={`size-2.5 rounded-[2px] ${g.monto > 0 ? `${g.color} bg-current` : 'bg-line-strong'}`} />
            <span className={`truncate text-[12.5px] ${g.monto > 0 ? 'text-ink' : 'text-faint'}`}>{g.rotulo}</span>
            <span className={`whitespace-nowrap text-[12.5px] tabular-nums ${g.monto > 0 ? 'text-ink' : 'text-faint'}`}>
              {g.monto > 0 ? millones(g.monto) : g.falta ?? 'ninguno'}
            </span>
            <span className="text-right text-xs font-semibold tabular-nums text-ink">{total > 0 && g.monto > 0 ? pctEntero(g.monto / total) : ''}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * LA TORTITA DE 56 px — una por cliente, al lado de la torta grande del Resumen.
 *
 * Del diseño v9, sección «De qué está hecho el gasto»: `grid-template-columns:56px minmax(0,1fr)`
 * con 12 px de aire, y a la derecha tres renglones —nombre 12.5px/500, monto 11.5px muted y la
 * mezcla 11px faint («MO 43 · sub 1 · mat 56»)—. Sin leyenda: la de la torta grande ya está arriba
 * y repetirla cinco veces sería la misma información cinco veces.
 *
 * NO LLEVA CENTRO BLANCO. En el diseño la tortita es maciza: a 56 px el agujero se come el dibujo.
 * Es el mismo `arco()` con el mismo viewBox, así que los dos gráficos son el mismo gráfico.
 */
export function Tortita({ nombre, monto, mezcla, gajos }: {
  /** `null` = no se pudo formatear el total; se escribe ausencia, nunca «$ 0,00 M». */
  nombre: string; monto: string | null; mezcla: string; gajos: Gajo[]
}) {
  const trozos = gajosDe(gajos)
  return (
    <div className="grid min-w-0 grid-cols-[56px_minmax(0,1fr)] items-center gap-3">
      <svg viewBox="0 0 160 160" className="block size-14" role="img" aria-label={`${nombre}: ${mezcla}`}>
        {trozos.map((t) => (
          <path key={t.gajo.rotulo} d={t.d} className={`${t.gajo.color} fill-current stroke-surface`} strokeWidth={1.5} />
        ))}
        {trozos.length === 0 ? <circle cx={C} cy={C} r={R} className="fill-line" /> : null}
      </svg>
      <div className="flex min-w-0 flex-col gap-0.5">
        <div className="truncate text-[12.5px] font-medium text-ink">{nombre}</div>
        <div className={`whitespace-nowrap text-[11.5px] tabular-nums ${monto == null ? 'text-faint' : 'text-muted'}`}>{monto ?? 'sin registrar'}</div>
        <div className="truncate text-[11px] text-faint tabular-nums">{mezcla}</div>
      </div>
    </div>
  )
}
