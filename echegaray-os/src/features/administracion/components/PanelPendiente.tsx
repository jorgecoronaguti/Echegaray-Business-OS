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
import { fecha, plata } from '@/features/obras/components/formato'
import { ETIQUETA_TIPO, type GrupoPendiente } from '../services/imputacionService'

export interface ObraElegible {
  obra_id: string
  nombre: string
}

function Detalle({ grupo }: { grupo: GrupoPendiente }) {
  return (
    <div className="overflow-x-auto">
      <table data-testid="detalle-pendiente" className="w-full text-left">
        <thead>
          <tr className="border-b border-line text-[10px] uppercase tracking-wide text-faint">
            <th className="px-2 py-1.5 font-medium">Tipo</th>
            <th className="px-2 py-1.5 font-medium">Fecha</th>
            <th className="px-2 py-1.5 font-medium">Descripción</th>
            <th className="px-2 py-1.5 font-medium">Importe / recurso</th>
            <th className="px-2 py-1.5 font-medium">Origen</th>
          </tr>
        </thead>
        <tbody>
          {grupo.filas.map((f) => (
            <tr key={`${f.tabla}-${f.id}`} data-testid="fila-detalle" className="border-b border-line/60 last:border-0">
              <td className="px-2 py-1.5 text-[11px] text-muted">{ETIQUETA_TIPO[f.tipo]}</td>
              <td className="px-2 py-1.5 text-[11px] tabular-nums text-muted">{fecha(f.fecha)}</td>
              <td className="px-2 py-1.5 text-[12px] text-ink">{f.descripcion}</td>
              <td className="px-2 py-1.5 text-[12px] tabular-nums text-ink">
                {f.importe != null ? plata(f.importe) : <span className="text-muted">{f.recurso ?? '—'}</span>}
              </td>
              {/* La trazabilidad del origen es la tabla MÁS el identificador: sin el segundo, "salió
                  de compras" no permite ir a buscar el comprobante y confirmarlo. */}
              <td className="px-2 py-1.5 text-[11px] text-faint">
                {f.tabla}
                {f.referencia ? ` · ${f.referencia}` : ''}
                {f.fuente ? ` · ${f.fuente}` : ''}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
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
      className="w-full shrink-0 border-t border-line bg-surface p-4 lg:w-[27rem] lg:border-l lg:border-t-0"
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-[14px] font-semibold text-ink">{grupo.textos[0]}</h2>
          <p className="text-[11px] text-faint">
            {grupo.cantidad} fila(s) · {grupo.importe > 0 ? plata(grupo.importe) : 'sin importe'} ·
            clave «{grupo.clave}»
          </p>
        </div>
        <Link href={cerrarHref} data-testid="cerrar-panel" className="text-[12px] text-muted hover:text-ink">
          Cerrar
        </Link>
      </div>

      <Detalle grupo={grupo} />

      <div className="mt-4 border-t border-line pt-3">
        {sug
          ? (
              <p data-testid="motivo-sugerencia" className="mb-3 text-[12px] text-muted">
                <span className="font-medium text-ink">Sugerido: {nombreDeObra(sug.obra_id)}.</span>{' '}
                {sug.motivo}
                {!sug.preseleccionar && ' Es una inferencia, no un hecho: elegí la obra a mano.'}
              </p>
            )
          : (
              <p data-testid="sin-sugerencia" className="mb-3 text-[12px] text-muted">
                No hay evidencia para sugerir una obra. No se propone ninguna por parecido de nombre.
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
      </div>
    </aside>
  )
}
