// LA ANATOMÍA DE UNA FICHA, TAL COMO LA DIBUJA EL CANÓNICO (20 · Persona Ficha 360, 23 · Proveedor
// Ficha).
//
// ═══ POR QUÉ LA CABECERA DEJÓ DE SER EL SLAB GRAFITO ═══
//
// `BarraContexto` corona una obra o un presupuesto: fondo #30302F, filo amarillo, KPIs adentro. Los
// canónicos 20 y 23 dibujan otra cosa para las FICHAS DE PERSONA Y PROVEEDOR: cabecera blanca con
// migaja, avatar grande con iniciales, nombre a 21px, pastillas de estado al lado del nombre, una
// línea de identidad separada por puntos medios, y las acciones a la derecha —dos íconos secundarios
// y una sola primaria amarilla—. Los números NO viven en la cabecera: bajan a una tira de métricas
// propia, sobre el cuerpo.
//
// No se toca `BarraContexto` porque la usan obras y presupuestos, y el canónico ahí sigue siendo el
// slab. Lo que cambia es qué compone la ficha de Administración, no el design system.
//
// ═══ LA TIRA DE MÉTRICAS NO ESCRIBE CERO ═══
//
// Misma regla que el slab: `valor === null` escribe la ausencia en gris. «0 HH este mes» y «no
// tengo las HH de este mes» son dos hechos distintos y la ficha de una persona que recién entró se
// leería como la de alguien que no trabajó.

import Link from 'next/link'
import type { ReactNode } from 'react'

export type TonoPastilla = 'pos' | 'neg' | 'warn' | 'neutro'

const PASTILLA: Record<TonoPastilla, string> = {
  pos: 'border-[#D6EBDF] bg-pos-soft text-pos',
  neg: 'border-[#F3D3CF] bg-neg-soft text-neg',
  warn: 'border-[#F0DCC4] bg-warn-soft text-warn',
  neutro: 'border-line bg-canvas text-muted',
}

/** La pastilla que viaja al lado del nombre: estado de la entidad, no una etiqueta decorativa. */
export function PastillaFicha({
  tono = 'neutro', children, testid,
}: { tono?: TonoPastilla; children: ReactNode; testid?: string }) {
  return (
    <span
      data-testid={testid}
      className={`shrink-0 rounded-full border px-2.5 py-[2px] text-[11.5px] font-medium leading-[18px] ${PASTILLA[tono]}`}
    >
      {children}
    </span>
  )
}

/** Un hecho de la línea de identidad. El canónico los separa con punto medio, sin rótulos. */
export function HechoFicha({ children, mono }: { children: ReactNode; mono?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap ${mono ? 'font-mono text-[11.5px] tabular-nums' : ''}`}>
      {children}
    </span>
  )
}

export function CabeceraFicha({
  volverA, volverLabel, avatar, titulo, pastillas, hechos, acciones, solapas, testid,
}: {
  volverA: string
  volverLabel: string
  /** El avatar grande con iniciales. Lo dibuja quien llama porque persona y proveedor no comparten
   *  el mismo glifo: una persona lleva sus iniciales, un proveedor el ícono de la empresa. */
  avatar: ReactNode
  titulo: string
  pastillas?: ReactNode
  hechos?: ReactNode
  acciones?: ReactNode
  /** El nivel 2 de solapas vive DENTRO de la cabecera blanca, pegado abajo: así el filo inferior es
   *  uno solo y la solapa activa se apoya sobre él, como en el canónico. */
  solapas?: ReactNode
  testid?: string
}) {
  return (
    <div data-testid={testid} className="border-b border-line bg-surface px-4 pt-2.5 lg:px-5">
      <div className="flex items-center gap-[7px] text-[11.5px] text-faint">
        <Link href={volverA} data-testid="ficha-volver" className="transition-colors hover:text-ink">
          {volverLabel}
        </Link>
        <span>/</span>
        <span className="min-w-0 truncate text-ink-soft">{titulo}</span>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-3.5">
        {avatar}
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="min-w-0 truncate text-[21px] font-semibold leading-tight tracking-[-0.01em] text-ink">
              {titulo}
            </h1>
            {pastillas}
          </div>
          {hechos && (
            <div className="mt-[3px] flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[12px] text-muted">
              {hechos}
            </div>
          )}
        </div>
        {acciones && (
          <div className="ml-auto flex shrink-0 flex-wrap items-center gap-1.5">{acciones}</div>
        )}
      </div>

      {solapas && <div className="mt-2.5">{solapas}</div>}
    </div>
  )
}

/** El separador de la línea de identidad. Es un punto medio apagado, no un guion. */
export function Punto() {
  return <span className="text-line-strong" aria-hidden>·</span>
}

export interface MetricaFicha {
  rotulo: string
  valor: ReactNode | null
  /** El renglón chico a la derecha del número: «21 jornadas», «en 3 obras», «4 paquetes». */
  detalle?: ReactNode
  /** Lo que se escribe cuando no hay dato. NUNCA un cero. */
  falta?: string
  tono?: 'ink' | 'neg' | 'warn' | 'pos'
}

const TONO_NUM: Record<NonNullable<MetricaFicha['tono']>, string> = {
  ink: 'text-ink', neg: 'text-neg', warn: 'text-warn', pos: 'text-pos',
}

/** La tira de métricas del canónico: una sola tarjeta, celdas divididas por hairline. */
export function TiraMetricas({ metricas, testid }: { metricas: MetricaFicha[]; testid?: string }) {
  return (
    <div
      data-testid={testid}
      className="flex flex-wrap overflow-hidden rounded-[10px] border border-line bg-surface"
    >
      {metricas.map((m) => (
        <div
          key={m.rotulo}
          data-metrica={m.rotulo}
          className="min-w-[164px] flex-1 border-r border-[#EFEEEA] px-4 py-3 last:border-r-0"
        >
          <div className="whitespace-nowrap text-[10.5px] tracking-[0.04em] text-faint">{m.rotulo}</div>
          <div className="mt-0.5 flex flex-wrap items-baseline gap-[7px]">
            {m.valor == null
              ? <span className="text-[13px] text-faint">{m.falta ?? 'sin dato'}</span>
              : (
                  <span className={`whitespace-nowrap font-mono text-[20px] font-semibold tabular-nums ${TONO_NUM[m.tono ?? 'ink']}`}>
                    {m.valor}
                  </span>
                )}
            {m.detalle && <span className="whitespace-nowrap text-[11px] text-faint">{m.detalle}</span>}
          </div>
        </div>
      ))}
    </div>
  )
}

/** La tarjeta del aside y del cuerpo: encabezado con título, ícono opcional y contador a la derecha. */
export function TarjetaFicha({
  titulo, icono, indicador, tonoIndicador = 'ink', testid, children,
}: {
  titulo: string
  icono?: ReactNode
  indicador?: ReactNode
  tonoIndicador?: 'ink' | 'neg' | 'warn'
  testid?: string
  children: ReactNode
}) {
  const tono = tonoIndicador === 'neg' ? 'text-neg' : tonoIndicador === 'warn' ? 'text-warn' : 'text-ink'
  return (
    <section
      data-testid={testid}
      className="overflow-hidden rounded-[10px] border border-line bg-surface"
    >
      <div className="flex items-center gap-2.5 border-b border-[#EFEEEA] px-3.5 py-2.5">
        {icono && <span className="flex text-muted">{icono}</span>}
        <h2 className="text-[12.5px] font-semibold text-ink">{titulo}</h2>
        {indicador != null && (
          <span className={`ml-auto font-mono text-[11.5px] tabular-nums ${tono}`}>{indicador}</span>
        )}
      </div>
      {children}
    </section>
  )
}

/** Un renglón rotulado del bloque «Datos»: etiqueta angosta a la izquierda, valor a la derecha. */
export function DatoFicha({
  k, v, mono, falta = 'sin cargar',
}: { k: string; v: ReactNode | null; mono?: boolean; falta?: string }) {
  return (
    <div className="flex items-center gap-2.5 border-b border-[#F5F4F0] py-2 last:border-0">
      <span className="w-[92px] shrink-0 text-[11.5px] text-muted">{k}</span>
      <span
        className={`min-w-0 flex-1 truncate text-[12px] ${
          v == null ? 'text-faint' : mono ? 'font-mono tabular-nums text-ink' : 'text-ink'
        }`}
      >
        {v ?? falta}
      </span>
    </div>
  )
}

/** El cuerpo del bloque «Datos»: sólo el padding del canónico alrededor de los renglones. */
export function CuerpoDatos({ children }: { children: ReactNode }) {
  return <div className="px-3.5 pb-3 pt-1.5">{children}</div>
}

/** Una fila navegable de tarjeta: título, subtítulo con su propio tono, y un valor a la derecha. */
export function FilaTarjeta({
  href, punto, titulo, detalle, tonoDetalle = 'faint', valor, testid,
}: {
  href?: string
  /** El bolito de estado de «Obras donde trabajó»: verde la actual, gris las cerradas. */
  punto?: 'pos' | 'faint'
  titulo: string
  detalle?: ReactNode
  tonoDetalle?: 'faint' | 'neg' | 'warn'
  valor?: ReactNode
  testid?: string
}) {
  const tono = tonoDetalle === 'neg' ? 'text-neg' : tonoDetalle === 'warn' ? 'text-warn' : 'text-faint'
  const cuerpo = (
    <>
      {punto && (
        <span
          className={`h-1.5 w-1.5 shrink-0 rounded-full ${punto === 'pos' ? 'bg-pos' : 'bg-line-strong'}`}
          aria-hidden
        />
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12.5px] text-ink">{titulo}</span>
        {detalle != null && <span className={`mt-px block text-[11px] ${tono}`}>{detalle}</span>}
      </span>
      {valor != null && (
        <span className="shrink-0 font-mono text-[11.5px] tabular-nums text-ink-soft">{valor}</span>
      )}
      {href && <span className="shrink-0 text-[13px] text-line-strong" aria-hidden>›</span>}
    </>
  )
  const clase = 'flex items-center gap-2.5 border-b border-[#F5F4F0] px-3.5 py-2.5 last:border-0'
  return href
    ? <Link href={href} data-testid={testid} className={`${clase} transition-colors hover:bg-canvas`}>{cuerpo}</Link>
    : <div data-testid={testid} className={clase}>{cuerpo}</div>
}
