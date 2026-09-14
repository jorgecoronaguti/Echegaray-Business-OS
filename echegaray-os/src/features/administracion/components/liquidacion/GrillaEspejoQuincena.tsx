'use client'

// EL CUADRO DE LA QUINCENA — el bloque «Obreros 26» de la planilla JORNALES, en la app y editable.
//
// Dueño, 14/09/2026, sobre la versión anterior: *«demasiado resumido, no puedo modificar el valor
// hora, no tengo referencias de valores hs históricos de cada uno, deja afuera detalles relevantes,
// rehacer toda la sección»*. Eligió las columnas: «Legajo: alta y categoría» · «Horas normales y
// extras aparte» · «Toda la cadena de pago» · $/h «en la celda + historial al lado».
//
// Orden: Persona · Alta · Categoría · días · Normales · Extra 50 · Extra 100 · Total hs · $/h ·
// Cobra · Adelanto · Ya transf. · Por banco · Efectivo · Total · Efect. red. · Planilla.
//
// ═══ NI UN NÚMERO DE LA CADENA SE CALCULA ACÁ ═══
//
// Las celdas llegan armadas por `espejoDeJornales.ts` (la línea de `getLiquidacionDeLaQuincena`, las
// horas por tipo de `cuadroDeJornales.ts`). Este archivo decide ANCHOS, COLORES Y DÓNDE VA EL CAMPO.
// Si alguna vez hace una resta, hay dos definiciones de la cadena de pago.
//
// ═══ LAS CELDAS SE ESCRIBEN CON LOS EDITORES QUE YA EXISTEN ═══
//
// Día: `CeldaDeDia` → `guardarHorasDeLaCelda`. Plata: `CeldaEditable`. Redondeo: `CeldaRedondeo`.
// $/h: `CeldaTarifa` → `registrarTarifaDesdeLaQuincena`, que INSERTA una fila nueva en
// `persona_tarifa` (ver la cabecera de esa acción por qué no es `guardarValorHora`).

import { useState } from 'react'
import { V } from '@/shared/components/v2/patron'
import { RotuloDeGrupo } from '../RotuloDeGrupo'
import { CeldaRedondeo } from './CeldasDeLiquidacion'
import { ChipDeCotejo, CeldaDeDia, Escribible, Leida } from './cuadro/CeldasDelEspejo'
import { CeldaTarifa, rotuloCategoria, type MarcaDePiso } from './cuadro/CeldaTarifa'
import { HistorialDeTarifa } from './cuadro/HistorialDeTarifa'
import { horas as nHoras } from './formato'
import { ALTO_LIQ, CANAL_SCROLL, COLUMNA_FIJA, MARCO_SCROLL, MONO } from './solapas/tabla'
import type { CampoEditable } from '../../services/liquidacionOverrides'
import type { FilaDelEspejo, TotalesDelEspejo } from '../../services/espejoDeJornales'
import type { EntradaDeHistorial } from '../../services/cuadroDeJornales'

export { FiltrosDelEspejo } from './cuadro/FiltrosDelEspejo'
export type { MarcaDePiso } from './cuadro/CeldaTarifa'

const DIAS_CORTOS = ['D', 'L', 'M', 'M', 'J', 'V', 'S'] as const

/** `L1`, `S12`: la inicial del día y el número, como en el encabezado del bloque de la planilla. */
function rotuloDia(fecha: string): string {
  const [a, m, d] = fecha.split('-').map(Number)
  return `${DIAS_CORTOS[new Date(Date.UTC(a, m - 1, d)).getUTCDay()]}${d}`
}

const corta = (iso: string | null): string =>
  iso == null ? '—' : `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(2, 4)}`

/** Las columnas del legajo, entre el nombre y los días. No se fijan: la fija es sólo la del nombre. */
const LEGAJO = [
  { clave: 'alta', rotulo: 'Alta', px: 64 },
  { clave: 'categoria', rotulo: 'Categoría', px: 112 },
] as const

/** Las columnas de la derecha. El ancho sale del número más largo que reciben. */
const DERECHA = [
  { clave: 'normales', rotulo: 'Hs norm.', px: 56 },
  { clave: 'extra50', rotulo: 'Ext. 50%', px: 56 },
  { clave: 'extra100', rotulo: 'Ext. 100%', px: 60 },
  { clave: 'totalHoras', rotulo: 'Total hs', px: 60 },
  // 128: el neto mensual de Oficina («$1.800.000»), la marca «−N%» y el botón del historial.
  { clave: 'valorHora', rotulo: '$/h · mensual', px: 128 },
  { clave: 'cobra', rotulo: 'Cobra', px: 94 },
  { clave: 'adelanto', rotulo: 'Adelanto', px: 86 },
  { clave: 'yaTransferido', rotulo: 'Ya transf.', px: 88 },
  { clave: 'porBanco', rotulo: 'Por banco', px: 88 },
  { clave: 'enEfectivo', rotulo: 'Efectivo', px: 90 },
  { clave: 'total', rotulo: 'Total', px: 94 },
  { clave: 'efectivoRedondeado', rotulo: 'Efect. red.', px: 96 },
  { clave: 'planilla', rotulo: 'Planilla', px: 84 },
] as const

const GAP = 8
const COLUMNAS_FIJAS = [...LEGAJO, ...DERECHA]

const columnasDe = (nDias: number): string =>
  `minmax(190px,1fr) ${LEGAJO.map((c) => `${c.px}px`).join(' ')} repeat(${nDias},34px) `
  + DERECHA.map((c) => `${c.px}px`).join(' ')

const anchoDe = (nDias: number): number =>
  190 + nDias * 34 + COLUMNAS_FIJAS.reduce((s, c) => s + c.px, 0) + (nDias + COLUMNAS_FIJAS.length) * GAP

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

export function GrillaEspejoQuincena({
  dias, secciones, totales, quincena, camposEditables, sello, bajoElPiso = {},
  historiales = {}, historialCompleto = true,
}: {
  dias: readonly string[]
  secciones: readonly SeccionDelEspejo[]
  totales: TotalesDelEspejo
  quincena: { desde: string; hasta: string }
  camposEditables: readonly CampoEditable[]
  /** Por persona. Ausente = no está bajo el piso O no se pudo comparar (eso lo dice «Convenios»). */
  bajoElPiso?: Record<string, MarcaDePiso>
  /** El historial del valor hora de cada persona, ya armado en el servidor. */
  historiales?: Record<string, EntradaDeHistorial[]>
  historialCompleto?: boolean
  /** El sello de la planilla: lo dibuja el servidor y viaja entero. */
  sello: React.ReactNode
}) {
  const [abierta, setAbierta] = useState<FilaDelEspejo | null>(null)
  const columnas = columnasDe(dias.length)
  return (
    <div style={{
      background: '#FFFFFF', border: `1px solid ${V.lineaFuerte}`, borderRadius: 10,
      overflow: 'hidden',
    }}>
      {sello}
      {/* MARCO_SCROLL avisa que hay más a los lados; la primera columna se queda. Ver `tabla.tsx`. */}
      <div style={{ ...MARCO_SCROLL, padding: `16px ${CANAL_SCROLL}px 0` }}>
        <div data-testid="espejo-tabla" style={{ minWidth: anchoDe(dias.length), display: 'flex', flexDirection: 'column' }}>
          <div data-testid="espejo-encabezado" style={{
            display: 'grid', gridTemplateColumns: columnas, gap: GAP,
            height: ALTO_LIQ.encabezadoAncho, alignItems: 'end', paddingBottom: 8,
            borderBottom: `1px solid ${V.linea}`, fontFamily: MONO, fontSize: '9.5px',
            letterSpacing: '.04em', color: V.tenue, textTransform: 'uppercase',
          }}>
            <div style={COLUMNA_FIJA}>Persona</div>
            {LEGAJO.map((c) => <div key={c.clave}>{c.rotulo}</div>)}
            {dias.map((f) => (
              <div key={f} style={{ textAlign: 'center' }} title={f}>{rotuloDia(f)}</div>
            ))}
            {DERECHA.map((c) => <div key={c.clave} style={{ textAlign: 'right' }}>{c.rotulo}</div>)}
          </div>

          {secciones.map((sec, i) => (
            <div key={sec.clave} data-testid={`espejo-seccion-${sec.clave}`}>
              <RotuloDeGrupo texto={sec.rotulo} primero={i === 0} />
              {sec.filas.map((fila) => (
                <Fila key={fila.personaId} fila={fila} columnas={columnas} quincena={quincena}
                  camposEditables={camposEditables} piso={bajoElPiso[fila.personaId]}
                  abrir={() => setAbierta(fila)} />
              ))}
            </div>
          ))}

          <Total columnas={columnas} dias={dias} totales={totales} />
        </div>
      </div>
      <PieDelEspejo totales={totales} />
      {abierta && (
        <HistorialDeTarifa
          persona={{ personaId: abierta.personaId, nombre: abierta.nombre, alta: abierta.alta, categoria: abierta.categoria }}
          entradas={historiales[abierta.personaId] ?? []}
          completo={historialCompleto}
          onCerrar={() => setAbierta(null)}
        />
      )}
    </div>
  )
}

/** Una fila: el nombre, el legajo, los días, las horas por tipo y la cadena. */
function Fila({ fila, columnas, quincena, camposEditables, piso, abrir }: {
  fila: FilaDelEspejo
  columnas: string
  quincena: { desde: string; hasta: string }
  camposEditables: readonly CampoEditable[]
  piso?: MarcaDePiso
  abrir: () => void
}) {
  const l = fila.linea
  const h = fila.horasPorTipo
  // LO TRABAJADO Y LO QUE LIQUIDA NO SIEMPRE SON EL MISMO NÚMERO (domingos, licencias pagas). Se
  // marca y se dicen los dos: igualarlos escondería justo el detalle que se pidió no perder.
  const liquidaOtra = l.horas != null && Math.abs(l.horas - h.total) > 0.01
  return (
    <div data-testid={`espejo-fila-${fila.personaId}`} style={filaGrid(columnas, ALTO_LIQ.filaPersona)}>
      <div style={COLUMNA_FIJA}>
        <button type="button" onClick={abrir} data-testid={`espejo-nombre-${fila.personaId}`} title={fila.nombre}
          style={{
            border: 0, background: 'transparent', padding: 0, cursor: 'pointer', color: V.tinta,
            font: 'inherit', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{fila.nombre}</button>
      </div>
      <div style={{ fontFamily: MONO, fontSize: '11.5px', color: fila.alta ? V.apagado : V.tenue }}>{corta(fila.alta)}</div>
      <div style={{ color: fila.categoria ? V.apagado : V.tenue, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
        title={fila.categoria ?? 'sin categoría en el legajo'}>
        {fila.categoria ? rotuloCategoria(fila.categoria) : '—'}
      </div>
      {fila.celdas.map((c) => (
        <CeldaDeDia key={c.fecha} celda={c} personaId={fila.personaId} nombre={fila.nombre} />
      ))}
      <Leida valor={h.normales || null} unidad="horas" />
      <Leida valor={h.extra50 || null} unidad="horas" />
      <Leida valor={h.extra100 || null} unidad="horas" />
      <Leida valor={h.total} unidad="horas" medio testid={`espejo-total-hs-${fila.personaId}`}
        titulo={liquidaOtra ? `Trabajadas ${nHoras(h.total)} h · liquida ${nHoras(l.horas)} h (sin domingos, con licencias pagas)` : undefined} />
      <CeldaTarifa fila={fila} quincena={quincena} piso={piso} abrirHistorial={abrir} />
      <Leida valor={l.cobra} medio origen={l.origen.cobra}
        titulo={l.valorHora != null && l.horas != null ? `${nHoras(l.horas)} h liquidables × $/h` : undefined} />
      <Escribible campo="adelanto" fila={fila} quincena={quincena} camposEditables={camposEditables} ancho={78} />
      <Escribible campo="yaTransferido" fila={fila} quincena={quincena} camposEditables={camposEditables} ancho={80} />
      <Escribible campo="porBanco" fila={fila} quincena={quincena} camposEditables={camposEditables} ancho={80} />
      <Leida valor={l.enEfectivo} medio origen={l.origen.enEfectivo} />
      <Leida valor={l.total} origen={l.origen.total} />
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <CeldaRedondeo personaId={fila.personaId} valor={l.efectivoRedondeado}
          quincena={quincena} grupo={fila.grupo} bloqueada={fila.cerrada} ancho={88} />
      </div>
      <ChipDeCotejo fila={fila} />
    </div>
  )
}

/** La fila de total, cerrada por arriba con el grafito. Suma las filas visibles, no el plantel. */
function Total({ columnas, dias, totales }: {
  columnas: string; dias: readonly string[]; totales: TotalesDelEspejo
}) {
  const h = totales.horasPorTipo
  return (
    <div data-testid="espejo-total" style={{
      ...filaGrid(columnas, ALTO_LIQ.total), borderBottom: 'none',
      borderTop: `1px solid ${V.grafito}`, fontWeight: 600,
    }}>
      <div style={COLUMNA_FIJA}>{totales.personas} persona{totales.personas === 1 ? '' : 's'}</div>
      <div /><div />
      {dias.map((f, i) => (
        <div key={f} style={{ textAlign: 'center', color: totales.porDia[i] == null ? V.tenue : V.tinta }}>
          {totales.porDia[i] == null ? '·' : nHoras(totales.porDia[i])}
        </div>
      ))}
      <Leida valor={h.normales} unidad="horas" />
      <Leida valor={h.extra50} unidad="horas" />
      <Leida valor={h.extra100} unidad="horas" />
      <Leida valor={h.total} unidad="horas" testid="espejo-total-hs" />
      <div />
      <Leida valor={totales.cobra} />
      <Leida valor={totales.adelanto} />
      <Leida valor={totales.yaTransferido} />
      <Leida valor={totales.porBanco} />
      <Leida valor={totales.enEfectivo} />
      <Leida valor={totales.total} />
      <div />
      <div />
    </div>
  )
}

/**
 * EL PIE: lo que el total NO pudo sumar, con su número. Sólo cuando hay algo que decir: un párrafo
 * permanente debajo de una tabla es uno de los que el dueño prohíbe.
 */
function PieDelEspejo({ totales }: { totales: TotalesDelEspejo }) {
  const partes: string[] = []
  if (totales.sinTarifa > 0) partes.push(`${totales.sinTarifa} sin retribución cargada (no suman a la plata)`)
  if (totales.difieren > 0) {
    partes.push(`${totales.difieren} fila${totales.difieren === 1 ? '' : 's'} difiere${totales.difieren === 1 ? '' : 'n'} de la planilla por ${nHoras(totales.horasDeDiferencia)} h`)
  }
  if (totales.sinCotejar > 0 && totales.sinCotejar === totales.personas) {
    partes.push('todavía no se cotejó contra la planilla')
  }
  if (partes.length === 0) return <div style={{ height: 16 }} />
  return (
    <p data-testid="espejo-pie" style={{
      fontSize: '11.5px', color: V.apagado, margin: 0, padding: '8px 20px 16px',
    }}>
      {partes.join(' · ')}.
    </p>
  )
}
