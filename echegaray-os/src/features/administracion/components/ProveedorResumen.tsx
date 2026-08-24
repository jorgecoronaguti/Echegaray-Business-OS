// LOS BLOQUES DERIVADOS DE LA FICHA DEL PROVEEDOR.
//
// Todo lo que se dibuja acá sale de los comprobantes. No hay un campo «rubro», ni «plazo de pago»,
// ni «insumos que provee» guardado en ninguna parte — y eso es a propósito: el handoff dice que las
// relaciones de un proveedor se DERIVAN de las operaciones. Lo que la base todavía no puede
// contestar se escribe como ausencia, con su nombre.

import Link from 'next/link'
import { Estado, Eyebrow, FilaTotal, Num, Nulo, Tabla, THead, Th, Timeline, Tr, Td, Vacio } from '@/shared/components/ds'
import type { Evento, TonoEstado } from '@/shared/components/ds'
import { fecha, plata } from '@/features/obras/components/formato'
import { CuerpoDatos, DatoFicha, FilaTarjeta, TarjetaFicha } from './FichaCanonica'
import type {
  CompraPorObra, ComprobanteProveedor, ConceptoProvisto, PaqueteDelProveedor,
} from '../services/fichaProveedor'

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
    <TarjetaFicha titulo="Últimos movimientos" indicador={total || null} testid="movimientos-proveedor">
      <div className="px-3.5 py-3">
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
      </div>
    </TarjetaFicha>
  )
}

/** LOS PAQUETES CONTRATADOS — el bloque del canónico 23 que sí tiene fuente desde el 21/08.
 *
 * Sale de `public.subcontrato`. NO lleva barra de avance: la tabla guarda estado, no porcentaje, y
 * pintar «terminado ⇒ 100 %» convertiría una decisión administrativa en una medición de obra.
 */
export function PaquetesContratados({ filas, error }: { filas: PaqueteDelProveedor[]; error?: string | null }) {
  if (error) {
    return (
      <section data-testid="paquetes-error">
        <Eyebrow className="mb-1.5">Paquetes contratados</Eyebrow>
        <p className="text-[12px] leading-relaxed text-warn">
          No pude leer los paquetes de subcontrato: esta ficha no puede decir si tiene alguno.
        </p>
      </section>
    )
  }
  const contratado = filas.reduce((a, p) => a + (p.precio ?? 0), 0)
  const conPrecio = filas.filter((p) => p.precio !== null).length
  return (
    <section data-testid="paquetes-proveedor">
      <div className="mb-2.5 flex items-baseline justify-between gap-3">
        <Eyebrow>Paquetes contratados</Eyebrow>
        <Num className="text-faint">{filas.length} {filas.length === 1 ? 'paquete' : 'paquetes'}</Num>
      </div>
      {filas.length === 0 ? (
        <Vacio>
          Ningún paquete de subcontrato cuelga de este proveedor en las obras que podés ver.
        </Vacio>
      ) : (
        <Tabla testid="tabla-paquetes" minWidth={520}>
          <THead>
            <Th>Obra</Th>
            <Th>Trabajo</Th>
            <Th>Estado</Th>
            <Th num>Contrato</Th>
          </THead>
          <tbody>
            {filas.map((p) => (
              <Tr key={p.id} compacta>
                <Td fuerte className="max-w-0 truncate">{p.obra}</Td>
                <Td className="max-w-0 truncate text-muted">{p.trabajo}</Td>
                <Td className="w-[130px]">
                  <Estado tono={TONO_PAQUETE[p.estado] ?? 'pendiente'} clave={p.estado}>
                    {ROTULO_PAQUETE[p.estado] ?? p.estado}
                  </Estado>
                </Td>
                {/* SIN PRECIO NO ES $ 0: el paquete existe y todavía no se pactó cuánto vale. */}
                <Td num className="w-[130px]">
                  {p.precio === null ? <Nulo>sin precio</Nulo> : <Num>{plata(p.precio)}</Num>}
                </Td>
              </Tr>
            ))}
          </tbody>
          <tfoot>
            <FilaTotal>
              <Td fuerte><Num className="text-ink">{filas.length}</Num></Td>
              <Td />
              <Td>
                {conPrecio < filas.length && (
                  <span className="text-[11.5px] font-normal text-warn">
                    {filas.length - conPrecio} sin precio
                  </span>
                )}
              </Td>
              <Td num>{conPrecio === 0 ? <Nulo>sin precio</Nulo> : <Num className="text-ink">{plata(contratado)}</Num>}</Td>
            </FilaTotal>
          </tfoot>
        </Tabla>
      )}
      <p className="mt-2 text-[11px] leading-relaxed text-faint">
        El canónico dibuja además el avance de cada paquete. `subcontrato` guarda estado, no
        porcentaje: derivar «terminado = 100 %» sería inventar una certificación.
      </p>
    </section>
  )
}

const TONO_PAQUETE: Record<string, TonoEstado> = {
  previsto: 'pendiente', contratado: 'curso', en_curso: 'curso', terminado: 'pos', anulado: 'neg',
}
const ROTULO_PAQUETE: Record<string, string> = {
  previsto: 'Previsto', contratado: 'Contratado', en_curso: 'En curso',
  terminado: 'Terminado', anulado: 'Anulado',
}

/** EL ASIDE DE LA FICHA, EN TARJETAS — la anatomía del canónico 23.
 *
 * Antes eran tres bloques sueltos con un `Eyebrow` cada uno, colgando del fondo del canvas. El zip
 * los dibuja como TARJETAS con borde, encabezado propio y contador a la derecha, iguales a las de
 * la ficha de persona y la de cliente: es el mismo componente (`TarjetaFicha`), no una copia. Un
 * aside sin caja se lee como el pie de la pantalla y no como la columna de propiedades.
 */
export function PropiedadesProveedor({
  datos,
  nombres,
  children,
}: {
  datos: { k: string; v: React.ReactNode | null; mono?: boolean; falta?: string }[]
  nombres: { nombre_norm: string; comprobantes: number; manual: boolean }[]
  /** Actividad y documentos: el resto de la anatomía del aside, que la página compone. */
  children?: React.ReactNode
}) {
  return (
    <aside className="flex w-full shrink-0 flex-col gap-3.5 lg:w-[320px]" data-testid="propiedades-proveedor">
      <TarjetaFicha titulo="Datos" testid="tarjeta-datos-proveedor">
        <CuerpoDatos>
          {datos.map((d) => <DatoFicha key={d.k} k={d.k} v={d.v} mono={d.mono} falta={d.falta ?? 'sin cargar'} />)}
        </CuerpoDatos>
      </TarjetaFicha>

      <TarjetaFicha
        titulo="Nombres de Compras vinculados"
        indicador={nombres.length || null}
        testid="tarjeta-nombres-proveedor"
      >
        {nombres.length === 0 ? (
          <p className="px-3.5 py-3 text-[12px] leading-relaxed text-muted" data-testid="sin-nombres-vinculados">
            Ningún texto de la pestaña Compras apunta a esta ficha todavía. Por eso no hay
            comprobantes: se vinculan desde{' '}
            <Link href="/administracion/proveedores?vista=resolver" className="text-ink underline">
              nombres sin resolver
            </Link>.
          </p>
        ) : (
          <div data-testid="nombres-vinculados">
            {nombres.map((n) => (
              <FilaTarjeta
                key={n.nombre_norm}
                titulo={n.nombre_norm}
                detalle={n.manual ? 'resuelto a mano' : undefined}
                valor={n.comprobantes}
              />
            ))}
          </div>
        )}
      </TarjetaFicha>

      {children}
    </aside>
  )
}
