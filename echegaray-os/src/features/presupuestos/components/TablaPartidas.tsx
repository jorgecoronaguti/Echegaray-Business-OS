'use client'

// 15 · LA TABLA DE PARTIDAS, con sus rubros y la edición en línea.
//
// ═══ EL RUBRO ES UNA FILA DE AGRUPACIÓN, NO UNA ENTIDAD ═══
//
// `cotizacion_partida.rubro` es un texto de la partida. La fila gris de rubro se arma agrupando lo
// que la vista ya devolvió, y su subtotal suma las partidas que TIENEN subtotal — las que no lo
// tienen no cuentan como cero, se declaran al lado.
//
// ═══ EL TOTAL DE LA TABLA NO SE SUMA ACÁ ═══
//
// Sale de `cotizacion_cascada.costo_directo`, que es el mismo número que abre la cascada de arriba.
// Sumar las filas otra vez daría un segundo camino al mismo total, y el día que difieran —una
// partida filtrada por el buscador, un `null` contado como cero— nadie sabría cuál mirar.
//
// ═══ LA SELECCIÓN VIVE EN LA URL ═══
//
// `?partida=<id>` abre el panel de la derecha. Así la vista con una partida abierta se puede
// mandar por chat, y el botón de atrás del navegador hace lo que se espera.

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { Buscador, Nulo, Tabla, THead, Th, Tr, Td, FilaTotal } from '@/shared/components/ds'
import { BotonAccion } from '@/shared/components/ui'
import type { PartidaValorizada } from '../types'
import { filasDeLaTabla, filtrarPartidas, faltantesDe } from '../services/partidas'
import { hh as fHH, importe, plata, porcentaje, rendimiento } from '../services/formato'
import { quitarPartida } from '../services/actionsPartida'
import { CeldaEditable } from './CeldaEditable'

export function TablaPartidas({
  partidas,
  cotizacionId,
  costoDirecto,
  seleccionada,
  congelado,
  accion,
}: {
  partidas: PartidaValorizada[]
  cotizacionId: string
  costoDirecto: number | null
  seleccionada: string | null
  congelado: boolean
  accion?: React.ReactNode
}) {
  const [busqueda, setBusqueda] = useState('')
  const visibles = useMemo(() => filtrarPartidas(partidas, busqueda), [partidas, busqueda])
  const filas = useMemo(() => filasDeLaTabla(visibles, costoDirecto), [visibles, costoDirecto])

  return (
    <div className="min-w-0">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <Buscador
          value={busqueda}
          onChange={setBusqueda}
          placeholder="Buscar partida, código o rubro"
          testid="buscador-partidas"
          className="w-[230px] max-w-full"
        />
        {busqueda && (
          <span className="font-mono text-[11.5px] tabular-nums text-faint" data-testid="cuenta-partidas">
            {visibles.length} de {partidas.length}
          </span>
        )}
        {accion}
      </div>

      <Tabla testid="tabla-partidas" minWidth={900}>
        <THead>
          <Th>Código</Th>
          <Th>Descripción</Th>
          <Th num>Cant.</Th>
          <Th>Un.</Th>
          <Th num>Hs/un.</Th>
          <Th num>HH</Th>
          <Th num>Costo unit.</Th>
          <Th num>Subtotal</Th>
          <Th num>Incid.</Th>
          <Th />
        </THead>
        <tbody>
          {filas.map((f) =>
            f.tipo === 'rubro' ? (
              <Tr key={f.clave} className="bg-surface-quiet" data-testid="fila-rubro">
                <Td className="font-mono text-[11px] text-muted">{f.codigo}</Td>
                <Td className="text-[11.5px] font-semibold uppercase tracking-[0.05em] text-ink">
                  {f.nombre}
                  {f.nSinAnalisis > 0 && (
                    <span className="ml-2 text-[9.5px] font-normal normal-case tracking-normal text-warn">
                      {f.nSinAnalisis} sin análisis
                    </span>
                  )}
                </Td>
                <Td /><Td /><Td />
                <Td num className="font-semibold">{fHH(f.hh) ?? <Nulo>sin dato</Nulo>}</Td>
                <Td />
                <Td num className="font-semibold">{importe(f.subtotal) ?? <Nulo>sin cargar</Nulo>}</Td>
                <Td /><Td />
              </Tr>
            ) : (
              <FilaPartida
                key={f.clave}
                p={f.partida}
                incidenciaPct={f.incidenciaPct}
                cotizacionId={cotizacionId}
                seleccionada={seleccionada === f.partida.partida_id}
                congelado={congelado}
              />
            ),
          )}
          {/* EL TOTAL SALE DE LA VISTA, NO DE LA SUMA DE ARRIBA. */}
          <FilaTotal>
            <Td /><Td className="text-[12px] font-medium text-ink">Costo directo del presupuesto</Td>
            <Td /><Td /><Td /><Td /><Td />
            <Td num className="font-semibold" data-testid="total-costo-directo">
              {plata(costoDirecto) ?? <Nulo>sin cargar</Nulo>}
            </Td>
            <Td /><Td />
          </FilaTotal>
        </tbody>
      </Tabla>

      {visibles.length === 0 && (
        <p className="border-b border-[#EFEEEA] py-6 text-[13px] text-muted" data-testid="partidas-vacias">
          {partidas.length === 0 ? (
            'Este presupuesto todavía no tiene partidas. Sin partidas no hay costo directo, y sin costo directo no hay precio.'
          ) : (
            <>Nada coincide con «{busqueda}». <button type="button" onClick={() => setBusqueda('')} className="text-ink underline underline-offset-2">Ver todo</button>.</>
          )}
        </p>
      )}
    </div>
  )
}

function FilaPartida({
  p, incidenciaPct, cotizacionId, seleccionada, congelado,
}: {
  p: PartidaValorizada
  incidenciaPct: number | null
  cotizacionId: string
  seleccionada: boolean
  congelado: boolean
}) {
  const faltantes = faltantesDe(p)
  const base = `/presupuestos/${cotizacionId}`
  return (
    <Tr seleccionada={seleccionada} data-testid="fila-partida" data-partida={p.partida_id}>
      <Td className="font-mono text-[11px] text-muted">
        <CeldaEditable partidaId={p.partida_id} cotizacionId={cotizacionId} campo="codigo"
          valor={p.codigo ?? ''} mono ancho="w-[62px]" placeholder="sin código"
          deshabilitada={congelado} testid={`codigo-${p.partida_id}`} />
      </Td>
      <Td className="pl-3.5">
        <div className="flex min-w-0 items-center gap-2">
          <CeldaEditable partidaId={p.partida_id} cotizacionId={cotizacionId} campo="descripcion"
            valor={p.descripcion} deshabilitada={congelado} testid={`descripcion-${p.partida_id}`} />
          {faltantes.map((f) => (
            <span key={f} className="shrink-0 whitespace-nowrap text-[9.5px] text-warn" data-testid="badge-falta">{f}</span>
          ))}
        </div>
      </Td>
      <Td num>
        <CeldaEditable partidaId={p.partida_id} cotizacionId={cotizacionId} campo="cantidad"
          valor={p.cantidad === null ? '' : String(p.cantidad).replace('.', ',')} alineacion="derecha"
          mono ancho="w-[58px]" deshabilitada={congelado} testid={`cantidad-${p.partida_id}`} />
      </Td>
      <Td>
        <CeldaEditable partidaId={p.partida_id} cotizacionId={cotizacionId} campo="unidad"
          valor={p.unidad ?? ''} ancho="w-[38px]" placeholder="un." deshabilitada={congelado} />
      </Td>
      <Td num>
        {/* HS/UN. es el rendimiento. Escribirlo acá GANA sobre el del análisis: el `coalesce` de la
            vista prefiere el de la partida. Sube las HH y el plazo; NO cambia el costo. */}
        <CeldaEditable partidaId={p.partida_id} cotizacionId={cotizacionId} campo="hs_unitarias"
          valor={p.hs_unitarias === null ? '' : rendimiento(p.hs_unitarias)!} alineacion="derecha"
          mono ancho="w-[54px]" placeholder="sin dato" deshabilitada={congelado}
          testid={`hs-${p.partida_id}`} />
      </Td>
      <Td num>{fHH(p.hh) ?? <span className="text-[11.5px] text-warn">sin dato</span>}</Td>
      <Td num>{importe(p.costo_unitario) ?? <span className="text-[11.5px] text-warn">sin dato</span>}</Td>
      <Td num fuerte>{importe(p.subtotal) ?? <Nulo>sin cargar</Nulo>}</Td>
      <Td num>
        {incidenciaPct === null ? (
          <span className="text-faint">—</span>
        ) : (
          <span className="inline-flex items-center justify-end gap-1.5">
            {/* La barra sólo se dibuja porque el número ES una fracción de 0 a 100. Debajo de HH o
                de un importe estaría midiendo contra nada. */}
            <span className="hidden h-1 w-8 shrink-0 overflow-hidden rounded-full bg-[#EAE7E6] sm:block">
              <span className="block h-full bg-accent" style={{ width: `${Math.min(100, incidenciaPct)}%` }} />
            </span>
            <span className="font-mono text-[11px] tabular-nums text-muted">{porcentaje(incidenciaPct, 'auto')}</span>
          </span>
        )}
      </Td>
      <Td>
        <div className="flex items-center justify-end gap-2 whitespace-nowrap">
          <Link href={`${base}/partida/${p.partida_id}`} className="text-[11.5px] text-muted underline-offset-2 hover:text-ink hover:underline">
            análisis
          </Link>
          <Link href={`${base}?partida=${p.partida_id}`} className="text-[11.5px] text-muted underline-offset-2 hover:text-ink hover:underline">
            ver
          </Link>
          {!congelado && (
            <BotonAccion accion={quitarPartida} args={[p.partida_id, cotizacionId]}
              tono="peligro" testid={`borrar-${p.partida_id}`}>
              quitar
            </BotonAccion>
          )}
        </div>
      </Td>
    </Tr>
  )
}
