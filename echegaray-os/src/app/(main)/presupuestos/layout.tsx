// LA BARRA DE ADMINISTRACIÓN TAMBIÉN ACÁ — Presupuestos es nivel 2 de Administración.
//
// Mismo envoltorio, mismo `pt-7` y misma razón que en `/clientes`: una barra que hay que acordarse
// de poner es una barra que falta en la pantalla nueva. Se declara activa por `startsWith`, así que
// también se enciende adentro de un presupuesto, de una partida y de la conversión — que siguen
// estando DENTRO de Presupuestos.

import type { ReactNode } from 'react'
import { NavAdministracion } from '@/features/administracion/components/NavAdministracion'

export default function PresupuestosLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <div className="mx-auto max-w-[1400px] px-4 pt-7 sm:px-6"><NavAdministracion /></div>
      {children}
    </>
  )
}
