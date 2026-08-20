'use client'

import { useMemo, useState } from 'react'
import { Buscador, Nulo, Tabla, THead, Th, Tr, Td, Vacio } from '@/shared/components/ds'
import type { MovimientoGlobal } from '../services/operacionGlobalService'
import { dmHora } from './formato'

// OPERACIÓN · MOVIMIENTOS — el log de traslados de todas las obras.
//
// Cada fila dice A QUÉ OBRA fue, no sólo el texto del destino: «ALMACEN» y «Comedor La Estrella» son
// cosas distintas y sólo una es una obra. Cuando el destino no resuelve a ninguna obra se escribe
// «fuera de obra» —depósito, taller, administración—, que es la verdad y no un faltante.
//
// El movimiento no se edita ni se borra: es un HECHO con fecha. Corregirlo es registrar el
// movimiento que lo corrige, desde la ficha de la herramienta.

export function MovimientosGlobal({ movimientos }: { movimientos: MovimientoGlobal[] }) {
  const [q, setQ] = useState('')

  const filtrados = useMemo(() => {
    const term = q.trim().toLowerCase()
    if (!term) return movimientos
    return movimientos.filter((m) =>
      `${m.herramienta_nombre ?? ''} ${m.destino ?? ''} ${m.responsable ?? ''} ${m.obra_nombre ?? ''}`
        .toLowerCase()
        .includes(term),
    )
  }, [movimientos, q])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[12.5px] text-muted">
          Cada movimiento registrado en el OS actualiza la ubicación de la herramienta.
        </p>
        <Buscador value={q} onChange={setQ} placeholder="Buscar herramienta, destino u obra" className="w-[250px]" />
      </div>

      {filtrados.length === 0 ? (
        <Vacio>
          {movimientos.length === 0
            ? 'Todavía no hay traslados registrados. Se anotan desde la ficha de cada herramienta.'
            : 'Ningún movimiento coincide con la búsqueda.'}
        </Vacio>
      ) : (
        <Tabla testid="tabla-movimientos" minWidth={720}>
          <THead>
            <Th className="w-[90px]">Fecha</Th>
            <Th>Herramienta</Th>
            <Th className="w-[200px]">Destino</Th>
            <Th className="w-[200px]">Obra</Th>
            <Th className="w-[170px]">Responsable</Th>
          </THead>
          <tbody>
            {filtrados.map((m) => (
              <Tr key={m.id_movimiento}>
                <Td num>{dmHora(m.fecha) ?? <Nulo>sin fecha</Nulo>}</Td>
                <Td fuerte>
                  {m.herramienta_nombre ?? (
                    <span className="font-mono text-[12.5px] text-muted">{m.id_herramienta}</span>
                  )}
                </Td>
                <Td>{m.destino ?? <Nulo>sin destino</Nulo>}</Td>
                <Td>{m.obra_nombre ?? <Nulo>fuera de obra</Nulo>}</Td>
                <Td>{m.responsable ?? <Nulo>sin responsable</Nulo>}</Td>
              </Tr>
            ))}
          </tbody>
        </Tabla>
      )}
    </div>
  )
}
