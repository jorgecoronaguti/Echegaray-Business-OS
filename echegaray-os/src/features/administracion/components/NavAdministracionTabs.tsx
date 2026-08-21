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
import { puedeVerRuta } from '@/features/auth/types/areas'
import type { Rol } from '@/features/auth/types'

const VISTAS = [
  { href: '/clientes', label: 'Clientes' },
  // Presupuestos entra en la barra el 21/08/2026 con el módulo: la cartera de ofertas es de
  // Administración, y sin la solapa la única forma de llegar sería escribir la URL.
  { href: '/presupuestos', label: 'Presupuestos' },
  { href: '/administracion/usuarios', label: 'Usuarios' },
  { href: '/administracion/personas', label: 'Personas' },
  { href: '/administracion/proveedores', label: 'Proveedores' },
  { href: '/administracion/pendientes', label: 'Pendientes' },
  // La biblioteca de análisis de precio unitario. Va última porque es la sección de CONSULTA del
  // área: no se entra a hacer un trámite, se entra a mirar con qué se cotiza.
  //
  // NO entra en RUTAS_SOLO_ECONOMIA: la tarea tipo, su análisis y su rendimiento son OPERATIVOS y
  // el jefe de obra los necesita para planificar. Lo económico de esa pantalla es el PRECIO, y eso
  // lo cierra la base — `recurso_precio` sólo abre para `ve_economia()`.
  { href: '/administracion/base-maestra', label: 'Base maestra' },
  // El archivo transversal de Drive (pantalla 27). Entra el 21/08/2026: sin la solapa la única
  // forma de llegar sería escribir la URL.
  //
  // SÍ entra en RUTAS_SOLO_ECONOMIA, y por eso el jefe de obra NO ve esta solapa: las tres carpetas
  // raíz del índice son `administracion`, `archivo-fiscal` y `libro-sueldos`. Los documentos de SU
  // obra los ve en la obra; ésta es la vista de la empresa entera.
  { href: '/documentos', label: 'Documentos' },
] as const

// ═══ LA BARRA NO PUEDE SER MÁS ANCHA QUE LA BASE (21/08/2026) ═══
//
// Dibujaba las seis secciones a todo el mundo. Un jefe de obra veía «Usuarios» —y desde hoy
// «Presupuestos»— y el middleware lo rebotaba: un botón que existe, se puede apretar y lleva a
// nada. El mismo portero que decide la puerta decide ahora la solapa, así que no pueden discrepar:
// agregar una ruta económica a `RUTAS_SOLO_ECONOMIA` la saca de la barra sola.
//
// `rol` puede llegar indefinido mientras el perfil carga. En ese caso NO se dibujan las secciones
// restringidas: falla cerrado. Una solapa que aparece medio segundo y desaparece es peor que una
// que tarda medio segundo en aparecer.
export function NavAdministracionTabs({ rol }: { rol?: Rol | null }) {
  const pathname = usePathname()
  const visibles = VISTAS.filter((v) => puedeVerRuta(rol, v.href))
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
        tabs={visibles.map((v) => ({
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
