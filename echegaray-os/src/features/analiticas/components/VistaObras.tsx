// OBRAS — una obra elegida: cada rubro presupuestado contra consumido, a qué ritmo consume y cuánto
// costó su hora.
//
// Estructura confirmada por el dueño (17/09/2026): absorbe lo útil de «Contrato y gasto» (los pares de
// barras cotizado/gastado del diseño v6), de «Gasto por obra» (el % y la composición) y de «Costo por
// hora» ($/h medido contra la empresa). No repite las cifras generales: ésas son del Resumen.
import Link from 'next/link'
import { aUrl, type Filtros } from '../services/filtros'
import { horasTexto, millones, pctConSigno, pctEntero, porHora } from '../services/formato'
import { celda, costoPorHora, INCLUIDO_EN_MATERIALES, ITEMS, porHoraMedido, quedaMaterialesYSubcontratos, UMBRAL_HORA_CARA, type Celda, type Item } from '../services/agregados'
import { mesesParaAgotar, type MesDeConsumo, type Ritmo } from '../services/consumo'
import { rotuloEstimada, type ObraAnalitica } from '../services/obras'
import { SIN_PRESUPUESTO_RUBRO } from '../services/presupuesto'
import { ancho, Cabecera, Seccion } from './Piezas'
import { Columnas } from './VistasEmpresa'

export function VistaObras({ obras, obra, filtros, consumo, ritmo, sinIva }: {
  obras: ObraAnalitica[]
  obra: ObraAnalitica | null
  filtros: Filtros
  consumo: MesDeConsumo[] | null
  ritmo: Ritmo | null
  /** Comprobantes tomados al total por no discriminar IVA; `null` = la base todavía no publica el neto. */
  sinIva: number | null
}) {
  if (!obra) return <p className="mt-9 text-sm text-muted">Ninguna obra con estos filtros.</p>
  const queda = obra.presupuesto != null ? obra.presupuesto - (obra.consumoComparable ?? 0) : null
  const meses = mesesParaAgotar(queda, ritmo?.porMes ?? null)
  return (
    <>
      <Selector obras={obras} elegida={obra.id} filtros={filtros} />
      <Cabecera titulo={obra.nombre}
        detalle={<>{obra.clienteNombre}{obra.precio != null ? ` · contrato ${millones(obra.precio)} (referencia)` : ''}{obra.presupuestoEstimado ? ' · presupuesto estimado' : ''}</>}
        cifras={[
          { rotulo: 'presupuestado', valor: millones(obra.presupuesto), falta: 'sin presupuesto', nota: obra.presupuesto != null ? undefined : (obra.motivoPresupuesto ?? undefined) },
          { rotulo: 'consumido', valor: millones(obra.presupuesto != null ? obra.consumoComparable : obra.gasto.total), falta: 'sin movimiento', nota: obra.presupuesto != null ? 'en esos rubros' : undefined },
          { rotulo: queda != null && queda < 0 ? 'excedido' : 'queda', valor: queda != null ? millones(Math.abs(queda)) : null, falta: '—', tono: queda != null && queda < 0 ? 'neg' : undefined, nota: obra.avanceGasto != null ? `${pctEntero(obra.avanceGasto)} consumido` : undefined },
          // LA NOTA DEL DISEÑO ES «alcanza X meses», y nada más: con la frase entera envolvía a dos
          // renglones y esta cifra quedaba más arriba que las otras tres. De qué sale el ritmo —tres
          // meses cerrados, con o sin mano de obra estimada— no se pierde: va en el `title`.
          { rotulo: 'ritmo por mes', valor: ritmo?.porMes != null ? millones(ritmo.porMes) : null, falta: consumo == null ? 'sin publicar' : 'sin consumo reciente',
            nota: ritmo?.porMes != null && meses != null
              ? `alcanza ${meses === 0 ? '0 meses' : `${meses.toLocaleString('es-AR', { maximumFractionDigits: 1 })} meses`}`
              : undefined,
            detalle: ritmo?.porMes != null ? `últimos 3 meses cerrados${ritmo.conEstimada ? ' · con mano de obra estimada' : ''}` : undefined },
        ]} />
      <Seccion titulo="Rubro contra rubro" aclaracion="la cotización incluye los subcontratos dentro de materiales">
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-5" data-testid="rubros">
          {ITEMS.map((i) => <Rubro key={i.clave} item={i.clave} rotulo={i.rotulo} c={celda(obra, i.clave)} />)}
        </div>
        {/* ═══ EL «QUEDA» CIERRA EL BLOQUE, NO LO PARTE (diseño v9) ═══
            Iba insertado después de Subcontratos: en el teléfono aparecía a mitad de la lista, antes
            de «Otros» y «Horas hombre», y en la computadora quedaba metido dentro de la grilla, bajo
            una sola columna. El diseño lo pone debajo de TODOS los rubros, alineado a la izquierda y
            con `max-width:520px`. Es el cierre de la comparación: tiene que venir después de lo que
            cierra. */}
        <div className="mt-4 max-w-[520px] border-t border-line pt-2">
          <QuedaCombinado obra={obra} />
          <NotaIva sinIva={sinIva} />
        </div>
      </Seccion>
      <Seccion titulo="Consumo por mes" filo
        aclaracion="materiales y subcontratos por fecha del comprobante; mano de obra por la quincena en que empieza"
        leyenda={[{ color: 'bg-accent', rotulo: 'mano de obra' }, { color: 'bg-muted', rotulo: 'subcontratos' }, { color: 'bg-dato-materiales', rotulo: 'materiales' }]}>
        <ConsumoMensual consumo={consumo} />
      </Seccion>
      <Seccion titulo="Costo de la hora" filo arriba="">
        <CostoHora obra={obra} obras={obras} />
      </Seccion>
      <div className="pb-9" />
    </>
  )
}

function Selector({ obras, elegida, filtros }: { obras: ObraAnalitica[]; elegida: string; filtros: Filtros }) {
  return (
    // ═══ EN EL TELÉFONO LA ELEGIDA VA PRIMERO (diseño v9) ═══
    //
    // «En el teléfono la fila de obras es un scroller: la elegida va primero para que se vea.»
    // Ordenado sólo alfabéticamente, a 390 el amarillo quedaba fuera de pantalla y no se sabía qué
    // obra se estaba mirando sin desplazar. `order-first` lo resuelve sin tocar el orden en 1440,
    // donde entran todas y el diseño mantiene el alfabético.
    <nav aria-label="Obra" className="barra-corrible -mx-4 mt-6 flex gap-1.5 px-4 lg:mx-0 lg:flex-wrap lg:px-0">
      {[...obras].sort((a, b) => a.nombre.localeCompare(b.nombre)).map((o) => (
        <Link key={o.id} prefetch={false} href={aUrl({ ...filtros, obra: o.id })} aria-current={o.id === elegida ? 'page' : undefined} data-testid={`obra-${o.id}`}
          className={`flex h-9 shrink-0 items-center whitespace-nowrap rounded-control px-3.5 text-[13px] lg:order-none lg:h-[30px] ${o.id === elegida ? 'order-first bg-marca font-medium text-accent' : 'text-ink-soft hover:bg-surface-sunken'}`}>
          {o.nombre}
        </Link>
      ))}
    </nav>
  )
}

/** Un rubro: la barra fina de lo cotizado, la gruesa de lo consumido, y qué queda. Medidas del diseño v6. */
function Rubro({ item, rotulo, c }: { item: Item; rotulo: string; c: Celda }) {
  const fmt = item === 'horas' ? horasTexto : millones
  const escala = Math.max(c.cotizado ?? 0, c.gastado ?? 0)
  const excedido = c.lectura?.tipo === 'excedido'
  const sinPres = c.lectura?.tipo === 'sinPresupuesto'
  const tono = excedido ? 'bg-neg' : sinPres ? 'bg-warn' : 'bg-accent'
  const gColor = c.gastado == null ? 'text-faint' : excedido ? 'text-neg' : sinPres ? 'text-warn' : 'text-ink'
  return (
    <div className="flex min-w-0 flex-col gap-2.5" data-testid={`rubro-${item}`}>
      <div className="text-[13px] font-semibold text-ink">{rotulo}</div>
      <Par rotulo="cotizado" ancho={ancho(c.cotizado, escala)} barra="bg-dato-referencia"
        valor={c.cotizado != null ? `${fmt(c.cotizado)}${c.estimado ? ' est.' : ''}` : '—'} color={c.cotizado != null ? 'text-ink' : 'text-faint'} titulo={c.cotizadoAusente ?? undefined} />
      <Par rotulo="consumido" ancho={ancho(c.gastado, escala)} barra={tono}
        valor={c.gastado != null ? fmt(c.gastado) : (c.gastadoAusente ?? (item === 'horas' ? 'sin horas' : '—'))} color={gColor} fuerte />
      <LecturaRubro c={c} item={item} />
      {c.consumoEstimado ? <div className="pl-[68px] text-[10.5px] text-faint">{c.consumoEstimado}</div> : null}
    </div>
  )
}

/** DEBAJO DE MATERIALES: con qué base se midió lo consumido. Un número con IVA no se compara con un presupuesto sin IVA. */
function NotaIva({ sinIva }: { sinIva: number | null }) {
  return (
    <p data-testid="nota-iva" className="text-[10.5px] text-faint sm:col-span-2 lg:col-start-2 lg:row-start-3">
      {sinIva == null ? 'consumo con IVA: la base todavía no publica el neto'
        : `neto de IVA · ${sinIva} ${sinIva === 1 ? 'comprobante' : 'comprobantes'} sin IVA discriminado tomados al total`}
    </p>
  )
}

/** Debajo de Materiales y Subcontratos: lo que queda de los dos juntos contra MA. */
function QuedaCombinado({ obra }: { obra: ObraAnalitica }) {
  const q = quedaMaterialesYSubcontratos(obra)
  if (!q) return null
  const excedido = q.lectura?.tipo === 'excedido'
  const texto = q.lectura?.tipo === 'queda' ? `${millones(q.lectura.monto)} · ${pctEntero(q.pct)} consumido`
    : excedido ? `excedido en ${millones(q.lectura?.monto)}` : 'sin movimiento'
  return (
    <div data-testid="queda-materiales-subcontratos" className="flex items-baseline justify-between gap-3">
      <span className="text-[11.5px] text-faint">queda materiales y subcontratos</span>
      <span className={`text-[12.5px] font-semibold tabular-nums ${excedido ? 'text-neg' : 'text-ink'}`}>{texto}</span>
    </div>
  )
}

function Par({ rotulo, ancho: w, barra, valor, color, fuerte = false, titulo }: {
  rotulo: string; ancho: string; barra: string; valor: string | null; color: string; fuerte?: boolean; titulo?: string
}) {
  return (
    <div className="grid h-[18px] grid-cols-[60px_minmax(0,1fr)_minmax(0,auto)] items-center gap-2">
      <div className="text-[11px] text-faint">{rotulo}</div>
      <div className="h-2.5 min-w-0"><div className={`h-full rounded-[2px] ${barra}`} style={{ width: w }} /></div>
      <div className={`max-w-[150px] truncate whitespace-nowrap text-right ${fuerte ? 'text-[12.5px] font-semibold' : 'text-xs'} ${color}`} title={titulo ?? valor ?? undefined}>{valor}</div>
    </div>
  )
}

function LecturaRubro({ c, item }: { c: Celda; item: Item }) {
  const l = c.lectura
  const fmt = item === 'horas' ? horasTexto : millones
  // EL MOTIVO LARGO VA UNA VEZ, en la cabecera; en cada rubro, la palabra corta.
  const corto = c.cotizadoAusente === SIN_PRESUPUESTO_RUBRO || c.cotizadoAusente === INCLUIDO_EN_MATERIALES ? c.cotizadoAusente : 'sin presupuesto'
  const TEXTO: Record<NonNullable<Celda['lectura']>['tipo'], [string, string]> = {
    queda: [`queda ${fmt(l?.monto)} · ${pctEntero(c.pct)} consumido`, 'text-muted'],
    excedido: [`excedido en ${fmt(l?.monto)}`, 'text-neg'],
    sinMovimiento: ['sin movimiento', 'text-muted'],
    sinPresupuesto: [`consumo ${corto}`, 'text-warn'],
    sinConsumo: ['sin consumo registrado con qué comparar', 'text-faint'],
  }
  // SIN LECTURA Y SIN COTIZADO se dice por qué no hay cotizado: la palabra no entra en la columna del número.
  const [texto, color] = l ? TEXTO[l.tipo] : c.cotizado == null && c.cotizadoAusente ? [item === 'horas' ? c.cotizadoAusente : corto, 'text-faint'] : [' ', 'text-muted']
  return <div className={`min-h-[34px] pl-[68px] text-[11.5px] leading-snug ${color}`}>{texto}</div>
}

function ConsumoMensual({ consumo }: { consumo: MesDeConsumo[] | null }) {
  if (consumo == null) return <p className="text-[12.5px] text-faint">El consumo mes a mes todavía no se publica en la base.</p>
  const conMes = consumo.filter((m): m is MesDeConsumo & { mes: string } => m.mes != null).slice(-12)
  const sinFecha = consumo.filter((m) => m.mes == null).reduce((a, m) => a + (m.materiales ?? 0) + (m.subcontratos ?? 0), 0)
  if (!conMes.length) return <p className="text-[12.5px] text-faint">Sin consumo registrado.</p>
  const total = (m: MesDeConsumo) => (m.manoObra ?? 0) + (m.subcontratos ?? 0) + (m.materiales ?? 0)
  const max = Math.max(1, ...conMes.map(total))
  return (
    <>
      <Columnas meses={conMes.map((m) => ({
        mes: m.mes, valor: millones(total(m)),
        partes: [
          { alto: ((m.materiales ?? 0) / max) * 170, clase: 'bg-dato-materiales' },
          { alto: ((m.subcontratos ?? 0) / max) * 170, clase: 'bg-muted' },
          { alto: ((m.manoObra ?? 0) / max) * 170, clase: 'bg-accent' },
        ],
      }))} />
      {sinFecha > 0 ? <p className="mt-3 text-[11.5px] text-faint">{millones(sinFecha)} en comprobantes sin fecha: no tienen mes.</p> : null}
    </>
  )
}

function CostoHora({ obra, obras }: { obra: ObraAnalitica; obras: ObraAnalitica[] }) {
  const medido = porHoraMedido(obra)
  const empresa = costoPorHora(obras).empresa
  const contra = medido != null && empresa ? medido / empresa - 1 : null
  const est = rotuloEstimada(obra.gasto)
  return (
    <div className="grid grid-cols-2 gap-6 lg:grid-cols-3">
      <Dato rotulo="esta obra" valor={porHora(medido)} tono={contra != null && contra > UMBRAL_HORA_CARA ? 'text-warn' : 'text-ink'}
        falta={obra.gasto.manoObra && est ? 'sin medir' : 'sin horas'} nota={medido == null && est ? `la mano de obra es ${est}: horas × tarifa no mide la hora` : contra != null ? `${pctConSigno(contra)} contra la empresa` : undefined} />
      <Dato rotulo="empresa" valor={porHora(empresa)} falta="sin medir" nota="sólo obras con recibo" />
      <Dato rotulo="horas cargadas" valor={horasTexto(obra.gasto.horas)} falta="sin horas" nota={horasTexto(obra.gasto.horasValorizadas) ? `${horasTexto(obra.gasto.horasValorizadas)} con costo` : undefined} />
    </div>
  )
}

function Dato({ rotulo, valor, falta, nota, tono = 'text-ink' }: { rotulo: string; valor: string | null; falta: string; nota?: string; tono?: string }) {
  return (
    <div className="flex flex-col gap-1.5 border-t border-line pt-3">
      <div className="text-[11px] text-faint">{rotulo}</div>
      <div className={`text-[22px] font-semibold leading-none tracking-[-0.02em] tabular-nums ${valor == null ? 'text-faint' : tono}`}>{valor ?? falta}</div>
      {nota ? <div className="text-[11.5px] text-muted">{nota}</div> : null}
    </div>
  )
}
