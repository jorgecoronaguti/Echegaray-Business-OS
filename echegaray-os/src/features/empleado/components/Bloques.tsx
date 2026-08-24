import Link from 'next/link'
import type { ReactNode } from 'react'

// LAS PIEZAS DE TARJETA DEL PERFIL EMPLEADO — las que dibujan los mockups M02…M09 (24/08/2026).
//
// ═══ POR QUÉ VUELVEN LAS TARJETAS ═══
//
// La versión anterior era «secuencia vertical, sin cards»: el argumento era que una tarjeta sugiere
// un objeto separado que se puede abrir. En los mockups del dueño CADA bloque de estas pantallas
// ES abrible —la tarea se abre, el fichaje se toca, el problema lleva a su detalle—, así que la
// tarjeta no miente: dice la verdad sobre el objetivo táctil. Manda el mockup.
//
// El fondo de la pantalla es el canvas gris y la tarjeta es blanca: ese contraste es lo que hace
// que en 390px se vea dónde termina un bloque y empieza el otro sin dibujar una línea por renglón.

/** La tarjeta blanca sobre canvas. `href` la vuelve táctil entera: en obra se toca con guante y el
 *  objetivo es la tarjeta, nunca el texto de adentro. */
export function Tarjeta({
  children, href, tono = 'normal', testid,
}: {
  children: ReactNode
  href?: string
  tono?: 'normal' | 'alerta' | 'ok' | 'marca'
  testid?: string
}) {
  const fondo =
    tono === 'alerta' ? 'border-neg-soft bg-neg-soft'
      : tono === 'ok' ? 'border-pos-soft bg-pos-soft'
        : tono === 'marca' ? 'border-marca bg-marca'
          : 'border-line bg-surface'
  const clases = `block rounded-[14px] border ${fondo} px-4 py-3.5`
  return href ? (
    <Link href={href} data-testid={testid} className={`${clases} active:opacity-90`}>{children}</Link>
  ) : (
    <div data-testid={testid} className={clases}>{children}</div>
  )
}

/** Los filtros de M03 y M08: pastillas, no un `<select>`. Cada una lleva su cuenta al lado —el
 *  número es lo que hace decidir cuál tocar—, y una cuenta que no se pudo leer va `null` y no 0. */
export function Chips({
  base, actual, opciones, testid,
}: {
  base: string
  actual: string
  opciones: { id: string; label: string; cuenta: number | null }[]
  testid?: string
}) {
  return (
    <div data-testid={testid} className="flex gap-2 overflow-x-auto pb-1">
      {opciones.map((o) => {
        const activo = o.id === actual
        return (
          <Link
            key={o.id}
            href={o.id === opciones[0]?.id ? base : `${base}?ver=${o.id}`}
            data-testid={`chip-${o.id}`}
            aria-current={activo ? 'page' : undefined}
            className="flex h-[44px] shrink-0 items-center"
          >
            {/* LA PASTILLA MIDE 34px Y EL OBJETIVO TÁCTIL 44px, y por eso son dos elementos.
                El mockup dibuja la pastilla de 34; el piso de 44px del OS no es estética, es el
                pulgar con guante. Agrandar el dibujo rompería el mockup y achicar el objetivo
                rompería el pulgar: el `<Link>` de 44 envuelve el `<span>` de 34. */}
            <span
              className={`flex h-[34px] items-center gap-1.5 rounded-full border px-3.5 text-[12.5px] ${
                activo ? 'border-ink bg-ink font-semibold text-white' : 'border-line bg-surface text-ink'
              }`}
            >
              {o.label}
              {o.cuenta != null && (
                <span className={`font-mono text-[11px] tabular-nums ${activo ? 'text-white/70' : 'text-faint'}`}>
                  {o.cuenta}
                </span>
              )}
            </span>
          </Link>
        )
      })}
    </div>
  )
}

/** La barra de avance de la tarjeta de tarea. Roja cuando el frente está frenado: el color lo
 *  decide el impedimento, no el porcentaje — un 74% con el material faltante no es una buena
 *  noticia. `pct === null` NO dibuja barra: sin medición no hay avance que pintar. */
export function Barra({ pct, frenada }: { pct: number | null; frenada?: boolean }) {
  if (pct == null) return null
  const ancho = Math.max(0, Math.min(100, pct))
  return (
    <span className="mt-2.5 flex items-center gap-3">
      <span className="h-[6px] min-w-0 flex-1 overflow-hidden rounded-full bg-surface-sunken">
        <span
          className={`block h-full rounded-full ${frenada ? 'bg-neg' : 'bg-info'}`}
          style={{ width: `${ancho}%` }}
        />
      </span>
      <span className="w-[34px] shrink-0 text-right font-mono text-[12.5px] font-semibold tabular-nums text-ink">
        {Math.round(ancho)}%
      </span>
    </span>
  )
}

/** El azulejo de número de M06 y M09: rótulo en versalitas y el número grande debajo. Es el bloque
 *  de dato grande del Employee shell metido en una caja. `valor === null` escribe el faltante con
 *  su nombre —«sin registrar»— y nunca un cero: un 0 afirma que el dato existe y vale cero. */
export function Azulejo({
  etiqueta, valor, falta = 'sin registrar', tono, testid,
}: {
  etiqueta: string
  valor: string | null
  falta?: string
  tono?: 'warn' | 'neg' | 'pos'
  testid?: string
}) {
  const color = tono === 'neg' ? 'text-neg' : tono === 'warn' ? 'text-warn' : tono === 'pos' ? 'text-pos' : 'text-ink'
  return (
    <div
      data-testid={testid}
      data-vacio={valor == null ? 'si' : undefined}
      className="min-w-0 flex-1 rounded-[12px] border border-line bg-surface px-3.5 py-3"
    >
      <span className="block truncate text-[10px] font-semibold tracking-[0.11em] text-faint">
        {etiqueta.toUpperCase()}
      </span>
      {valor == null ? (
        <span className="mt-1.5 block text-[12.5px] text-faint">{falta}</span>
      ) : (
        <span className={`mt-1.5 block font-mono text-[22px] font-semibold leading-none tracking-[-0.02em] tabular-nums ${color}`}>
          {valor}
        </span>
      )}
    </div>
  )
}

/** La primaria de ancho completo del pie: 52px, un solo verbo. Los mockups la dejan fija abajo y
 *  apagada mientras no haya nada que guardar — apagada y con el texto diciendo QUÉ FALTA, no
 *  «Guardar» en gris sin explicación. */
export function PrimariaAncha({
  children, href, tono = 'ink', testid,
}: {
  children: ReactNode
  href?: string
  tono?: 'ink' | 'marca'
  testid?: string
}) {
  const clases = `flex h-[52px] w-full items-center justify-center rounded-[12px] text-[14.5px] font-semibold ${
    tono === 'marca' ? 'bg-marca text-on-marca' : 'bg-ink text-white'
  }`
  return href ? (
    <Link href={href} data-testid={testid} className={`${clases} active:opacity-90`}>{children}</Link>
  ) : (
    <span data-testid={testid} className={clases}>{children}</span>
  )
}
