// PRESUPUESTOS ES NIVEL 1 — y por eso acá ya no va la barra de Administración.
//
// Este layout dibujaba `NavAdministracion`: Presupuestos era una sección más del área, entre
// Usuarios y Personas. El mockup v2 lo sube a la barra de la aplicación, al lado de Obras, con el
// motivo escrito en su `title`: *«Comercial, no administración: vive al lado de Obras»*. Un módulo
// que está en la barra de nivel 1 no puede además dibujar la barra de nivel 2 de OTRA área: serían
// dos «dónde estoy» contradictorios, y el de abajo no tendría ninguna solapa encendida.
//
// Lo que ESTA pantalla no tiene todavía es su propia barra de nivel 2 (cartera · plantillas · …).
// No se inventa una: el canónico 14 no la dibuja.

import type { ReactNode } from 'react'
import { RefrescarEnVivo } from '@/shared/tiempo-real/ProveedorTiempoReal'
import { TABLAS_DE } from '@/shared/tiempo-real/pantallas'

export default function PresupuestosLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {/* TIEMPO REAL (dueño, 15/09/2026): cotización, partidas y análisis de precios. */}
      <RefrescarEnVivo tablas={TABLAS_DE.cotizaciones} />
      {children}
    </>
  )
}
