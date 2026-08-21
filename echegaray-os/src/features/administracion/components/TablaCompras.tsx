// EL LIBRO DE COMPRAS, UNA FILA POR COMPROBANTE — pantalla 24, §tabla.
//
// Las seis columnas son las del contrato de diseño y las seis las puede contestar la fuente:
// Fecha · Proveedor · Comprobante · Obra · Importe · Control. No hay una séptima de «concepto»
// porque el libro de ARCA no trae el detalle de lo comprado: inventar la columna y dejarla vacía
// haría parecer que falta cargar algo que no existe.
//
// ═══ LA NOTA DE CRÉDITO SE MUESTRA EN NEGATIVO ═══
//
// Es una columna de COMPRAS: una nota de crédito resta. Dibujarla como un importe positivo más es
// literalmente el defecto que costó $41.953.276 en el libro (`orquestador/lib/comprobante-arca.mjs`,
// 21/07) — cada nota entraba dos veces mal, sumando cuando debía restar. Acá el signo sale de la
// base (`comprobante_signo`), no de una tabla de códigos escrita en el front.
//
// Y cuando el signo es NULL —un código de ARCA que la tabla no conoce— el importe se muestra tal
// cual pero SIN signo asumido, y el estado de la fila dice «Sin clasificar». Tratar lo desconocido
// como lo habitual es el error de origen; mostrarlo como un problema es el arreglo.

import Link from 'next/link'
import { Estado, Nulo, Tabla, Td, Th, THead, Tr, Vacio } from '@/shared/components/ds'
import { fecha, plata } from '@/features/obras/components/formato'
import { controlDe } from '../services/comprasEstado'
import type { ComprobanteCompra } from '../services/comprasService'

function Importe({ c }: { c: ComprobanteCompra }) {
  if (c.imp_total == null) return <Nulo>sin importe</Nulo>
  if (c.signo === null) {
    // El número existe, lo que no se sabe es si suma o resta. Se muestra apagado para que no se
    // lea como un dato firme.
    return <span className="text-faint" title="El tipo de comprobante no está en la tabla de ARCA: el signo no se puede afirmar.">{plata(c.imp_total)}</span>
  }
  const valor = c.signo * c.imp_total
  return <span className={valor < 0 ? 'text-pos' : 'text-ink'}>{plata(valor)}</span>
}

export function TablaCompras({
  filas,
  seleccionado,
  hrefDe,
}: {
  filas: ComprobanteCompra[]
  seleccionado?: string
  hrefDe: (id: string) => string
}) {
  if (filas.length === 0) {
    return (
      <div data-testid="compras-vacio">
        <Vacio>Ningún comprobante de compra coincide con este filtro.</Vacio>
      </div>
    )
  }
  return (
    <Tabla testid="tabla-compras" minWidth={720}>
      <THead>
        <Th>Fecha</Th>
        <Th>Proveedor</Th>
        <Th>Comprobante</Th>
        <Th>Obra</Th>
        <Th num>Importe</Th>
        <Th>Control</Th>
      </THead>
      <tbody>
        {filas.map((c) => {
          const control = controlDe(c)
          return (
            <Tr key={c.id} data-testid="fila-compra" seleccionada={c.id === seleccionado} compacta>
              <Td num className="w-[76px] text-muted">{fecha(c.fecha_emision)}</Td>
              <Td fuerte className="max-w-0">
                <Link href={hrefDe(c.id)} data-testid="abrir-compra" className="block min-w-0 truncate hover:underline">
                  {c.emisor_nombre?.trim() || <Nulo>sin proveedor</Nulo>}
                </Link>
              </Td>
              <Td className="w-[150px]">
                <span className="block font-mono text-[12px] tabular-nums text-ink">
                  {c.comprobante || <Nulo>sin número</Nulo>}
                </span>
                <span className="block truncate text-[10.5px] text-faint">{c.tipo_nombre}</span>
              </Td>
              <Td className={`max-w-0 truncate ${c.obra_texto?.trim() ? '' : 'text-warn'}`}>
                {/* «SIN OBRA» no es un vacío tipográfico: es trabajo pendiente y por eso se escribe
                    y se pinta, en vez de dejar un guion que se lee como «no aplica». */}
                {c.obra_texto?.trim() || 'SIN OBRA'}
              </Td>
              <Td num className="w-[120px]"><Importe c={c} /></Td>
              <Td className="w-[130px]">
                <Estado tono={control.tono} clave={control.clave}>{control.etiqueta}</Estado>
              </Td>
            </Tr>
          )
        })}
      </tbody>
    </Tabla>
  )
}
