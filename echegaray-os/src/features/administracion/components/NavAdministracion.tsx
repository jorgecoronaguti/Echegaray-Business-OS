'use client'

// LA NAVEGACIÓN DEL ÁREA ADMINISTRACIÓN — el segundo y último nivel.
//
// El dueño: *"NIVEL 1: Administración | Obras. NIVEL 2 Administración: Clientes / Usuarios /
// Personas / Proveedores / Pendientes. **No mezclar niveles en la misma barra.**"* Y
// `design/system/LAYOUT_RESPONSIVE.md` lo repite: máximo dos niveles visibles, el nivel 2 con la
// regla amarilla de 2px.
//
// LAS SOLAPAS YA NO SE DIBUJAN ACÁ. Este archivo dibujaba su propia barra —copiada de `NavObras`,
// con los mismos píxeles escritos por tercera vez—; ahora declara QUÉ secciones hay y delega el CÓMO
// en `Tabs` del design system. Es la regla 11 de `UX_PRINCIPLES.md`: si el patrón existe, ese es el
// que se usa. Lo que queda acá es lo único que es propio del área: la lista y qué cuenta como estar
// adentro de cada sección.

import { usePathname } from 'next/navigation'
import { Tabs } from '@/shared/components/ds'

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
    <div
      // `nav-admin-secciones` y no `nav-administracion`: ese nombre YA es el del enlace al ÁREA en
      // el encabezado global (`nav-${area}`). Dos elementos con el mismo identificador de prueba
      // hacen fallar por ambigüedad a cualquier test que los busque, y el mensaje no dice cuál sobra.
      data-testid="nav-admin-secciones"
      className="mb-5"
    >
      <Tabs
        testid="tabs-administracion"
        tabs={VISTAS.map((v) => ({
          href: v.href,
          label: v.label,
          // `startsWith` y no igualdad: la ficha de un cliente (`/clientes/la-estrella`) o el legajo
          // de una persona siguen estando DENTRO de su sección. Sin esto, entrar a una ficha apaga
          // la barra entera y la pantalla deja de decir dónde está parado el que la mira.
          activo: pathname === v.href || pathname.startsWith(v.href + '/'),
          testid: `nav-admin-secciones-${v.label.toLowerCase()}`,
        }))}
      />
    </div>
  )
}
