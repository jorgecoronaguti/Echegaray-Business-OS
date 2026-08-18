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

import Link from 'next/link'
import { useMemo, useState } from 'react'
import type { ClientePanel } from '../types'

/** Sin acentos, sin mayúsculas y sin espacios de más: «La Estrella», «la estrella» y «ESTRELLA»
 *  tienen que encontrar la misma fila. Nadie escribe los acentos cuando busca. */
function normalizar(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
}

export function ListaClientes({ clientes }: { clientes: ClientePanel[] }) {
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
    <div className="max-w-2xl space-y-3">
      {/* ANCHO DE LECTURA, NO ANCHO DE PANTALLA. Dos columnas estiradas a 1.400px dejan el nombre
          pegado a la izquierda y el número de obras a la derecha con un metro de vacío en el medio,
          y hay que barrer la pantalla con la vista para leer un renglón. */}
      <input
        type="search"
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
        data-testid="buscar-cliente"
        placeholder="Buscar un cliente…"
        aria-label="Buscar un cliente"
        className="w-full rounded-control border border-line bg-white px-3 py-1.5 text-[13px] text-ink placeholder:text-faint"
      />

      {visibles.length === 0 ? (
        <p className="rounded-xl border border-line bg-white px-4 py-3 text-[13px] text-muted" data-testid="sin-resultados">
          Ningún cliente se llama así.
        </p>
      ) : (
        <div className="rounded-xl border border-line bg-white">
          <table data-testid="clientes-tabla" className="w-full text-left">
            <thead>
              <tr className="border-b border-line text-[10px] uppercase tracking-wide text-faint">
                <th className="px-4 py-2 font-medium">Cliente</th>
                <th className="w-20 px-4 py-2 text-right font-medium">Obras</th>
              </tr>
            </thead>
            <tbody>{visibles.map((c) => <Fila key={c.cliente_id} c={c} />)}</tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function Fila({ c }: { c: ClientePanel }) {
  return (
    <tr className="border-b border-line/60 last:border-0 hover:bg-slate-50">
      <td className="px-4 py-2">
        {c.slug ? (
          <Link href={`/clientes/${c.slug}`} className="text-[13px] font-medium text-ink hover:underline">
            {c.nombre_comercial}
          </Link>
        ) : (
          // Sin identificador no hay record al que entrar. Se muestra igual: esconderlo haría que un
          // cliente real desapareciera de la lista sin que nadie se entere.
          <>
            <span className="text-[13px] font-medium text-ink">{c.nombre_comercial}</span>
            <span className="block text-[11px] text-faint">sin identificador: no tiene ficha todavía</span>
          </>
        )}
        {/* El «archivado» se queda: es la razón por la que esta fila normalmente NO estaría acá, y
            sin él la lista con archivados no se distingue de la lista sin ellos. */}
        {!c.activo && <span className="ml-2 text-[11px] text-faint">archivado</span>}
      </td>
      <td className="px-4 py-2 text-right text-[13px] tabular-nums text-muted">{c.n_obras || '—'}</td>
    </tr>
  )
}
