// RESUMEN — la única vista con cifras generales: cuánto se presupuestó, cuánto se consumió, cuánto queda.
//
// Estructura confirmada por el dueño (17/09/2026): las cifras de las obras que pasan los filtros y un
// gráfico por obra, presupuestado contra consumido. Estilo del diseño v6: cabecera de 180 px, cifras de
// 28 px, barra fina gris para lo presupuestado y gruesa grafito para lo consumido.
//
// La barra de consumo se apila en MANO DE OBRA, MATERIALES y SUBCONTRATOS (dueño, 17/09/2026: subcontratos
// se ve aparte), con los colores del diseño. El % y el «queda» comparan RUBRO CONTRA RUBRO (ver
// `presupuesto.ts`); lo consumido sin presupuesto con qué compararse se dice aparte, en ámbar.
import Link from 'next/link'
import { aUrl, type Filtros } from '../services/filtros'
import { millones, pctEntero } from '../services/formato'
import { agruparPorCliente, cifrasResumen, manoObraDe, type ControlDeObra, type GrupoDeCliente } from '../services/agregados'
import { IconoCliente, IconoObra } from '@/shared/components/iconos'
import { ALTO_V2, RotuloCol } from '@/shared/components/v2/patron'
import { rotuloEstimada, type ObraAnalitica } from '../services/obras'
import { ancho, Cabecera, Seccion } from './Piezas'

export function VistaResumen({ obras, sinObra, filtros, neto }: {
  obras: ObraAnalitica[]
  sinObra: Map<string, number | null>
  filtros: Filtros
  /** `true` = la base publica el consumo neto de IVA (20260917T1900). */
  neto: boolean
}) {
  const r = cifrasResumen(obras, sinObra)
  const grupos = agruparPorCliente(obras)
  const est = rotuloEstimada(manoObraDe(obras))
  const conPres = obras.length - r.obrasSinPresupuesto
  const excedido = r.queda != null && r.queda < 0
  return (
    <>
      <Cabecera titulo="Resumen" repartidas
        detalle={`${obras.length} obras · ${conPres} con presupuesto · acumulado a la fecha`}
        cifras={[
          { rotulo: 'presupuestado', valor: millones(r.presupuestado), falta: 'sin presupuesto cargado',
            nota: r.contrato != null ? `contrato ${millones(r.contrato)} · referencia` : undefined },
          { rotulo: 'consumido', valor: millones(r.consumido), falta: 'sin movimiento',
            nota: `${neto ? 'neto de IVA' : 'con IVA: la base todavía no publica el neto'}${est ? ` · mano de obra ${est}` : ''}` },
          { rotulo: excedido ? 'excedido' : 'queda', valor: r.queda != null ? millones(Math.abs(r.queda)) : null, falta: '—', tono: excedido ? 'neg' : undefined,
            nota: r.presupuestado ? `${pctEntero((r.consumido ?? 0) / r.presupuestado)} consumido` : undefined },
          { rotulo: 'consumido sin presupuesto', valor: r.consumoSinPresupuesto ? millones(r.consumoSinPresupuesto) : null, falta: 'ninguno', tono: 'warn',
            nota: r.obrasSinPresupuesto ? `${r.obrasSinPresupuesto} ${r.obrasSinPresupuesto === 1 ? 'obra' : 'obras'} sin presupuesto y rubros no cotizados` : 'rubros no cotizados' },
          { rotulo: 'sin obra asignada', valor: millones(r.sinObraAsignada), falta: 'ninguno', tono: 'muted', nota: 'no se reparte entre obras' },
        ]} />
      <Seccion titulo="Presupuestado contra consumido, por cliente y obra"
        aclaracion="como en Clientes: cada cliente con sus obras debajo. Primero lo excedido, después lo que más consumió. La barra fina es lo presupuestado; la gruesa, todo lo consumido por rubro."
        leyenda={[
          { color: 'bg-dato-referencia', rotulo: 'presupuestado' },
          { color: 'bg-accent', rotulo: 'mano de obra' },
          { color: 'bg-dato-materiales', rotulo: 'materiales' },
          { color: 'bg-muted', rotulo: 'subcontratos' },
        ]}>
        <Grafico grupos={grupos} filtros={filtros} />
      </Seccion>
      <div className="pb-9" />
    </>
  )
}

// LAS COLUMNAS DE LA LISTA, como la tabla de Clientes: nombre ancho a la izquierda y cifras a la derecha.
const COLS = 'grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-2 lg:grid-cols-[240px_minmax(0,1fr)_72px_170px] lg:items-center'

function Grafico({ grupos, filtros }: { grupos: GrupoDeCliente[]; filtros: Filtros }) {
  const escala = Math.max(1, ...grupos.flatMap((g) => g.obras.map((f) => Math.max(f.presupuesto ?? 0, f.obra.gasto.total ?? 0))))
  if (!grupos.length) return <p className="text-sm text-faint">Ninguna obra con estos filtros.</p>
  return (
    <div className="flex flex-col" data-testid="resumen-por-cliente">
      <div className={`hidden border-b border-line-strong lg:grid ${COLS}`} style={{ height: ALTO_V2.encabezado }}>
        <RotuloCol>Cliente · obra</RotuloCol><RotuloCol>Presupuestado y consumido</RotuloCol>
        <RotuloCol derecha>%</RotuloCol><RotuloCol derecha>Queda</RotuloCol>
      </div>
      {grupos.map((g) => (
        <div key={g.clienteId} data-testid="resumen-cliente">
          <FilaCliente g={g} />
          {g.obras.map((f) => <FilaObra key={f.obra.id} f={f} escala={escala} href={aUrl({ ...filtros, vista: 'obras', obra: f.obra.id })} />)}
        </div>
      ))}
    </div>
  )
}

const tonoPct = (pct: number | null) => (pct == null ? 'text-faint' : pct > 1 ? 'text-neg' : pct >= 0.8 ? 'text-warn' : 'text-ink')

/** EL ENCABEZADO DEL CLIENTE, como la fila maestra de Clientes: nombre, cuántas obras, y sus totales. */
function FilaCliente({ g }: { g: GrupoDeCliente }) {
  return (
    <div className={`${COLS} border-b border-line bg-surface-quiet px-0 py-2 lg:py-0`} style={{ minHeight: ALTO_V2.cliente }}>
      <div className="col-start-1 row-start-1 flex min-w-0 items-center gap-2.5 lg:col-auto lg:row-auto">
        <IconoCliente className="h-[15px] w-[15px] shrink-0 text-faint" />
        <div className="flex min-w-0 flex-col gap-px">
          <span className="truncate text-[12.5px] font-semibold text-ink">{g.nombre}</span>
          <span className="truncate text-[11px] text-faint">
            {g.obras.length} {g.obras.length === 1 ? 'obra' : 'obras'}{g.excedidas ? ` · ${g.excedidas} excedida${g.excedidas === 1 ? '' : 's'}` : ''}
          </span>
        </div>
      </div>
      <div className="col-span-2 text-[12px] tabular-nums text-muted lg:col-span-1">
        {g.presupuestado != null
          ? <>{g.consumido != null ? <><span className="font-semibold text-ink">{millones(g.consumido)}</span> consumido</> : <span className="text-faint">sin movimiento</span>} de {millones(g.presupuestado)} presupuestado</>
          : <span className="text-warn">sin presupuesto · {millones(g.consumoTotal) ?? 'sin movimiento'} consumido</span>}
      </div>
      <div className={`col-start-2 row-start-1 text-right text-[16px] font-semibold tabular-nums lg:col-auto lg:row-auto ${tonoPct(g.pct)}`}>{g.pct != null ? pctEntero(g.pct) : '—'}</div>
      <div className={`col-span-2 text-right text-[12.5px] font-medium tabular-nums lg:col-span-1 ${g.queda != null && g.queda < 0 ? 'text-neg' : g.queda == null ? 'text-faint' : 'text-ink'}`}>
        {g.queda == null ? 'sin comparar' : g.queda < 0 ? `excedido ${millones(-g.queda)}` : `queda ${millones(g.queda)}`}
      </div>
    </div>
  )
}

/** LA OBRA COLGADA DE SU CLIENTE, con la sangría y el ícono de la hija del CRM. */
function FilaObra({ f, escala, href }: { f: ControlDeObra; escala: number; href: string }) {
  const o = f.obra
  const g = o.gasto
  const total = g.total ?? 0
  return (
    <Link href={href} prefetch={false} data-testid={`resumen-obra-${o.id}`}
      className={`${COLS} border-b border-hairline py-2.5 hover:bg-surface-quiet lg:py-2`} style={{ minHeight: ALTO_V2.hija }}>
      <div className="col-start-1 row-start-1 flex min-w-0 items-center gap-2.5 pl-3.5 lg:col-auto lg:row-auto">
        <IconoObra className="h-[13px] w-[13px] shrink-0 text-faint" />
        <div className="flex min-w-0 flex-col gap-px">
          <span className="truncate text-[12px] text-ink-soft">{o.nombre}</span>
          {o.presupuestoEstimado ? <span className="text-[10.5px] text-faint">presupuesto estimado</span> : null}
        </div>
      </div>
      <div className="col-span-2 flex min-w-0 flex-col gap-1 lg:col-span-1">
        <div className="flex h-2.5 items-center gap-2">
          {f.presupuesto != null ? (
            <><div className="h-1.5 rounded-[2px] bg-dato-referencia" style={{ width: ancho(f.presupuesto, escala) }} /><span className="whitespace-nowrap text-[11px] text-muted">{millones(f.presupuesto)}{o.presupuestoEstimado ? ' estimado' : ''}</span></>
          ) : <span className="truncate text-[11px] text-warn">{o.motivoPresupuesto}</span>}
        </div>
        <div className="flex h-3 items-center gap-2">
          <div className="flex h-3 overflow-hidden rounded-[2px]" style={{ width: ancho(total, escala) }}
            title={`mano de obra ${millones(g.manoObra) ?? '—'} · materiales ${millones(g.materiales) ?? '—'} · subcontratos ${millones(g.subcontratos) ?? '—'}`}>
            <div className="bg-accent" style={{ width: ancho(g.manoObra, total) }} />
            <div className="bg-dato-materiales" style={{ width: ancho(g.materiales, total) }} />
            <div className="bg-muted" style={{ width: ancho(g.subcontratos, total) }} />
          </div>
          <span className="whitespace-nowrap text-xs font-semibold text-ink">
            {f.consumido != null ? millones(f.consumido) : null}
            {f.sinPresupuesto > 0 ? <span className="font-normal text-warn">{f.consumido != null ? ' + ' : ''}{millones(f.sinPresupuesto)}</span> : null}
            {f.consumido == null && f.sinPresupuesto <= 0 ? <span className="font-normal text-faint">sin movimiento</span> : null}
          </span>
        </div>
      </div>
      <div className={`col-start-2 row-start-1 text-right text-[15px] font-semibold tabular-nums lg:col-auto lg:row-auto ${tonoPct(f.pct)}`}>
        {f.pct != null ? pctEntero(f.pct) : '—'}
      </div>
      <Lectura f={f} />
    </Link>
  )
}

function Lectura({ f }: { f: ControlDeObra }) {
  let valor = 'sin comparar'
  let color = 'text-faint'
  if (f.queda != null) {
    valor = f.queda < 0 ? `excedido ${millones(-f.queda)}` : `queda ${millones(f.queda)}`
    color = f.queda < 0 ? 'text-neg' : 'text-ink'
  }
  return (
    <div className="col-span-2 flex flex-col items-end gap-0.5 lg:col-span-1">
      <div className={`text-[12px] font-medium tabular-nums ${color}`}>{valor}</div>
      {f.queda != null && f.sinPresupuesto > 0 ? <div className="text-[10.5px] text-faint">en los rubros presupuestados</div> : null}
    </div>
  )
}
