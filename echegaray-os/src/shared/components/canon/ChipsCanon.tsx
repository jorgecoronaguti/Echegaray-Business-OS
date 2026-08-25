import Link from 'next/link'
import type { ReactNode } from 'react'

// LOS FILTROS DEL CANÓNICO — pastillas con su contador, no texto subrayado.
//
// ═══ MEDIDO ═══
//
// `19 · Personal Cartera.dc.html` y `17 · Base Maestra Tareas.dc.html` dibujan el mismo control:
//
//   `display:flex;alignItems:center;gap:5px;fontSize:12px;border:1px solid <borde>;
//    background:<fondo>;color:<color>;borderRadius:6px;padding:4px 9px`
//   activo    borde #30302F · fondo #30302F · texto #FFFFFF · contador #B9B7B1
//   inactivo  borde #E7E6E2 · fondo #FFFFFF · texto #3A3A38 · contador #91918B
//
// ═══ POR QUÉ NO ES `ds/Filtros` NI `FiltrosURL` ═══
//
// Aquéllos dibujan los filtros como texto con un subrayado de 1,5px en el activo. Es una decisión
// legítima del sistema anterior; el canónico la contradice —pastilla llena de grafito— y en el porte
// literal gana el mockup. No se tocan los otros dos porque los usan pantallas de otros frentes.
//
// ═══ EL CONTADOR ES PARTE DEL FILTRO, NO UN ADORNO ═══
//
// «Papeles vencidos 0» dice, antes de hacer clic, que ese corte está vacío — que es exactamente lo
// que evita el viaje. Por eso `cuenta` admite `null`: cuando la fuente no se pudo contar, el número
// no se dibuja, en vez de decir 0 y prometer una lista vacía que quizá no lo esté.

export interface OpcionChip {
  clave: string
  label: ReactNode
  href: string
  activo?: boolean
  /** `null` = no se pudo contar. Nunca 0 por defecto. */
  cuenta?: number | null
  testid?: string
}

export function ChipsCanon({ opciones, testid = 'filtros' }: { opciones: OpcionChip[]; testid?: string }) {
  return (
    <div data-testid={testid} className="flex min-w-0 flex-wrap items-center gap-2">
      {opciones.map((o) => (
        // `prefetch={false}`: son rutas dinámicas y cada prefetch es un render RSC completo.
        <Link
          key={o.clave}
          href={o.href}
          prefetch={false}
          data-testid={o.testid}
          aria-current={o.activo ? 'true' : undefined}
          className={`flex items-center gap-[5px] rounded-md border px-[9px] py-[4px] text-[12px] transition-colors ${
            o.activo
              ? 'border-accent bg-accent text-white'
              : 'border-line bg-surface text-ink-soft hover:border-line-strong'
          }`}
        >
          {o.label}
          {o.cuenta !== null && o.cuenta !== undefined && (
            // #B9B7B1 sobre el grafito es el contraste que el canónico usa para que el número no
            // compite con el rótulo del chip encendido. No hay token: es un valor medido.
            <span className={`font-mono text-[10.5px] tabular-nums ${o.activo ? 'text-[#B9B7B1]' : 'text-faint'}`}>
              {o.cuenta}
            </span>
          )}
        </Link>
      ))}
    </div>
  )
}
