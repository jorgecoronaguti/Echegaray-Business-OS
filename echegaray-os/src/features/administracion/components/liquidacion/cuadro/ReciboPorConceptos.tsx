'use client'

// EL BLANCO DE LA QUINCENA, CONCEPTO POR CONCEPTO: ESTIMADO, Y EL REAL AL LADO CUANDO LLEGÓ.
//
// Dueño, 14/09/2026: *«en lo del estimado en blanco, que discrimine los conceptos»*. Como el recibo del estudio:
// haberes, subtotal remunerativo, descuentos, total de descuentos y NETO ESTIMADO, que es el Banco preliminar de la
// fila (lo mismo, no otra cuenta: `sueldo.neto`). Cada importe lleva en `title` la regla y cuántos recibos la
// sostienen; una regla dudosa va con ⚠ y sin número. Con recibo real: columnas Real y Dif. (real − estimado); si
// el recibo todavía no está cargado concepto por concepto, el real son sus totales. Entra en 390 px.
//
// Ni una cuenta acá: las filas son `compararConReal`; los totales, del estimado y del recibo.

import type { ReactNode } from 'react'
import { V } from '@/shared/components/v2/patron'
import { pesos } from '../formato'
import { compararConReal, totalesDelReal, type FilaComparada } from '../../../services/reciboEstimado'
import type { SueldoBlancoNegro } from '../../../services/sueldoBlancoNegro'
import type { RenglonDePresentismo } from './presentismoEnElPanel'

const MONO = "'IBM Plex Mono', monospace"
const SOLO_ESTIMADO = 'minmax(0, 1fr) 96px'
const CON_REAL = 'minmax(0, 1fr) 78px 78px 64px'
const SIN_DETALLE_REAL = 'el recibo del estudio todavía no está cargado concepto por concepto'

const legible = (s: string): string => (s ? s.charAt(0) + s.slice(1).toLowerCase() : s)

// EL PRESENTISMO ENTRE LOS CONCEPTOS DEL BLANCO (dueño, 28/09/2026, eligió esto entre tres lugares: «entre los
// conceptos del blanco»). Si el 0425 ya es un renglón (jornada completa, recibo real), su estado, base, % y fechas
// van debajo de ese renglón. Si no (media jornada: el estudio lo anula con el 0426 y desde el 21/09 el par no se
// muestra), va un renglón «Presentismo» detrás del 0401 con el importe de `presentismo.ts` APAGADO y la nota
// «fuera del subtotal»: ese importe se paga o se descuenta con el negro, y el subtotal del blanco no lo suma.
export function ReciboPorConceptos({ s, presentismo = null }: { s: SueldoBlancoNegro; presentismo?: RenglonDePresentismo | null }) {
  const est = s.reciboEstimado ?? null
  const real = s.conceptosReales ?? null
  const totales = totalesDelReal(real) ?? s.totalesReales ?? null
  // SIN BLANCO QUE MOSTRAR, EL PRESENTISMO IGUAL SE DICE (auditor 28/09): «sin categoría» es justamente cuando no hay estimado.
  if (!est && !totales) {
    if (!presentismo) return null
    return (
      <section data-testid="panel-recibo-conceptos" style={{ fontSize: '12px', fontVariantNumeric: 'tabular-nums' }}>
        <FilaDePresentismo r={presentismo} cols={SOLO_ESTIMADO} conReal={false} detalleReal={false} />
      </section>
    )
  }
  const filas = compararConReal(est, real)
  const conReal = totales != null
  const cols = conReal ? CON_REAL : SOLO_ESTIMADO
  const de = (...secciones: string[]) => filas.filter((f) => secciones.includes(f.seccion))
  const p = { cols, conReal, detalleReal: real != null }
  return (
    <section data-testid="panel-recibo-conceptos" style={{ fontSize: '12px', fontVariantNumeric: 'tabular-nums' }}>
      <div style={{ fontFamily: MONO, fontSize: '9.5px', letterSpacing: '.06em', color: V.tenue, textTransform: 'uppercase', paddingBottom: 6 }}>
        {conReal ? 'Blanco · real contra ESTIMADO' : 'Blanco ESTIMADO'}
      </div>
      {conReal && (
        <Grilla cols={cols} color={V.tenue} tamano="10.5px">
          <span>Concepto</span><Derecha>Estimado</Derecha><Derecha>Real</Derecha><Derecha>Dif.</Derecha>
        </Grilla>
      )}
      <Bloque titulo="Haberes" filas={de('remunerativo', 'no_remunerativo')} presentismo={presentismo} {...p} />
      <Total rotulo="Subtotal remunerativo" {...p} est={est?.remunerativo} real={totales?.haberes} />
      <Bloque titulo="Descuentos" filas={de('descuento')} {...p} />
      <Total rotulo="Total descuentos" {...p} est={est?.descuentos} real={totales?.descuentos} />
      <Total rotulo="Neto estimado · Banco" fuerte {...p} est={est?.neto} real={totales?.neto} testid="recibo-neto" />
      {est?.avisos.map((a) => <div key={a} style={{ fontSize: '11px', color: V.warn, paddingTop: 4 }}>{`⚠ ${a}`}</div>)}
    </section>
  )
}

function Grilla({ cols, children, color = V.tinta, tamano = '12px', fuerte = false, borde = V.linea, testid }: {
  cols: string; children: ReactNode; color?: string; tamano?: string; fuerte?: boolean; borde?: string; testid?: string
}) {
  return (
    <div data-testid={testid} style={{
      display: 'grid', gridTemplateColumns: cols, gap: 6, alignItems: 'baseline', padding: '3px 0',
      borderTop: `1px solid ${borde}`, color, fontSize: tamano, fontWeight: fuerte ? 600 : 400,
    }}>
      {children}
    </div>
  )
}

const Derecha = ({ children, title, color }: { children: ReactNode; title?: string; color?: string }) => (
  <span title={title} style={{ textAlign: 'right', color }}>{children}</span>
)

interface PropsDeTabla { cols: string; conReal: boolean; detalleReal: boolean }

function Bloque({ titulo, filas, presentismo = null, ...p }: PropsDeTabla & {
  titulo: string; filas: FilaComparada[]; presentismo?: RenglonDePresentismo | null
}) {
  if (filas.length === 0) return null
  const con0425 = filas.some((f) => f.codigo === '0425')
  const trasBasico = presentismo && !con0425 ? Math.max(filas.findIndex((f) => f.codigo === '0401'), -1) : -2
  return (
    <>
      <div style={{ fontSize: '10.5px', color: V.apagado, paddingTop: 8 }}>{titulo}</div>
      {trasBasico === -1 && presentismo && <FilaDePresentismo r={presentismo} {...p} />}
      {filas.map((f, i) => (
        <div key={`${f.seccion}-${f.codigo}`}>
          <Fila f={f} nota={f.codigo === '0425' && presentismo ? presentismo.notaSinBase : undefined} {...p} />
          {i === trasBasico && presentismo && <FilaDePresentismo r={presentismo} {...p} />}
        </div>
      ))}
    </>
  )
}

/**
 * El presentismo del OS cuando el blanco no lleva 0425 (los recibos no dan la regla, o no hay estimado): mismo
 * renglón que un concepto, importe apagado y fuera del subtotal. No afirma dónde se cobra: no se sabe.
 */
function FilaDePresentismo({ r, cols, conReal }: PropsDeTabla & { r: RenglonDePresentismo }) {
  const fuera = r.valor != null
  const donde = 'fuera del subtotal: el blanco no lleva 0425'
  return (
    <Grilla cols={cols} testid="recibo-concepto-presentismo">
      <div style={{ minWidth: 0 }} data-estado={r.estado}>
        <div>
          <span style={{ fontFamily: MONO, fontSize: '10px', color: V.tenue, marginRight: 6 }}>0425</span>
          {r.rotulo.replace(/^− /, '')}
        </div>
        <div style={{ fontSize: '10.5px', color: V.apagado }}>{fuera ? `${r.nota} · ${donde}` : r.nota}</div>
      </div>
      <Derecha color={V.apagado}>{r.valor == null ? '—' : `${r.rotulo.startsWith('−') ? '− ' : ''}${pesos(r.valor)}`}</Derecha>
      {conReal && <Derecha color={V.tenue}>—</Derecha>}
      {conReal && <Derecha color={V.tenue}>—</Derecha>}
    </Grilla>
  )
}

function Fila({ f, cols, conReal, detalleReal, nota }: PropsDeTabla & { f: FilaComparada; nota?: string }) {
  const unidad = f.unidad == null ? null : `${f.unidad.toLocaleString('es-AR')}${f.base == null ? '' : ` × ${pesos(f.base)}`}`
  // Con fuente y sin número: regla dudosa (⚠). Sin fuente y sin número: el estimado no lo previó.
  const dudosa = f.estimado == null && f.fuente != null
  return (
    <Grilla cols={cols} testid={`recibo-concepto-${f.codigo}`}>
      <div style={{ minWidth: 0 }}>
        <div title={f.descripcion} style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          <span style={{ fontFamily: MONO, fontSize: '10px', color: V.tenue, marginRight: 6 }}>{f.codigo}</span>
          {legible(f.descripcion)}
        </div>
        {unidad && <div style={{ fontSize: '10.5px', color: V.apagado }}>{unidad}</div>}
        {nota && <div data-testid="recibo-concepto-0425-presentismo" style={{ fontSize: '10.5px', color: V.apagado }}>{nota}</div>}
      </div>
      <Derecha title={f.fuente ?? 'el estimado no lo previó'} color={dudosa ? V.warn : conReal ? V.apagado : V.tinta}>
        {dudosa ? '⚠' : pesos(f.estimado)}
      </Derecha>
      {conReal && <Derecha title={detalleReal ? undefined : SIN_DETALLE_REAL}>{pesos(f.real)}</Derecha>}
      {conReal && <Derecha color={f.diferencia ? V.warn : V.tenue}>{f.diferencia == null ? '—' : pesos(f.diferencia)}</Derecha>}
    </Grilla>
  )
}

function Total({ rotulo, cols, conReal, est, real, fuerte = false, testid }: PropsDeTabla & {
  rotulo: string; est: number | null | undefined; real: number | null | undefined; fuerte?: boolean; testid?: string
}) {
  const e = est ?? null, r = real ?? null
  const dif = e == null || r == null ? null : Math.round((r - e) * 100) / 100
  return (
    <Grilla cols={cols} fuerte={fuerte} borde={fuerte ? V.grafito : V.linea} testid={testid}>
      <span>{rotulo}</span>
      <Derecha color={e == null ? V.warn : conReal ? V.apagado : V.tinta} title={e == null ? 'hay un concepto con regla dudosa: sin total estimado' : undefined}>
        {e == null ? '⚠' : pesos(e)}
      </Derecha>
      {conReal && <Derecha>{pesos(r)}</Derecha>}
      {conReal && <Derecha color={dif ? V.warn : V.tenue}>{pesos(dif)}</Derecha>}
    </Grilla>
  )
}
