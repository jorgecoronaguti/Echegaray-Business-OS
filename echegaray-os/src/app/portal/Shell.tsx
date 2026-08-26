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
  /** Dirección está mirando desde la ficha. Ya no cambia NADA de lo que se dibuja —el portal es
   *  idéntico para los dos— y se conserva por si alguna pantalla necesitara saberlo. */
  previa?: boolean
  /** Cuántas obras suyas hay. Sólo para el subtítulo — la lista vive en el contenido. */
  obras: number
  children: ReactNode
}

export function Shell({ cliente, obras, children }: Props) {
  const ruta = usePathname() ?? '/portal'
  const activo = destinoActivo(ruta)

  return (
    <div className="flex min-h-dvh flex-col bg-canvas text-ink">
      {/* EL AVISO DE LA PREVIA. Es lo ÚNICO que se agrega cuando mira Dirección: el resto de la
          pantalla es idéntica a la del cliente, porque un portal que se comporta distinto según
          quién mira no prueba nada de lo que muestra. Existe para poder volver a la ficha. */}
      {/* LA FRANJA DE LA VISTA PREVIA SE RETIRÓ (26/08/2026). Decía «estás viendo el portal como lo
          ve X» con un enlace para volver. En el iPhone su texto se partía en tres líneas y tapaba la
          marca de la empresa, y el dueño la evaluó por lo que aportaba: «no sirve». Tenía razón —
          quien abre la previa acaba de tocar el botón en la ficha del cliente y sabe perfectamente
          qué está mirando; para volver está el botón del navegador.
          `previa` NO se retira: sigue siendo lo que autoriza a Dirección a entrar sin ser un
          contacto del cliente. Lo que se fue es su cartel. Y así el portal es EXACTAMENTE el mismo
          para el dueño y para el cliente, que es lo que se pidió desde el principio. */}
      {/* ── LA MARCA, ARRIBA DE TODO Y EN TODAS LAS PANTALLAS ───────────────────────────────
          Antes había sólo un isotipo de 26px en el rincón de la barra lateral. El dueño lo miró y
          dijo lo único que importa: «así es genérico, con un logo arriba a la izquierda de una
          empresa random». Tenía razón — un símbolo sin nombre no dice de quién es el portal, y este
          portal es la cara de la empresa frente a un cliente.
          Ahora es una franja propia, a todo el ancho y sobre todo lo demás, con el isotipo Y el
          nombre escrito. Es exactamente el patrón del header del OS (`AppHeader`), con su mismo
          tamaño e interletrado: una sola manera de firmar, no dos. */}
      <header
        className="flex h-[44px] shrink-0 items-center gap-2.5 border-b border-line bg-surface px-[14px] md:px-[26px]"
      >
        <img src="/marca/isotipo.png" alt="" width={24} height={24} className="h-[24px] w-[24px]" />
        {/* EL NOMBRE ENTERO, SIEMPRE. La empresa se llama ECHEGARAY CONSTRUCCIONES —así figura en
            toda la plataforma— y recortarlo a «ECHEGARAY» en el teléfono la dejaba a medio nombrar
            justo en la pantalla que más se usa. Se retiraba porque competía con el nombre del
            cliente al lado; ese nombre ya no está en la barra, así que el motivo desapareció.
            Es UN nombre, no una marca con su bajada: un solo peso, un solo color, un interletrado. */}
        <span className="text-[11.5px] font-semibold tracking-[.04em] text-ink">
          ECHEGARAY CONSTRUCCIONES
        </span>
        <span className="ml-auto text-[11px] text-faint">Portal del cliente</span>
        {/* En el teléfono no hay barra lateral: «Salir» vive acá, y se ESCRIBE. Un chevron a la
            derecha se lee «siguiente», no «cerrar sesión». */}
        <Link href="/portal/salir" className="flex min-h-11 items-center px-1 text-[12px] text-muted hover:text-ink md:hidden">
          Salir
        </Link>
      </header>

      <div className="flex min-h-0 flex-1">
      {/* ── BARRA LATERAL · sólo escritorio ─────────────────────────────────────────────────── */}
      <nav
        aria-label="Secciones"
        className="hidden w-[88px] shrink-0 flex-col items-center gap-[5px] border-r border-line bg-surface py-4 md:flex"
      >
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
        {/* LA BARRA DEL CLIENTE SE RETIRÓ (26/08/2026). Repetía su nombre en cada pantalla y no
            aportaba: el cliente sabe quién es. «El header del portal no tiene que decir siempre el
            nombre del cliente, sólo el nombre de la empresa; el nombre del cliente es para la
            pantalla de bienvenida únicamente.» Arriba queda la marca de la empresa, que es de quién
            es el portal — el dato que sí hace falta repetir. */}

        {/* `pb` deja libre la altura del menú inferior del teléfono; en escritorio no hay menú abajo. */}
        {/* El hueco del menú inferior incluye la barra de gestos: en un iPhone sin ella el último
              renglón de la lista quedaba debajo del menú. */}
        <main className="min-w-0 flex-1 overflow-x-hidden pb-[calc(86px+env(safe-area-inset-bottom))] md:pb-0">
          {/* Anclado a la IZQUIERDA, no centrado: la maqueta pone `padding:40px 34px;maxWidth:880px` sin
              margen automático. Centrarlo despega el contenido de la barra lateral y a 2560px lo deja
              flotando en el medio de la pantalla, lejos del menú que lo gobierna. */}
          <div className="w-full max-w-[880px] px-5 py-7 md:px-[34px] md:pb-12 md:pt-10">{children}</div>
        </main>
      </div>
      </div>

      {/* ── MENÚ INFERIOR · sólo teléfono ───────────────────────────────────────────────────── */}
      <nav
        aria-label="Secciones"
        className="fixed inset-x-0 bottom-0 z-20 flex items-stretch border-t border-line bg-surface px-[6px] pt-2 md:hidden pb-[max(1.25rem,env(safe-area-inset-bottom))]"
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
