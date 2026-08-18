// La barra de Administración vive en el layout y no en cada página: una barra que hay que acordarse
// de poner es una barra que falta en la pantalla nueva.
import type { ReactNode } from 'react'
import { NavAdministracion } from '@/features/administracion/components/NavAdministracion'

export default function AdministracionLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <div className="mx-auto max-w-[1400px] px-4 pt-7 sm:px-6"><NavAdministracion /></div>
      {children}
    </>
  )
}
