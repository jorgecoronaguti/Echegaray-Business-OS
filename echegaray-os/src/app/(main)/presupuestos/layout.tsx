// LA BARRA DE ADMINISTRACIÓN TAMBIÉN ACÁ — Presupuestos volvió a ser nivel 2 (dueño, 21/09/2026).
//
// Textual: *«"presupuestos" es una sección dentro de CRM admin»*. Había subido a la barra de la
// aplicación el 25/08 por el mockup v2, y este layout dejó de dibujar `NavAdministracion` entonces.
// Vuelve, por el mismo motivo que en `/clientes`: la sección vive fuera del prefijo
// `/administracion/**`, así que sin este archivo entrar a Presupuestos apaga la barra y desde ahí no
// se puede llegar a Clientes ni a Compras sin volver atrás.
//
// El envoltorio es IDÉNTICO al de `/administracion` y `/clientes` a propósito: tres secciones
// hermanas con espaciados distintos hacen que la página salte al navegar entre ellas.

import type { ReactNode } from 'react'
import { NavAdministracion } from '@/features/administracion/components/NavAdministracion'
import { RefrescarEnVivo } from '@/shared/tiempo-real/ProveedorTiempoReal'
import { TABLAS_DE } from '@/shared/tiempo-real/pantallas'

export default function PresupuestosLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {/* A SANGRE, como en `/administracion` y `/clientes`. */}
      <NavAdministracion />
      {/* TIEMPO REAL (dueño, 15/09/2026): cotización, partidas y análisis de precios. */}
      <RefrescarEnVivo tablas={TABLAS_DE.cotizaciones} />
      {children}
    </>
  )
}
