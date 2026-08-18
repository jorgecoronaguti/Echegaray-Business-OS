// OBRAS DEL CLIENTE — el portafolio de esta relación, con acceso directo a cada una.
//
// MISMO CRITERIO QUE EL PORTAFOLIO GENERAL: archivada = `cerrada`, y `pausada` se sigue viendo. Si
// el cliente escondiera obras con una regla distinta de la de `/obras`, la misma obra estaría o no
// estaría según por dónde se entre — que es exactamente el problema que el eje canónico vino a
// resolver.
//
// FRONTERA: acá no se calcula un peso. El contratado, el costo y el avance salen de `obra_panel`, o
// sea de Compras y de Cotización. Y no hay un «avance del cliente»: promediar obras de tamaños
// distintos daría un número que no significa nada.

import Link from 'next/link'
import { Callout, FormAccion, type AccionFormulario } from '@/shared/components/ui'
import { CamposObra } from '@/features/obras/components/CamposObra'
import { ETAPA_LABEL, type ObraPanel } from '@/features/obras/types'
import { plata } from '@/features/obras/components/formato'

function FilaObra({ o }: { o: ObraPanel }) {
  return (
    <tr className="border-b border-line/60 last:border-0 hover:bg-sky-50/50">
      <td className="px-4 py-2.5">
        <Link href={`/obras/${o.obra_id}`} className="block">
          <span className="text-[13px] font-semibold text-ink hover:underline">{o.nombre}</span>
          <span className="block text-[11px] text-faint">
            {o.etapa ? ETAPA_LABEL[o.etapa] : 'etapa sin declarar'}
            {o.estado !== 'activa' && ` · ${o.estado}`}
          </span>
        </Link>
      </td>
      <td className="px-3 py-2.5">
        {o.avance_pct == null ? (
          <span className="text-[12px] text-faint">{o.n_actividades ? 'sin avance cargado' : 'sin cronograma'}</span>
        ) : (
          <span className="flex items-center gap-2">
            <span className="h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-slate-100">
              <span className="block h-full rounded-full bg-sky-600" style={{ width: `${Math.min(100, o.avance_pct)}%` }} />
            </span>
            <span className="w-9 shrink-0 text-right text-[12px] tabular-nums text-ink">{o.avance_pct}%</span>
            {/* La cobertura va pegada al número, igual que en el portafolio y en el chat. */}
            <span className="whitespace-nowrap text-[11px] text-faint">
              {o.n_actividades_medidas}/{o.n_actividades}
            </span>
          </span>
        )}
      </td>
      <td className="px-3 py-2.5 text-right text-[12px] tabular-nums text-muted">{plata(o.monto_contratado)}</td>
      <td className="px-3 py-2.5 text-right text-[12px] tabular-nums text-ink">{plata(o.costo_real)}</td>
    </tr>
  )
}

export function TabObras({
  obras, archivadas, conArchivadas, urlArchivadas, urlSinArchivadas, clienteId, crearObra,
  puedeEditar = true,
}: {
  obras: ObraPanel[]
  /** Cuántas quedaron fuera de la lista. Es el conteo, no la lista: si es 0 no hay puerta que abrir. */
  archivadas: number
  conArchivadas: boolean
  urlArchivadas: string
  urlSinArchivadas: string
  clienteId: string
  crearObra: AccionFormulario
  /** Crear una obra es de Administración. Ver las del cliente, no. */
  puedeEditar?: boolean
}) {
  return (
    <div className="space-y-3">
      {obras.length === 0 ? (
        <Callout tono="neutral">
          {archivadas === 0
            ? 'Este cliente no tiene ninguna obra. Se crea acá abajo.'
            : 'Todas las obras de este cliente están archivadas.'}
        </Callout>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line bg-white">
          <table data-testid="obras-del-cliente" className="w-full min-w-[620px] text-left">
            <thead>
              <tr className="border-b border-line text-[10px] uppercase tracking-wide text-faint">
                <th className="px-4 py-2.5 font-medium">Obra</th>
                <th className="px-3 py-2.5 font-medium">Avance</th>
                <th className="px-3 py-2.5 text-right font-medium">Contratado</th>
                <th className="px-3 py-2.5 text-right font-medium">Costo real</th>
              </tr>
            </thead>
            <tbody>{obras.map((o) => <FilaObra key={o.obra_id} o={o} />)}</tbody>
          </table>
        </div>
      )}

      {/* La puerta de vuelta, igual que en el portafolio: archivar no puede parecerse a borrar. */}
      {archivadas > 0 && (
        <p className="text-[12px] text-faint" data-testid="pie-archivadas-cliente">
          {conArchivadas ? (
            <>
              Se muestran también {archivadas} obra{archivadas === 1 ? '' : 's'} archivada{archivadas === 1 ? '' : 's'}.{' '}
              <Link href={urlSinArchivadas} className="text-ink underline underline-offset-2">Ocultarlas</Link>.
            </>
          ) : (
            <>
              {archivadas} obra{archivadas === 1 ? '' : 's'} archivada{archivadas === 1 ? '' : 's'} fuera de esta lista.{' '}
              <Link href={urlArchivadas} className="text-ink underline underline-offset-2" data-testid="ver-archivadas-cliente">Verlas</Link>.
            </>
          )}
        </p>
      )}

      {puedeEditar && (
      <details className="rounded-xl border border-line bg-white" data-testid="alta-obra">
        <summary className="cursor-pointer px-4 py-2.5 text-[13px] font-medium text-ink">Nueva obra de este cliente</summary>
        <div className="border-t border-line p-4">
          <FormAccion accion={crearObra} testid="form-obra" enviar="Crear obra" limpiarAlOk mensajeOk="Obra creada.">
            {/* La obra nace COLGADA DE ESTE CLIENTE. Que el cliente venga del contexto y no de un
                desplegable es lo que impide crear una obra huérfana: hasta que existió `cliente_id`,
                las tres obras de La Estrella eran tres cadenas de texto iguales por casualidad. */}
            <input type="hidden" name="cliente_id" value={clienteId} />
            <CamposObra />
          </FormAccion>
        </div>
      </details>
      )}
    </div>
  )
}
