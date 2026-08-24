'use client'

// 13 · LAS PARTIDAS DEL CONTRATO — una lista de trabajo.
//
// Cada partida se elige una vez y se convierte una vez: no es una tabla que se compara de arriba a
// abajo. La fila muestra las tres cosas que deciden si se puede tocar: cuánto hay que repartir, cómo
// se llama, y en qué estado está.
//
// ═══ FILAS CON HAIRLINE, NO OCHO TARJETAS (Design 23/08) ═══
//
// Eran ocho `rounded-card border`: ocho cajas para leer ocho nombres, y la seleccionada se marcaba
// pintando la caja entera de amarillo suave. El sistema marca la selección con la regla amarilla de
// 2px sobre `surface-quiet` —igual que en la tabla de partidas, la de obras y la de compras—, y la
// jerarquía la hace el peso tipográfico. «Antes de una caja: ¿hace falta para entender el dato?».
//
// ═══ EL ESTADO SE LEE DE `obra_actividad`, NO DE UNA MARCA ═══
//
// «convertida · 2 frentes · 10 act.» sale de contar lo que existe en la obra. Una bandera en la
// partida diría «convertida» aunque alguien hubiera borrado las actividades.

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { Buscador } from '@/shared/components/ds'
import type { PartidaValorizada } from '../types'
import type { ConversionDeLaPartida } from '../services/conversionService'
import { filtrarPartidas } from '../services/partidas'
import { cantidad as fCantidad } from '../services/formato'

export function ListaPartidasConversion({
  partidas,
  conversiones,
  seleccionada,
  hrefBase,
}: {
  partidas: PartidaValorizada[]
  conversiones: Record<string, ConversionDeLaPartida>
  seleccionada: string | null
  hrefBase: string
}) {
  const [busqueda, setBusqueda] = useState('')
  const visibles = useMemo(() => filtrarPartidas(partidas, busqueda), [partidas, busqueda])
  const convertidas = partidas.filter((p) => conversiones[p.partida_id]).length

  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[13px] font-semibold text-ink">Partidas del contrato</h2>
        <span className="font-mono text-[11.5px] tabular-nums text-faint" data-testid="cuenta-convertidas">
          {convertidas} de {partidas.length}
        </span>
      </div>

      <div className="mt-2">
        <Buscador value={busqueda} onChange={setBusqueda} placeholder="Buscar partida" testid="buscador-conversion" />
      </div>

      <ul className="mt-2 border-t border-line" data-testid="lista-partidas-conversion">
        {visibles.map((p) => {
          const c = conversiones[p.partida_id]
          const activa = seleccionada === p.partida_id
          return (
            <li key={p.partida_id} className="border-b border-[#EFEEEA]">
              <Link
                href={`${hrefBase}?partida=${p.partida_id}`}
                data-testid="tarjeta-partida"
                data-partida={p.partida_id}
                data-seleccionada={activa ? '' : undefined}
                style={activa ? { boxShadow: 'inset 2px 0 0 var(--os-marca)' } : undefined}
                className={`block px-2.5 py-2 transition-colors ${
                  activa ? 'bg-surface-quiet' : 'hover:bg-surface-quiet'
                }`}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className={`min-w-0 truncate text-[12.5px] ${activa ? 'font-semibold text-ink' : 'text-ink'}`}>
                    {p.descripcion}
                  </span>
                  <span className="shrink-0 font-mono text-[11.5px] tabular-nums text-ink-soft">
                    {p.cantidad === null ? 'sin cómputo' : `${fCantidad(p.cantidad)} ${p.unidad ?? ''}`.trim()}
                  </span>
                </div>
                <div className="mt-0.5 flex items-baseline justify-between gap-2">
                  <EstadoTarjeta p={p} c={c} />
                  <span className="shrink-0 font-mono text-[10.5px] tabular-nums text-faint">
                    {p.codigo ?? 'sin código'}
                  </span>
                </div>
              </Link>
            </li>
          )
        })}
      </ul>

      {visibles.length === 0 && (
        <p className="py-4 text-[12.5px] text-muted">
          {partidas.length === 0
            ? 'Este presupuesto no tiene partidas: no hay nada que convertir.'
            : `Nada coincide con «${busqueda}».`}
        </p>
      )}
    </div>
  )
}

function EstadoTarjeta({ p, c }: { p: PartidaValorizada; c?: ConversionDeLaPartida }) {
  const clases = 'inline-flex min-w-0 items-center gap-1.5 truncate text-[11px]'
  if (c) {
    return (
      <span className={`${clases} text-pos`} data-estado="convertida">
        <span className="h-[5px] w-[5px] rounded-full bg-pos" />
        convertida · {c.frentes === 0 ? 'sin frentes' : `${c.frentes} ${c.frentes === 1 ? 'frente' : 'frentes'}`} · {c.actividades} act.
      </span>
    )
  }
  if (p.sin_analisis) {
    return (
      <span className={`${clases} text-warn`} data-estado="sin_analisis">
        <span className="h-[5px] w-[5px] rounded-full bg-warn" />
        sin convertir · sin análisis
      </span>
    )
  }
  return (
    <span className={`${clases} text-muted`} data-estado="sin_convertir">
      <span className="h-[5px] w-[5px] rounded-full bg-[#C9C4C2]" />
      sin convertir{p.subcontratada ? ' · subcontrato' : ''}
    </span>
  )
}
