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
import { Estado, FilaTotal, Nulo, Num, Tabla, Td, Th, THead, Tr, Vacio } from '@/shared/components/ds'
import { fecha, plata } from '@/features/obras/components/formato'
import { controlDe, totalDeLaVista, type Control } from '../services/comprasEstado'
import type { ComprobanteCompra } from '../services/comprasService'

// ═══ LA FILA TRANSACCIONAL (Design 23/08 · COMPONENTS.md §Transaction row) ═══
//
// La excepción se marca con una REGLA INTERIOR de 3px en el borde izquierdo, no con un badge de
// color en la columna de estado. El motivo es de escaneo: el ojo recorre el borde izquierdo de una
// tabla de arriba abajo sin leer nada, así que las tres filas que piden trabajo se encuentran en un
// barrido; una pastilla en la última columna obliga a leer las treinta.
//
// La regla es `boxShadow` y no un `border-l`: un borde real corre la fila 3px y desalinea la
// columna de fecha con el encabezado. Es la misma técnica con la que `Tr` dibuja la selección — y
// por eso la selección GANA cuando ambas coinciden: el estilo en línea de `Tr` pisa a esta clase,
// que es exactamente lo que pide el contrato («la fila seleccionada usa la regla amarilla de 2px»).
const REGLA: Record<Control['tono'], string> = {
  pos: '',
  warn: 'shadow-[inset_3px_0_0_var(--os-warn)]',
  neg: 'shadow-[inset_3px_0_0_var(--os-neg)]',
}

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

/**
 * LA COLUMNA OBRA DICE DÓNDE LLEGA EL GASTO, NO QUÉ DICE EL PAPEL.
 *
 * Antes mostraba `obra_texto` o «SIN OBRA» en ámbar. Con eso, «Sueldos» —que está imputado a
 * Estructura y no reclama nada— se veía igual que «Quattropani», y un rótulo que el diccionario no
 * conoce se veía igual que uno que sí: el gasto no llegaba a ninguna obra y la pantalla lo mostraba
 * como imputado. Ahora el texto sigue arriba (es lo que dice el papel) y debajo va a dónde llegó.
 */
function Imputada({ c }: { c: ComprobanteCompra }) {
  const texto = c.obra_texto?.trim()
  if (c.imputacion === 'sin_identificar' || (!texto && !c.imputacion)) {
    // «SIN OBRA» no es un vacío tipográfico: es trabajo pendiente y por eso se escribe y se pinta,
    // en vez de dejar un guion que se lee como «no aplica».
    return <span className="block truncate text-warn">SIN OBRA</span>
  }
  return (
    <>
      <span className="block truncate text-ink">{texto}</span>
      {c.imputacion === 'estructura' && (
        <span className="block truncate text-[10.5px] text-faint" title="Imputado a Estructura: no es costo de ninguna obra.">
          Estructura
        </span>
      )}
      {c.imputacion === 'sin_resolver' && (
        <span
          className="block truncate text-[10.5px] text-warn"
          title="Este rótulo no está en el diccionario de obras: el gasto no llega a ninguna obra. Se resuelve declarando el alias."
        >
          sin resolver
        </span>
      )}
    </>
  )
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
  const suma = totalDeLaVista(filas)
  const afuera = suma.sinImporte + suma.sinSigno
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
            <Tr
              key={c.id}
              data-testid="fila-compra"
              // El estado va al DOM aunque la columna no lo dibuje: es lo que deja verificar una fila
              // normal desde un test sin depender de un texto que el diseño decidió no escribir.
              data-control={control.clave}
              seleccionada={c.id === seleccionado}
              className={REGLA[control.tono]}
            >
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
              <Td className="max-w-0"><Imputada c={c} /></Td>
              <Td num className="w-[120px]"><Importe c={c} /></Td>
              {/* SINCRONIZADA NO DIBUJA NADA — COMPONENTS.md §Sync state, textual: «la
                  sincronización con el Sheet no se celebra». Era el estado de la enorme mayoría de
                  las filas, así que la columna de control decía lo mismo treinta veces y el
                  problema real quedaba escondido entre treinta confirmaciones de que todo va bien.
                  Confirmada SÍ se escribe: no es el estado de una máquina, es una persona que miró
                  el papel y se hizo cargo. */}
              <Td className="w-[130px]">
                {control.clave !== 'sincronizada' && (
                  <Estado tono={control.tono} clave={control.clave}>{control.etiqueta}</Estado>
                )}
              </Td>
            </Tr>
          )
        })}
      </tbody>
      {/* LA FILA DE TOTAL DICE «EN PANTALLA», NO «EL LIBRO». Con un filtro puesto o con el tope
          recortando, suma un subconjunto: rotularla «Total» a secas la convertiría en una
          afirmación sobre la empresa que no es cierta. Y los que no se pudieron sumar se cuentan al
          lado — un total que se come en silencio los comprobantes sin importe miente hacia abajo. */}
      <tfoot>
        <FilaTotal>
          <Td colSpan={3} fuerte>
            <span className="text-[12px] font-normal text-muted">En pantalla</span>{' '}
            <Num className="text-ink">{filas.length}</Num>
          </Td>
          <Td className="text-right">
            {afuera > 0 && (
              <span data-testid="total-fuera-de-suma" className="text-[11.5px] font-normal text-warn">
                {afuera} sin sumar
              </span>
            )}
          </Td>
          <Td num className="w-[120px]">
            {suma.total === null
              ? <Nulo>sin importes</Nulo>
              : <span data-testid="total-compras" className={suma.total < 0 ? 'text-pos' : 'text-ink'}>{plata(suma.total)}</span>}
          </Td>
          <Td />
        </FilaTotal>
      </tfoot>
    </Tabla>
  )
}
