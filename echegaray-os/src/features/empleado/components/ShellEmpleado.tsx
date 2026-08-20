'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'
import { CONTEXTOS, contextoActivo } from './shell-logica'

// NO se re-exporta `inicialesDe` acá: este módulo es de cliente, y re-exportar una función pura
// desde un módulo de cliente la vuelve inllamable desde el servidor. Se importa de `shell-logica`.

// EL MARCO DEL PERFIL EMPLEADO — tres contextos, no ocho.
//
// ═══ POR QUÉ NO USA `AppHeader` ═══
//
// `AppHeader` dibuja las DOS ÁREAS DE PRODUCTO (Administración · Obras) y es la navegación del ERP.
// El empleado no navega áreas: navega su día. El handoff lo dice en una línea —«tres contextos, no
// ocho»— y los tres son Hoy · Mi trabajo · Mi información. Meterlo en el header del ERP le mostraría
// dos puertas que la base le va a cerrar, y una pantalla que ofrece lo que la base niega enseña que
// la pantalla miente.
//
// ═══ MOBILE PRIMERO, Y EL ESCRITORIO NO ES OTRA EXPERIENCIA ═══
//
// En el teléfono los tres contextos van en una barra FIJA al pie de 58px, con la regla amarilla de
// 2px arriba del activo. En escritorio esos mismos tres suben al header. Es el mismo árbol y las
// mismas pantallas: no hay una versión reducida y otra completa.
//
// LA BARRA ES FIJA Y EL CONTENIDO LE DEJA LUGAR (`pb-[70px]`): sin ese hueco, la última fila de
// cualquier lista queda tapada por la barra y nadie la puede tocar.


export function ShellEmpleado({
  email,
  iniciales,
  salir,
  children,
}: {
  email: string | null
  iniciales: string
  /** El botón de salir llega ARMADO desde el servidor: su `action` es una server action y este
   *  componente es de cliente. Es el mismo patrón que `AppHeader`. */
  salir: ReactNode
  children: ReactNode
}) {
  // La ruta la pone el navegador, no el servidor: un layout de App Router no recibe el pathname, y
  // pasarlo por `headers()` obligaría a que TODA pantalla del perfil fuera dinámica sólo para pintar
  // un subrayado.
  const activo = contextoActivo(usePathname() ?? '')
  return (
    <div className="min-h-screen bg-surface" data-testid="shell-empleado">
      {/* ── EL TELÉFONO: barra de marca arriba, contextos abajo ─────────────────────────── */}
      <header className="flex h-[44px] shrink-0 items-center gap-2 border-b border-line px-4 lg:hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/marca/isotipo.png" alt="" className="h-[22px] w-[22px]" />
        <span className="text-[12.5px] font-semibold tracking-[0.12em] text-ink">ECHEGARAY</span>
        <span className="ml-auto flex h-[28px] w-[28px] items-center justify-center rounded-full bg-surface-quiet text-[11px] font-semibold text-ink-soft">
          {iniciales}
        </span>
      </header>

      {/* ── EL ESCRITORIO: los mismos tres contextos, en el header ──────────────────────── */}
      <header className="hidden h-[56px] items-center gap-6 border-b border-line px-8 lg:flex">
        <span className="flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/marca/isotipo.png" alt="" className="h-[22px] w-[22px]" />
          <span className="text-[12.5px] font-semibold tracking-[0.12em] text-ink">ECHEGARAY</span>
          <span className="text-[11px] text-faint">Business OS</span>
        </span>
        <nav className="flex h-full items-stretch gap-1">
          {CONTEXTOS.map((c) => (
            <Link
              key={c.href}
              href={c.href}
              data-testid={`${c.testid}-desktop`}
              aria-current={activo === c.href ? 'page' : undefined}
              className={`flex items-center border-b-2 px-3 text-[13px] ${
                activo === c.href
                  ? 'border-marca font-semibold text-ink'
                  : 'border-transparent text-muted hover:text-ink'
              }`}
            >
              {c.label}
            </Link>
          ))}
        </nav>
        <span className="ml-auto flex items-center gap-3 text-[12px] text-muted">
          <span>
            {email ?? 'sin email'} <span className="text-faint">· Empleado</span>
          </span>
          {salir}
        </span>
      </header>

      <main className="pb-[70px] lg:pb-10">{children}</main>

      <nav
        data-testid="barra-contextos"
        className="fixed inset-x-0 bottom-0 z-20 flex h-[58px] border-t border-line bg-surface lg:hidden"
      >
        {CONTEXTOS.map((c) => (
          <Link
            key={c.href}
            href={c.href}
            data-testid={c.testid}
            aria-current={activo === c.href ? 'page' : undefined}
            className="relative flex flex-1 items-center justify-center text-[12px]"
          >
            {activo === c.href && <span aria-hidden className="absolute inset-x-0 top-0 h-[2px] bg-marca" />}
            <span className={activo === c.href ? 'font-semibold text-ink' : 'text-muted'}>{c.label}</span>
          </Link>
        ))}
      </nav>
    </div>
  )
}

/** El contenedor de una pantalla del perfil. 16px de padding en el teléfono, y en escritorio el
 *  ancho se usa: el handoff pone Hoy en dos columnas de 620px + resto, no una columna estirada. */
export function PantallaEmpleado({
  titulo, sub, volver, children, acciones,
}: {
  titulo: string
  sub?: ReactNode
  volver?: { href: string; label: string }
  children: ReactNode
  acciones?: ReactNode
}) {
  return (
    <div className="mx-auto w-full max-w-[1100px] px-4 pt-[18px] lg:px-8 lg:pt-8">
      {volver && (
        <Link href={volver.href} data-testid="volver" className="text-[12px] text-muted hover:text-ink">
          ← {volver.label}
        </Link>
      )}
      <div className="mt-1 flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-[20px] font-semibold tracking-[-0.01em] text-ink lg:text-[22px]">{titulo}</h1>
          {sub && <p className="mt-1 text-[12.5px] text-muted">{sub}</p>}
        </div>
        {acciones}
      </div>
      <div className="mt-5">{children}</div>
    </div>
  )
}

/** El rótulo de sección en versalitas del handoff: OBRA, CUADRILLA, ASISTENCIA, TRABAJO DE HOY. */
export function Seccion({ titulo, extra, children }: { titulo: string; extra?: ReactNode; children: ReactNode }) {
  return (
    <section className="mt-6 first:mt-0">
      <div className="flex items-baseline gap-3">
        <h2 className="text-[10.5px] font-semibold tracking-[0.14em] text-faint">{titulo}</h2>
        {extra && <span className="ml-auto text-[12px]">{extra}</span>}
      </div>
      <div className="mt-2">{children}</div>
    </section>
  )
}

