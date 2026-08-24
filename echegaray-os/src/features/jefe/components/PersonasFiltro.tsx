'use client'

// J05 · LOS CHIPS DE «QUIÉN ESTÁ HOY».
//
// ═══ POR QUÉ RECIBE LOS DOS BLOQUES YA DIBUJADOS Y NO LOS DATOS ═══
//
// Filtrar es lo único que pasa en el navegador. Las filas —el reloj de cada jornada, la lectura del
// punto, las HH imputadas— las arma el servidor y llegan acá como `ReactNode`. Si en cambio
// viajaran los datos crudos, este archivo tendría que volver a dibujar la fila de una persona: dos
// versiones de la misma fila, y la del cliente siempre queda atrás.
//
// ═══ POR QUÉ EL ESTADO NO VA A LA URL, COMO EN J02 ═══
//
// En la lista de tareas el filtro viaja en la query porque «estoy mirando las tareas con problema»
// es una vista que se manda por mensaje y se abre de nuevo mañana. Acá no: la pantalla es de HOY y
// se mira parado en la obra, alternando entre los dos bloques con el pulgar. Una vuelta al servidor
// por toque, con la conexión de una obra, convierte un chip en una espera.

import { useState } from 'react'
import {
  FILTRO_PERSONAS_LABEL, FILTROS_PERSONAS, conteoPersonas, muestraFichados, muestraSinFichar,
  vacioPorFiltro, type FiltroPersonas,
} from '../services/personasFiltro'

export interface Props {
  /** Cuántas personas tienen marca hoy. Es el contador del chip «Fichados». */
  fichados: number
  /** Cuántas del plantel esperado no tienen marca. NO son ausentes: ver `personasFiltro.ts`. */
  sinFichar: number
  bloqueFichados: React.ReactNode
  bloqueSinFichar: React.ReactNode
}

export function PersonasFiltro({ fichados, sinFichar, bloqueFichados, bloqueSinFichar }: Props) {
  const [filtro, setFiltro] = useState<FiltroPersonas>('todos')
  const conteo = conteoPersonas(fichados, sinFichar)

  return (
    <>
      {/* EL CHIP DICE CUÁNTAS TIENE. Sin el contador el jefe toca «Sin fichar» para descubrir que no
          hay ninguna, y en 390px cada toque que no informa nada cuesta una pantalla entera. */}
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1" data-testid="filtros-personas">
        {FILTROS_PERSONAS.map((f) => {
          const activo = f === filtro
          return (
            <button
              key={f}
              type="button"
              onClick={() => setFiltro(f)}
              data-testid={`filtro-${f}`}
              aria-pressed={activo}
              // LA PASTILLA ELEGIDA ES GRAFITO, NO AMARILLO. J02, J04 y J05 la dibujan igual:
              // `#30302F` con texto blanco y radio completo. El amarillo de la marca queda para la
              // acción que ESCRIBE; usarlo también para «qué estoy mirando» deja la pantalla con dos
              // amarillos que significan cosas distintas.
              className={`flex h-[44px] shrink-0 items-center gap-2 rounded-[999px] border px-4 text-[13.5px] ${
                activo ? 'border-accent bg-accent font-semibold text-white' : 'border-line bg-surface text-ink'
              }`}
            >
              {FILTRO_PERSONAS_LABEL[f]}
              <span className={`font-mono text-[12px] tabular-nums ${activo ? 'text-white/70' : 'text-faint'}`}>
                {conteo[f]}
              </span>
            </button>
          )
        })}
      </div>

      {muestraFichados(filtro) && bloqueFichados}
      {muestraSinFichar(filtro) && bloqueSinFichar}

      {/* UN FILTRO QUE ABRE EN BLANCO SE LEE «NO HAY NADIE EN LA OBRA». Es otra cosa, y se arregla
          tocando otro chip. */}
      {vacioPorFiltro(filtro, fichados, sinFichar) && (
        <p className="px-1 py-6 text-center text-[12.5px] leading-relaxed text-faint" data-testid="vacio-por-filtro">
          Nadie en «{FILTRO_PERSONAS_LABEL[filtro]}». Tocá otro chip para ver al resto.
        </p>
      )}
    </>
  )
}
