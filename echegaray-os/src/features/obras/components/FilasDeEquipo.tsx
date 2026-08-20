'use client'

// LOS EQUIPOS DE UNA JORNADA — renglones que se agregan a medida que hacen falta.
//
// Arranca con UNO. Un formulario que abre con cinco renglones vacíos se lee como una obligación de
// llenarlos, y la mayoría de las jornadas usa una sola máquina o ninguna.
//
// El catálogo es una AYUDA (`datalist`), no una restricción: el campo acepta cualquier texto. Un
// equipo alquilado por una semana no está en el inventario del Sheet y no puede ser motivo para no
// anotarlo. Y por eso lo que se guarda es el NOMBRE y no un id: ese inventario sincroniza desde
// afuera, y un renombrado allá no puede romper el historial de la obra.

import { useState } from 'react'
import { CTRL } from '@/shared/components/ui'

export function FilasDeEquipo({ catalogo = [] }: { catalogo?: string[] }) {
  const [n, setN] = useState(1)
  return (
    <div className="space-y-1.5" data-testid="filas-equipo">
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            name={`equipo_${i}`}
            list="catalogo-equipos"
            maxLength={120}
            placeholder="Hormigonera, mini excavadora…"
            className={`${CTRL} min-w-0 flex-1`}
            data-testid={`equipo-${i}`}
          />
          <input
            name={`equipo_horas_${i}`}
            type="number" step="0.5" min="0" max="24"
            placeholder="h"
            className={`${CTRL} w-[74px] shrink-0 text-right`}
            data-testid={`equipo-horas-${i}`}
          />
        </div>
      ))}
      <datalist id="catalogo-equipos">
        {catalogo.map((c) => <option key={c} value={c} />)}
      </datalist>
      <button
        type="button"
        onClick={() => setN((v) => Math.min(8, v + 1))}
        data-testid="agregar-equipo"
        className="text-[12px] text-muted hover:text-ink"
      >+ otro equipo</button>
    </div>
  )
}
