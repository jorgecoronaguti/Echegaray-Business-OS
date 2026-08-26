'use client'

// EL SHELL DEL PORTAL — una sola pieza que sirve de 360px a 2560px.
//
// ═══ POR QUÉ NO SON DOS COMPONENTES ═══
//
// Las maquetas son dos archivos (escritorio y teléfono) pero NO son dos productos: el mismo menú, la
// misma barra de obras, el mismo contenido. Partirlo en `ShellCompu` y `ShellMobile` duplica el menú
// y garantiza que dentro de dos meses uno tenga un destino que el otro no. Acá el menú se declara una
// vez y se dibuja de dos maneras: al costado desde `md`, abajo por debajo.
//
// ═══ ESTO NO ES EL OS ═══
//
// El portal es una aplicación aparte. No hay header de Administración, no hay sidebar del OS, no hay
// buscador global. Un cliente que ve un pedazo del chrome interno ve algo que no le pertenece.
//
// ═══ LO QUE LAS MAQUETAS DECIDEN Y ACÁ SE RESPETA ═══
//
//   · barra lateral de 88px, ítems de 68px, activo en amarillo con texto grafito
//   · «Avance» en gris, sin `href`, con el rótulo «Más adelante» — presente para que el cliente sepa
//     que viene; esconderlo lo convertiría en una sorpresa
//   · la barra de arriba dice de QUIÉN es lo que se está mirando — ya no elige obra: todas las obras
//     del cliente se muestran juntas en el contenido (26/08/2026, pedido del dueño: «me sirve por
//     cliente y q cada cliente tenga todas sus obras»). Elegir una obra para ver el total obligaba al
//     cliente a sumar de memoria cuatro pantallas.
//   · en el teléfono el menú son CINCO — Avance y Salir suben a la barra de arriba, como en la maqueta

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'
import { DESTINOS, NAVEGABLES, destinoActivo } from './destinos'
import { IconoDestino } from './IconoDestino'
import { IconoUsuario } from './iconos'

export type ObraDelPortal = { id: string; nombre: string }

type Props = {
  /** El nombre del cliente: es de quién es TODO lo que se ve abajo. */
  cliente: string
  /** Cuántas obras suyas hay. Sólo para el subtítulo — la lista vive en el contenido. */
  obras: number
  children: ReactNode
}

export function Shell({ cliente, obras, children }: Props) {
  const ruta = usePathname() ?? '/portal'
  const activo = destinoActivo(ruta)

  return (
    <div className="flex min-h-dvh bg-canvas text-ink">
      {/* ── BARRA LATERAL · sólo escritorio ─────────────────────────────────────────────────── */}
      <nav
        aria-label="Secciones"
        className="hidden w-[88px] shrink-0 flex-col items-center gap-[5px] border-r border-line bg-surface py-4 md:flex"
      >
        <span className="mb-[14px] grid h-[26px] w-[26px] place-items-center rounded-[6px] bg-marca text-[11px] font-semibold text-ink">
          E
        </span>
        {DESTINOS.map((d) => (
          <ItemLateral key={d.href} destino={d} activo={activo?.href === d.href} />
        ))}
        <Link
          href="/portal/salir"
          className="mt-auto flex w-[68px] flex-col items-center gap-[5px] rounded-[8px] py-[9px] text-muted transition-colors hover:bg-surface-sunken hover:text-ink"
        >
          <IconoUsuario tamano={20} />
          <span className="text-[10.5px]">Salir</span>
        </Link>
      </nav>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* ── QUIÉN ES ─────────────────────────────────────────────────────────────────────── */}
        <header className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line bg-surface px-[14px] py-[11px] md:px-[26px]">
          <span className="min-h-[22px] text-[14px] font-semibold text-ink">{cliente}</span>
          <span className="text-[12.5px] text-faint">
            {obras === 0 ? 'sin obras' : obras === 1 ? '1 obra' : `${obras} obras`}
          </span>
          <div className="ml-auto flex items-center gap-[9px] text-[12.5px] text-muted">
            <IconoUsuario tamano={17} />
            {/* En el teléfono no hay barra lateral: salir vive acá, y se ESCRIBE. Un chevron a la
                derecha se lee «siguiente», no «cerrar sesión». */}
            <Link href="/portal/salir" className="flex min-h-11 items-center px-2 text-[12.5px] text-muted hover:text-ink md:hidden">
              Salir
            </Link>
          </div>
        </header>

        {/* `pb` deja libre la altura del menú inferior del teléfono; en escritorio no hay menú abajo. */}
        <main className="min-w-0 flex-1 overflow-x-hidden pb-[86px] md:pb-0">
          {/* Anclado a la IZQUIERDA, no centrado: la maqueta pone `padding:40px 34px;maxWidth:880px` sin
              margen automático. Centrarlo despega el contenido de la barra lateral y a 2560px lo deja
              flotando en el medio de la pantalla, lejos del menú que lo gobierna. */}
          <div className="w-full max-w-[880px] px-5 py-7 md:px-[34px] md:pb-12 md:pt-10">{children}</div>
        </main>
      </div>

      {/* ── MENÚ INFERIOR · sólo teléfono ───────────────────────────────────────────────────── */}
      <nav
        aria-label="Secciones"
        className="fixed inset-x-0 bottom-0 z-20 flex items-stretch border-t border-line bg-surface px-[6px] pb-5 pt-2 md:hidden"
      >
        {NAVEGABLES.map((d) => {
          const encendido = activo?.href === d.href
          return (
            <Link
              key={d.href}
              href={d.href}
              aria-current={encendido ? 'page' : undefined}
              className={
                'flex min-h-11 flex-1 flex-col items-center gap-1 py-1.5 ' +
                (encendido ? 'text-ink' : 'text-faint')
              }
            >
              <IconoDestino icono={d.icono} tamano={21} />
              <span className={`text-[10.5px] ${encendido ? 'font-semibold' : ''}`}>{d.rotulo}</span>
            </Link>
          )
        })}
      </nav>
    </div>
  )
}

function ItemLateral({ destino, activo }: { destino: (typeof DESTINOS)[number]; activo: boolean }) {
  const base = 'flex w-[68px] flex-col items-center gap-[5px] rounded-[8px] py-[9px]'
  // «Más adelante» no es un link roto ni un link a una pantalla vacía: no es un link.
  if (destino.masAdelante) {
    return (
      <span className={`${base} cursor-default text-line-strong`} title="Más adelante">
        <IconoDestino icono={destino.icono} tamano={20} />
        <span className="text-[10.5px]">{destino.rotulo}</span>
      </span>
    )
  }
  return (
    <Link
      href={destino.href}
      aria-current={activo ? 'page' : undefined}
      className={
        `${base} transition-colors ` +
        (activo ? 'bg-marca text-ink' : 'text-muted hover:bg-surface-sunken hover:text-ink')
      }
    >
      <IconoDestino icono={destino.icono} tamano={20} />
      <span className={`text-[10.5px] ${activo ? 'font-semibold' : ''}`}>{destino.rotulo}</span>
    </Link>
  )
}
