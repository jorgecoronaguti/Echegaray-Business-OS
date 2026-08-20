'use client'

// LA NAVEGACIÓN DEL ÁREA OBRAS — dos vistas, y se terminó.
//
// ═══ POR QUÉ SÓLO DOS, SI HASTA EL 19/08 HABÍA SEIS ═══
//
// Había seis: Portafolio · Cronograma · Personal · Operación · Certificaciones · Documentos. Cuatro
// de ellas no eran vistas del ÁREA: eran dominios DE UNA OBRA listados de todas las obras a la vez.
// El dueño lo cortó (20/08), textual: *"Personal, Operación, Certificaciones y Documentos NO son
// vistas globales principales. Son dominios que pertenecen al workspace DE CADA OBRA."*
//
// El defecto no era estético. Con seis entradas acá, la barra del área y las solapas de la obra
// ofrecían los MISMOS cinco nombres en dos niveles distintos de la jerarquía, y la respuesta a
// «¿dónde miro el personal?» dependía de por dónde hubieras entrado. Dos caminos a la misma
// información es la forma en que dos pantallas empiezan a contestar distinto.
//
// LA JERARQUÍA QUE MANDA:
//   NIVEL 1  Administración · Obras                   (el header global)
//   NIVEL 2  Resumen · Gantt                          (esto)
//   NIVEL 3  la obra individual, con SUS solapas      (`/obras/[obra]`)
// Ningún nivel se mezcla con otro en la misma barra.
//
// Se reusa el patrón que ya existe en el workspace de la obra —línea de solapas, subrayado en el
// amarillo de la marca— en vez de inventar uno: dos formas distintas de decir "dónde estoy" en la
// misma pantalla se aprenden dos veces y se aprenden mal.

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const VISTAS = [
  { href: '/obras', id: 'resumen', label: 'Resumen' },
  { href: '/obras/gantt', id: 'gantt', label: 'Gantt' },
] as const

export function NavObras() {
  const pathname = usePathname()
  return (
    <nav className="mb-5 flex gap-1 overflow-x-auto overscroll-x-contain border-b border-line" data-testid="nav-vistas-obras">
      {VISTAS.map((v) => {
        const activa = pathname === v.href
        return (
          <Link
            key={v.href}
            href={v.href}
            data-testid={`nav-vistas-obras-${v.id}`}
            aria-current={activa ? 'page' : undefined}
            className={`-mb-px shrink-0 border-b-2 px-3.5 py-2 text-[13px] transition-colors ${
              activa ? 'border-marca font-medium text-ink' : 'border-transparent text-muted hover:text-ink'
            }`}
          >{v.label}</Link>
        )
      })}
    </nav>
  )
}
