'use client'

import { useState } from 'react'
import { FormPresencia } from './FormPresencia'
import { FormAsistencia, type FilaConOtraObra } from './FormAsistencia'
import type { PresenciaGuardada } from '@/features/administracion/services/presenciaDelDia'

// LA PANTALLA DEL DÍA EN EL TELÉFONO — primero la presencia, y las horas como paso aparte.
//
// El dueño, 08/09/2026: *«una cosa es asistir y otra la carga de horas»*. Lo que se abre al entrar
// es PRESENCIA. La carga de horas sigue existiendo entera —el mismo `FormAsistencia`, no una copia
// recortada— y se llega con un enlace secundario.
//
// ═══ POR QUÉ UN PASO EN EL CLIENTE Y NO DOS RUTAS ═══
//
// Se evaluó `?paso=horas` en la URL. Se descartó por dos razones concretas:
//
//  1. LAS DOS VISTAS USAN EXACTAMENTE LOS MISMOS DATOS (`getJornadaDelDia`, una obra y un día).
//     Con dos rutas, tocar el enlace costaba un viaje al servidor completo para volver a leer lo
//     mismo — parado en la obra, con datos móviles y una mano ocupada.
//  2. LA CARGA DE HORAS NECESITA SABER QUÉ PRESENCIA SE ACABA DE GUARDAR. Con dos rutas eso se
//     resuelve releyendo la base; acá el acuse de la acción ya devuelve lo escrito.
//
// Lo que se conserva de la alternativa descartada: el estado que viaja a las horas es SÓLO EL
// GUARDADO. Lo tipeado y no guardado no condiciona nada — si condicionara, alguien podría marcar
// «no vino» sin guardar, pasar a horas y ver a esa persona bloqueada por una declaración que no
// existe en ningún lado.

export function CargaDelDia({ obraId, obraNombre, fecha, jornada, filas, presencia }: {
  obraId: string
  obraNombre: string
  fecha: string
  jornada: number
  filas: FilaConOtraObra[]
  /** Lo que ya está declarado en `asistencia_dia` para ese día, leído en el servidor. */
  presencia: PresenciaGuardada[]
}) {
  const [paso, setPaso] = useState<'presencia' | 'horas'>('presencia')
  const [guardada, setGuardada] = useState<PresenciaGuardada[]>(presencia)

  if (paso === 'horas') {
    return (
      <div data-testid="paso-horas">
        <p className="mb-3">
          <button
            type="button"
            onClick={() => setPaso('presencia')}
            data-testid="volver-a-presencia"
            className="-ml-1 inline-flex min-h-[44px] items-center px-1 text-[12px] text-muted hover:text-ink"
          >
            ← Presencia del día
          </button>
        </p>
        <FormAsistencia
          obraId={obraId}
          obraNombre={obraNombre}
          fecha={fecha}
          jornada={jornada}
          filas={filas}
          presencia={guardada}
        />
      </div>
    )
  }

  return (
    <div data-testid="paso-presencia">
      <FormPresencia
        obraId={obraId}
        obraNombre={obraNombre}
        fecha={fecha}
        filas={filas}
        guardadas={guardada}
        onGuardado={setGuardada}
        alCargarHoras={() => setPaso('horas')}
      />
    </div>
  )
}
