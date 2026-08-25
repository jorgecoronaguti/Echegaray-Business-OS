'use client'

// EL BOTÓN VIVE EN LA CABECERA Y LA ACCIÓN PASA EN EL CUERPO.
//
// Los mockups 28, 31 y 32 ponen la acción principal de cada solapa arriba, al lado del nombre del
// cliente: «Registrar cobro», «Publicar al cliente», «Agregar mail». Esa cabecera la dibuja la
// ficha (Server Component) y el cuerpo es de cliente, así que no comparten estado por props sin
// convertir media pantalla en cliente.
//
// La alternativa era mandar el botón a la URL (`?cobro=1`), y eso es exactamente lo que el dueño
// rechazó: un viaje al servidor y un re-render de la pantalla entera para abrir un formulario que
// ya está dibujado dos columnas más abajo.
//
// Esto es un aviso de una sola dirección —la cabecera pide, el cuerpo decide qué hacer— y no
// guarda estado: si nadie escucha, no pasa nada. Vive en el navegador, no cruza la frontera.

import { useEffect, useRef } from 'react'

export type Pedido =
  | 'cobro' | 'exportar' | 'recordatorio'
  | 'agregar-pago' | 'publicar' | 'descartar-cambios'
  | 'agregar-mail' | 'ingresos' | 'suspender'
  | 'ver-como-cliente'

const oyentes = new Set<(p: Pedido) => void>()

export function pedir(p: Pedido) {
  for (const f of [...oyentes]) f(p)
}

export function useAlPedir(f: (p: Pedido) => void) {
  // La función se guarda en una ref para suscribirse UNA vez: suscribir en cada render daría de
  // baja y de alta al oyente en medio de un pedido y el cuerpo se perdería el aviso.
  const ref = useRef(f)
  // La ref se actualiza DESPUÉS del render (`react-hooks/refs`: escribirla durante el render rompe
  // el renderizado concurrente), y la suscripción es de montaje: así el oyente no se da de baja y
  // de alta en medio de un pedido.
  useEffect(() => { ref.current = f })
  useEffect(() => {
    const g = (p: Pedido) => ref.current(p)
    oyentes.add(g)
    return () => { oyentes.delete(g) }
  }, [])
}
