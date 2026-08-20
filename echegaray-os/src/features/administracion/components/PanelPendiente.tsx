// EL PANEL DE UN TEXTO PENDIENTE — el detalle que hace falta para poder decidir, y la resolución.
//
// ═══ POR QUÉ LA RESOLUCIÓN ES SIEMPRE MÚLTIPLE, Y POR QUÉ ESO ES SEGURO ═══
//
// El encargo pide *"selección múltiple únicamente cuando sea seguro"*. Acá el lote no es una opción
// que se marca: es la única resolución posible. Lo que se escribe es UNA fila de `obra_alias` para
// la clave, y esa fila vale para todas las filas que dicen lo mismo — las de la lista y las que
// entren mañana por el sincronizador. Por eso el panel muestra las N filas ANTES de confirmar: no
// para elegir cuáles, sino para que quien resuelve vea todo lo que va a mover.
//
// Lo que NO existe es un "resolver todo lo seleccionado" sobre claves distintas. Dos textos
// distintos son dos preguntas distintas y se contestan por separado.
//
// ═══ LA SUGERENCIA SE MUESTRA CON SU MOTIVO O NO SE MUESTRA ═══
//
// Un nombre de obra propuesto sin decir de dónde salió es indistinguible de una adivinanza. Cuando
// la evidencia es un juicio humano sobre el MISMO texto, la obra viene preseleccionada; cuando es
// una inferencia por el proveedor, se dice cuál es y el desplegable queda en blanco a propósito.

import Link from 'next/link'
import { Campo, CTRL, FormAccion, type AccionFormulario } from '@/shared/components/ui'
import { Eyebrow, Nulo, Num, Tabla, Td, Th, THead, Tr } from '@/shared/components/ds'
import { fecha, plata } from '@/features/obras/components/formato'
import { ETIQUETA_TIPO, type GrupoPendiente } from '../services/imputacionService'

export interface ObraElegible {
  obra_id: string
  nombre: string
}

function Detalle({ grupo }: { grupo: GrupoPendiente }) {
  return (
    <Tabla testid="detalle-pendiente" minWidth={0}>
      <THead>
        <Th>Tipo</Th>
        <Th>Fecha</Th>
        <Th>Descripción</Th>
        <Th>Importe / recurso</Th>
      </THead>
      <tbody>
        {grupo.filas.map((f) => (
          <Tr key={`${f.tabla}-${f.id}`} compacta data-testid="fila-detalle">
            <Td className="w-[90px]">{ETIQUETA_TIPO[f.tipo]}</Td>
            <Td num className="w-[80px]">{f.fecha ? fecha(f.fecha) : <Nulo>sin fecha</Nulo>}</Td>
            <Td fuerte>
              {f.descripcion}
              {/* LA TRAZABILIDAD DEL ORIGEN ES LA TABLA MÁS EL IDENTIFICADOR: sin el segundo, «salió
                  de compras» no permite ir a buscar el comprobante y confirmarlo. */}
              <span className="block truncate text-[11px] text-faint">
                {f.tabla}{f.referencia ? ` · ${f.referencia}` : ''}{f.fuente ? ` · ${f.fuente}` : ''}
              </span>
            </Td>
            <Td num>
              {f.importe != null ? plata(f.importe) : <span className="text-[12px] text-muted">{f.recurso ?? '—'}</span>}
            </Td>
          </Tr>
        ))}
      </tbody>
    </Tabla>
  )
}

export function PanelPendiente({ grupo, obras, resolver, cerrarHref, nombreDeObra }: {
  grupo: GrupoPendiente
  obras: ObraElegible[]
  resolver: AccionFormulario
  cerrarHref: string
  nombreDeObra: (obraId: string) => string
}) {
  const sug = grupo.sugerencia
  return (
    <aside
      data-testid="panel-pendiente"
      className="w-full shrink-0 border-t border-line pt-4 lg:w-[392px] lg:border-l lg:border-t-0 lg:py-1 lg:pl-6 lg:pt-0"
    >
      <div className="flex items-baseline gap-2.5">
        <h2 className="min-w-0 flex-1 truncate font-mono text-[14px] font-semibold text-ink">{grupo.textos[0]}</h2>
        <Link
          href={cerrarHref} data-testid="cerrar-panel" aria-label="Cerrar el panel"
          className="shrink-0 text-[12px] leading-none text-faint transition-colors hover:text-ink"
        >✕</Link>
      </div>
      <p className="mt-1.5 text-[12px] text-muted">
        {grupo.cantidad} fila(s) en {grupo.tipos.map((t) => ETIQUETA_TIPO[t]).join(' · ')} ·{' '}
        {grupo.importe > 0 ? <Num className="text-muted">{plata(grupo.importe)}</Num> : <Nulo>sin importe asociado</Nulo>}
      </p>
      <p className="mt-1 text-[11px] text-faint">clave «{grupo.clave}»</p>

      <div className="mt-5">
        <Eyebrow className="mb-2">Las filas que va a mover</Eyebrow>
        <Detalle grupo={grupo} />
      </div>

      <div className="mt-5 border-t border-line pt-4">
        {sug
          ? (
              <p data-testid="motivo-sugerencia" className="mb-4 text-[12px] leading-relaxed text-muted">
                <span className="font-medium text-ink">Sugerido: {nombreDeObra(sug.obra_id)}.</span>{' '}
                {sug.motivo}
                {!sug.preseleccionar && ' Es una inferencia, no un hecho: elegí la obra a mano.'}
              </p>
            )
          : (
              <p data-testid="sin-sugerencia" className="mb-4 text-[12px] leading-relaxed text-muted">
                <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-faint">Sugerido </span><br />
                Sin evidencia previa para este texto. No se propone obra por parecido de nombre.
              </p>
            )}

        <FormAccion
          accion={resolver}
          testid="form-resolver"
          enviar={`Resolver ${grupo.cantidad} fila(s)`}
          mensajeOk="Resuelto. El costo se reimputa solo."
        >
          <input type="hidden" name="clave" value={grupo.clave} />
          <input type="hidden" name="ejemplo" value={grupo.textos[0]} />
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            <Campo label="¿Qué es?">
              <select name="clasificacion" defaultValue="obra" className={CTRL} data-testid="clasificacion">
                <option value="obra">Una obra</option>
                <option value="mantenimiento">Un mantenimiento</option>
                <option value="indirecto">Costo de estructura, no de obra</option>
                <option value="excluido">No corresponde contarlo</option>
              </select>
            </Campo>
            <Campo label="¿Cuál?" ayuda="En blanco si no es una obra.">
              <select
                name="obra_id"
                defaultValue={sug?.preseleccionar ? sug.obra_id : ''}
                className={CTRL}
                data-testid="obra-destino"
              >
                <option value="">no es una obra</option>
                {obras.map((o) => (
                  <option key={o.obra_id} value={o.obra_id}>{o.nombre}</option>
                ))}
              </select>
            </Campo>
          </div>
        </FormAccion>
        <p className="mt-4 text-[11px] leading-relaxed text-faint">
          Resolver escribe una fila en el diccionario de obras y vale para todas las filas que digan
          lo mismo — hoy y mañana. Nunca en lote.
        </p>
      </div>
    </aside>
  )
}
