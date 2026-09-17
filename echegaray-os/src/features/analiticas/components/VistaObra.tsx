// GASTO POR OBRA — cada obra contra su presupuesto, y a qué ritmo lo consume.
//
// Diseño v6: cuatro cifras, orden por chips y una tabla con la barra «gastado sobre contrato» y la
// composición. En clave del dueño (17/09/2026) la barra es gastado sobre PRESUPUESTO, el contrato baja
// a la línea de la obra como referencia, y la columna «$ / hora» (que ya tiene su vista) deja lugar al
// RITMO: lo consumido por mes en los tres meses cerrados, y cuántos meses le dura lo que queda.
import Link from 'next/link'
import { aUrl, type Filtros } from '../services/filtros'
import { horasTexto, millones, pctEntero } from '../services/formato'
import { rotuloEstimada, type ObraAnalitica } from '../services/obras'
import { cifrasGastoPorObra, composicion, ordenar, type Orden } from '../services/agregados'
import { mesesParaAgotar, type Ritmo } from '../services/consumo'
import { ancho, Cabecera, ENCABEZADO } from './Piezas'

const ORDENES: { clave: Orden; rotulo: string }[] = [
  { clave: 'gastado', rotulo: 'Gastado' }, { clave: 'presupuesto', rotulo: 'Presupuesto' }, { clave: 'pct', rotulo: '% gastado' },
  { clave: 'horas', rotulo: 'Horas' }, { clave: 'ritmo', rotulo: 'Ritmo' },
]
const COLUMNAS = 'lg:grid-cols-[minmax(200px,1.4fr)_100px_100px_minmax(160px,1.6fr)_110px_130px_80px]'

export function VistaObra({ obras, filtros, ritmos }: { obras: ObraAnalitica[]; filtros: Filtros; ritmos: Map<string, Ritmo> | null }) {
  const c = cifrasGastoPorObra(obras)
  const orden = (filtros.orden ?? 'gastado') as Orden
  const filas = ordenar(obras, orden, ritmos ?? new Map())
  const clientes = new Set(obras.map((o) => o.clienteId)).size
  const gastado = obras.reduce((a, o) => a + (o.gasto.total ?? 0), 0)
  return (
    <>
      <Cabecera titulo="Gasto por obra"
        detalle={`${obras.length} obras de ${clientes} clientes · ${millones(gastado)} gastados`}
        cifras={[
          { rotulo: 'con presupuesto y gasto', valor: `${c.conAmbas} de ${obras.length}` },
          { rotulo: 'gastan sin presupuesto', valor: String(c.gastanSinPresupuesto), tono: c.gastanSinPresupuesto ? 'warn' : undefined },
          { rotulo: 'cerca del límite', valor: String(c.cerca), tono: c.cerca ? 'warn' : 'muted' },
          { rotulo: 'se pasaron del presupuesto', valor: String(c.excedidas), tono: c.excedidas ? 'neg' : undefined },
        ]}
        derecha={
          <div className="barra-corrible flex items-center gap-1">
            <span className="mr-1.5 shrink-0 text-[11px] text-faint">ordenar por</span>
            {ORDENES.map((s) => (
              <Link key={s.clave} prefetch={false} href={aUrl({ ...filtros, orden: s.clave })} aria-current={s.clave === orden ? 'true' : undefined}
                className={`flex h-9 shrink-0 items-center whitespace-nowrap rounded-control px-3 text-xs text-accent lg:h-7 ${s.clave === orden ? 'bg-marca font-medium' : 'hover:bg-surface-sunken'}`}>
                {s.rotulo}
              </Link>
            ))}
          </div>
        } />
      <div className="flex flex-col pb-9">
        <div className={`hidden h-9 items-center gap-5 border-b border-line lg:grid ${COLUMNAS} ${ENCABEZADO}`}>
          <div>Obra</div><div className="text-right">Presupuesto</div><div className="text-right">Gastado</div>
          <div>Gastado sobre presupuesto</div><div className="text-right">Ritmo por mes</div><div>Composición</div><div className="text-right">HH</div>
        </div>
        {ritmos == null ? <p className="border-b border-line py-2 text-[11.5px] text-faint">El ritmo por mes todavía no se publica en la base.</p> : null}
        {filas.map((o) => <Fila key={o.id} o={o} ritmo={ritmos?.get(o.id) ?? null} leido={ritmos != null} />)}
      </div>
    </>
  )
}

function Fila({ o, ritmo, leido }: { o: ObraAnalitica; ritmo: Ritmo | null; leido: boolean }) {
  const gasta = (o.gasto.total ?? 0) > 0
  const pasada = o.grupo === 'pasadas'
  const mix = composicion([o])
  const est = rotuloEstimada(o.gasto)
  const queda = o.presupuesto != null && o.gasto.total != null ? o.presupuesto - o.gasto.total : null
  const meses = mesesParaAgotar(queda, ritmo?.porMes ?? null)
  let pct = 'sin presupuesto'
  let pColor = 'text-warn'
  if (o.presupuesto != null && gasta) { pct = `${pctEntero(o.avanceGasto)}${meses != null ? ` · ${meses === 0 ? 'agotado' : `${meses.toLocaleString('es-AR', { maximumFractionDigits: 1 })} meses`}` : ''}`; pColor = pasada ? 'text-neg' : 'text-muted' }
  else if (o.presupuesto != null) { pct = 'sin movimiento'; pColor = 'text-faint' }
  return (
    <div className={`grid grid-cols-2 gap-x-4 gap-y-1.5 border-b border-line py-3 hover:bg-surface-quiet lg:h-[52px] lg:items-center lg:gap-5 lg:py-0 ${COLUMNAS}`}>
      <div className="col-span-2 flex min-w-0 flex-col gap-0.5 lg:col-span-1">
        <div className="truncate text-[13px] font-medium text-ink">{o.nombre}</div>
        <div className="truncate text-[11px] text-faint">{o.clienteNombre}{o.precio != null ? ` · contrato ${millones(o.precio)}` : ''}</div>
      </div>
      <div className={`whitespace-nowrap text-[12.5px] lg:text-right ${o.presupuesto != null ? 'text-ink' : 'text-warn'}`}>
        <span className="text-[11px] text-faint lg:hidden">presupuesto </span>{o.presupuesto != null ? millones(o.presupuesto) : 'sin presupuesto'}
      </div>
      <div className="whitespace-nowrap text-right text-[12.5px] font-semibold text-ink">
        <span className="text-[11px] font-normal text-faint lg:hidden">gastado </span>{gasta ? millones(o.gasto.total) : '—'}
      </div>
      <div className="col-span-2 flex items-center gap-2.5 lg:col-span-1">
        <div className="relative h-2.5 flex-1 overflow-hidden rounded-[2px] bg-line">
          <div className={`absolute inset-y-0 left-0 ${pasada ? 'bg-neg' : 'bg-accent'}`} style={{ width: o.avanceGasto != null ? ancho(o.avanceGasto, 1) : '0%' }} />
        </div>
        <div className={`min-w-16 whitespace-nowrap text-[11.5px] ${pColor}`}>{pct}</div>
      </div>
      <div className="whitespace-nowrap text-[12.5px] lg:text-right" title={ritmo?.conEstimada ? 'incluye mano de obra estimada' : undefined}>
        <span className="text-[11px] text-faint lg:hidden">ritmo </span>
        {!leido ? <span className="text-faint">sin leer</span>
          : ritmo?.porMes != null ? <span className="text-ink">{millones(ritmo.porMes)}{ritmo.conEstimada ? <span className="text-faint"> est.</span> : null}</span>
            : <span className="text-faint">sin consumo reciente</span>}
      </div>
      <div className="flex h-2.5 overflow-hidden rounded-[2px] bg-line lg:self-center" title={mix ? `mano de obra ${pctEntero(mix.manoObra)}${est ? ` (${est})` : ''} · subcontratos ${pctEntero(mix.subcontratos)} · materiales ${pctEntero(mix.materiales)}` : undefined}>
        <div className="bg-accent" style={{ width: ancho(mix?.manoObra, 1) }} />
        <div className="bg-muted" style={{ width: ancho(mix?.subcontratos, 1) }} />
        <div className="bg-dato-materiales" style={{ width: ancho(mix?.materiales, 1) }} />
      </div>
      <div className={`text-right text-[12.5px] ${o.gasto.horas != null ? 'text-ink' : 'text-faint'}`}>{horasTexto(o.gasto.horas) ?? 'sin horas'}</div>
    </div>
  )
}
