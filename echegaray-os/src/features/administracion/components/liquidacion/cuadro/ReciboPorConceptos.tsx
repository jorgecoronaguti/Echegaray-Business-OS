'use client'

// EL RECIBO DE LA QUINCENA, CONCEPTO POR CONCEPTO: ESTIMADO, O REAL CONTRA ESTIMADO.
//
// Dueño, 14/09/2026: *«al hacer click en la persona quiero q el menu de la derecha q se abre me muestre una
// liquidacion estimada concepto por concepto»*. Tres bloques como el recibo del estudio —haberes, descuentos,
// neto— y debajo contribuciones y costo empleador si hay con qué. Cada importe estimado lleva en `title` la regla
// y cuántos recibos la sostienen; una regla dudosa no tiene número y lo dice. Con el recibo real: Real y
// Diferencia (real − estimado). Entra en 390 px: el código va delante del concepto, la unidad debajo.
//
// Ni una cuenta acá: las filas son `compararConReal`, los totales del estimado son suyos y los del real, `totalesDelReal`.

import type { ReactNode } from 'react'
import { V } from '@/shared/components/v2/patron'
import { pesos } from '../formato'
import { compararConReal, totalesDelReal, type FilaComparada } from '../../../services/reciboEstimado'
import type { SueldoBlancoNegro } from '../../../services/sueldoBlancoNegro'

const MONO = "'IBM Plex Mono', monospace"
const SOLO_ESTIMADO = 'minmax(0, 1fr) 96px'
const CON_REAL = 'minmax(0, 1fr) 78px 78px 64px'

const legible = (s: string): string => (s ? s.charAt(0) + s.slice(1).toLowerCase() : s)

export function ReciboPorConceptos({ s }: { s: SueldoBlancoNegro }) {
  const est = s.reciboEstimado ?? null
  const real = s.conceptosReales ?? null
  if (!est && !real) return null
  const filas = compararConReal(est, real)
  const tr = totalesDelReal(real)
  const conReal = real != null
  const cols = conReal ? CON_REAL : SOLO_ESTIMADO
  const de = (...secciones: string[]) => filas.filter((f) => secciones.includes(f.seccion))
  const contribuciones = de('contribucion')
  return (
    <section data-testid="panel-recibo-conceptos" style={{ fontSize: '12px', fontVariantNumeric: 'tabular-nums' }}>
      <div style={{ fontFamily: MONO, fontSize: '9.5px', letterSpacing: '.06em', color: V.tenue, textTransform: 'uppercase', paddingBottom: 6 }}>
        {conReal ? (est ? 'Recibo · real contra estimado' : 'Recibo · real') : 'Recibo ESTIMADO'}
      </div>
      {conReal && (
        <Grilla cols={cols} color={V.tenue} tamano="10.5px">
          <span>Concepto</span><Derecha>Estimado</Derecha><Derecha>Real</Derecha><Derecha>Dif.</Derecha>
        </Grilla>
      )}
      <Bloque titulo="Haberes" filas={de('remunerativo', 'no_remunerativo')} cols={cols} conReal={conReal} />
      <Total rotulo="Total haberes" cols={cols} conReal={conReal} est={est?.remunerativo} real={tr?.haberes} />
      <Bloque titulo="Descuentos" filas={de('descuento')} cols={cols} conReal={conReal} />
      <Total rotulo="Total descuentos" cols={cols} conReal={conReal} est={est?.descuentos} real={tr?.descuentos} />
      <Total rotulo="Neto" fuerte cols={cols} conReal={conReal} est={est?.neto} real={tr?.neto} testid="recibo-neto" />
      {contribuciones.length > 0 && (
        <>
          <Bloque titulo="Contribuciones del empleador" filas={contribuciones} cols={cols} conReal={conReal} />
          <Total rotulo="Costo empleador" fuerte cols={cols} conReal={conReal} est={est?.costoTotal} real={tr?.costoTotal} />
        </>
      )}
      {est?.avisos.map((a) => <div key={a} style={{ fontSize: '11px', color: V.warn, paddingTop: 4 }}>{a}</div>)}
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

function Bloque({ titulo, filas, cols, conReal }: { titulo: string; filas: FilaComparada[]; cols: string; conReal: boolean }) {
  if (filas.length === 0) return null
  return (
    <>
      <div style={{ fontSize: '10.5px', color: V.apagado, paddingTop: 8 }}>{titulo}</div>
      {filas.map((f) => <Fila key={`${f.seccion}-${f.codigo}`} f={f} cols={cols} conReal={conReal} />)}
    </>
  )
}

function Fila({ f, cols, conReal }: { f: FilaComparada; cols: string; conReal: boolean }) {
  const unidad = f.unidad == null ? null : `${f.unidad.toLocaleString('es-AR')}${f.base == null ? '' : ` × ${pesos(f.base)}`}`
  // Sin fuente y sin número, el estimado no lo previó; con fuente y sin número, la regla es dudosa.
  const sinNumero = f.fuente ? 'dudosa' : '—'
  return (
    <Grilla cols={cols} testid={`recibo-concepto-${f.codigo}`}>
      <div style={{ minWidth: 0 }}>
        <div title={f.descripcion} style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          <span style={{ fontFamily: MONO, fontSize: '10px', color: V.tenue, marginRight: 6 }}>{f.codigo}</span>
          {legible(f.descripcion)}
        </div>
        {unidad && <div style={{ fontSize: '10.5px', color: V.apagado }}>{unidad}</div>}
      </div>
      <Derecha title={f.fuente ?? (conReal ? 'el estimado no lo previó' : undefined)} color={conReal ? V.apagado : V.tinta}>
        {f.estimado == null ? sinNumero : pesos(f.estimado)}
      </Derecha>
      {conReal && <Derecha>{pesos(f.real)}</Derecha>}
      {conReal && <Derecha color={f.diferencia ? V.warn : V.tenue}>{f.diferencia == null ? '—' : pesos(f.diferencia)}</Derecha>}
    </Grilla>
  )
}

function Total({ rotulo, cols, conReal, est, real, fuerte = false, testid }: {
  rotulo: string; cols: string; conReal: boolean; est: number | null | undefined; real: number | null | undefined; fuerte?: boolean; testid?: string
}) {
  const e = est ?? null, r = real ?? null
  const dif = e == null || r == null ? null : Math.round((r - e) * 100) / 100
  return (
    <Grilla cols={cols} fuerte={fuerte} borde={fuerte ? V.grafito : V.linea} testid={testid}>
      <span>{rotulo}</span>
      <Derecha color={conReal ? V.apagado : V.tinta} title={e == null ? 'hay un concepto sin número: sin total estimado' : undefined}>{pesos(e)}</Derecha>
      {conReal && <Derecha>{pesos(r)}</Derecha>}
      {conReal && <Derecha color={dif ? V.warn : V.tenue}>{pesos(dif)}</Derecha>}
    </Grilla>
  )
}
