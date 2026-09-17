// GASTO POR OBRA (plano contrato × gastado) Y COSTO POR HORA (puntos por cliente sobre el eje $/hora).
//
// El plano usa LA MISMA escala en los dos ejes: la diagonal es «gastó lo que vale», y sólo con la
// misma escala un punto por encima de la diagonal se lee como excedido sin mirar un número. Las obras
// sin precio no tienen dónde ir en el eje X: salen del plano a un panel propio, no a X = 0.
import Link from 'next/link'
import { aUrl, type Filtros } from '../services/filtros'
import { horasTexto, millones, pctConSigno, pctEntero, porHora } from '../services/formato'
import type { ObraAnalitica } from '../services/obras'
import { cifrasGastoPorObra, costoPorHora, ordenar, textoComposicion, UMBRAL_HORA_CARA, type Orden } from '../services/agregados'
import { Ausente, Cifras, Subtitulo, Titulo, Valor } from './Piezas'

export function VistaObra({ obras, filtros, periodo }: { obras: ObraAnalitica[]; filtros: Filtros; periodo: string }) {
  const c = cifrasGastoPorObra(obras)
  const conPrecio = obras.filter((o) => o.precio != null)
  const fuera = obras.filter((o) => o.precio == null && (o.gasto.total ?? 0) > 0)
  const tope = Math.max(1, ...conPrecio.map((o) => Math.max(o.precio ?? 0, o.gasto.total ?? 0)))
  const orden = (filtros.orden ?? 'gastado') as Orden
  const COLS: { clave: Orden; rotulo: string }[] = [
    { clave: 'gastado', rotulo: 'Gastado' }, { clave: 'contrato', rotulo: 'Contrato' }, { clave: 'pct', rotulo: '% del contrato' },
    { clave: 'horas', rotulo: 'Horas' }, { clave: 'hora', rotulo: '$/hora' },
  ]
  return (
    <>
      <Titulo titulo="Gasto por obra" linea={`${obras.length} obras · ${periodo} · la diagonal es gastar lo que vale el contrato`} />
      <Cifras cifras={[
        { rotulo: 'Con contrato y gasto', valor: String(c.conAmbas) },
        { rotulo: 'Gastan sin precio', valor: String(c.gastanSinPrecio), tono: c.gastanSinPrecio ? 'warn' : undefined },
        { rotulo: 'Con precio y sin movimiento', valor: String(c.conPrecioSinMovimiento) },
        { rotulo: 'Gastaron más que el precio', valor: String(c.excedidas), tono: c.excedidas ? 'neg' : undefined },
      ]} />
      <div className="grid gap-8 lg:grid-cols-[1fr_280px]">
        <div className="relative aspect-square w-full max-w-xl pb-6 pl-10">
          <svg viewBox="0 0 100 100" className="h-full w-full overflow-visible" aria-label="Contrato contra gastado por obra">
            <rect x="0" y="0" width="100" height="100" fill="none" className="stroke-line" strokeWidth="0.3" />
            <line x1="0" y1="100" x2="100" y2="0" className="stroke-dato-referencia" strokeWidth="0.4" strokeDasharray="1.5 1.5" />
            {conPrecio.map((o) => {
              const x = ((o.precio ?? 0) / tope) * 100
              const y = 100 - ((o.gasto.total ?? 0) / tope) * 100
              const excede = (o.gasto.total ?? 0) > (o.precio ?? 0)
              const hueco = (o.gasto.total ?? 0) <= 0
              return (
                <circle key={o.id} cx={x} cy={y} r="1.6" strokeWidth="0.5"
                  className={hueco ? 'fill-surface stroke-accent' : excede ? 'fill-neg stroke-neg' : 'fill-accent stroke-accent'}>
                  <title>{`${o.nombre}: gastado ${millones(o.gasto.total) ?? 'sin movimiento'} de ${millones(o.precio)}`}</title>
                </circle>
              )
            })}
          </svg>
          <span className="absolute bottom-0 left-10 text-xs text-faint">Contrato →</span>
          <span className="absolute bottom-0 right-0 text-xs tabular-nums text-faint">{millones(tope)}</span>
          <span className="absolute left-0 top-0 text-xs text-faint">Gastado</span>
          <span className="absolute left-0 top-4 text-xs tabular-nums text-faint">{millones(tope)}</span>
        </div>
        <section>
          <Subtitulo derecha={String(fuera.length)}>Fuera del plano</Subtitulo>
          {fuera.length ? (
            <ul className="text-sm tabular-nums">
              {fuera.map((o) => (
                <li key={o.id} className="flex h-10 items-center justify-between gap-2 border-b border-line-hairline">
                  <span className="min-w-0 truncate text-ink">{o.nombre}</span>
                  <span className="text-ink">{millones(o.gasto.total)} <Ausente>{o.ausencia}</Ausente></span>
                </li>
              ))}
            </ul>
          ) : <Ausente>ninguna</Ausente>}
        </section>
      </div>
      <Subtitulo>Obra por obra</Subtitulo>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm tabular-nums">
          <thead className="text-xs text-faint">
            <tr className="border-b border-line-strong text-right">
              <th className="py-2 text-left font-normal">Obra</th>
              {COLS.map((k) => (
                <th key={k.clave} className="font-normal">
                  <Link prefetch={false} scroll={false} href={aUrl({ ...filtros, orden: k.clave })}
                    className={`inline-flex h-9 items-center ${orden === k.clave ? 'font-medium text-ink' : 'hover:text-ink'}`}>
                    {k.rotulo}{orden === k.clave ? ' ↓' : ''}
                  </Link>
                </th>
              ))}
              <th className="pl-4 text-left font-normal">Composición</th>
            </tr>
          </thead>
          <tbody>
            {ordenar(obras, orden).map((o) => {
              const pct = o.precio && o.gasto.total != null ? o.gasto.total / o.precio : null
              const ph = o.gasto.manoObra && o.gasto.horasValorizadas ? o.gasto.manoObra / o.gasto.horasValorizadas : null
              return (
                <tr key={o.id} className="h-fila border-b border-line-hairline text-right">
                  <td className="max-w-64 truncate text-left text-ink">{o.nombre}</td>
                  <td><Valor v={millones(o.gasto.total)} falta="sin movimiento" /></td>
                  <td><Valor v={millones(o.precio)} falta={o.ausencia ?? 'sin precio'} /></td>
                  <td className={pct != null && pct > 1 ? 'text-neg' : ''}><Valor v={pctEntero(pct)} falta="—" /></td>
                  <td><Valor v={horasTexto(o.gasto.horas)} falta="sin horas" /></td>
                  <td><Valor v={porHora(ph)} falta="—" /></td>
                  <td className="pl-4 text-left text-xs text-muted"><Valor v={textoComposicion(o)} falta="—" /></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </>
  )
}

export function VistaHora({ obras, periodo }: { obras: ObraAnalitica[]; periodo: string }) {
  const { empresa, puntos } = costoPorHora(obras)
  // EL EJE ARRANCA CERCA DEL MÁS BARATO, NO EN CERO: las obras difieren en ±10 % y desde cero se apilaban
  // en el último décimo. Y llega hasta la línea de +20 %, para que la línea ámbar nunca quede afuera.
  const piso = Math.min(...puntos.map((p) => p.porHora), empresa ?? Infinity) * 0.9
  const tope = Math.max(...puntos.map((p) => p.porHora), (empresa ?? 0) * (1 + UMBRAL_HORA_CARA)) * 1.03
  const porCliente = new Map<string, typeof puntos>()
  for (const p of puntos) porCliente.set(p.obra.clienteNombre, [...(porCliente.get(p.obra.clienteNombre) ?? []), p])
  const x = (v: number) => `${((v - piso) / (tope - piso)) * 100}%`
  return (
    <>
      <Titulo titulo="Costo por hora"
        linea={`${puntos.length} obras con mano de obra y horas · ${periodo} · es costo de la hora, no productividad · las horas de jefe van a Estructura`} />
      <Cifras cifras={[
        { rotulo: 'Empresa', valor: porHora(empresa), falta: 'sin horas' },
        { rotulo: 'Obras medidas', valor: String(puntos.length) },
        { rotulo: `Más de ${pctEntero(UMBRAL_HORA_CARA)} sobre la empresa`, valor: String(puntos.filter((p) => p.contraEmpresa > UMBRAL_HORA_CARA).length) },
        { rotulo: 'Sin horas o sin mano de obra', valor: String(obras.length - puntos.length) },
      ]} />
      {empresa == null ? <Ausente>sin horas valorizadas en el período</Ausente> : (
        <div className="relative mb-8 border-b border-line sm:ml-40">
          <div className="absolute inset-y-0 border-l border-accent" style={{ left: x(empresa) }} />
          <div className="absolute inset-y-0 border-l border-dashed border-warn" style={{ left: x(empresa * (1 + UMBRAL_HORA_CARA)) }} />
          {[...porCliente.entries()].map(([cliente, ps]) => (
            <div key={cliente} className="relative h-12 border-t border-line-hairline">
              <span className="absolute left-0 top-0 max-w-full truncate text-xs text-muted sm:left-auto sm:right-full sm:top-1/2 sm:w-40 sm:-translate-y-1/2 sm:pr-3">{cliente}</span>
              {ps.map((p) => (
                <span key={p.obra.id} title={`${p.obra.nombre}: ${porHora(p.porHora)}`}
                  className={`absolute top-2/3 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full sm:top-1/2 ${p.contraEmpresa > UMBRAL_HORA_CARA ? 'bg-warn' : 'bg-accent'}`}
                  style={{ left: x(p.porHora) }} />
              ))}
            </div>
          ))}
          <p className="py-1 text-xs tabular-nums text-faint" style={{ paddingLeft: x(empresa) }}>empresa {porHora(empresa)}</p>
        </div>
      )}
      <Subtitulo>Obra por obra</Subtitulo>
      <ul className="text-sm tabular-nums">
        {puntos.map((p) => (
          <li key={p.obra.id} className="flex h-fila items-center gap-3 border-b border-line-hairline">
            <span className="min-w-0 flex-1 truncate text-ink">{p.obra.nombre}</span>
            <span className="text-ink">{porHora(p.porHora)}</span>
            <span className={`w-28 text-right ${p.contraEmpresa > UMBRAL_HORA_CARA ? 'text-warn' : 'text-muted'}`}>
              {pctConSigno(p.contraEmpresa)} vs empresa
            </span>
          </li>
        ))}
      </ul>
    </>
  )
}
