'use client'

import { useEffect, useState } from 'react'
import { ZONA_OBRA } from '../services/zona'

// LA HORA DEL ENCABEZADO DE J01 — «Sáb 23/08 · 07:40».
//
// ═══ POR QUÉ NO SE IMPRIME EN EL SERVIDOR ═══
//
// El mockup pone la hora al lado del día. Renderizada en el servidor queda congelada en el instante
// de la respuesta: el jefe abre a las 07:40, se guarda el teléfono, lo saca a las 11:15 y la
// pantalla sigue diciendo 07:40. Una hora que miente es peor que no tenerla, y ésta encabeza una
// pantalla que se lee como «lo que pasa AHORA».
//
// Corre en el cliente y se actualiza cada 30 s: no hace falta el segundero para una jornada.
//
// ═══ POR QUÉ ARRANCA VACÍA ═══
//
// El servidor y el teléfono pueden estar en el mismo huso pero no en el mismo minuto, y una
// diferencia de un dígito entre el HTML del servidor y el primer render del cliente es un error de
// hidratación. Se dibuja en el primer efecto, ya en el navegador.

export function RelojDeObra() {
  const [hora, setHora] = useState<string | null>(null)

  useEffect(() => {
    const leer = () => setHora(new Intl.DateTimeFormat('es-AR', {
      hour: '2-digit', minute: '2-digit', hour12: false, timeZone: ZONA_OBRA,
    }).format(new Date()))
    leer()
    const t = setInterval(leer, 30_000)
    return () => clearInterval(t)
  }, [])

  if (!hora) return null
  return <span data-testid="reloj-de-obra"> · {hora}</span>
}
