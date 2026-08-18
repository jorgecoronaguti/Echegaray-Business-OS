'use client'

// LA NAVEGACIÓN DEL ÁREA ADMINISTRACIÓN — el segundo y último nivel, igual que en Obras.
//
// ═══ POR QUÉ EXISTE (19/08/2026) ═══
//
// El dueño: *"NIVEL 1: Administración | Obras. NIVEL 2 Administración: Clientes / Usuarios /
// Personas / Proveedores / Pendientes. NIVEL 2 Obras: Resumen / Gantt. **No mezclar niveles en la
// misma barra.**"*
//
// Hasta hoy Administración no tenía barra: era una pantalla-menú con tarjetas, y adentro de esa
// pantalla convivían Clientes, **Obras** (que es el otro módulo de nivel 1), tres pantallas de
// integraciones y **Usuarios dos veces**. Eso es exactamente mezclar niveles: para ir de Personas a
// Proveedores había que volver al menú, y desde el menú se podía "entrar" a un módulo hermano como
// si fuera una sección de éste.
//
// Se reusa el patrón de `NavObras` —línea de solapas, subrayado en el amarillo de la marca,
// desplazable— y no se inventa uno nuevo: dos formas de decir "dónde estoy" en la misma aplicación
// se aprenden dos veces y se aprenden mal.

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const VISTAS = [
  { href: '/clientes', label: 'Clientes' },
  { href: '/administracion/usuarios', label: 'Usuarios' },
  { href: '/administracion/personas', label: 'Personas' },
  { href: '/administracion/proveedores', label: 'Proveedores' },
  { href: '/administracion/pendientes', label: 'Pendientes' },
] as const

export function NavAdministracion() {
  const pathname = usePathname()
  return (
    <nav
      className="mb-5 flex gap-1 overflow-x-auto overscroll-x-contain border-b border-line"
      // `nav-admin-secciones` y no `nav-administracion`: ese nombre YA es el del enlace al ÁREA en
      // el encabezado (`nav-${area}`). Dos elementos con el mismo identificador de prueba hacen que
      // cualquier test que los busque falle por ambigüedad — y el mensaje no dice cuál sobra.
      data-testid="nav-admin-secciones"
    >
      {VISTAS.map((v) => {
        // `startsWith` y no igualdad: la ficha de un cliente (`/clientes/la-estrella`) sigue estando
        // DENTRO de Clientes. Sin esto, entrar a un cliente apaga la barra entera y la pantalla
        // queda sin decir dónde está parado el que la mira.
        const activa = pathname === v.href || pathname.startsWith(v.href + '/')
        return (
          <Link
            key={v.href}
            href={v.href}
            data-testid={`nav-admin-secciones-${v.label.toLowerCase()}`}
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
