'use client'

// LA LISTA DE CLIENTES — DOS COLUMNAS, Y UN BUSCADOR.
//
// ═══ QUÉ SE FUE, Y POR QUÉ ═══
//
// El dueño: *"Quiero CLIENTE | OBRAS. Nada más para el MVP. El objetivo del listado es ENCONTRAR Y
// ABRIR UN CLIENTE."*
//
// Se fueron responsable, contratado, costo real, restricciones, documentos y el CUIT como subtítulo
// permanente. Ninguno de esos números se perdió: TODOS viven en el record del cliente, que está a un
// clic, y el contratado y el costo real además viven en el portafolio de obras, que es donde se
// comparan contra algo. Acá no servían para decidir nada —nadie elige a quién llamar por su costo
// real acumulado— y le sacaban al nombre el 70% del ancho.
//
// ═══ POR QUÉ EL BUSCADOR FILTRA EN EL NAVEGADOR Y NO EN EL SERVIDOR ═══
//
// Son cinco clientes hoy, y unas decenas en el peor caso imaginable de esta empresa. Un `?q=` que va
// al servidor por cada tecla convierte una búsqueda instantánea en cinco viajes de red, y el foco
// del campo se pierde en cada recarga: escribir «estrella» termina en «e» y una lista parpadeando.
// El filtro local es exacto, inmediato, y no hay ningún dato que el servidor sepa y esta lista no.
//
// El día que sean miles, el criterio cambia y el filtro se muda al servidor. Queda declarado como
// decisión tomada sobre el tamaño real del negocio, no como un olvido.
//
// ═══ LA TABLA NO VA EN CAJA (Design Handoff V2) ═══
//
// `COMPONENTS.md` §Table: hairline superior + divisores de fila. El `rounded-xl border` que tenía
// alrededor era un contenedor que no aportaba nada —la tabla ya se delimita sola con su encabezado
// y sus divisores— y encima entraba en conflicto con el buscador, que en el sistema es sólo un
// hairline inferior: caja arriba, caja abajo, dos marcos para dos controles.

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { Buscador, Nulo, Tabla, THead, Th, Tr, Td } from '@/shared/components/ds'
import type { ClientePanel } from '../types'

/** Sin acentos, sin mayúsculas y sin espacios de más: «La Estrella», «la estrella» y «ESTRELLA»
 *  tienen que encontrar la misma fila. Nadie escribe los acentos cuando busca. */
function normalizar(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
}

export function ListaClientes({
  clientes,
  accion,
}: {
  clientes: ClientePanel[]
  /** La primaria `+ Nuevo cliente`, que sólo el servidor sabe si corresponde dibujar. Viaja como
   *  nodo para que quede AL LADO del buscador —como en el handoff— sin volver de cliente la
   *  decisión de permisos, que es del servidor y sólo del servidor. */
  accion?: React.ReactNode
}) {
  const [busqueda, setBusqueda] = useState('')
  const q = normalizar(busqueda)
  // SE BUSCA POR LOS DOS NOMBRES. Desde que el cliente tiene nombre comercial y razón social por
  // separado, buscar sólo por el comercial dejaría a «Alimentos del Sur SAS» sin resultado aunque
  // esté cargado — el que busca por la razón social es justamente el que la tiene delante, en una
  // factura o en un contrato. La lista muestra el comercial igual: el hallazgo no cambia el rótulo.
  const visibles = useMemo(
    () => (q
      ? clientes.filter((c) => normalizar(`${c.nombre_comercial} ${c.razon_social ?? ''}`).includes(q))
      : clientes),
    [clientes, q],
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Buscador
          value={busqueda}
          onChange={setBusqueda}
          placeholder="Buscar un cliente…"
          testid="buscar-cliente"
          className="flex-1"
        />
        {accion}
      </div>

      {visibles.length === 0 ? (
        <p className="border-t border-line py-6 text-[13px] text-muted" data-testid="sin-resultados">
          Ningún cliente se llama así.
        </p>
      ) : (
        <Tabla testid="clientes-tabla" minWidth={320}>
          <THead>
            <Th>Cliente</Th>
            <Th num className="w-24">Obras</Th>
          </THead>
          <tbody>{visibles.map((c) => <Fila key={c.cliente_id} c={c} />)}</tbody>
        </Tabla>
      )}
    </div>
  )
}

function Fila({ c }: { c: ClientePanel }) {
  return (
    <Tr>
      <Td fuerte>
        <span className="flex flex-wrap items-baseline gap-x-2">
          {c.slug ? (
            <Link href={`/clientes/${c.slug}`} className="text-[13px] font-medium text-ink hover:underline">
              {c.nombre_comercial}
            </Link>
          ) : (
            // Sin identificador no hay record al que entrar. Se muestra igual: esconderlo haría que
            // un cliente real desapareciera de la lista sin que nadie se entere.
            <>
              <span className="text-[13px] font-medium text-ink">{c.nombre_comercial}</span>
              <Nulo className="text-[11px]">sin identificador: no tiene ficha todavía</Nulo>
            </>
          )}
          {/* El «archivado» se queda: es la razón por la que esta fila normalmente NO estaría acá, y
              sin él la lista con archivados no se distingue de la lista sin ellos. */}
          {!c.activo && <Nulo className="text-[11px]">archivado</Nulo>}
        </span>
      </Td>
      {/* CERO OBRAS SE ESCRIBE «—» Y NO «0»: un cliente sin obras cargadas y un cliente al que le
          contratamos cero veces son cosas distintas, y esta lista no sabe cuál es cuál. */}
      <Td num>{c.n_obras || <Nulo>—</Nulo>}</Td>
    </Tr>
  )
}
