'use client'

// LA CARTERA DE CLIENTES — la tabla del canónico 25.
//
// ═══ CAMBIO DE REGLA DECLARADO (Design 23/08/2026) ═══
//
// El 19/08 el dueño pidió *"CLIENTE | OBRAS. Nada más para el MVP"* y se sacaron seis columnas. El
// canónico del 23/08 —cuatro días después, y es el contrato vigente— vuelve a dibujar la cartera con
// CLIENTE · EN EJECUCIÓN · OBRAS · CONTRATADO. No es «el dato ya lo teníamos»: es que la pantalla se
// rediseñó, y ahora las columnas contestan algo. «En ejecución» dice de qué le va a hablar el
// cliente si llama, que es la razón por la que se abre esta lista.
//
// **ESTO REVIERTE UNA DECISIÓN EXPLÍCITA Y TIENE QUE MIRARLO EL DUEÑO.** Se implementa el contrato
// más nuevo y se deja el rastro a la vista, en vez de resolverlo en silencio para cualquiera de los
// dos lados.
//
// ═══ LO QUE EL CANÓNICO DIBUJA Y ACÁ NO ESTÁ ═══
//
// - **PRESUPUESTOS (tasa de conversión).** `public.presupuestos` tiene 2 filas y cuelga de la OBRA
//   (`obra_canonica_id`), no del cliente: no hay presupuesto perdido, ni enviado, ni rechazado que
//   contar. Una «tasa de conversión» calculada sobre eso sería un número inventado.
// - **ÚLT. MOV.** No existe ninguna fuente de «último movimiento del cliente». Lo más parecido es
//   `clientes.updated_at`, que es la última edición de la FICHA: poner eso bajo ese rótulo diría
//   «hablamos hoy» cuando lo que pasó es que alguien corrigió un teléfono.
//
// ═══ EL BUSCADOR SIGUE FILTRANDO EN EL NAVEGADOR ═══
//
// Cinco clientes hoy, decenas en el peor caso de esta empresa. Un `?q=` por tecla convierte una
// búsqueda instantánea en cinco viajes de red. Los CHIPS de recorte sí van por la URL —son estado
// compartible y el canónico los pide así—, y el texto se filtra acá.

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { Buscador, Estado, Nulo, Num, Tabla, THead, Th, Tr, Td } from '@/shared/components/ds'
import { IconoProblema } from '@/shared/components/iconos'
import { money } from '@/shared/utils/format'
import { contieneEnAlguno } from '@/shared/utils/busqueda'
import { avisoDeDatos, totalesCartera } from '../services/cartera'
import { PanelCliente, iniciales } from './PanelCliente'
import type { ClientePanel, ObraDePanel } from '../types'

export interface ObraEnCurso { obra_id: string; nombre: string }

export function ListaClientes({
  clientes,
  enEjecucion,
  obrasPorCliente,
  veEconomia,
  accion,
  filtros,
}: {
  clientes: ClientePanel[]
  /** Las obras `activa` de cada cliente, por `cliente_id`. Vacío = ninguna, y eso se escribe. */
  enEjecucion: Record<string, ObraEnCurso[]>
  /** TODAS las obras de cada cliente, para el panel. Ausente = el panel dice «sin obras cargadas». */
  obrasPorCliente?: Record<string, ObraDePanel[]>
  /** El jefe de obra NO ve el contratado. La restricción es de la RLS; acá sólo se deja de ofrecer
   *  una columna que la base le devolvería igual pero que él no tiene por qué mirar. */
  veEconomia: boolean
  /** La primaria `+ Nuevo cliente`, que sólo el servidor sabe si corresponde dibujar. */
  accion?: React.ReactNode
  /** Los chips de recorte, que viven en la URL y por eso los arma el servidor. */
  filtros?: React.ReactNode
}) {
  const [busqueda, setBusqueda] = useState('')
  // LA SELECCIÓN VIVE ACÁ, NO EN LA URL: el panel no lee nada nuevo del servidor (ver `PanelCliente`).
  const [sel, setSel] = useState<string | null>(null)
  // SE BUSCA POR LOS DOS NOMBRES. Desde que el cliente tiene nombre comercial y razón social por
  // separado, buscar sólo por el comercial dejaría a «Alimentos del Sur SAS» sin resultado aunque
  // esté cargado — el que busca por la razón social es justamente el que la tiene delante, en una
  // factura o en un contrato. La lista muestra el comercial igual: el hallazgo no cambia el rótulo.
  const visibles = useMemo(
    () => clientes.filter((c) => contieneEnAlguno([c.nombre_comercial, c.razon_social], busqueda)),
    [clientes, busqueda],
  )
  // EL PIE CUENTA LO QUE SE VE. Un total calculado sobre la cartera entera mientras la tabla muestra
  // tres filas filtradas es un número que no cuadra con nada de lo que hay en pantalla.
  const total = useMemo(() => totalesCartera(visibles), [visibles])
  // EL PANEL SIGUE A LO QUE SE VE. Si el filtro sacó de la lista al cliente seleccionado, el panel se
  // cierra solo: un detalle abierto de una fila que ya no está es un dato huérfano en pantalla.
  const seleccionado = useMemo(() => visibles.find((c) => c.cliente_id === sel) ?? null, [visibles, sel])

  return (
    <div className="flex min-w-0 items-start gap-3">
    <div className="min-w-0 flex-1 space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Buscador
          value={busqueda}
          onChange={setBusqueda}
          placeholder="Buscar un cliente…"
          testid="buscar-cliente"
          className="min-w-[200px] flex-1"
        />
        {accion}
      </div>

      {filtros}

      {visibles.length === 0 ? (
        <p className="border-t border-line py-6 text-[13px] text-muted" data-testid="sin-resultados">
          Ningún cliente se llama así.
        </p>
      ) : (
        <Tabla testid="clientes-tabla" minWidth={veEconomia ? 780 : 620}>
          <THead>
            <Th>Cliente</Th>
            <Th>En ejecución</Th>
            <Th num className="w-16">Obras</Th>
            {veEconomia && <Th num className="w-36">Contratado</Th>}
          </THead>
          <tbody>
            {visibles.map((c) => (
              <Fila
                key={c.cliente_id}
                c={c}
                obras={enEjecucion[c.cliente_id] ?? []}
                veEconomia={veEconomia}
                elegido={c.cliente_id === sel}
                onElegir={() => setSel((a) => (a === c.cliente_id ? null : c.cliente_id))}
              />
            ))}
          </tbody>
          {/* LA FRANJA DE TOTALES del canónico, como fila de total de la tabla: alineada con sus
              columnas. Una franja suelta debajo obliga a adivinar de qué columna es cada número. */}
          <tfoot>
            <tr className="h-fila border-t border-line-strong text-ink" data-testid="pie-cartera">
              <td className="px-3 align-middle text-[12px] first:pl-0">
                <span className="text-faint">Clientes </span>
                <Num>{total.clientes}</Num>
                <span className="ml-4 text-faint">Con obra activa </span>
                <Num>{total.conObraActiva}</Num>
              </td>
              <td />
              <td />
              {veEconomia && (
                <td className="px-3 text-right align-middle font-mono text-[12.5px] font-medium tabular-nums last:pr-0">
                  {/* NADIE CARGÓ NINGÚN CONTRATO ≠ CONTRATADO $ 0. */}
                  {total.contratado === null ? <Nulo>sin cargar</Nulo> : money(total.contratado)}
                </td>
              )}
            </tr>
          </tfoot>
        </Tabla>
      )}
    </div>

    {seleccionado && (
      <PanelCliente
        c={seleccionado}
        obras={obrasPorCliente?.[seleccionado.cliente_id] ?? []}
        veEconomia={veEconomia}
        onCerrar={() => setSel(null)}
      />
    )}
    </div>
  )
}

function Fila({
  c,
  obras,
  veEconomia,
  elegido,
  onElegir,
}: {
  c: ClientePanel
  obras: ObraEnCurso[]
  veEconomia: boolean
  elegido: boolean
  onElegir: () => void
}) {
  const aviso = avisoDeDatos(c)
  return (
    // LA FILA ENTERA ABRE EL PANEL, como el canónico 00. El nombre sigue siendo un enlace a la ficha
    // y detiene la propagación: quien quiere editar entra directo, quien está recorriendo la cartera
    // toca en cualquier otro lado y se queda en la lista.
    <Tr
      onClick={onElegir}
      data-elegido={elegido || undefined}
      className={`cursor-pointer ${elegido ? 'bg-surface-quiet' : ''}`}
    >
      <Td fuerte className="max-w-0">
        <span className="flex min-w-0 items-center gap-2">
          <span
            aria-hidden
            className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-[7px] bg-surface-quiet text-[10px] font-semibold text-ink-soft"
          >
            {iniciales(c.nombre_comercial)}
          </span>
          <span className="min-w-0">
            {c.slug ? (
              <Link
                href={`/clientes/${c.slug}`}
                onClick={(e) => e.stopPropagation()}
                className="block truncate text-[13px] font-medium text-ink hover:underline"
              >
                {c.nombre_comercial}
              </Link>
            ) : (
              // Sin identificador no hay record al que entrar. Se muestra igual: esconderlo haría que
              // un cliente real desapareciera de la lista sin que nadie se entere.
              <span className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-[13px] font-medium text-ink">{c.nombre_comercial}</span>
                <Nulo className="text-[11px]">sin identificador: no tiene ficha todavía</Nulo>
              </span>
            )}
            {/* LA RAZÓN SOCIAL COMO SUBTÍTULO. El canónico pone ahí el tipo de cliente; en esta base
                no existe esa columna, y la razón social es el otro nombre real del cliente —el que
                aparece en la factura— así que ocupa el renglón sin inventar una taxonomía. */}
            <span className="block truncate text-[10.5px] font-normal text-faint">
              {c.razon_social ?? 'sin razón social'}
            </span>
          </span>
          {/* El «archivado» se queda: es la razón por la que esta fila normalmente NO estaría acá. */}
          {!c.activo && <Nulo className="shrink-0 text-[11px]">archivado</Nulo>}
          {aviso && (
            <span title={aviso} aria-label={aviso} className="shrink-0 text-warn" data-testid="aviso-datos">
              <IconoProblema className="h-[14px] w-[14px]" />
            </span>
          )}
        </span>
      </Td>

      {/* ESTADO = PUNTO + PALABRA, nunca pastilla de color (COMPONENTS.md §Status badges). Se usa
          el `Estado` del DS con tono `curso` —punto grafito—: el canónico lo dibuja azul, pero en
          este sistema el azul es información y el grafito es «en curso». Gana el sistema. */}
      <Td className="max-w-0">
        {obras.length === 0 ? (
          <Nulo>ninguna</Nulo>
        ) : (
          // La celda manda: con `sm:max-w-none` una lista larga de obras se montaba sobre
          // «Contratado» (QA 24/08). El título completo queda en el tooltip.
          <span className="flex min-w-0 items-center" title={obras.map((o) => o.nombre).join(' · ')}>
            <Estado tono="curso" clave="en-ejecucion" className="min-w-0 max-w-full">
              <span className="block min-w-0 truncate">
                {obras.map((o) => o.nombre).join(' · ')}
              </span>
            </Estado>
          </span>
        )}
      </Td>

      {/* CERO OBRAS SE ESCRIBE «—» Y NO «0»: un cliente sin obras cargadas y un cliente al que le
          contratamos cero veces son cosas distintas, y esta lista no sabe cuál es cuál. */}
      <Td num>{c.n_obras || <Nulo>—</Nulo>}</Td>

      {veEconomia && (
        <Td num>{c.contratado === null ? <Nulo>sin cargar</Nulo> : money(c.contratado)}</Td>
      )}
    </Tr>
  )
}
