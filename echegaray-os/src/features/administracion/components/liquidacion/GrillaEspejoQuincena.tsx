'use client'

// EL CUADRO DE LA QUINCENA — BLANCO + NEGRO (dueño, 14/09/2026).
//
// *«realmente no se entiende nada el cuadro de liq de hs, vamos a rehacer. revisar en cada caso el valor
// hs segun categoria q aparece en recibo de sueldo, esa es la parte en blanco … la otra es otro valor
// hora … q cubre el otro 50 en negro del salario»*. La fila se lee en el orden en que se arma el sueldo:
//
//   Persona · Horas │ BLANCO · recibo: Hs · $/h cat. · Neto (banco) │ NEGRO: Hs · $/h negro ✎ · Importe │
//   TOTAL · − Adelanto ✎ · − Ya transf. ✎ · Efectivo · Efect. red. ✎ · los días
//
// ═══ DOS BANDAS ROTULADAS Y NO SEIS COLUMNAS SUELTAS ═══
//
// «Hs» aparece dos veces y significa dos cosas: las que paga el recibo y las que no. Sin la banda de
// arriba hay que adivinar cuál es cuál; con ella la lectura es de izquierda a derecha sin leyenda.
//
// ═══ LO QUE NO ESTÁ Y POR QUÉ ═══
//
// Sin columnas de extras (dueño, 14/09: «las columnas de hs extra quitarlas»): las extras se siguen
// pagando con el coeficiente de JORNALES dentro de «Horas». Sin «Por banco» aparte: el banco ES el neto.
// El 50/50 acordado y el cotejo con la planilla siguen en el panel de la persona.
//
// ═══ NI UN NÚMERO SE CALCULA ACÁ ═══
//
// Las cifras son las de `getLiquidacionDeLaQuincena` (con `sueldoBlancoNegro`) y el cierre lo comprueba
// `cierreDeLaFila`. Este archivo decide anchos, colores y dónde va cada campo.

import { useState } from 'react'
import { V } from '@/shared/components/v2/patron'
import { RotuloDeGrupo } from '../RotuloDeGrupo'
import { CeldaRedondeo } from './CeldasDeLiquidacion'
import { CeldaDeDia, CeldaHorasPagas, Escribible, Leida } from './cuadro/CeldasDelEspejo'
import {
  CeldaEfectivoDelSueldo, CeldaHoraCategoria, CeldaHorasBlanco, CeldaHorasNegro, CeldaImporteNegro, CeldaNeto, CeldaTotal,
} from './cuadro/CeldasBlancoNegro'
import { CeldaTarifa, rotuloCategoria } from './cuadro/CeldaTarifa'
import { PanelDeLaPersona } from './cuadro/PanelDeLaPersona'
import { horas as nHoras, pesos } from './formato'
import { ALTO_LIQ, CANAL_SCROLL, COLUMNA_FIJA, MARCO_SCROLL, MONO, fondoDeColumnaFija } from './solapas/tabla'
import type { CampoEditable } from '../../services/liquidacionOverrides'
import type { FilaDelEspejo, TotalesDelEspejo } from '../../services/espejoDeJornales'
import { cierreDeTotales, type EntradaDeHistorial } from '../../services/cuadroDeJornales'
import { sumaDelRedondeo } from '../../services/efectivoRedondeado'
import type { DetalleLaboral } from '../../services/detalleLaboral'

export { FiltrosDelEspejo } from './cuadro/FiltrosDelEspejo'

const DIAS_CORTOS = ['D', 'L', 'M', 'M', 'J', 'V', 'S'] as const

function rotuloDia(fecha: string): string {
  const [a, m, d] = fecha.split('-').map(Number)
  return `${DIAS_CORTOS[new Date(Date.UTC(a, m - 1, d)).getUTCDay()]}${d}`
}

const corta = (iso: string | null): string =>
  iso == null ? 'alta sin cargar' : `alta ${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(2, 4)}`

/**
 * LAS COLUMNAS DE LA PLATA, EN EL ORDEN DE LA PESTAÑA «OBREROS 26» DE JORNALES (dueño, 14/09/2026: «pone las hs
 * por dia adelante y todos los calculos monetarios al reves, quiero q repliques la pestaña sheet jornales»).
 * La planilla dice NOMBRE · días · DIAS/HORAS · $ HORA · BANCO · ADELANTO BANCO / EMBARGOS · ADELANTO EFECTIVO ·
 * TOTAL EFECTIVO · TOTAL SEMANA (`orquestador/lib/jornales-espejo.mjs:50`). El modelo blanco/negro queda entre
 * las horas y los adelantos. No cambia ningún cálculo: sólo orden y rótulos. Sin «Cliente · Obra» (dueño:
 * «esa columna no te pedi en liq hs»). `banda` agrupa el encabezado de arriba.
 */
const PLATA = [
  { clave: 'horas', rotulo: 'Horas', px: 56 },
  { clave: 'hsBlanco', rotulo: 'Hs recibo ✎', px: 72, banda: 'blanco' },
  { clave: 'horaCategoria', rotulo: '$/h cat. ✎', px: 96, banda: 'blanco' },
  { clave: 'neto', rotulo: 'Banco ✎', px: 132, banda: 'blanco' },
  { clave: 'hsNegro', rotulo: 'Hs', px: 48, banda: 'negro' },
  // 120: el botón del $/h con el «+8%» al lado. La marca del básico se mudó al $/h de categoría.
  { clave: 'horaNegro', rotulo: '$/h negro ✎', px: 120, banda: 'negro' },
  { clave: 'negro', rotulo: 'Importe', px: 104, banda: 'negro' },
  { clave: 'yaTransferido', rotulo: 'Adelanto banco / embargos ✎', px: 136 },
  { clave: 'adelanto', rotulo: 'Adelanto efectivo ✎', px: 120 },
  { clave: 'enEfectivo', rotulo: 'Total efectivo', px: 112 },
  { clave: 'efectivoRedondeado', rotulo: 'Efect. red. ✎', px: 108 },
  { clave: 'total', rotulo: 'Cobra total', px: 128 },
] as const

const GAP = 8

/**
 * «COBRA TOTAL» FIJA A LA DERECHA (dueño, 14/09/2026: «necesito q en alguna columna de liq hs me diga cuanto cobra
 * en total»). Con el orden de JORNALES quedaba al final y había que desplazarse. Es la espejo de `COLUMNA_FIJA`:
 * frena en el borde del recorte (`right: -CANAL_SCROLL`), fondo opaco y un filo izquierdo con el token de línea.
 */
export const COLUMNA_COBRA: React.CSSProperties = {
  position: 'sticky', right: -CANAL_SCROLL, marginRight: -CANAL_SCROLL, paddingRight: CANAL_SCROLL, paddingLeft: GAP,
  zIndex: 1, background: fondoDeColumnaFija(), borderLeft: `1px solid ${V.linea}`, fontWeight: 600,
}
/**
 * POR DEBAJO DE 560 PX NO QUEDA FIJA: a 390 px Persona (200) y Cobra total (128) fijas dejaban ~20 px para lo del
 * medio. La clase `!important` gana sobre el `style` en línea.
 */
export const CLASE_COBRA = 'max-[559px]:!static max-[559px]:!border-l-0'
const DIA = 36

// LOS DÍAS ADELANTE, COMO EN LA PLANILLA: Persona · días · plata.
const columnasDe = (nDias: number): string =>
  `minmax(200px,1fr) repeat(${nDias},${DIA}px) ${PLATA.map((c) => `${c.px}px`).join(' ')}`

const anchoDe = (nDias: number): number =>
  200 + nDias * DIA + PLATA.reduce((s, c) => s + c.px, 0) + (nDias + PLATA.length) * GAP

/** Cuántas columnas ocupan las dos bandas: la celda de un mensual las cubre enteras. */
const ANCHO_DE_LAS_BANDAS = PLATA.filter((c) => 'banda' in c).length

/** Dónde empieza cada banda en la grilla (1 = Persona, después los días). */
const inicioDe = (banda: 'blanco' | 'negro', nDias: number): number =>
  2 + nDias + PLATA.findIndex((c) => 'banda' in c && c.banda === banda)

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
  dias, secciones, totales, quincena, camposEditables, sello,
  historiales = {}, historialCompleto = true, detalles = {},
}: {
  dias: readonly string[]
  secciones: readonly SeccionDelEspejo[]
  totales: TotalesDelEspejo
  quincena: { desde: string; hasta: string }
  camposEditables: readonly CampoEditable[]
  historiales?: Record<string, EntradaDeHistorial[]>
  historialCompleto?: boolean
  /** El detalle laboral de cada persona (`leerDetallesLaborales`). Viaja armado: el panel no lee. */
  detalles?: Record<string, DetalleLaboral>
  sello: React.ReactNode
}) {
  const [abierta, setAbierta] = useState<string | null>(null)
  const columnas = columnasDe(dias.length)
  const visibles = secciones.flatMap((s) => s.filas)
  const filaAbierta = abierta ? visibles.find((f) => f.personaId === abierta) : undefined
  // EL PIE DEL REDONDEO SUMA LO QUE SE VE: las mismas filas del recorte, guardado o sugerido.
  const redondeo = sumaDelRedondeo(visibles.map((f) => f.linea))
  return (
    <div style={{ background: '#FFFFFF', border: `1px solid ${V.lineaFuerte}`, borderRadius: 10, overflow: 'hidden' }}>
      {sello}
      <div style={{ ...MARCO_SCROLL, padding: `16px ${CANAL_SCROLL}px 0` }}>
        <div data-testid="espejo-tabla" style={{ minWidth: anchoDe(dias.length), display: 'flex', flexDirection: 'column' }}>
          <Encabezado columnas={columnas} dias={dias} sellada={visibles.some((f) => f.cerrada)} />

          {secciones.map((sec, i) => (
            <div key={sec.clave} data-testid={`espejo-seccion-${sec.clave}`}>
              <RotuloDeGrupo texto={sec.rotulo} primero={i === 0} />
              {sec.filas.map((fila) => (
                <Fila key={fila.personaId} fila={fila} columnas={columnas} quincena={quincena}
                  camposEditables={camposEditables}
                  pct={pctDeLaQuincena(historiales[fila.personaId], quincena.desde)}
                  abrir={() => setAbierta(fila.personaId)} />
              ))}
            </div>
          ))}

          <Total columnas={columnas} dias={dias} totales={totales} redondeo={redondeo} />
        </div>
      </div>
      <PieDelEspejo totales={totales} redondeo={redondeo} />
      {/* `key` = LA PERSONA. Sin la clave, abrir a otra persona reutiliza el mismo árbol y cada celda
          editable conserva lo tecleado para la anterior (dueño, 11/09/2026: «si cambiás de persona la
          hora se cambia»). */}
      {filaAbierta && (
        <PanelDeLaPersona key={filaAbierta.personaId} fila={filaAbierta} quincena={quincena} camposEditables={camposEditables}
          historial={historiales[filaAbierta.personaId] ?? []} historialCompleto={historialCompleto}
          detalle={detalles[filaAbierta.personaId]}
          onCerrar={() => setAbierta(null)} />
      )}
    </div>
  )
}

/** Dos niveles: arriba las bandas BLANCO · recibo y NEGRO; abajo el rótulo de cada columna. */
function Encabezado({ columnas, dias, sellada }: { columnas: string; dias: readonly string[]; sellada: boolean }) {
  const mono = { fontFamily: MONO, fontSize: '9.5px', letterSpacing: '.04em', textTransform: 'uppercase' as const }
  const banda = (inicio: number, texto: string, testid: string) => (
    <div data-testid={testid} style={{
      gridColumn: `${inicio} / span 3`, gridRow: 1, borderBottom: `1px solid ${V.grafito}`, paddingBottom: 4,
      color: V.tinta, fontWeight: 600, ...mono,
    }}>{texto}{sellada && (
      // LA FOTO SELLADA NO SE RECALCULA: el negro es total − neto del recibo (`negroDeLaFila`).
      <span data-testid={`${testid}-sellada`} style={{ marginLeft: 8, fontWeight: 400, color: V.apagado, textTransform: 'none' }}>sellada</span>
    )}</div>
  )
  return (
    <div data-testid="espejo-encabezado" style={{
      display: 'grid', gridTemplateColumns: columnas, columnGap: GAP, rowGap: 4, alignItems: 'end',
      paddingBottom: 8, borderBottom: `1px solid ${V.linea}`, color: V.tenue, ...mono,
    }}>
      <div style={{ ...COLUMNA_FIJA, gridRow: 1, alignSelf: 'stretch' }} />
      {banda(inicioDe('blanco', dias.length), 'Blanco · recibo', 'banda-blanco')}
      {banda(inicioDe('negro', dias.length), 'Negro', 'banda-negro')}
      <div style={{ ...COLUMNA_FIJA, gridColumn: 1, gridRow: 2, height: ALTO_LIQ.encabezado - 16, display: 'flex', alignItems: 'end' }}>Persona</div>
      {dias.map((f, i) => <div key={f} style={{ gridColumn: 2 + i, gridRow: 2, textAlign: 'center' }} title={f}>{rotuloDia(f)}</div>)}
      {PLATA.map((c, i) => (
        <div key={c.clave} data-testid={c.clave === 'total' ? 'encabezado-total-cobra' : undefined}
          className={c.clave === 'total' ? CLASE_COBRA : undefined}
          style={{ gridColumn: 2 + dias.length + i, gridRow: 2, textAlign: 'right', ...(c.clave === 'total' ? { ...COLUMNA_COBRA, color: V.tinta, alignSelf: 'stretch', display: 'flex', alignItems: 'end', justifyContent: 'flex-end' } : null) }}>{c.rotulo}</div>
      ))}
    </div>
  )
}

function Fila({ fila, columnas, quincena, camposEditables, pct, abrir }: {
  fila: FilaDelEspejo
  columnas: string
  quincena: { desde: string; hasta: string }
  camposEditables: readonly CampoEditable[]
  pct: number | null
  abrir: () => void
}) {
  const l = fila.linea
  return (
    // `data-fila-edicion`: Tab en una celda pasa a la siguiente editable de ESTA fila (`InlineEdit`).
    <div data-testid={`espejo-fila-${fila.personaId}`} data-fila-edicion="" style={filaGrid(columnas, ALTO_LIQ.filaAlta)}>
      <div style={COLUMNA_FIJA}>
        <button type="button" onClick={abrir} data-testid={`espejo-nombre-${fila.personaId}`} title={`${fila.nombre} · abrir el detalle`}
          style={{
            display: 'block', border: 0, background: 'transparent', padding: 0, cursor: 'pointer', textAlign: 'left',
            color: V.tinta, font: 'inherit', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{fila.nombre}</button>
        <div style={{ fontSize: '11px', color: V.apagado, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {`${fila.categoria ? rotuloCategoria(fila.categoria) : 'sin categoría'} · ${corta(fila.alta)}`}
          {/* QUIEN YA NO ESTÁ NUNCA DESAPARECE DE SU QUINCENA (dueño, 14/09/2026): marca chica y apagada. */}
          {fila.baja && (
            <span data-testid={`baja-${fila.personaId}`} title={fila.baja.titulo} style={{ marginLeft: 6, color: V.tenue }}>{fila.baja.texto}</span>
          )}
        </div>
      </div>
      {fila.celdas.map((c) => <CeldaDeDia key={c.fecha} celda={c} personaId={fila.personaId} nombre={fila.nombre} />)}
      <CeldaHorasPagas fila={fila} />
      {l.netoMensual != null ? (
        // UN MENSUAL NO VA EN LAS BANDAS (QA, 14/09/2026): su sueldo fijo en «$/h negro» sumaba al Total
        // sin estar en Neto ni en Negro. Una celda propia ocupa las seis columnas; su neto mensual se
        // sigue editando acá, y el pie lo suma en «Sueldos mensuales».
        <div data-testid={`mensual-${fila.personaId}`} style={{
          gridColumn: `span ${ANCHO_DE_LAS_BANDAS}`, display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8,
        }}>
          <span style={{ fontSize: '11px', color: V.apagado }}>mensual</span>
          <CeldaTarifa fila={fila} quincena={quincena} pct={pct} />
        </div>
      ) : (
        <>
          {/* EL BLANCO SE ESCRIBE EN LA ABIERTA (dueño, 14/09/2026): Hs recibo, $/h cat. y Neto. El negro, el
              total y el efectivo siguen derivados de lo escrito. */}
          <CeldaHorasBlanco fila={fila} edicion={{ quincena, camposEditables }} />
          <CeldaHoraCategoria fila={fila} edicion={{ quincena, camposEditables }} />
          <CeldaNeto fila={fila} edicion={{ quincena, camposEditables }} />
          <CeldaHorasNegro fila={fila} />
          <CeldaTarifa fila={fila} quincena={quincena} pct={pct} />
          <CeldaImporteNegro fila={fila} edicion={{ quincena, camposEditables }} />
        </>
      )}
      <Escribible campo="yaTransferido" fila={fila} quincena={quincena} camposEditables={camposEditables} ancho={128} />
      <Escribible campo="adelanto" fila={fila} quincena={quincena} camposEditables={camposEditables} ancho={112} />
      <CeldaEfectivoDelSueldo fila={fila} edicion={{ quincena, camposEditables }} />
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <CeldaRedondeo personaId={fila.personaId} valor={l.efectivoRedondeado} enEfectivo={l.enEfectivo}
          quincena={quincena} grupo={fila.grupo} bloqueada={fila.cerrada} ancho={100} />
      </div>
      <div className={CLASE_COBRA} style={{ ...COLUMNA_COBRA, alignSelf: 'stretch', display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
        <CeldaTotal fila={fila} edicion={{ quincena, camposEditables }} />
      </div>
    </div>
  )
}

/** La fila de total: suma las filas VISIBLES, columna por columna de plata. Cierra igual que cada fila. */
function Total({ columnas, dias, totales, redondeo }: {
  columnas: string; dias: readonly string[]; totales: TotalesDelEspejo
  /** Suma de lo que muestra la columna del redondeo en las filas visibles (guardado o sugerido). */
  redondeo: number
}) {
  const cierre = cierreDeTotales(totales)
  const noCierra = cierre?.cierra === false
  return (
    <div data-testid="espejo-total" style={{
      ...filaGrid(columnas, ALTO_LIQ.filaAlta), borderBottom: 'none', borderTop: `1px solid ${V.grafito}`, fontWeight: 600,
    }}>
      <div style={COLUMNA_FIJA}>{totales.personas} persona{totales.personas === 1 ? '' : 's'}</div>
      {dias.map((f, i) => (
        <div key={f} style={{ textAlign: 'center', color: totales.porDia[i] == null ? V.tenue : V.tinta }}>
          {totales.porDia[i] == null ? '·' : nHoras(totales.porDia[i])}
        </div>
      ))}
      <Leida valor={totales.horasPagas} unidad="horas" testid="espejo-total-hs" />
      <div />
      <div />
      <Leida valor={totales.netoBandas} testid="espejo-total-neto" />
      <div />
      <div />
      <Leida valor={totales.negro} testid="espejo-total-negro" />
      <Leida valor={totales.yaTransferido} />
      <Leida valor={totales.adelanto} />
      <div data-testid="espejo-total-efectivo" style={{ textAlign: 'right', whiteSpace: 'nowrap', color: noCierra ? V.neg : V.tinta }}
        title={noCierra ? `No cierra por ${pesos(cierre?.diferencia ?? null)}` : undefined}>{pesos(totales.enEfectivo)}</div>
      <Leida valor={redondeo > 0 ? redondeo : null} testid="espejo-total-redondeo" />
      <div data-testid="espejo-total-cobra" className={CLASE_COBRA}
        style={{ ...COLUMNA_COBRA, textAlign: 'right', fontSize: '14px', whiteSpace: 'nowrap', alignSelf: 'stretch', display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>{pesos(totales.cobra)}</div>
    </div>
  )
}

/**
 * EL PIE: los totales de cada columna de plata —lo que va al lote del banco, lo del negro, los sobres— y lo
 * que el total no pudo sumar. Recorta con el filtro, porque sale de los mismos totales.
 */
function PieDelEspejo({ totales, redondeo }: { totales: TotalesDelEspejo; redondeo: number }) {
  const cierre = cierreDeTotales(totales)
  const avisos: string[] = []
  if (cierre?.cierra === false) avisos.push(`el total no cierra por ${pesos(cierre.diferencia)}`)
  if (totales.sinNeto > 0) avisos.push(`${totales.sinNeto} sin neto: sin recibo previo, no suman`)
  if (totales.sinTarifa > 0) avisos.push(`${totales.sinTarifa} sin retribución cargada (no suman a la plata)`)
  if (totales.estimados > 0) avisos.push(`${totales.estimados} con blanco estimado`)
  const cifra = (rotulo: string, valor: number | null, testid: string) => (
    <span data-testid={testid}><span style={{ color: V.apagado }}>{`${rotulo} `}</span><strong>{pesos(valor)}</strong></span>
  )
  return (
    <div data-testid="espejo-pie" style={{
      display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', columnGap: 16, rowGap: 4, padding: '12px 20px 16px',
      fontSize: '12.5px', fontVariantNumeric: 'tabular-nums',
    }}>
      {/* EL MISMO ORDEN QUE LAS COLUMNAS (JORNALES). BANCO + NEGRO + SUELDOS MENSUALES = TOTAL QUINCENA, exacto. */}
      {cifra('Banco', totales.netoBandas, 'pie-neto')}
      {cifra('Negro', totales.negro, 'pie-negro')}
      {totales.mensuales > 0 && cifra('Sueldos mensuales', totales.mensuales, 'pie-mensuales')}
      {cifra('Adelanto banco / embargos', totales.yaTransferido, 'pie-transferido')}
      {cifra('Adelanto efectivo', totales.adelanto, 'pie-adelantos')}
      {cifra('Total efectivo', totales.enEfectivo, 'pie-efectivo')}
      {cifra('Efectivo redondeado', redondeo > 0 ? redondeo : null, 'pie-redondeo')}
      {cifra('Cobra total', totales.cobra, 'pie-total')}
      {avisos.length > 0 && (
        <span style={{ fontSize: '11.5px', color: cierre?.cierra === false ? V.neg : V.apagado }}>{avisos.join(' · ')}</span>
      )}
    </div>
  )
}
