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
import { agruparPorCliente, cifrasResumen, manoObraDe, type FilaControl, type GrupoDeCliente } from '../services/agregados'
import { IconoCliente, IconoObra } from '@/shared/components/iconos'
import { ALTO_V2, RotuloCol } from '@/shared/components/v2/patron'
import { rotuloEstimada, type ObraAnalitica } from '../services/obras'
import { ancho, Cabecera, Seccion } from './Piezas'

export function VistaResumen({ obras, cartera, sinObra, filtros, neto }: {
  obras: ObraAnalitica[]
  /** Toda la cartera, sin filtro: cuántas obras activas tiene cada cliente, como en Clientes. */
  cartera: ObraAnalitica[]
  sinObra: Map<string, number | null>
  filtros: Filtros
  /** `true` = la base publica el consumo neto de IVA (20260917T1900). */
  neto: boolean
}) {
  const r = cifrasResumen(obras, sinObra)
  const grupos = agruparPorCliente(obras, cartera)
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
          // CONSUMIDO ES EL TOTAL, la misma cifra que suma la tabla: el dueño la suma a ojo y tiene que cerrar.
          { rotulo: 'consumido', valor: millones(r.consumoTotal), falta: 'sin movimiento',
            nota: `${neto ? 'neto de IVA' : 'con IVA: la base todavía no publica el neto'}${r.consumoSinPresupuesto ? ` · ${millones(r.consumoSinPresupuesto)} sin presupuesto` : ''}${est ? ` · mano de obra ${est}` : ''}` },
          { rotulo: excedido ? 'excedido' : 'queda', valor: r.queda != null ? millones(Math.abs(r.queda)) : null, falta: '—', tono: excedido ? 'neg' : undefined,
            nota: r.presupuestado ? `${pctEntero((r.consumido ?? 0) / r.presupuestado)} de lo presupuestado` : undefined },
          { rotulo: 'consumido sin presupuesto', valor: r.consumoSinPresupuesto ? millones(r.consumoSinPresupuesto) : null, falta: 'ninguno', tono: 'warn',
            nota: r.obrasSinPresupuesto ? `${r.obrasSinPresupuesto} ${r.obrasSinPresupuesto === 1 ? 'obra' : 'obras'} sin presupuesto y rubros no cotizados` : 'rubros no cotizados' },
          { rotulo: 'sin obra asignada', valor: millones(r.sinObraAsignada), falta: 'ninguno', tono: 'muted', nota: 'no se reparte entre obras' },
        ]} />
      <Seccion titulo="Presupuestado contra consumido, por cliente y obra"
        aclaracion="en el mismo orden que Clientes: cada cliente con sus obras debajo. Lo consumido es neto de IVA; el % y lo que queda comparan rubro contra rubro. En rojo, lo excedido."
        leyenda={VARIANTE === 'apilada' ? [
          { color: 'bg-accent', rotulo: 'mano de obra' },
          { color: 'bg-dato-materiales', rotulo: 'materiales' },
          { color: 'bg-muted', rotulo: 'subcontratos' },
        ] : undefined}>
        <Grafico grupos={grupos} filtros={filtros} />
      </Seccion>
      <div className="pb-9" />
    </>
  )
}

/** Probadas las dos a 1440 (17/09/2026): la barra fina del «Avance de cobro» de Clientes se lee mejor. */
const VARIANTE: 'avance' | 'apilada' = 'avance'

// LAS COLUMNAS DE CLIENTES: el nombre ancho a la izquierda y las cifras a la derecha, con los mismos
// rótulos en mayúsculas. Por debajo de 1024 px se sueltan las columnas y las cifras pasan a una línea,
// como hace Clientes en el teléfono.
const COLS = 'grid grid-cols-[minmax(0,1fr)_auto] gap-x-3.5 lg:grid-cols-[minmax(200px,1.6fr)_repeat(5,minmax(0,1fr))_130px_minmax(0,1fr)] lg:items-center'

function Grafico({ grupos, filtros }: { grupos: GrupoDeCliente[]; filtros: Filtros }) {
  if (!grupos.length) return <p className="text-sm text-faint">Ninguna obra con estos filtros.</p>
  return (
    <div className="flex flex-col" data-testid="resumen-por-cliente">
      <div className={`border-b border-line-strong ${COLS}`} style={{ height: ALTO_V2.encabezado }}>
        <RotuloCol>Cliente · obra</RotuloCol>
        <span className="grid lg:hidden"><RotuloCol derecha>Queda</RotuloCol></span>
        {['Presupuestado', 'Mano de obra', 'Materiales', 'Subcontratos', 'Consumido', '%', 'Queda'].map((r) => (
          <span key={r} className="hidden lg:grid"><RotuloCol derecha titulo={r === 'Consumido' ? 'Neto de IVA: mano de obra + materiales + subcontratos.' : undefined}>{r}</RotuloCol></span>
        ))}
      </div>
      {grupos.map((g) => (
        <div key={g.clienteId} data-testid="resumen-cliente">
          <FilaCliente g={g} />
          {g.obras.map((f) => <FilaObra key={f.obra.id} f={f} href={aUrl({ ...filtros, vista: 'obras', obra: f.obra.id })} />)}
        </div>
      ))}
    </div>
  )
}

const tonoPct = (pct: number | null) => (pct == null ? 'text-faint' : pct > 1 ? 'text-neg' : pct >= 0.8 ? 'text-warn' : 'text-ink')
const Plata = ({ v, fuerte = false, clase = '' }: { v: number | null; fuerte?: boolean; clase?: string }) => (
  <span className={`hidden text-right text-[12px] tabular-nums lg:block ${v == null ? 'text-faint' : fuerte ? 'font-semibold text-ink' : 'text-ink'} ${clase}`}>{v == null ? '—' : millones(v)}</span>
)

/** EL % COMO EL «AVANCE DE COBRO» DE CLIENTES: barra fina y el número a la derecha. */
function Porcentaje({ pct, g, parcial = false }: { pct: number | null; g?: { manoObra: number | null; materiales: number | null; subcontratos: number | null; total: number | null }; parcial?: boolean }) {
  return (
    <span className="flex flex-col items-end">
    <span className="flex items-center justify-end gap-2">
      {VARIANTE === 'avance' ? (
        <span className="hidden h-1.5 w-16 overflow-hidden rounded-full bg-line lg:block">
          <span className={`block h-full ${pct != null && pct > 1 ? 'bg-neg' : 'bg-accent'}`} style={{ width: pct == null ? '0%' : ancho(pct, 1) }} />
        </span>
      ) : g ? (
        <span className="hidden h-2 w-16 overflow-hidden rounded-[2px] lg:flex">
          <span className="bg-accent" style={{ width: ancho(g.manoObra, g.total) }} />
          <span className="bg-dato-materiales" style={{ width: ancho(g.materiales, g.total) }} />
          <span className="bg-muted" style={{ width: ancho(g.subcontratos, g.total) }} />
        </span>
      ) : null}
      <span className={`w-11 text-right text-[12.5px] font-semibold tabular-nums ${tonoPct(pct)}`}>{pct != null ? pctEntero(pct) : '—'}</span>
    </span>
    {/* EL % NO SALE DEL CONSUMIDO DE LA FILA cuando parte no tiene presupuesto: se dice sobre qué es. */}
    {parcial && pct != null ? <span className="text-[10px] text-faint">sobre lo presupuestado</span> : null}
    </span>
  )
}

const quedaTexto = (q: number | null) => (q == null ? 'sin comparar' : q < 0 ? `excedido ${millones(-q)}` : millones(q))
const quedaTono = (q: number | null) => (q == null ? 'text-faint' : q < 0 ? 'text-neg' : 'text-ink')

/** Las cifras en una línea, debajo del nombre, cuando las columnas no entran (teléfono). */
function LineaAngosta({ pres, mo, mat, sub, cons, pct, sangria }: { pres: number | null; mo: number | null; mat: number | null; sub: number | null; cons: number | null; pct: number | null; sangria: number }) {
  const m = (v: number | null) => (v == null ? '—' : millones(v))
  return (
    <span className="col-span-2 flex flex-wrap gap-x-1.5 text-[11px] tabular-nums text-muted lg:hidden" style={{ paddingLeft: sangria }}>
      <span>Presup. <b className="font-medium text-ink">{m(pres)}</b></span>·<span>MO <b className="font-medium text-ink">{m(mo)}</b></span>·
      <span>Mat. <b className="font-medium text-ink">{m(mat)}</b></span>·<span>Sub. <b className="font-medium text-ink">{m(sub)}</b></span>·
      <span>Consumido <b className="font-medium text-ink">{m(cons)}</b></span>·<span className={tonoPct(pct)}>{pct != null ? pctEntero(pct) : '—'}</span>
    </span>
  )
}

/** EL ENCABEZADO DEL CLIENTE, como la fila maestra de Clientes: la suma de sus obras en cada columna. */
function FilaCliente({ g }: { g: GrupoDeCliente }) {
  return (
    <div className={`${COLS} gap-y-1 border-b border-line py-2 lg:py-0`} style={{ minHeight: ALTO_V2.cliente }}>
      <span className="flex min-w-0 items-center gap-2.5">
        <IconoCliente className="h-[15px] w-[15px] shrink-0 text-faint" />
        <span className="flex min-w-0 flex-col gap-px">
          <span className="truncate text-[12.5px] font-semibold text-ink">{g.nombre}</span>
          <span className="truncate text-[11px] text-faint">
            {g.obras.length} {g.obras.length === 1 ? 'obra' : 'obras'}
            {g.excedidas ? <span className="text-neg"> · {g.excedidas} excedida{g.excedidas === 1 ? '' : 's'}</span> : null}
          </span>
        </span>
      </span>
      <span className={`text-right text-[12.5px] font-semibold tabular-nums lg:hidden ${quedaTono(g.queda)}`}>{quedaTexto(g.queda)}</span>
      <Plata v={g.presupuestado} /><Plata v={g.manoObra} /><Plata v={g.materiales} /><Plata v={g.subcontratos} />
      <Plata v={g.consumoTotal} fuerte />
      <span className="hidden lg:block"><Porcentaje pct={g.pct} g={{ ...g, total: g.consumoTotal }} parcial={g.consumoTotal != null && Math.abs(g.consumoTotal - (g.consumido ?? 0)) > 1} /></span>
      <span className={`hidden text-right text-[12px] font-semibold tabular-nums lg:block ${quedaTono(g.queda)}`}>{quedaTexto(g.queda)}</span>
      <LineaAngosta pres={g.presupuestado} mo={g.manoObra} mat={g.materiales} sub={g.subcontratos} cons={g.consumoTotal} pct={g.pct} sangria={25} />
    </div>
  )
}

/** LA OBRA COLGADA DE SU CLIENTE, con la sangría y el ícono de la hija de Clientes; el adicional, un paso más. */
function FilaObra({ f, href }: { f: FilaControl; href: string }) {
  const o = f.obra
  const g = o.gasto
  const sangria = f.nivel ? 38 : 14
  const excedida = f.pct != null && f.pct > 1
  return (
    <Link href={href} prefetch={false} data-testid={`resumen-obra-${o.id}`} data-excedida={excedida ? '' : undefined}
      className={`${COLS} gap-y-1 border-b border-hairline py-2 hover:bg-surface-quiet lg:py-0`} style={{ minHeight: ALTO_V2.hija }}>
      <span className="flex min-w-0 items-center gap-2.5" style={{ paddingLeft: sangria }}>
        <IconoObra className="h-[13px] w-[13px] shrink-0 text-faint" />
        <span className="flex min-w-0 flex-col gap-px">
          <span className={`truncate text-[12px] ${excedida ? 'text-neg' : 'text-ink-soft'}`}>
            {o.nombre}{f.esAdicional ? <span className="ml-2 font-mono text-[10.5px] uppercase tracking-[.06em] text-faint">adicional</span> : null}
          </span>
          {f.presupuesto == null ? <span className="truncate text-[10.5px] text-warn">{o.motivoPresupuesto}</span>
            : o.presupuestoEstimado ? <span className="text-[10.5px] text-faint">presupuesto estimado</span> : null}
        </span>
      </span>
      <span className={`text-right text-[12px] font-medium tabular-nums lg:hidden ${quedaTono(f.queda)}`}>{quedaTexto(f.queda)}</span>
      <Plata v={f.presupuesto} /><Plata v={g.manoObra} /><Plata v={g.materiales} /><Plata v={g.subcontratos} />
      <span className="hidden flex-col items-end lg:flex">
        <span className={`text-[12px] tabular-nums ${g.total == null ? 'text-faint' : 'font-semibold text-ink'}`}>{g.total == null ? '—' : millones(g.total)}</span>
        {f.consumido != null && g.total != null && Math.abs(g.total - f.consumido) > 1
          ? <span className="text-[10.5px] text-warn" title="Lo que no tiene presupuesto con qué compararse no entra al % ni a lo que queda.">{millones(g.total - f.consumido)} sin presupuesto</span> : null}
      </span>
      <span className="hidden lg:block"><Porcentaje pct={f.pct} g={{ ...g, total: g.total }} parcial={f.sinPresupuesto > 1} /></span>
      <span className={`hidden text-right text-[12px] tabular-nums lg:block ${quedaTono(f.queda)}`}>{quedaTexto(f.queda)}</span>
      <LineaAngosta pres={f.presupuesto} mo={g.manoObra} mat={g.materiales} sub={g.subcontratos} cons={g.total} pct={f.pct} sangria={sangria + 23} />
    </Link>
  )
}
