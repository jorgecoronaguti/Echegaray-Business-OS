'use client'

import type { ReactNode } from 'react'

// LOS CONTROLES DE ENTRADA — `design/system/COMPONENTS.md` §Inputs.
//
// 34px de alto en escritorio, 48 en el teléfono; borde `line-strong` (el borde de campo editable,
// más presente que el de bloque, porque un campo tiene que verse tocable); radio 6; texto 13.
//
// La clase se exporta como constante además del componente: hay formularios del OS que necesitan
// pintar un `<select>` nativo o un input controlado por una librería, y la alternativa a compartir
// la clase es que cada uno se dibuje su propio campo un píxel distinto.

export const CAMPO =
  'h-control w-full rounded-control border border-line-strong bg-surface px-2.5 text-[13px] text-ink placeholder:text-faint transition-colors focus:border-ink/30 disabled:bg-surface-sunken disabled:text-faint max-lg:h-control-movil'

export function Campo({
  rotulo,
  ayuda,
  error,
  children,
  className = '',
}: {
  rotulo?: ReactNode
  ayuda?: ReactNode
  error?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <label className={`block ${className}`}>
      {rotulo && <span className="mb-1 block text-[12.5px] text-ink-soft">{rotulo}</span>}
      {children}
      {ayuda && !error && <span className="mt-1 block text-[11.5px] text-faint">{ayuda}</span>}
      {error && <span className="mt-1 block text-[11.5px] text-neg">{error}</span>}
    </label>
  )
}

/**
 * LA LUPA DEL SISTEMA — SVG, NUNCA EL CARÁCTER `⌕` (U+2315).
 *
 * IBM Plex Sans no trae ese glifo: el navegador dibuja el rectángulo vacío del «tofu». Y no falla,
 * se dibuja mal — que es peor, porque nada avisa. Un icono que depende de qué caracteres traiga la
 * tipografía es un icono que un día no está.
 *
 * Se exporta porque además de los dos buscadores del sistema hay pantallas que dibujan la lupa
 * suelta. Tres áreas la redibujaron por su cuenta el mismo día; una sola definición es lo que evita
 * la cuarta.
 */
export function IconoBuscar({ className = '' }: { className?: string }) {
  return (
    <svg
      aria-hidden
      width="13"
      height="13"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className={`shrink-0 text-faint ${className}`}
    >
      <circle cx="9" cy="9" r="6" />
      <line x1="13.5" y1="13.5" x2="18" y2="18" strokeLinecap="round" />
    </svg>
  )
}

/**
 * EL BUSCADOR DE UNA LISTA: sólo hairline inferior + icono. Sin caja. Un buscador con borde completo
 * arriba de una tabla sin caja es la caja que la tabla no tiene.
 *
 * Es LA caja de búsqueda del OS, y filtra al teclear porque no tiene otra forma de hacerlo: avisa
 * cada tecla y no sabe nada de Enter. Ésta es la versión CONTROLADA, para listas que ya viajaron
 * enteras al navegador —Clientes, Cuentas, Operarios, Costos—: filtrar es un `filter` en memoria,
 * instantáneo y sin debounce, porque no hay ningún viaje que ahorrar.
 *
 * Cuando el filtro lo resuelve Postgres y el estado tiene que quedar en la URL, el que va es
 * `BuscadorURL`, que dibuja EXACTAMENTE éste y le pone la navegación encima.
 */
export function Buscador({
  value,
  onChange,
  name,
  placeholder = 'Buscar',
  testid = 'buscador',
  className = '',
}: {
  value: string
  onChange: (v: string) => void
  /** Sólo cuando va dentro de un `form` que tiene que seguir funcionando sin JavaScript. */
  name?: string
  placeholder?: string
  testid?: string
  className?: string
}) {
  return (
    <div className={`flex min-w-0 items-center gap-2 border-b border-line ${className}`}>
      <IconoBuscar />
      <input
        type="search"
        name={name}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        data-testid={testid}
        aria-label={placeholder}
        className="h-control min-w-0 flex-1 bg-transparent text-[13px] text-ink outline-none placeholder:text-faint max-lg:h-control-movil"
      />
    </div>
  )
}

// ═══ FILTROS ═══
//
// «Texto en línea, activo subrayado; contador "N de M" a la derecha. NO aparecen con una sola
// fila.» Lo último es la regla que más se olvida: un filtro sobre una lista de un elemento no es
// una ayuda, es una fila de interfaz que no hace nada. Y el estado va a la URL, para que la vista
// filtrada se pueda pasar por chat.
export function Filtros({
  opciones,
  cuenta,
  testid = 'filtros',
}: {
  opciones: { label: ReactNode; href?: string; onClick?: () => void; activo?: boolean; testid?: string }[]
  /** `{ n, total }`. Se dibuja sólo si filtrar cambió algo. */
  cuenta?: { n: number; total: number } | null
  testid?: string
}) {
  return (
    <div data-testid={testid} className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1.5">
      {opciones.map((o, k) => {
        const clase = `pb-[2px] text-[12.5px] transition-colors ${
          o.activo ? 'border-b-[1.5px] border-ink font-medium text-ink' : 'border-b-[1.5px] border-transparent text-muted hover:text-ink'
        }`
        return o.href ? (
          <a key={o.href} href={o.href} data-testid={o.testid} aria-current={o.activo ? 'true' : undefined} className={clase}>
            {o.label}
          </a>
        ) : (
          <button key={k} type="button" onClick={o.onClick} data-testid={o.testid} aria-pressed={o.activo} className={clase}>
            {o.label}
          </button>
        )
      })}
      {cuenta && cuenta.n !== cuenta.total && (
        <span className="ml-auto font-mono text-[11.5px] tabular-nums text-faint" data-testid="filtros-cuenta">
          {cuenta.n} de {cuenta.total}
        </span>
      )}
    </div>
  )
}
