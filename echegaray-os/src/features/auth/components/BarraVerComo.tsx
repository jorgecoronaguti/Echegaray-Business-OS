'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

// LA FRANJA DE «VER COMO», DIBUJADA.
//
// Es cliente por una sola razón: el `volver`. Salir de la lente tiene que devolver a LA PANTALLA EN
// LA QUE UNO ESTABA —si te escupe a la home, nadie va a usar la lente dos veces— y el pathname sólo
// lo sabe el navegador. Todo lo que decide —si hay lente y cuál— lo resolvió el servidor.
//
// COLOR: `warn`, no `marca`. El amarillo de la marca es identidad (1,6:1 sobre blanco, no lleva
// texto encima) y esto es un ESTADO anómalo del sistema. Fondo `warn` sólido con tinta oscura, que
// es lo único que se lee de reojo desde el otro lado del escritorio.

export function BarraVerComo({
  mirando, etiqueta, roles,
}: {
  mirando: string
  etiqueta: string
  roles: { rol: string; label: string }[]
}) {
  const pathname = usePathname() ?? '/'
  const volver = encodeURIComponent(pathname)

  return (
    <div
      data-testid="aviso-ver-como"
      data-rol-mirado={mirando}
      role="status"
      className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line-strong bg-warn px-3 py-1.5 text-ink sm:px-6 lg:px-10"
    >
      <span className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-[0.04em]">
        <span aria-hidden>👁</span> Viendo como {etiqueta}
      </span>

      {/* LO QUE ESTO NO PRUEBA, ESCRITO EN LA PANTALLA. Sin esta línea, una captura de esta franja
          se usa mañana como evidencia de que un permiso está bien puesto — y no lo es. */}
      <span className="order-last w-full text-[11px] leading-snug text-ink-soft sm:order-none sm:w-auto sm:flex-1">
        Lente de pantalla: muestra la UX de ese rol, <strong className="font-semibold">no prueba los permisos de la base</strong> (el RLS te sigue viendo a vos). Con la lente puesta no se escribe.
      </span>

      <span className="flex items-center gap-1">
        {roles.map((r) => (
          <Link
            key={r.rol}
            prefetch={false}
            href={`/ver-como?rol=${r.rol}&volver=${volver}`}
            data-testid={`ver-como-${r.rol}`}
            aria-current={r.rol === mirando ? 'true' : undefined}
            className={`rounded-md px-2 py-1 text-[11.5px] ${
              r.rol === mirando
                ? 'bg-ink font-semibold text-white'
                : 'text-ink hover:bg-surface/60'
            }`}
          >
            {r.label}
          </Link>
        ))}
      </span>

      <Link
        prefetch={false}
        href={`/ver-como?salir=1&volver=${volver}`}
        data-testid="salir-de-ver-como"
        className="rounded-md border border-ink/40 bg-surface px-2.5 py-1 text-[12px] font-semibold text-ink hover:bg-surface-quiet"
      >
        Salir del modo
      </Link>
    </div>
  )
}
