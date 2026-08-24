// LA ENTIDAD ACTIVA DE LA ENTRADA — la cartera de clientes, para abrir una ficha (Design 00).
//
// ═══ POR QUÉ ACÁ NO HAY PANEL DE FICHA ═══
//
// El mockup abre el cliente en un panel a la derecha con CUIT, contacto, obras y actividad. Eso YA
// existe entero en `/clientes/<cliente>` —cuatro bloques, sus acciones y su timeline— y rehacerlo acá
// sería una segunda ficha del mismo cliente: dos pantallas que muestran lo mismo se contradicen el
// día que una de las dos aprende un campo nuevo. La fila lleva a la ficha real.
//
// ═══ «EN EJECUCIÓN» ES UN NÚMERO Y NO EL NOMBRE DE LA OBRA ═══
//
// El mockup escribe «Depósito Norte · Playón». Ese nombre exige saber CUÁL de las obras del cliente
// está en ejecución, y ese predicado vive en `cliente_panel` (que ya publica `n_obras_activas`).
// Resolverlo otra vez acá crearía una segunda definición de «obra activa» — la clase de duplicación
// que después se descubre porque dos pantallas cuentan distinto.
//
// ═══ EL CONTRATADO ES PRECIO ═══
//
// Sólo lo ve quien ve economía. La base ya lo cierra; esto es no dibujar una columna vacía al jefe de
// obra. La cartera de `/clientes` NO lo muestra a nadie por decisión del dueño («Quiero CLIENTE |
// OBRAS. Nada más para el MVP») y acá sí, porque esta lista existe para elegir a quién abrir y el
// tamaño de la relación es lo que ordena esa decisión.

import Link from 'next/link'
import { Nulo, Num, Tabla, THead, Th, Tr, Td, Valor, Vacio } from '@/shared/components/ds'
import { plata } from '@/shared/utils/format'
import type { ClientePanel } from '@/features/clientes/types'

export function TablaClientesHome({
  clientes,
  veEconomia,
}: {
  clientes: ClientePanel[]
  veEconomia: boolean
}) {
  if (clientes.length === 0) {
    return (
      <Vacio accion={<Link href="/clientes?nuevo=1" className="text-ink underline underline-offset-2">Cargar el primero</Link>}>
        Todavía no hay clientes activos.
      </Vacio>
    )
  }

  return (
    <Tabla testid="home-clientes" minWidth={520}>
      <THead>
        <Th>Cliente</Th>
        <Th num className="w-20">Obras</Th>
        <Th className="w-40">En ejecución</Th>
        {veEconomia && <Th num className="w-40">Contratado</Th>}
      </THead>
      <tbody>
        {clientes.map((c) => <Fila key={c.cliente_id} c={c} veEconomia={veEconomia} />)}
      </tbody>
    </Tabla>
  )
}

function Fila({ c, veEconomia }: { c: ClientePanel; veEconomia: boolean }) {
  return (
    <Tr>
      <Td fuerte>
        {c.slug ? (
          <Link
            href={`/clientes/${c.slug}`}
            prefetch={false}
            data-testid="abrir-cliente"
            className="text-[13px] font-medium text-ink hover:underline"
          >
            {c.nombre_comercial}
          </Link>
        ) : (
          // Sin identificador no hay ficha a la que entrar. Se muestra igual: esconderlo haría
          // desaparecer a un cliente real sin que nadie se entere.
          <span className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-[13px] font-medium text-ink">{c.nombre_comercial}</span>
            <Nulo className="text-[11px]">sin identificador: no tiene ficha todavía</Nulo>
          </span>
        )}
      </Td>
      {/* CERO OBRAS SE ESCRIBE «—» Y NO «0»: un cliente sin obras cargadas y un cliente al que le
          contratamos cero veces son cosas distintas, y esta lista no sabe cuál es cuál. */}
      <Td num>{c.n_obras || <Nulo>—</Nulo>}</Td>
      <Td>
        {c.n_obras_activas > 0 ? (
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[12.5px] text-ink">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-info" />
            <Num className="text-ink">{c.n_obras_activas}</Num>
            {c.n_obras_activas === 1 ? 'obra' : 'obras'}
          </span>
        ) : (
          <Nulo>ninguna</Nulo>
        )}
      </Td>
      {veEconomia && (
        <Td num>
          <Valor v={c.contratado} falta="sin contrato">{(n) => plata(n)}</Valor>
        </Td>
      )}
    </Tr>
  )
}
