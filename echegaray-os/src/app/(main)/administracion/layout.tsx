import type { ReactNode } from 'react'

// ═══ POR QUÉ LA BARRA DE NIVEL 2 YA NO VIVE ACÁ (20/08/2026) ═══
//
// Estaba en el layout con un argumento razonable: *"una barra que hay que acordarse de poner es una
// barra que falta en la pantalla nueva"*. El handoff de diseño la mueve, y el motivo es más fuerte:
// la barra va DEBAJO del título de la pantalla (`design/screens/visual/Administracion.dc.html`,
// bloques 2a · 2b · 2d · 2f), y un layout sólo puede dibujar por ENCIMA de su contenido.
//
// Y no va en todas: el legajo de una persona y Cuadrillas están un nivel más abajo, tienen su propio
// `← volver` y —en el legajo— sus propias solapas. Ponerles también la barra del área daría TRES
// niveles de navegación a la vista, que es exactamente lo que prohíbe `LAYOUT_RESPONSIVE.md`.
//
// La garantía de que ninguna sección se olvide de la barra la da `NavAdministracion`, que declara
// las cinco en un solo lugar, y cada una de las cinco secciones raíz la renderiza como primer hijo
// de su `PageShell`.
export default function AdministracionLayout({ children }: { children: ReactNode }) {
  return <>{children}</>
}
