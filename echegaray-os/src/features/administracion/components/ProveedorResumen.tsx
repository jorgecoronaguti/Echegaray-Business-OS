// LOS BLOQUES DERIVADOS DE LA FICHA DEL PROVEEDOR.
//
// Todo lo que se dibuja acá sale de los comprobantes. No hay un campo «rubro», ni «plazo de pago»,
// ni «insumos que provee» guardado en ninguna parte — y eso es a propósito: el handoff dice que las
// relaciones de un proveedor se DERIVAN de las operaciones. Lo que la base todavía no puede
// contestar se escribe como ausencia, con su nombre.

import Link from 'next/link'
import { Eyebrow, Num, Nulo, Tabla, THead, Th, Timeline, Tr, Td, Vacio } from '@/shared/components/ds'
import type { Evento } from '@/shared/components/ds'
import { fecha, plata } from '@/features/obras/components/formato'
import type { CompraPorObra, ComprobanteProveedor, ConceptoProvisto } from '../services/fichaProveedor'

export function ComprasPorObra({ filas }: { filas: CompraPorObra[] }) {
  if (filas.length === 0) return null
  return (
    <section data-testid="compras-por-obra">
      <div className="mb-2.5 flex items-baseline justify-between gap-3">
        <Eyebrow>Dónde se gastó</Eyebrow>
        <Num className="text-faint">{filas.length} {filas.length === 1 ? 'destino' : 'destinos'}</Num>
      </div>
      <ul className="border-t border-line">
        {filas.map((o) => (
          <li
            key={o.obra ?? 'sin-imputar'}
            data-obra={o.obra ?? 'sin-imputar'}
            className="flex items-center gap-4 border-b border-[#EFEEEA] py-2.5"
          >
            <span className={`min-w-0 flex-1 truncate text-[13px] ${o.obra ? 'text-ink' : 'text-warn'}`}>
              {o.obra ?? 'sin imputar'}
            </span>
            <Num className="shrink-0 text-faint">{o.comprobantes}</Num>
            {/* LA BARRA SÓLO EXISTE SI EL NÚMERO ES UNA FRACCIÓN 0–100. Cuando no se puede
                calcular la participación no se dibuja una pista vacía: se deja el hueco, que dice
                lo mismo sin insinuar un cero. */}
            <span className="hidden h-1 w-[86px] shrink-0 overflow-hidden rounded-full bg-surface-sunken sm:block">
              {o.participacion !== null && (
                <span className="block h-1 rounded-full bg-accent" style={{ width: `${o.participacion}%` }} />
              )}
            </span>
            <span className="w-[104px] shrink-0 text-right">
              {o.total === null ? <Nulo>sin importe</Nulo> : <Num className="text-ink">{plata(o.total)}</Num>}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}

/**
 * QUÉ NOS PROVEE. El concepto va tal cual está escrito en el comprobante: todavía no hay catálogo
 * de insumos y partir el texto por el guión inventaría un rubro que la fuente no declara.
 */
export function ConceptosProvistos({ filas, total }: { filas: ConceptoProvisto[]; total: number }) {
  return (
    <section data-testid="conceptos-provistos">
      <div className="mb-2.5 flex items-baseline justify-between gap-3">
        <Eyebrow>Qué nos provee</Eyebrow>
        <Num className="text-faint">{filas.length < total ? `${filas.length} de ${total}` : total}</Num>
      </div>
      {filas.length === 0 ? (
        <Vacio>Ningún comprobante de este proveedor trae un concepto escrito.</Vacio>
      ) : (
        <Tabla testid="tabla-conceptos" minWidth={420}>
          <THead>
            <Th>Concepto</Th>
            <Th num>Comprobantes</Th>
            <Th num>Última vez</Th>
          </THead>
          <tbody>
            {filas.map((c) => (
              <Tr key={c.concepto} compacta>
                <Td fuerte className="max-w-0 truncate">{c.concepto}</Td>
                <Td num>{c.comprobantes}</Td>
                <Td num className="text-muted">{fecha(c.ultima)}</Td>
              </Tr>
            ))}
          </tbody>
        </Tabla>
      )}
      <p className="mt-2 text-[11px] leading-relaxed text-faint">
        Sale de lo escrito en cada comprobante. No hay catálogo de insumos: por eso no hay precio
        unitario ni variación, y el concepto se muestra tal como lo cargó quien hizo la compra.
      </p>
    </section>
  )
}

/**
 * LA ACTIVIDAD DE LA FICHA — `COMPONENTS.md` §Timeline y §Anatomía de ficha de entidad.
 *
 * Un proveedor no tiene tabla de eventos: lo que le pasó SON sus comprobantes. Cada uno se escribe
 * como el evento que es —cuándo, de qué tipo de papel, qué se compró, a qué obra y por cuánto— y se
 * muestran los últimos, con la salida a la lista completa. Los cuatrocientos comprobantes de un
 * corralón en su ficha no son transparencia: esconden los tres que importan entre 397 que no.
 */
export function MovimientosProveedor({
  filas,
  total,
  verTodoHref,
}: {
  filas: ComprobanteProveedor[]
  total: number
  verTodoHref: string
}) {
  const eventos: Evento[] = filas.map((f) => ({
    id: f.id,
    fecha: f.fecha ? fecha(f.fecha) : 'sin fecha',
    tipo: f.tipo?.trim() || 'comprobante',
    texto: (
      <>
        <span className="block truncate">{f.concepto?.trim() || 'sin concepto'}</span>
        <span className={`block truncate text-[11px] ${f.obra_texto?.trim() ? 'text-faint' : 'text-warn'}`}>
          {f.obra_texto?.trim() || 'sin imputar'}
        </span>
      </>
    ),
    // SIN IMPORTE NO ES $ 0. La columna de la derecha se deja vacía y el hueco dice lo que un cero
    // mentiría: que la compra existió y no costó nada.
    derecha: f.total === null || f.total === undefined
      ? <span className="text-[11.5px] font-normal text-faint">sin importe</span>
      : plata(f.total),
    tono: f.obra_texto?.trim() ? undefined : 'warn',
  }))
  return (
    <section className="mt-6" data-testid="movimientos-proveedor">
      <Eyebrow className="mb-1.5">Últimos movimientos</Eyebrow>
      <Timeline
        eventos={eventos}
        total={total}
        testid="timeline-proveedor"
        vacio="Ningún comprobante de Compras llegó todavía a este proveedor."
        verTodo={
          <Link href={verTodoHref} data-testid="ver-todos-comprobantes" className="text-muted underline underline-offset-2 hover:text-ink">
            Ver los {total} →
          </Link>
        }
      />
    </section>
  )
}

/** El aside de la ficha: lo que la base sabe del proveedor, y lo que todavía no. */
export function PropiedadesProveedor({
  filas,
  nombres,
  children,
}: {
  filas: { k: string; v: React.ReactNode }[]
  nombres: { nombre_norm: string; comprobantes: number; manual: boolean }[]
  /** Actividad y documentos: el resto de la anatomía del aside, que la página compone. */
  children?: React.ReactNode
}) {
  return (
    <aside className="w-full shrink-0 lg:w-[300px]" data-testid="propiedades-proveedor">
      <Eyebrow className="mb-2.5">Propiedades</Eyebrow>
      <dl className="border-t border-line">
        {filas.map((f) => (
          <div key={f.k} className="flex items-baseline justify-between gap-3 border-b border-[#EFEEEA] py-2">
            <dt className="shrink-0 text-[12px] text-faint">{f.k}</dt>
            <dd className="min-w-0 truncate text-right text-[12.5px] text-ink">{f.v}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-6">
        <Eyebrow className="mb-2.5">Nombres de Compras vinculados</Eyebrow>
        {nombres.length === 0 ? (
          <p className="text-[12px] leading-relaxed text-muted" data-testid="sin-nombres-vinculados">
            Ningún texto de la pestaña Compras apunta a esta ficha todavía. Por eso no hay
            comprobantes: se vinculan desde{' '}
            <Link href="/administracion/proveedores?vista=resolver" className="text-ink underline">
              nombres sin resolver
            </Link>.
          </p>
        ) : (
          <ul className="space-y-1.5" data-testid="nombres-vinculados">
            {nombres.map((n) => (
              <li key={n.nombre_norm} className="flex items-baseline gap-3">
                <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink-soft">{n.nombre_norm}</span>
                <Num className="shrink-0 text-faint">{n.comprobantes}</Num>
                {n.manual && <span className="shrink-0 text-[10.5px] text-faint">a mano</span>}
              </li>
            ))}
          </ul>
        )}
      </div>

      {children}
    </aside>
  )
}
