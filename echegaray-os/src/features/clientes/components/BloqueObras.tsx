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
//
// ═══ LA ETAPA ES UNA COLUMNA, NO UN SUBTÍTULO (Design Handoff V2) ═══
//
// El handoff pide `Obra | Etapa | Avance | Contratado | Costo real`. La etapa vivía como línea
// chiquita debajo del nombre, y ahí no se puede barrer con la vista: para saber cuáles de las tres
// obras están en cierre había que leer tres subtítulos de 11px en vez de una columna.

import Link from 'next/link'
import { Nulo, Tabla, THead, Th, Tr, Td, Vacio } from '@/shared/components/ds'
import { FormAccion, type AccionFormulario } from '@/shared/components/ui'
import { CamposObra } from '@/features/obras/components/CamposObra'
import { ETAPA_LABEL, type ObraPanel } from '@/features/obras/types'
import { plata } from '@/features/obras/components/formato'

function FilaObra({ o }: { o: ObraPanel }) {
  return (
    <Tr>
      <Td fuerte>
        <Link href={`/obras/${o.obra_id}`} className="text-[13px] font-medium text-ink hover:underline">
          {o.nombre}
        </Link>
        {/* El estado NO es la etapa: una obra pausada sigue teniendo su etapa. Va pegado al nombre
            porque explica por qué la fila puede no estar donde se la busca. */}
        {o.estado !== 'activa' && <Nulo className="ml-2 text-[11px]">{o.estado}</Nulo>}
      </Td>
      <Td>
        {o.etapa ? ETAPA_LABEL[o.etapa] : <Nulo>etapa sin declarar</Nulo>}
      </Td>
      <Td>
        {o.avance_pct == null ? (
          <Nulo>{o.n_actividades ? 'sin avance cargado' : 'sin cronograma'}</Nulo>
        ) : (
          <span className="flex items-baseline gap-2">
            <span className="font-mono text-[12.5px] tabular-nums text-ink">{o.avance_pct}%</span>
            {/* La cobertura va pegada al número, igual que en el portafolio y en el chat: un 28%
                medido sobre 2 de 40 actividades no es el mismo 28% que sobre 40 de 40. */}
            <span className="whitespace-nowrap font-mono text-[11px] tabular-nums text-faint">
              {o.n_actividades_medidas}/{o.n_actividades}
            </span>
          </span>
        )}
      </Td>
      <Td num className="text-muted">{plata(o.monto_contratado)}</Td>
      <Td num fuerte>{plata(o.costo_real)}</Td>
    </Tr>
  )
}

export function BloqueObras({
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
      {/* EL ALTA VA ARRIBA. Debajo de la lista, «nueva obra» no la encuentra nadie. La obra nace
          COLGADA DE ESTE CLIENTE: que el cliente venga del contexto y no de un desplegable es lo que
          impide crear una obra huérfana. */}
      {puedeEditar && (
        <details className="rounded-card border border-line bg-surface" data-testid="alta-obra">
          <summary className="cursor-pointer select-none px-3.5 py-2 text-[12.5px] text-ink">+ Nueva obra de este cliente</summary>
          <div className="border-t border-line p-3.5">
            <FormAccion accion={crearObra} testid="form-obra" enviar="Crear obra" limpiarAlOk mensajeOk="Obra creada.">
              {/* La obra nace COLGADA DE ESTE CLIENTE. Hasta que existió `cliente_id`, las tres
                  obras de La Estrella eran tres cadenas de texto iguales por casualidad. */}
              <input type="hidden" name="cliente_id" value={clienteId} />
              <CamposObra />
            </FormAccion>
          </div>
        </details>
      )}

      {obras.length === 0 ? (
        <Vacio>
          {archivadas === 0
            ? 'Este cliente no tiene ninguna obra. Se crea desde acá, colgada de este cliente.'
            : 'Todas las obras de este cliente están archivadas.'}
        </Vacio>
      ) : (
        <Tabla testid="obras-del-cliente" minWidth={640}>
          <THead>
            <Th>Obra</Th>
            <Th className="w-[150px]">Etapa</Th>
            <Th className="w-[130px]">Avance</Th>
            <Th num className="w-[150px]">Contratado</Th>
            <Th num className="w-[150px]">Costo real</Th>
          </THead>
          <tbody>{obras.map((o) => <FilaObra key={o.obra_id} o={o} />)}</tbody>
        </Tabla>
      )}

      {/* La puerta de vuelta, igual que en el portafolio: archivar no puede parecerse a borrar. */}
      <p className="text-[11px] leading-relaxed text-faint" data-testid="pie-archivadas-cliente">
        {archivadas > 0 && (
          conArchivadas ? (
            <>
              Se muestran también {archivadas} obra{archivadas === 1 ? '' : 's'} archivada{archivadas === 1 ? '' : 's'}.{' '}
              <Link href={urlSinArchivadas} className="text-ink underline underline-offset-2">Ocultarlas</Link>.{' '}
            </>
          ) : (
            <>
              {archivadas} obra{archivadas === 1 ? '' : 's'} archivada{archivadas === 1 ? '' : 's'} fuera de esta lista.{' '}
              <Link href={urlArchivadas} className="text-ink underline underline-offset-2" data-testid="ver-archivadas-cliente">Verlas</Link>.{' '}
            </>
          )
        )}
        El contratado y el costo salen de la obra: acá no se calcula nada propio.
      </p>
    </div>
  )
}
