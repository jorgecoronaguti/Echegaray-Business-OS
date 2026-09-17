// ESTADO DEL GASTO (la vista por defecto) Y RESUMEN — las dos lecturas acumuladas de la cartera.
import Link from 'next/link'
import { aUrl, type Filtros } from '../services/filtros'
import { millones, pctEntero, horasTexto } from '../services/formato'
import { agruparPorSemaforo, fraseDeObra, ORDEN_GRUPOS, type Grupo, type ObraAnalitica } from '../services/obras'
import { cifrasResumen, composicion, masGastan, porCliente } from '../services/agregados'
import { Anillo, Ausente, Cifras, Subtitulo, Titulo, Valor } from './Piezas'

const TONO_GRUPO: Record<Grupo, 'neg' | 'warn' | 'pos' | 'dato'> = {
  pasadas: 'neg', cerca: 'warn', dentro: 'pos', sinMovimiento: 'dato', sinPresupuesto: 'dato',
}
const TEXTO_GRUPO: Record<Grupo, string> = {
  pasadas: 'text-neg', cerca: 'text-warn', dentro: 'text-pos', sinMovimiento: 'text-faint', sinPresupuesto: 'text-faint',
}

export function VistaEstado({ obras }: { obras: ObraAnalitica[] }) {
  const grupos = agruparPorSemaforo(obras)
  const n = (g: Grupo) => grupos.get(g)?.length ?? 0
  return (
    <>
      <Titulo titulo="Estado del gasto"
        linea={`${obras.length} obras · gastado contra presupuesto, a la fecha · cerca del límite desde el 80 %`} />
      <dl className="mb-8 grid grid-cols-2 border-y border-line lg:grid-cols-5">
        {ORDEN_GRUPOS.map((g) => (
          <div key={g.clave} className="border-line py-4 pr-4 odd:border-r lg:border-r lg:px-4 lg:first:pl-0 lg:last:border-r-0">
            <dt className="text-xs text-faint">{g.rotulo}</dt>
            <dd className={`mt-1 text-3xl font-semibold tabular-nums ${n(g.clave) ? TEXTO_GRUPO[g.clave] : 'text-faint'}`}>{n(g.clave)}</dd>
          </div>
        ))}
      </dl>
      {ORDEN_GRUPOS.map((g) => {
        const lista = grupos.get(g.clave) ?? []
        if (!lista.length) return null
        return (
          <section key={g.clave}>
            <Subtitulo derecha={`${lista.length} ${lista.length === 1 ? 'obra' : 'obras'}`}>{g.rotulo}</Subtitulo>
            <ul className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-5">
              {lista.map((o) => <AnilloDeObra key={o.id} o={o} />)}
            </ul>
          </section>
        )
      })}
    </>
  )
}

function AnilloDeObra({ o }: { o: ObraAnalitica }) {
  const sinPres = o.presupuesto == null
  const segunda = o.costoObjetivo != null && o.precio != null ? `contrato ${millones(o.precio)}` : null
  return (
    <li className="flex flex-col items-center text-center">
      <Anillo proporcion={o.avanceGasto} tono={TONO_GRUPO[o.grupo]}
        centro={sinPres || o.avanceGasto == null ? <Ausente>—</Ausente> : <span className={TEXTO_GRUPO[o.grupo]}>{pctEntero(o.avanceGasto ?? 0)}</span>} />
      <p className="mt-2 line-clamp-2 text-sm font-medium text-ink">{o.nombre}</p>
      <p className="text-xs text-faint">{o.clienteNombre}</p>
      {sinPres ? null : (
        <p className="mt-1 text-xs tabular-nums text-muted">
          <Valor v={millones(o.gasto.total)} falta="ninguno" /> de {millones(o.presupuesto)}
          {o.costoObjetivo != null ? ' (costo objetivo)' : ''}
        </p>
      )}
      {segunda ? <p className="text-xs tabular-nums text-faint">{segunda}</p> : null}
      <p className={`mt-1 text-xs ${o.grupo === 'pasadas' ? 'text-neg' : sinPres ? 'text-faint' : 'text-muted'}`}>{fraseDeObra(o)}</p>
    </li>
  )
}

const QUE_NO_SE_PUEDE = [
  { que: 'Margen por obra', falta: 'lo que queda por gastar: sin costo a terminar, contrato menos gasto no es margen' },
  { que: 'Lo cotizado según el presupuesto', falta: 'vincular cada obra con su presupuesto aprobado' },
  { que: 'Productividad', falta: 'avance medido por actividad; hoy las horas no se cruzan con cantidades' },
  { que: 'Certificado contra avance', falta: 'que el sincronizador de Cobranzas escriba la obra de cada certificado' },
]

export function VistaResumen({ obras, sinObra, filtros }: {
  obras: ObraAnalitica[]
  sinObra: ReadonlyMap<string, number | null>
  filtros: Filtros
}) {
  const c = cifrasResumen(obras, sinObra)
  const clientes = porCliente(obras, sinObra)
  const top = masGastan(obras)
  const comp = composicion(obras)
  return (
    <>
      <Titulo titulo="Resumen" linea={`${obras.length} obras de ${clientes.length} clientes · acumulado a la fecha`} />
      <Cifras cifras={[
        { rotulo: 'Contratado con papel', valor: millones(c.contratadoConPapel) },
        { rotulo: 'Gastado en obras', valor: millones(c.gastadoEnObras), falta: 'sin movimiento' },
        { rotulo: 'Sin obra asignada', valor: millones(c.sinObraAsignada), falta: 'ninguno' },
        { rotulo: 'Horas en obra', valor: horasTexto(c.horasEnObra), falta: 'sin horas' },
        { rotulo: 'Obras sin precio', valor: String(c.obrasSinPrecio), tono: c.obrasSinPrecio ? 'warn' : undefined },
      ]} />
      <Subtitulo derecha="parte del gasto total">Por cliente</Subtitulo>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm tabular-nums">
          <thead className="text-xs text-faint">
            <tr className="border-b border-line-strong text-right">
              <th className="py-2 text-left font-normal">Cliente</th><th className="font-normal">Parte</th>
              <th className="font-normal">Gastado</th><th className="font-normal">Contratado</th>
              <th className="font-normal">Queda</th><th className="font-normal">Horas</th>
            </tr>
          </thead>
          <tbody>
            {clientes.map((f) => (
              <tr key={f.clienteId} className="h-fila border-b border-line-hairline text-right hover:bg-surface-sunken">
                <td className="text-left">
                  <Link prefetch={false} className="font-medium text-ink hover:underline"
                    href={aUrl({ ...filtros, vista: 'contrato', cliente: f.slug })}>{f.nombre}</Link>
                </td>
                <td className="text-lg font-semibold text-ink"><Valor v={pctEntero(f.parte)} falta="—" /></td>
                <td><Valor v={millones(f.gastado)} falta="sin movimiento" /></td>
                <td><Valor v={millones(f.contratado)} falta="sin precio" /></td>
                <td className={f.queda != null && f.queda < 0 ? 'text-neg' : ''}><Valor v={millones(f.queda)} falta="—" /></td>
                <td><Valor v={horasTexto(f.horas)} falta="sin horas" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="grid gap-x-10 lg:grid-cols-2">
        <section>
          <Subtitulo>Las {top.length} obras que más gastan</Subtitulo>
          <ol className="text-sm tabular-nums">
            {top.map((o, i) => (
              <li key={o.id} className="flex h-10 items-center gap-3 border-b border-line-hairline">
                <span className="w-5 text-faint">{i + 1}</span>
                <span className="min-w-0 flex-1 truncate text-ink">{o.nombre}</span>
                <span className="text-ink">{millones(o.gasto.total)}</span>
              </li>
            ))}
          </ol>
        </section>
        <section>
          <Subtitulo>De qué está hecho el gasto</Subtitulo>
          {comp ? (
            <dl className="grid grid-cols-3 text-center">
              {[['Mano de obra', comp.manoObra], ['Subcontratos', comp.subcontratos], ['Materiales', comp.materiales]].map(([r, v]) => (
                <div key={r as string}><dd className="text-2xl font-semibold tabular-nums text-ink">{pctEntero(v as number)}</dd><dt className="text-xs text-faint">{r}</dt></div>
              ))}
            </dl>
          ) : <Ausente>sin movimiento</Ausente>}
          <Subtitulo>Lo que la base no puede afirmar</Subtitulo>
          <ul className="text-sm">
            {QUE_NO_SE_PUEDE.map((x) => (
              <li key={x.que} className="border-b border-line-hairline py-2">
                <span className="font-medium text-ink">{x.que}</span>
                <span className="block text-xs text-muted">Falta: {x.falta}.</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  )
}
