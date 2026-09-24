'use client'

import { useSyncExternalStore } from 'react'
import { usePathname } from 'next/navigation'
import { leerObraRecordada } from '../utils/obraRecordada'

// La cookie no avisa cuando cambia: no hay a qué suscribirse. Se relee en cada render, y el marco se
// vuelve a dibujar en cada navegación porque depende de la ruta (`usePathname`).
const sinSuscripcion = () => () => {}

/**
 * La obra que el jefe tiene elegida (cookie `os_obra`), leída en el navegador. Un marco que no se
 * desmonta —la barra de `(main)`, el shell del jefe— se entera de que el jefe cambió de obra en otra
 * pantalla porque se relee en cada navegación. En el servidor (y en la hidratación) es `null`: los
 * enlaces salen sin obra y la pantalla la resuelve igual por la cookie.
 */
export function useObraRecordada(): string | null {
  usePathname()
  return useSyncExternalStore(sinSuscripcion, () => leerObraRecordada(document.cookie), () => null)
}
