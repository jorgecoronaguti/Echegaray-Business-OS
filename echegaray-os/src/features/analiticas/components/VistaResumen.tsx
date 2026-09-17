// RESUMEN — la única vista con cifras generales: cuánto se presupuestó, cuánto se consumió, cuánto queda.
//
// Estructura confirmada por el dueño (17/09/2026): las cifras de las obras que pasan los filtros y un
// gráfico por obra, presupuestado contra consumido. Estilo del diseño v6: cabecera de 180 px, cifras de
// 28 px, barra fina gris para lo presupuestado y gruesa grafito para lo consumido.
//
// Se compara RUBRO CONTRA RUBRO (ver `presupuesto.ts`): la barra grafito es lo consumido en los rubros
// presupuestados; lo que se consumió sin presupuesto con qué compararse va a continuación, en ámbar,
// porque es lo que reclama. Nunca se suma al «queda».
import Link from 'next/link'
import { aUrl, type Filtros } from '../services/filtros'
import { millones, pctEntero } from '../services/formato'
import { cifrasResumen, controlPorObra, manoObraDe, type ControlDeObra } from '../services/agregados'
import { rotuloEstimada, type ObraAnalitica } from '../services/obras'
import { ancho, Cabecera, Seccion } from './Piezas'

export function VistaResumen({ obras, sinObra, filtros }: {
  obras: ObraAnalitica[]
  sinObra: Map<string, number | null>
  filtros: Filtros
}) {
  const r = cifrasResumen(obras, sinObra)
  const filas = controlPorObra(obras)
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
            nota: est ? `mano de obra ${est}` : 'en los mismos rubros' },
          { rotulo: excedido ? 'excedido' : 'queda', valor: r.queda != null ? millones(Math.abs(r.queda)) : null, falta: '—', tono: excedido ? 'neg' : undefined,
            nota: r.presupuestado ? `${pctEntero((r.consumido ?? 0) / r.presupuestado)} consumido` : undefined },
          { rotulo: 'consumido sin presupuesto', valor: r.consumoSinPresupuesto ? millones(r.consumoSinPresupuesto) : null, falta: 'ninguno', tono: 'warn',
            nota: r.obrasSinPresupuesto ? `${r.obrasSinPresupuesto} ${r.obrasSinPresupuesto === 1 ? 'obra' : 'obras'} sin presupuesto y rubros no cotizados` : 'rubros no cotizados' },
          { rotulo: 'sin obra asignada', valor: millones(r.sinObraAsignada), falta: 'ninguno', tono: 'muted', nota: 'no se reparte entre obras' },
        ]} />
      <Seccion titulo="Presupuestado contra consumido, por obra"
        aclaracion="la barra fina es lo presupuestado; la gruesa, lo consumido en esos rubros. Tocá una obra para verla rubro por rubro."
        leyenda={[
          { color: 'bg-dato-referencia', rotulo: 'presupuestado' },
          { color: 'bg-accent', rotulo: 'consumido' },
          { color: 'bg-neg', rotulo: 'consumido de más' },
          { color: 'bg-warn', rotulo: 'consumido sin presupuesto' },
        ]}>
        <Grafico filas={filas} filtros={filtros} />
      </Seccion>
      <div className="pb-9" />
    </>
  )
}

function Grafico({ filas, filtros }: { filas: ControlDeObra[]; filtros: Filtros }) {
  const escala = Math.max(1, ...filas.map((f) => Math.max(f.presupuesto ?? 0, (f.consumido ?? 0) + f.sinPresupuesto)))
  if (!filas.length) return <p className="text-sm text-faint">Ninguna obra con estos filtros.</p>
  return (
    <div className="flex flex-col">
      {filas.map((f) => <FilaObra key={f.obra.id} f={f} escala={escala} href={aUrl({ ...filtros, vista: 'obras', obra: f.obra.id })} />)}
    </div>
  )
}

function FilaObra({ f, escala, href }: { f: ControlDeObra; escala: number; href: string }) {
  const o = f.obra
  const pasada = f.pct != null && f.pct > 1
  // DENTRO DEL PRESUPUESTO en grafito y LO EXCEDIDO en rojo: la barra dice dónde terminó el presupuesto.
  const dentro = f.consumido != null && f.presupuesto != null ? Math.min(f.consumido, f.presupuesto) : 0
  const exceso = f.consumido != null && f.presupuesto != null ? Math.max(0, f.consumido - f.presupuesto) : 0
  return (
    <Link href={href} prefetch={false} data-testid={`resumen-obra-${o.id}`}
      className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-5 gap-y-2 border-b border-line py-3.5 hover:bg-surface-quiet lg:grid-cols-[220px_minmax(0,1fr)_90px_190px] lg:items-center">
      <div className="col-start-1 row-start-1 flex min-w-0 flex-col gap-0.5 lg:col-auto lg:row-auto">
        <div className="truncate text-[13.5px] font-medium text-ink">{o.nombre}</div>
        <div className="truncate text-[11.5px] text-faint">{o.clienteNombre}{o.presupuestoEstimado ? ' · presupuesto estimado' : ''}</div>
      </div>
      <div className="col-span-2 flex min-w-0 flex-col gap-1.5 lg:col-span-1">
        <div className="flex h-2.5 items-center gap-2">
          {f.presupuesto != null ? (
            <><div className="h-1.5 rounded-[2px] bg-dato-referencia" style={{ width: ancho(f.presupuesto, escala) }} /><span className="whitespace-nowrap text-[11px] text-muted">{millones(f.presupuesto)}{o.presupuestoEstimado ? ' estimado' : ''}</span></>
          ) : <span className="truncate text-[11px] text-warn">{o.motivoPresupuesto}</span>}
        </div>
        <div className="flex h-3.5 items-center gap-2">
          <div className="flex h-3.5 overflow-hidden rounded-[2px]" style={{ width: ancho(dentro + exceso + f.sinPresupuesto, escala) }}>
            <div className="bg-accent" style={{ width: ancho(dentro, dentro + exceso + f.sinPresupuesto) }} />
            <div className="bg-neg" style={{ width: ancho(exceso, dentro + exceso + f.sinPresupuesto) }} />
            <div className="bg-warn" style={{ width: ancho(f.sinPresupuesto, dentro + exceso + f.sinPresupuesto) }} />
          </div>
          <span className="whitespace-nowrap text-xs font-semibold text-ink">
            {f.consumido != null ? millones(f.consumido) : null}
            {f.sinPresupuesto > 0 ? <span className="font-normal text-warn">{f.consumido != null ? ' + ' : ''}{millones(f.sinPresupuesto)}</span> : null}
            {f.consumido == null && f.sinPresupuesto <= 0 ? <span className="font-normal text-faint">sin movimiento</span> : null}
          </span>
        </div>
      </div>
      <div className={`col-start-2 row-start-1 text-right text-[18px] font-semibold tracking-[-0.02em] tabular-nums lg:col-auto lg:row-auto ${f.pct == null ? 'text-faint' : pasada ? 'text-neg' : f.pct >= 0.8 ? 'text-warn' : 'text-ink'}`}>
        {f.pct != null ? pctEntero(f.pct) : '—'}
      </div>
      <Lectura f={f} />
    </Link>
  )
}

function Lectura({ f }: { f: ControlDeObra }) {
  let valor = 'sin comparar'
  let nota = 'no hay presupuesto con qué medir'
  let color = 'text-faint'
  if (f.queda != null) {
    valor = f.queda < 0 ? `excedido ${millones(-f.queda)}` : `queda ${millones(f.queda)}`
    nota = f.sinPresupuesto > 0 ? 'en los rubros presupuestados' : 'del presupuesto'
    color = f.queda < 0 ? 'text-neg' : 'text-ink'
  }
  return (
    <div className="col-span-2 flex items-baseline justify-between gap-2 lg:col-span-1 lg:flex-col lg:items-end lg:gap-0.5">
      <div className={`text-[12.5px] font-medium ${color}`}>{valor}</div>
      <div className="text-[11px] text-faint">{nota}</div>
    </div>
  )
}
