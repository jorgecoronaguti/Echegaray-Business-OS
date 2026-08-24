'use client'

// 15 · LA TABLA DE PARTIDAS, con sus rubros y la edición en línea.
//
// ═══ EL RUBRO ES UNA FILA DE AGRUPACIÓN, NO UNA ENTIDAD ═══
//
// `cotizacion_partida.rubro` es un texto de la partida. La fila gris de rubro se arma agrupando lo
// que la vista ya devolvió, y su subtotal suma las partidas que TIENEN subtotal — las que no lo
// tienen no cuentan como cero, se declaran al lado.
//
// Desde el Design 23/08 el rubro además PLIEGA (COMPONENTS.md §Table, grupos colapsables): un
// presupuesto de 68 partidas se recorre por rubro, no fila por fila. Se abre por defecto —cerrar
// todo esconde el trabajo—, pero se puede cerrar el rubro que ya está resuelto.
//
// ═══ LOS CHIPS DE DEUDA DE CARGA REEMPLAZAN A DOS BLOQUES DE AVISO ═══
//
// «3 sin análisis» y «2 sin cómputo» eran dos `Aviso` a ancho completo arriba de la cascada. Un
// aviso informa; un chip que además filtra la tabla RESUELVE — el número y la lista de trabajo son
// el mismo control. El conteo sale de `contarFaltantes`, sobre las partidas completas: filtrar por
// el buscador no puede hacer bajar una deuda que sigue existiendo.
//
// ═══ EL TOTAL DE LA TABLA NO SE SUMA ACÁ ═══
//
// Sale de `cotizacion_cascada.costo_directo`, que es el mismo número que abre la franja de arriba.
// Sumar las filas otra vez daría un segundo camino al mismo total, y el día que difieran —una
// partida filtrada por el buscador, un `null` contado como cero— nadie sabría cuál mirar.
//
// ═══ LA SELECCIÓN VIVE EN LA URL ═══
//
// `?partida=<id>` abre el panel de la derecha, que se dibuja con la composición leída en el
// servidor. Así la vista con una partida abierta se puede mandar por chat, y el botón de atrás del
// navegador hace lo que se espera.

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { Buscador, FilaGrupo, Nulo, Tabla, THead, Th, Tr, Td, FilaTotal } from '@/shared/components/ds'
import { IconoAbrir, IconoEliminar, IconoProblema } from '@/shared/components/iconos'
import { BotonAccion } from '@/shared/components/ui'
import type { PartidaValorizada } from '../types'
import {
  contarFaltantes, filasDeLaTabla, filtrarPartidas, filtrarPorFalta, faltantesDe,
  type FaltaPartida,
} from '../services/partidas'
import { hh as fHH, importe, plata, porcentaje, rendimiento } from '../services/formato'
import { quitarPartida } from '../services/actionsPartida'
import { CeldaEditable } from './CeldaEditable'

const COLUMNAS = 8

export function TablaPartidas({
  partidas,
  cotizacionId,
  costoDirecto,
  hhPrevistas,
  precioVenta,
  margenPct,
  seleccionada,
  congelado,
  accion,
}: {
  partidas: PartidaValorizada[]
  cotizacionId: string
  costoDirecto: number | null
  /** Los tres del pie salen de `cotizacion_cascada`, igual que el costo directo: nunca se suman acá. */
  hhPrevistas: number | null
  precioVenta: number | null
  margenPct: number | null
  seleccionada: string | null
  congelado: boolean
  accion?: React.ReactNode
}) {
  const [busqueda, setBusqueda] = useState('')
  const [falta, setFalta] = useState<FaltaPartida | null>(null)
  const [cerrados, setCerrados] = useState<string[]>([])

  const deuda = useMemo(() => contarFaltantes(partidas), [partidas])
  const visibles = useMemo(
    () => filtrarPorFalta(filtrarPartidas(partidas, busqueda), falta),
    [partidas, busqueda, falta],
  )
  const filas = useMemo(() => filasDeLaTabla(visibles, costoDirecto), [visibles, costoDirecto])

  function alternar(clave: string) {
    setCerrados((v) => (v.includes(clave) ? v.filter((x) => x !== clave) : [...v, clave]))
  }

  return (
    <div className="min-w-0">
      <div className="mb-2.5 flex flex-wrap items-center gap-x-3 gap-y-2">
        {accion}
        <Buscador
          value={busqueda}
          onChange={setBusqueda}
          placeholder="Buscar partida, código o rubro"
          testid="buscador-partidas"
          className="w-[220px] max-w-full"
        />
        {busqueda && (
          <span className="font-mono text-[11.5px] tabular-nums text-faint" data-testid="cuenta-partidas">
            {visibles.length} de {partidas.length}
          </span>
        )}
        <Chip
          n={deuda.sinAnalisis}
          activo={falta === 'sin_analisis'}
          onClick={() => setFalta((v) => (v === 'sin_analisis' ? null : 'sin_analisis'))}
          testid="chip-sin-analisis"
        >
          sin análisis
        </Chip>
        <Chip
          n={deuda.sinComputo}
          activo={falta === 'sin_computo'}
          onClick={() => setFalta((v) => (v === 'sin_computo' ? null : 'sin_computo'))}
          testid="chip-sin-computo"
        >
          sin cómputo
        </Chip>
      </div>

      <Tabla testid="tabla-partidas" minWidth={880}>
        <THead>
          <Th>Partida</Th>
          <Th>Un.</Th>
          <Th num>Cant.</Th>
          <Th num>Hs/un.</Th>
          <Th num>HH</Th>
          <Th num>P. unit.</Th>
          <Th num>Total</Th>
          <Th />
        </THead>
        <tbody>
          {filas.map((f) => {
            if (f.tipo === 'rubro') {
              return (
                <FilaGrupo
                  key={f.clave}
                  testid="fila-rubro"
                  colSpan={COLUMNAS}
                  titulo={f.nombre}
                  cuenta={f.nPartidas}
                  abierto={!cerrados.includes(f.clave)}
                  onToggle={() => alternar(f.clave)}
                  derecha={
                    // Los dos números del rubro caen bajo SU columna —HH y TOTAL—, no apilados al
                    // borde: en el canon 15 el subtotal del rubro se lee en la misma vertical que
                    // los importes de sus partidas, que es lo que lo vuelve comparable de un
                    // vistazo. Los anchos replican los de la tabla; el resto de las columnas del
                    // rubro está vacío a propósito (un rubro no tiene unidad ni cantidad).
                    <span className="flex items-baseline">
                      {f.nSinAnalisis > 0 && (
                        <span className="mr-4 text-[10.5px] text-warn">{f.nSinAnalisis} sin análisis</span>
                      )}
                      <span className="w-[80px] px-3 text-right font-mono text-[11.5px] tabular-nums text-muted">
                        {fHH(f.hh) ?? <Nulo>sin dato</Nulo>}
                      </span>
                      <span className="w-[112px]" aria-hidden />
                      <span className="w-[124px] px-3 text-right font-mono text-[12.5px] font-semibold tabular-nums text-ink">
                        {importe(f.subtotal) ?? <Nulo>sin cargar</Nulo>}
                      </span>
                      <span className="w-[64px]" aria-hidden />
                    </span>
                  }
                />
              )
            }
            if (cerrados.includes(f.rubroClave)) return null
            return (
              <FilaPartida
                key={f.clave}
                p={f.partida}
                cotizacionId={cotizacionId}
                seleccionada={seleccionada === f.partida.partida_id}
                congelado={congelado}
              />
            )
          })}
          {/* EL PIE SALE DE LA VISTA, NO DE LA SUMA DE ARRIBA (canon 15: HH TOTALES · COSTO ·
              TOTAL · MARGEN). Los cuatro son los mismos números de la franja de arriba, y ésa es la
              razón de que estén: al pie de 68 filas la franja quedó tres pantallas atrás, y quien
              termina de recorrer el cómputo necesita ver contra qué total lo estuvo comparando sin
              volver a subir. Repetir el número es barato; recalcularlo sería otro camino al mismo
              total, y el día que difieran nadie sabría cuál mirar. */}
          <FilaTotal>
            <Td colSpan={COLUMNAS} className="text-[12px]">
              <div className="flex flex-wrap items-baseline justify-end gap-x-7 gap-y-1" data-testid="pie-presupuesto">
                <Cifra rotulo="HH totales" valor={fHH(hhPrevistas)} falta="sin cargar" testid="total-hh" />
                <Cifra rotulo="Costo" valor={plata(costoDirecto)} falta="sin cargar" testid="total-costo-directo" />
                <Cifra rotulo="Total" valor={plata(precioVenta)} falta="sin cargar" grande testid="total-precio-venta" />
                <Cifra rotulo="Margen" valor={porcentaje(margenPct)} falta="sin dato" tono="pos" testid="total-margen" />
              </div>
            </Td>
          </FilaTotal>
        </tbody>
      </Tabla>

      {visibles.length === 0 && (
        <p className="border-b border-[#EFEEEA] py-6 text-[13px] text-muted" data-testid="partidas-vacias">
          {partidas.length === 0 ? (
            'Este presupuesto todavía no tiene partidas. Sin partidas no hay costo directo, y sin costo directo no hay precio.'
          ) : falta !== null ? (
            <>Ninguna partida queda {falta === 'sin_analisis' ? 'sin análisis' : 'sin cómputo'} con lo que buscaste. <button type="button" onClick={() => setFalta(null)} className="text-ink underline underline-offset-2">Ver todas</button>.</>
          ) : (
            <>Nada coincide con «{busqueda}». <button type="button" onClick={() => setBusqueda('')} className="text-ink underline underline-offset-2">Ver todo</button>.</>
          )}
        </p>
      )}
    </div>
  )
}

/** Una cifra del pie: rótulo chico al lado del número, como el canon 15 lo dibuja. */
function Cifra({ rotulo, valor, falta, tono, grande, testid }: {
  rotulo: string; valor: string | null; falta: string
  tono?: 'pos'; grande?: boolean; testid: string
}) {
  return (
    <span className="flex items-baseline gap-2">
      <span className="text-[10px] uppercase tracking-[0.06em] text-faint">{rotulo}</span>
      <span
        data-testid={testid}
        className={`font-mono tabular-nums ${grande ? 'text-[15px] font-semibold' : 'text-[13px] font-semibold'} ${
          valor === null ? 'text-faint' : tono === 'pos' ? 'text-pos' : 'text-ink'
        }`}
      >
        {valor ?? <span className="font-sans text-[12px] font-normal"><Nulo>{falta}</Nulo></span>}
      </span>
    </span>
  )
}

/**
 * Un chip de deuda de carga. En CERO no se dibuja: «0 sin análisis» es una felicitación, y una
 * toolbar con dos felicitaciones permanentes es exactamente el ruido que el rediseño saca.
 */
function Chip({ n, activo, onClick, children, testid }: {
  n: number; activo: boolean; onClick: () => void; children: React.ReactNode; testid: string
}) {
  if (n === 0) return null
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activo}
      data-testid={testid}
      className={`inline-flex items-center gap-1.5 rounded-control border px-2.5 py-[5px] text-[12px] ${
        activo ? 'border-warn bg-warn-soft text-warn' : 'border-line text-warn hover:bg-surface-quiet'
      }`}
    >
      <IconoProblema className="h-[13px] w-[13px]" />
      <span className="font-mono tabular-nums">{n}</span>
      {children}
    </button>
  )
}

function FilaPartida({
  p, cotizacionId, seleccionada, congelado,
}: {
  p: PartidaValorizada
  cotizacionId: string
  seleccionada: boolean
  congelado: boolean
}) {
  const faltantes = faltantesDe(p)
  const base = `/presupuestos/${cotizacionId}`
  return (
    <Tr seleccionada={seleccionada} data-testid="fila-partida" data-partida={p.partida_id}>
      <Td>
        <div className="flex min-w-0 items-center gap-2">
          <CeldaEditable partidaId={p.partida_id} cotizacionId={cotizacionId} campo="codigo"
            valor={p.codigo ?? ''} mono ancho="w-[58px]" placeholder="s/c"
            deshabilitada={congelado} testid={`codigo-${p.partida_id}`} />
          <CeldaEditable partidaId={p.partida_id} cotizacionId={cotizacionId} campo="descripcion"
            valor={p.descripcion} deshabilitada={congelado} testid={`descripcion-${p.partida_id}`} />
          {faltantes.map((f) => (
            <span key={f} className="shrink-0 whitespace-nowrap text-[9.5px] text-warn" data-testid="badge-falta">{f}</span>
          ))}
        </div>
      </Td>
      <Td>
        <CeldaEditable partidaId={p.partida_id} cotizacionId={cotizacionId} campo="unidad"
          valor={p.unidad ?? ''} ancho="w-[38px]" placeholder="un." deshabilitada={congelado} />
      </Td>
      <Td num>
        <CeldaEditable partidaId={p.partida_id} cotizacionId={cotizacionId} campo="cantidad"
          valor={p.cantidad === null ? '' : String(p.cantidad).replace('.', ',')} alineacion="derecha"
          mono ancho="w-[58px]" deshabilitada={congelado} testid={`cantidad-${p.partida_id}`} />
      </Td>
      <Td num>
        {/* HS/UN. es el esfuerzo. Escribirlo acá GANA sobre el del análisis: el `coalesce` de la
            vista prefiere el de la partida. Sube las HH y el plazo; NO cambia el costo. */}
        <CeldaEditable partidaId={p.partida_id} cotizacionId={cotizacionId} campo="hs_unitarias"
          valor={p.hs_unitarias === null ? '' : rendimiento(p.hs_unitarias)!} alineacion="derecha"
          mono ancho="w-[54px]" placeholder="sin dato" deshabilitada={congelado}
          testid={`hs-${p.partida_id}`} />
      </Td>
      <Td num>{fHH(p.hh) ?? <span className="text-[11.5px] text-warn">sin cargar</span>}</Td>
      <Td num>{importe(p.costo_unitario) ?? <span className="text-[11.5px] text-warn">sin precio</span>}</Td>
      <Td num fuerte>{importe(p.subtotal) ?? <span className="text-[11.5px] text-warn">sin precio</span>}</Td>
      <Td>
        {/* Una acción = un icono, sólo + `title` en la fila (COMPONENTS.md §Iconografía). Eran tres
            enlaces de texto —«análisis · ver · quitar»— repetidos en cada una de las 68 filas: 204
            palabras compitiendo con los números que la tabla existe para comparar. */}
        <div className="flex items-center justify-end gap-1">
          <Link
            href={`${base}?partida=${p.partida_id}`}
            title="Ver el detalle en el panel"
            aria-label="Ver el detalle en el panel"
            data-testid={`ver-${p.partida_id}`}
            className="rounded-control p-1 text-faint hover:bg-surface-quiet hover:text-ink"
          >
            <IconoAbrir className="h-[15px] w-[15px]" />
          </Link>
          <Link
            href={`${base}/partida/${p.partida_id}`}
            title="Abrir el análisis completo"
            aria-label="Abrir el análisis completo"
            className="rounded-control px-1.5 py-1 text-[13px] leading-none text-faint hover:bg-surface-quiet hover:text-ink"
          >
            ›
          </Link>
          {!congelado && (
            <BotonAccion accion={quitarPartida} args={[p.partida_id, cotizacionId]}
              tono="peligro" testid={`borrar-${p.partida_id}`} className="[&_button]:border-transparent [&_button]:px-1.5 [&_button]:py-1">
              <span title="Quitar la partida" className="flex items-center">
                <span className="sr-only">Quitar la partida</span>
                <IconoEliminar className="h-[15px] w-[15px]" />
              </span>
            </BotonAccion>
          )}
        </div>
      </Td>
    </Tr>
  )
}
