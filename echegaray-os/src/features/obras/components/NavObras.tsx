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
// ═══ NO SON DOS PANTALLAS: SON DOS VISTAS DE LA MISMA (Design canónico 01 · 23/08) ═══
//
// Se llamaban «Resumen» y «Gantt» en una barra de solapas a todo el ancho, y las dos cosas estaban
// mal:
//
//   · «RESUMEN» ES EL NOMBRE DE OTRA PANTALLA. La primera solapa DENTRO de una obra también se
//     llama Resumen, en otro nivel de la jerarquía. Preguntar «¿lo viste en el Resumen?» tenía dos
//     respuestas posibles, que es exactamente el defecto que la barra de seis entradas ya había
//     costado. Los dos nombres nuevos dicen QUÉ SE VE: la misma cartera como tabla o sobre el
//     calendario.
//   · UNA BARRA DE SOLAPAS ANUNCIA SECCIONES DISTINTAS. Acá el dato es el mismo —las mismas obras,
//     los mismos filtros, el mismo semáforo— y sólo cambia la forma de mirarlo. El Design lo pone
//     como un conmutador de vista en la barra de herramientas, no como navegación: pesa menos,
//     ocupa una línea y devuelve al contenido los 40px que se llevaba el borde inferior.
//
// SIGUEN SIENDO DOS RUTAS, y eso no cambia: la URL es la verdad —se comparte, se recarga, vuelve
// con el botón de atrás— y cada vista recuerda su propia preferencia (`vistaRecordada`).

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const VISTAS = [
  { href: '/obras', id: 'resumen', label: 'Tabla' },
  { href: '/obras/gantt', id: 'gantt', label: 'Línea de tiempo' },
] as const

export function NavObras() {
  const pathname = usePathname()
  return (
    // EL PUESTO VA SUBRAYADO EN INK, no en el amarillo de la marca: `COMPONENTS.md` §Secondary tabs.
    // El amarillo queda para la primaria de la pantalla, que está a la misma altura y a la derecha —
    // dos amarillos en la misma línea hacen que el ojo lea dos acciones principales.
    <nav className="mb-4 flex items-center gap-4" data-testid="nav-vistas-obras">
      <span className="text-[12px] text-faint">Ver</span>
      {VISTAS.map((v) => {
        const activa = pathname === v.href
        return (
          <Link
            key={v.href}
            href={v.href}
            data-testid={`nav-vistas-obras-${v.id}`}
            aria-current={activa ? 'page' : undefined}
            className={`shrink-0 pb-[2px] text-[12.5px] transition-colors ${
              activa ? 'font-medium text-ink shadow-[inset_0_-1.5px_0_var(--os-ink)]' : 'text-muted hover:text-ink'
            }`}
          >{v.label}</Link>
        )
      })}
    </nav>
  )
}
