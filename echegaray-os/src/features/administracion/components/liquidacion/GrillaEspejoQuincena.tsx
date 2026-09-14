'use client'

// EL CUADRO DE LA QUINCENA — para calcular y pagar, no para mirar la planilla.
//
// Dueño, 14/09/2026, tres reclamos del mismo día: *«no puedo calcular nada de ahí que me sirva»*,
// *«no sé cuánto es el total que cobra cada persona»*, *«está rota esa columna final que dice
// "planilla"»*. La fila contesta, de izquierda a derecha, las preguntas en el orden en que se hacen:
//
//   Persona (categoría · alta) · LE FALTA PAGAR (banco · efectivo · 50/50) · Gana · − Adelanto ·
//   − Ya transferido · Efectivo redondeado · $/h · Hs pagas · los días · normales · extra 50 · extra 100
//
// ═══ LO QUE SE MUDÓ AL PANEL, SIN PERDERSE ═══
//
// POR BANCO editable, el acuerdo 50/50 desglosado, el recibo, el cotejo con la planilla, la jornada
// automática y el historial del valor hora: se abren tocando el nombre (`PanelDeLaPersona`).
//
// ═══ NI UN NÚMERO DE LA CADENA SE CALCULA ACÁ ═══
//
// Las cifras son las de `getLiquidacionDeLaQuincena` y el cierre lo comprueba `cierreDeLaFila`. Este
// archivo decide ANCHOS, COLORES Y DÓNDE VA CADA CAMPO.

import { useState } from 'react'
import { V } from '@/shared/components/v2/patron'
import { RotuloDeGrupo } from '../RotuloDeGrupo'
import { CeldaRedondeo } from './CeldasDeLiquidacion'
import { CeldaDeDia, CeldaLeFaltaPagar, Escribible, Leida } from './cuadro/CeldasDelEspejo'
import { CeldaTarifa, rotuloCategoria, type MarcaDePiso } from './cuadro/CeldaTarifa'
import { PanelDeLaPersona } from './cuadro/PanelDeLaPersona'
import { horas as nHoras, pesos } from './formato'
import { ALTO_LIQ, CANAL_SCROLL, COLUMNA_FIJA, MARCO_SCROLL, MONO } from './solapas/tabla'
import type { CampoEditable } from '../../services/liquidacionOverrides'
import type { FilaDelEspejo, TotalesDelEspejo } from '../../services/espejoDeJornales'
import { cierreDeTotales, type EntradaDeHistorial } from '../../services/cuadroDeJornales'

export { FiltrosDelEspejo } from './cuadro/FiltrosDelEspejo'
export type { MarcaDePiso } from './cuadro/CeldaTarifa'

const DIAS_CORTOS = ['D', 'L', 'M', 'M', 'J', 'V', 'S'] as const

function rotuloDia(fecha: string): string {
  const [a, m, d] = fecha.split('-').map(Number)
  return `${DIAS_CORTOS[new Date(Date.UTC(a, m - 1, d)).getUTCDay()]}${d}`
}

const corta = (iso: string | null): string =>
  iso == null ? 'alta sin cargar' : `alta ${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(2, 4)}`

/** La plata, primero: lo que el dueño busca al abrir la pantalla. */
const PLATA = [
  // 216: «50/50 sin recibo $1.800.000» en una línea y «banco $230.240 · efvo $121.916» en la otra.
  { clave: 'leFaltaPagar', rotulo: 'Le falta pagar', px: 216 },
  { clave: 'gana', rotulo: 'Gana', px: 100 },
  { clave: 'adelanto', rotulo: '− Adelanto', px: 96 },
  { clave: 'yaTransferido', rotulo: '− Ya transf.', px: 96 },
  { clave: 'efectivoRedondeado', rotulo: 'Efect. red.', px: 104 },
  { clave: 'valorHora', rotulo: '$/h · mensual', px: 156 },
  { clave: 'horasPagas', rotulo: 'Hs pagas', px: 64 },
] as const

/** Después de los días: las cantidades separadas, para leer de dónde salen las horas pagas. */
const CANTIDADES = [
  { clave: 'normales', rotulo: 'Hs norm.', px: 56 },
  { clave: 'extra50', rotulo: 'Ext. 50%', px: 56 },
  { clave: 'extra100', rotulo: 'Ext. 100%', px: 60 },
] as const

const GAP = 8
const DIA = 36

const columnasDe = (nDias: number): string =>
  `minmax(200px,1fr) ${PLATA.map((c) => `${c.px}px`).join(' ')} repeat(${nDias},${DIA}px) `
  + CANTIDADES.map((c) => `${c.px}px`).join(' ')

const anchoDe = (nDias: number): number =>
  200 + nDias * DIA + [...PLATA, ...CANTIDADES].reduce((s, c) => s + c.px, 0)
  + (nDias + PLATA.length + CANTIDADES.length) * GAP

const filaGrid = (columnas: string, alto: number): React.CSSProperties => ({
  display: 'grid', gridTemplateColumns: columnas, gap: GAP, minHeight: alto,
  alignItems: 'center', borderBottom: `1px solid ${V.linea}`,
  fontSize: '12.5px', fontVariantNumeric: 'tabular-nums',
})

export interface SeccionDelEspejo {
  clave: string
  rotulo: string
  filas: FilaDelEspejo[]
}

/** El % contra el valor anterior, sólo si el valor que rige empieza en esta quincena. */
function pctDeLaQuincena(historial: readonly EntradaDeHistorial[] | undefined, desde: string): number | null {
  const vigente = historial?.find((e) => e.vigente)
  return vigente && vigente.desde === desde ? vigente.pctAumento : null
}

export function GrillaEspejoQuincena({
  dias, secciones, totales, quincena, camposEditables, sello, bajoElPiso = {},
  historiales = {}, historialCompleto = true,
}: {
  dias: readonly string[]
  secciones: readonly SeccionDelEspejo[]
  totales: TotalesDelEspejo
  quincena: { desde: string; hasta: string }
  camposEditables: readonly CampoEditable[]
  bajoElPiso?: Record<string, MarcaDePiso>
  historiales?: Record<string, EntradaDeHistorial[]>
  historialCompleto?: boolean
  sello: React.ReactNode
}) {
  const [abierta, setAbierta] = useState<string | null>(null)
  const columnas = columnasDe(dias.length)
  const filaAbierta = abierta ? secciones.flatMap((s) => s.filas).find((f) => f.personaId === abierta) : undefined
  return (
    <div style={{ background: '#FFFFFF', border: `1px solid ${V.lineaFuerte}`, borderRadius: 10, overflow: 'hidden' }}>
      {sello}
      <div style={{ ...MARCO_SCROLL, padding: `16px ${CANAL_SCROLL}px 0` }}>
        <div data-testid="espejo-tabla" style={{ minWidth: anchoDe(dias.length), display: 'flex', flexDirection: 'column' }}>
          <div data-testid="espejo-encabezado" style={{
            display: 'grid', gridTemplateColumns: columnas, gap: GAP,
            height: ALTO_LIQ.encabezadoAncho, alignItems: 'end', paddingBottom: 8,
            borderBottom: `1px solid ${V.linea}`, fontFamily: MONO, fontSize: '9.5px',
            letterSpacing: '.04em', color: V.tenue, textTransform: 'uppercase',
          }}>
            <div style={COLUMNA_FIJA}>Persona</div>
            {PLATA.map((c) => (
              <div key={c.clave} style={{ textAlign: 'right', color: c.clave === 'leFaltaPagar' ? V.tinta : undefined }}>{c.rotulo}</div>
            ))}
            {dias.map((f) => <div key={f} style={{ textAlign: 'center' }} title={f}>{rotuloDia(f)}</div>)}
            {CANTIDADES.map((c) => <div key={c.clave} style={{ textAlign: 'right' }}>{c.rotulo}</div>)}
          </div>

          {secciones.map((sec, i) => (
            <div key={sec.clave} data-testid={`espejo-seccion-${sec.clave}`}>
              <RotuloDeGrupo texto={sec.rotulo} primero={i === 0} />
              {sec.filas.map((fila) => (
                <Fila key={fila.personaId} fila={fila} columnas={columnas} quincena={quincena}
                  camposEditables={camposEditables} piso={bajoElPiso[fila.personaId]}
                  pct={pctDeLaQuincena(historiales[fila.personaId], quincena.desde)}
                  abrir={() => setAbierta(fila.personaId)} />
              ))}
            </div>
          ))}

          <Total columnas={columnas} dias={dias} totales={totales} />
        </div>
      </div>
      <PieDelEspejo totales={totales} />
      {filaAbierta && (
        <PanelDeLaPersona fila={filaAbierta} quincena={quincena} camposEditables={camposEditables}
          historial={historiales[filaAbierta.personaId] ?? []} historialCompleto={historialCompleto}
          onCerrar={() => setAbierta(null)} />
      )}
    </div>
  )
}

function Fila({ fila, columnas, quincena, camposEditables, piso, pct, abrir }: {
  fila: FilaDelEspejo
  columnas: string
  quincena: { desde: string; hasta: string }
  camposEditables: readonly CampoEditable[]
  piso?: MarcaDePiso
  pct: number | null
  abrir: () => void
}) {
  const l = fila.linea
  const h = fila.horasPorTipo
  return (
    <div data-testid={`espejo-fila-${fila.personaId}`} style={filaGrid(columnas, ALTO_LIQ.filaAlta)}>
      <div style={COLUMNA_FIJA}>
        <button type="button" onClick={abrir} data-testid={`espejo-nombre-${fila.personaId}`} title={`${fila.nombre} · abrir el detalle`}
          style={{
            display: 'block', border: 0, background: 'transparent', padding: 0, cursor: 'pointer', textAlign: 'left',
            color: V.tinta, font: 'inherit', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{fila.nombre}</button>
        <div style={{ fontSize: '11px', color: V.apagado, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {`${fila.categoria ? rotuloCategoria(fila.categoria) : 'sin categoría'} · ${corta(fila.alta)}`}
        </div>
      </div>
      <CeldaLeFaltaPagar fila={fila} />
      <Leida valor={l.cobra} origen={l.origen.cobra}
        titulo={l.valorHora != null && l.horas != null ? `${nHoras(l.horas)} h pagas × ${pesos(l.valorHora)}/h` : undefined} />
      <Escribible campo="adelanto" fila={fila} quincena={quincena} camposEditables={camposEditables} ancho={88} />
      <Escribible campo="yaTransferido" fila={fila} quincena={quincena} camposEditables={camposEditables} ancho={88} />
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <CeldaRedondeo personaId={fila.personaId} valor={l.efectivoRedondeado}
          quincena={quincena} grupo={fila.grupo} bloqueada={fila.cerrada} ancho={96} />
      </div>
      <CeldaTarifa fila={fila} quincena={quincena} piso={piso} pct={pct} />
      <Leida valor={l.horas} unidad="horas" testid={`espejo-hs-pagas-${fila.personaId}`}
        titulo={h.automaticas > 0 ? `${nHoras(h.automaticas)} h de jornada automática sin confirmar: no se pagan` : undefined} />
      {fila.celdas.map((c) => <CeldaDeDia key={c.fecha} celda={c} personaId={fila.personaId} nombre={fila.nombre} />)}
      <Leida valor={h.normales || null} unidad="horas" apagada />
      <Leida valor={h.extra50 || null} unidad="horas" apagada />
      <Leida valor={h.extra100 || null} unidad="horas" apagada />
    </div>
  )
}

/** La fila de total: suma las filas VISIBLES. Cierra igual que cada fila. */
function Total({ columnas, dias, totales }: { columnas: string; dias: readonly string[]; totales: TotalesDelEspejo }) {
  const h = totales.horasPorTipo
  const cierre = cierreDeTotales(totales)
  return (
    <div data-testid="espejo-total" style={{
      ...filaGrid(columnas, ALTO_LIQ.filaAlta), borderBottom: 'none', borderTop: `1px solid ${V.grafito}`, fontWeight: 600,
    }}>
      <div style={COLUMNA_FIJA}>{totales.personas} persona{totales.personas === 1 ? '' : 's'}</div>
      <div data-testid="espejo-total-le-falta-pagar" style={{ textAlign: 'right', lineHeight: 1.25 }}>
        <div style={{ fontSize: '14px', color: cierre?.cierra === false ? V.neg : V.tinta }}>{pesos(totales.total)}</div>
        <div style={{ fontSize: '11px', fontWeight: 400, color: V.apagado, whiteSpace: 'nowrap' }}>
          {`banco ${pesos(totales.porBanco)} · efvo ${pesos(totales.enEfectivo)}`}
        </div>
      </div>
      <Leida valor={totales.cobra} />
      <Leida valor={totales.adelanto} />
      <Leida valor={totales.yaTransferido} />
      <div /><div />
      <Leida valor={totales.horasPagas} unidad="horas" testid="espejo-total-hs" />
      {dias.map((f, i) => (
        <div key={f} style={{ textAlign: 'center', color: totales.porDia[i] == null ? V.tenue : V.tinta }}>
          {totales.porDia[i] == null ? '·' : nHoras(totales.porDia[i])}
        </div>
      ))}
      <Leida valor={h.normales} unidad="horas" />
      <Leida valor={h.extra50} unidad="horas" />
      <Leida valor={h.extra100} unidad="horas" />
    </div>
  )
}

/**
 * EL PIE: cómo se paga la quincena —el lote del banco y los sobres— y lo que el total no pudo sumar.
 * Cierra entre sí y recorta con el filtro, porque sale de los mismos totales.
 */
function PieDelEspejo({ totales }: { totales: TotalesDelEspejo }) {
  const cierre = cierreDeTotales(totales)
  const avisos: string[] = []
  if (cierre?.cierra === false) avisos.push(`el total no cierra por ${pesos(cierre.diferencia)}`)
  if (totales.sinTarifa > 0) avisos.push(`${totales.sinTarifa} sin retribución cargada (no suman a la plata)`)
  if (totales.horasPorTipo.automaticas > 0) avisos.push(`${nHoras(totales.horasPorTipo.automaticas)} h de jornada automática sin confirmar, fuera del pago`)
  return (
    <div data-testid="espejo-pie" style={{
      display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: 16, padding: '12px 20px 16px',
      fontSize: '12.5px', fontVariantNumeric: 'tabular-nums',
    }}>
      <span><span style={{ color: V.apagado }}>Por banco (lote) </span><strong>{pesos(totales.porBanco)}</strong></span>
      <span><span style={{ color: V.apagado }}>En efectivo (sobres) </span><strong>{pesos(totales.enEfectivo)}</strong></span>
      <span><span style={{ color: V.apagado }}>Le falta pagar </span><strong>{pesos(totales.total)}</strong></span>
      {avisos.length > 0 && (
        <span style={{ fontSize: '11.5px', color: cierre?.cierra === false ? V.neg : V.apagado }}>{avisos.join(' · ')}</span>
      )}
    </div>
  )
}
