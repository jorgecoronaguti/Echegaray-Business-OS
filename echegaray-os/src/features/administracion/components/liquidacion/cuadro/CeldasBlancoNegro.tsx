'use client'

// LAS CELDAS DE BLANCO Y NEGRO DEL CUADRO DE LA QUINCENA (dueño, 14/09/2026).
//
// *«realmente no se entiende nada el cuadro de liq de hs, vamos a rehacer»*. La fila se lee como el
// sueldo se arma: lo que paga el recibo (blanco), lo que falta (negro), el total, y cómo se paga.
//
// ═══ «ESTIMADO» SE VE DISTINTO DE «RECIBO» ═══
//
// Sin recibo del período el blanco es una estimación (mitad de las horas × $/h de su categoría). Se
// dibuja apagado y en cursiva con «est.» chico: un número estimado con la tinta de uno real se lee como
// hecho. Con recibo, tinta normal y el enlace al PDF. Ámbar sólo para el problema: el recibo paga más
// horas que las cargadas.
//
// Ni una cuenta acá: las cifras son las de `linea.sueldo` (`sueldoBlancoNegro`) y la cadena.

import type { CSSProperties, ReactNode } from 'react'
import { V } from '@/shared/components/v2/patron'
import { MarcaDeOrigen } from '../CeldasDeLiquidacion'
import { horas as nHoras, pesos } from '../formato'
import { estadoDelPago, tituloDeJornales } from './estadoDelPago'
import type { FilaDelEspejo } from '../../../services/espejoDeJornales'
import type { SueldoBlancoNegro } from '../../../services/sueldoBlancoNegro'

const DERECHA: CSSProperties = { textAlign: 'right', whiteSpace: 'nowrap', overflow: 'hidden' }
const ESTIMADO: CSSProperties = { color: V.apagado, fontStyle: 'italic' }

export const urlDelRecibo = (id: string): string => `https://drive.google.com/file/d/${id}/view`

/** «est.» chico, derecho: la cursiva ya dice «apagado», el rótulo dice por qué. */
export const Est = () => (
  <span style={{ fontSize: '9.5px', color: V.tenue, marginLeft: 3, fontStyle: 'normal' }}>est.</span>
)

/** De dónde sale el blanco, en llano. Lo usan el `title` de la fila y el panel. */
export function origenDelBlanco(s: SueldoBlancoNegro): string {
  if (s.estado === 'recibo') return 'recibo del estudio'
  if (s.origenNeto === 'nomina') return 'neto del recibo de nómina; horas del blanco estimadas (mitad)'
  if (s.origenNeto === 'estimado') return 'estimado: mitad de las horas × $/h de su categoría; neto con la proporción de su último recibo'
  return 'estimado: mitad de las horas × $/h de su categoría; sin recibo previo no hay neto'
}

function Celda({ s, valor, testid, titulo, children }: {
  s: SueldoBlancoNegro | null; valor: string; testid?: string; titulo?: string; children?: ReactNode
}) {
  if (!s) return <div style={{ ...DERECHA, color: V.tenue }}>—</div>
  const est = s.estado === 'estimado'
  return (
    <div data-testid={testid} title={titulo ?? origenDelBlanco(s)} style={{ ...DERECHA, ...(est ? ESTIMADO : { color: V.tinta }) }}>
      {valor}{children}
    </div>
  )
}

export function CeldaHorasBlanco({ fila }: { fila: FilaDelEspejo }) {
  const s = fila.linea.sueldo
  return <Celda s={s} valor={nHoras(s?.horasBlanco ?? null)} testid={`hs-blanco-${fila.personaId}`} />
}

export function CeldaHoraCategoria({ fila }: { fila: FilaDelEspejo }) {
  const s = fila.linea.sueldo
  return <Celda s={s} valor={pesos(s?.valorHoraCategoria ?? null)} testid={`hora-categoria-${fila.personaId}`} />
}

/** NETO (BANCO): el neto del recibo, o el estimado; lo escrito a mano gana y se marca. */
export function CeldaNeto({ fila }: { fila: FilaDelEspejo }) {
  const l = fila.linea
  const s = l.sueldo
  const testid = `neto-${fila.personaId}`
  if (s && s.neto == null && !l.manual.porBanco) {
    return <div data-testid={testid} title={origenDelBlanco(s)} style={{ ...DERECHA, color: V.tenue }}>sin neto</div>
  }
  const estimado = s != null && s.origenNeto === 'estimado' && !l.manual.porBanco
  return (
    <div data-testid={testid} title={s ? origenDelBlanco(s) : undefined}
      style={{ ...DERECHA, ...(estimado ? ESTIMADO : { color: V.tinta }) }}>
      {pesos(l.porBanco)}{estimado && <Est />}
      <MarcaDeOrigen origen={l.origen.porBanco} compacta />
      {s?.driveFileId && (
        <a href={urlDelRecibo(s.driveFileId)} target="_blank" rel="noreferrer" data-testid={`recibo-pdf-${fila.personaId}`}
          title="Abrir el recibo" style={{ marginLeft: 4, fontSize: '10.5px', color: V.apagado, fontStyle: 'normal' }}>↗</a>
      )}
    </div>
  )
}

/** HS NEGRO: las que el recibo no paga. Ámbar si el recibo paga más de las cargadas. */
export function CeldaHorasNegro({ fila }: { fila: FilaDelEspejo }) {
  const s = fila.linea.sueldo
  if (s?.reciboExcedeHoras) {
    return (
      <div data-testid={`hs-negro-${fila.personaId}`} title="el recibo paga más horas que las cargadas"
        style={{ ...DERECHA, color: V.warn, fontWeight: 600 }}>0</div>
    )
  }
  return <Celda s={s} valor={nHoras(s?.horasNegro ?? null)} testid={`hs-negro-${fila.personaId}`} />
}

export function CeldaImporteNegro({ fila }: { fila: FilaDelEspejo }) {
  const s = fila.linea.sueldo
  return (
    <Celda s={s} valor={pesos(s?.negro ?? null)} testid={`negro-${fila.personaId}`}
      titulo={s && s.horasNegro != null ? `${nHoras(s.horasNegro)} h × ${pesos(s.valorHoraNegro)}/h negro` : undefined} />
  )
}

/** TOTAL = neto + negro. El número principal de la fila. JORNALES en el `title`, sin mandar. */
export function CeldaTotal({ fila }: { fila: FilaDelEspejo }) {
  const l = fila.linea
  const s = l.sueldo
  const jornales = tituloDeJornales(l)
  if (l.cobra == null) {
    const porque = l.sinNeto ? 'sin neto' : 'sin tarifa'
    return (
      <div data-testid={`total-${fila.personaId}`} style={{ ...DERECHA, color: V.tenue }}
        title={[l.sinNeto ? 'Sin neto del blanco: no hay total que afirmar.' : 'Sin retribución cargada.', jornales].filter(Boolean).join(' · ')}>
        {porque}
      </div>
    )
  }
  const estimado = s?.estado === 'estimado' && l.origen.cobra === 'calculado'
  const cuenta = s ? `neto ${pesos(l.porBanco)} + negro ${pesos(s.negro)}` : null
  return (
    <div data-testid={`total-${fila.personaId}`} title={[cuenta, jornales].filter(Boolean).join(' · ') || undefined}
      style={{ ...DERECHA, fontSize: '14px', fontWeight: 600, ...(estimado ? ESTIMADO : { color: V.tinta }) }}>
      {pesos(l.cobra)}{estimado && <Est />}<MarcaDeOrigen origen={l.origen.cobra} compacta />
    </div>
  )
}

/** EFECTIVO = total − banco − adelanto − ya transferido. Rojo con el porqué sólo si la fila no cierra. */
export function CeldaEfectivoDelSueldo({ fila }: { fila: FilaDelEspejo }) {
  const l = fila.linea
  const e = estadoDelPago(l)
  return (
    <div data-testid={`efectivo-${fila.personaId}`} title={e.titulo}
      style={{ ...DERECHA, color: e.noCierra ? V.neg : V.tinta }}>
      {pesos(l.enEfectivo)}<MarcaDeOrigen origen={l.origen.enEfectivo} compacta />
    </div>
  )
}
