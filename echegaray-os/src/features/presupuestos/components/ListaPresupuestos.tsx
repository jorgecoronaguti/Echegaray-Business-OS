'use client'

// 14 · PRESUPUESTOS CARTERA — la lista.
//
// ═══ EL BUSCADOR FILTRA EN EL NAVEGADOR; EL FILTRO DE ESTADO VA A LA URL ═══
//
// Son dos cosas distintas y por eso viven en lugares distintos. La BÚSQUEDA es exploración: se
// teclea, se corrige y se borra en dos segundos, y un `?q=` por tecla convierte eso en cinco viajes
// de red con el foco perdiéndose en cada recarga (el mismo criterio, y por el mismo tamaño de
// negocio, que en `ListaClientes`). El FILTRO de estado es una vista: «los adjudicados» es algo que
// alguien quiere volver a abrir mañana o mandar por chat, y para eso tiene que estar en la
// dirección.
//
// ═══ LO QUE NO SE DIBUJA EN CERO ═══
//
// Un presupuesto sin partidas tiene precio de venta 0 porque la vista hace `coalesce(sum(...), 0)`.
// En la columna MONTO eso diría que la empresa ofertó gratis. Se escribe «sin cargar».
// Un margen NULL —no hay costo directo contra el cual medirlo— se escribe «sin dato», nunca 0 %.

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { Buscador, Estado, Filtros, Nulo, Tabla, THead, Th, Tr, Td } from '@/shared/components/ds'
import type { PresupuestoCascada } from '../types'
import { FILTROS, filtrarCartera, ordenarCartera, type FiltroCartera } from '../services/cartera'
import { lecturaEstado } from '../services/estado'
import { tieneCifras } from '../services/cascada'
import { fecha, hh, plata, porcentaje } from '../services/formato'

/** El objetivo de la empresa contra el que se pinta el margen. Cuando baja de acá, va en `warn`. */
const MARGEN_OBJETIVO = 17

export function ListaPresupuestos({
  presupuestos,
  filtro,
  accion,
}: {
  presupuestos: PresupuestoCascada[]
  filtro: FiltroCartera
  accion?: React.ReactNode
}) {
  const [busqueda, setBusqueda] = useState('')
  const visibles = useMemo(
    () => ordenarCartera(filtrarCartera(presupuestos, filtro, busqueda)),
    [presupuestos, filtro, busqueda],
  )

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <Buscador
          value={busqueda}
          onChange={setBusqueda}
          placeholder="Buscar presupuesto, obra o cliente"
          testid="buscador-presupuestos"
          className="w-[280px] max-w-full"
        />
        {accion}
      </div>

      {presupuestos.length > 1 && (
        <div className="mb-2">
          <Filtros
            testid="filtros-presupuestos"
            opciones={FILTROS.map((f) => ({
              label: f.label,
              href: f.clave === 'todos' ? '/presupuestos' : `/presupuestos?filtro=${f.clave}`,
              activo: filtro === f.clave,
              testid: `filtro-${f.clave}`,
            }))}
            cuenta={{ n: visibles.length, total: presupuestos.length }}
          />
        </div>
      )}

      <Tabla testid="tabla-presupuestos" minWidth={860}>
        <THead>
          <Th>Número</Th>
          <Th>Objeto</Th>
          <Th>Cliente</Th>
          <Th num>Monto</Th>
          <Th num>HH</Th>
          <Th num>Margen</Th>
          <Th>Estado</Th>
        </THead>
        <tbody>
          {visibles.map((p) => <FilaPresupuesto key={p.id} p={p} />)}
        </tbody>
      </Tabla>

      {visibles.length === 0 && (
        <p className="border-b border-[#EFEEEA] py-6 text-[13px] text-muted" data-testid="cartera-vacia">
          {presupuestos.length === 0
            ? 'Todavía no hay presupuestos cargados.'
            : <>Nada coincide con lo que buscás. <button type="button" onClick={() => setBusqueda('')} className="text-ink underline underline-offset-2">Ver todo</button>.</>}
        </p>
      )}
    </div>
  )
}

function FilaPresupuesto({ p }: { p: PresupuestoCascada }) {
  const e = lecturaEstado(p.estado)
  const conCifras = tieneCifras(p)
  const monto = conCifras ? plata(p.precio_venta) : null
  const horas = conCifras ? hh(p.hh_previstas) : null
  const margen = porcentaje(p.margen_sobre_precio_pct)
  const bajoObjetivo = p.margen_sobre_precio_pct !== null && p.margen_sobre_precio_pct < MARGEN_OBJETIVO

  return (
    <Tr data-testid="fila-presupuesto" data-presupuesto={p.id}>
      <Td>
        <Link href={`/presupuestos/${p.id}`} className="font-mono text-[11.5px] tabular-nums text-ink hover:underline">
          {p.numero ?? 'sin número'}
        </Link>
        <div className="font-mono text-[10.5px] tabular-nums text-faint">
          v{p.version}
          {p.fecha_cotizacion && ` · ${fecha(p.fecha_cotizacion)}`}
        </div>
      </Td>
      <Td fuerte>
        <Link href={`/presupuestos/${p.id}`} className="hover:underline">
          {p.obra_nombre ?? <Nulo>sin objeto</Nulo>}
        </Link>
      </Td>
      <Td>{p.cliente ?? <Nulo>sin cliente</Nulo>}</Td>
      <Td num>{monto ?? <Nulo>sin cargar</Nulo>}</Td>
      <Td num>{horas ?? <Nulo>sin cargar</Nulo>}</Td>
      <Td num className={margen && bajoObjetivo ? 'text-warn' : undefined}>
        {margen ?? <Nulo>sin dato</Nulo>}
      </Td>
      <Td>
        <Estado tono={e.tono} clave={e.clave}>{e.label}</Estado>
      </Td>
    </Tr>
  )
}
