// CONTRATO Y GASTO — por cliente: cuatro anillos (uno por ítem) y la matriz de calor obra × ítem.
//
// La matriz es lo único con fondo de celda del módulo: cuatro grises según el % gastado de lo
// cotizado, y el excedido con borde y texto rojo. Una celda sin cotizado NO lleva fondo: pintarla
// en el gris más claro la leería como «gastó poco de lo cotizado».
import Link from 'next/link'
import { aUrl, type Filtros } from '../services/filtros'
import { horasTexto, millones, pctEntero } from '../services/formato'
import type { ObraAnalitica } from '../services/obras'
import { anillosDeCliente, celda, ITEMS, porCliente, type Celda, type Item } from '../services/agregados'
import { Anillo, Ausente, Subtitulo, Titulo } from './Piezas'

const FONDO: Record<NonNullable<Celda['tono']>, string> = {
  0: 'bg-surface-quiet', 1: 'bg-surface-sunken', 2: 'bg-dato-referencia/40', 3: 'bg-dato-materiales/50', 4: 'bg-neg-soft',
}

const texto = (item: Item, v: number | null): string | null => (item === 'horas' ? horasTexto(v) : millones(v))

export function VistaContrato({ obras, sinObra, filtros }: {
  obras: ObraAnalitica[]
  sinObra: ReadonlyMap<string, number | null>
  filtros: Filtros
}) {
  const clientes = porCliente(obras, sinObra)
  const actual = clientes.find((c) => c.slug === filtros.cliente) ?? clientes[0]
  if (!actual) {
    return <Titulo titulo="Contrato y gasto" linea="Ninguna obra con estos filtros." />
  }
  const anillos = anillosDeCliente(actual.obras)
  return (
    <>
      <Titulo titulo="Contrato y gasto"
        linea={`${actual.nombre} · ${actual.obras.length} obras · contrato sólo en mano de obra y materiales · acumulado a la fecha`} />
      <nav className="barra-corrible -mx-1 mb-6 flex gap-2 px-1" aria-label="Clientes">
        {clientes.map((c) => {
          const activo = c.clienteId === actual.clienteId
          return (
            <Link key={c.clienteId} prefetch={false} aria-current={activo ? 'true' : undefined}
              href={aUrl({ ...filtros, vista: 'contrato', cliente: c.slug })}
              className={`flex h-9 shrink-0 items-center rounded-control border px-3 text-sm ${activo ? 'border-marca bg-marca font-medium text-ink' : 'border-line text-muted hover:border-line-strong'}`}>
              {c.nombre}
            </Link>
          )
        })}
      </nav>
      <ul className="mb-8 grid grid-cols-2 gap-6 border-y border-line py-6 lg:grid-cols-4">
        {anillos.map((a) => {
          const rotulo = ITEMS.find((i) => i.clave === a.item)?.rotulo
          const p = a.cotizado && a.gastado != null ? a.gastado / a.cotizado : null
          return (
            <li key={a.item} className="flex items-center gap-4">
              <Anillo proporcion={p} tono={p != null && p > 1 ? 'neg' : 'dato'} tamano={72}
                centro={p == null ? <Ausente>—</Ausente> : <span className={p > 1 ? 'text-neg' : ''}>{pctEntero(p)}</span>} />
              <div className="text-sm tabular-nums">
                <p className="font-medium text-ink">{rotulo}</p>
                <p className="text-muted">{texto(a.item, a.gastado) ?? <Ausente>{a.item === 'horas' ? 'sin horas' : 'ninguno'}</Ausente>}</p>
                <p className="text-xs text-faint">
                  {a.cotizado != null ? `de ${millones(a.cotizado)}` : a.item === 'subcontratos' ? 'no es venta' : a.item === 'horas' ? 'sin previsión' : 'sin cotizado'}
                </p>
              </div>
            </li>
          )
        })}
      </ul>
      <Subtitulo derecha="gastado · % del cotizado">Obra por ítem</Subtitulo>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-separate border-spacing-1 text-sm tabular-nums">
          <thead className="text-xs text-faint">
            <tr><th className="text-left font-normal">Obra</th>{ITEMS.map((i) => <th key={i.clave} className="font-normal">{i.rotulo}</th>)}</tr>
          </thead>
          <tbody>
            {actual.obras.map((o) => (
              <tr key={o.id}>
                <td className="max-w-56 truncate pr-2 text-ink">{o.nombre}</td>
                {ITEMS.map((i) => <CeldaMatriz key={i.clave} c={celda(o, i.clave)} item={i.clave} />)}
              </tr>
            ))}
            <tr>
              <td className="pr-2 text-muted">Sin obra asignada</td>
              <td className="px-3 py-2 text-center text-xs text-faint" colSpan={4}>
                {millones(actual.sinObra) ?? 'ninguno'} · no se reparte entre obras
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </>
  )
}

function CeldaMatriz({ c, item }: { c: Celda; item: Item }) {
  const excedido = c.tono === 4
  const fondo = c.tono == null ? '' : FONDO[c.tono]
  const vacio = item === 'horas' ? 'sin horas' : 'ninguno'
  return (
    <td className={`h-14 rounded-control px-3 text-center align-middle ${fondo} ${excedido ? 'border border-neg text-neg' : 'text-ink'}`}>
      <span className="block">{texto(item, c.gastado) ?? <Ausente>{vacio}</Ausente>}</span>
      <span className={`block text-xs ${excedido ? 'text-neg' : 'text-faint'}`}>
        {c.pct != null ? `${pctEntero(c.pct)} del cotizado` : c.cotizado != null ? `de ${millones(c.cotizado)}` : c.cotizadoAusente}
      </span>
    </td>
  )
}
