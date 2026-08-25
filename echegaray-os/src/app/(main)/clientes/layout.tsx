// LA BARRA DE ADMINISTRACIÓN TAMBIÉN ACÁ — Clientes es nivel 2 de Administración, no un módulo suelto.
//
// `/administracion/layout.tsx` monta `NavAdministracion` para `/administracion/**`, y Clientes vive
// fuera de ese prefijo: sin este archivo, entrar a Clientes apaga la barra y desde ahí no hay forma
// de llegar a Personas o a Proveedores sin volver atrás. La barra se declara activa por
// `startsWith`, así que también se enciende dentro del record de un cliente
// (`/clientes/la-estrella`), que es lo correcto: la ficha sigue estando DENTRO de Clientes.
//
// Va en el layout y no en cada página por lo mismo que en Administración: una barra que hay que
// acordarse de poner es una barra que falta en la pantalla nueva.
//
// El envoltorio es IDÉNTICO al de `/administracion` a propósito —mismo contenedor, mismo `pt-7`—.
// Si el aire entre la barra y el título hay que corregirlo, se corrige en los dos a la vez: dos
// áreas hermanas con espaciados distintos hacen que la página salte al navegar entre ellas, que es
// exactamente el defecto que `PageShell` vino a resolver.

import type { ReactNode } from 'react'
import { NavAdministracion } from '@/features/administracion/components/NavAdministracion'

export default function ClientesLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {/* A SANGRE, como en `/administracion`: la barra v2 es una banda blanca con filo inferior que
          apoya en el header. Metida en un contenedor con `px-4 pt-7` quedaba flotando y el
          contenido saltaba de costado al navegar entre las dos. */}
      <NavAdministracion />
      {children}
    </>
  )
}
