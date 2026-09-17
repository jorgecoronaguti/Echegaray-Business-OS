'use client'

// LA FILA Y EL TOTAL DEL CUADRO DE JORNALEROS — en el orden en que se arma y se paga el sueldo (dueño, 14–17/09/2026):
//
//   Persona │ HORAS: días · Horas │ RECIBO BLANCO: Hs recibo · $/h cat. · Banco · Pagado · Saldo │
//   RECIBO NEGRO: Hs · $/h negro · Importe · Pagado · Saldo │ RESTO: Presentismo · Efect. red. · Total · Pagado · Saldo · Saldo red.
//
// Ni un número se calcula acá: las cifras son las de la línea (`aplicarOverrides`, `pagoDeLaQuincena`), los
// subtotales los de `totalesDeJornaleros`. Este archivo decide dónde va cada celda.
//
// SIN MENSUALES: tienen su propio cuadro (`FilasMensuales.tsx`). En esta grilla un sueldo del mes dejaba vacías las
// celdas del recibo blanco y ensuciaba el pie (captura del 17/09/2026).

import { V } from '@/shared/components/v2/patron'
import { ALTO_LIQ, COLUMNA_FIJA } from '../solapas/tabla'
import { CeldaRedondeo } from '../CeldasDeLiquidacion'
import { horas as nHoras, pesos } from '../formato'
import { CeldaDeDia, CeldaHorasPagas, CeldaPresentismo, Leida } from './CeldasDelEspejo'
import {
  CeldaHoraCategoria, CeldaHorasBlanco, CeldaHorasNegro, CeldaImporteNegro, CeldaNeto, CeldaPagado,
  CeldaPagadoTotal, CeldaSaldo, CeldaSaldoRedondeado, CeldaTotal,
} from './CeldasBlancoNegro'
import { CeldaTarifa, rotuloCategoria } from './CeldaTarifa'
import { CeldaPersona, RenglonDelDetalle } from './CeldaPersona'
import { LoQueCobra } from './LoQueCobra'
import { categoriasDeLaFila } from './categoriasDeLaFila'
import { filaPagada } from './marcaDePago'
import { filaGrid, PERSONA_ESTIRADA } from './TablaDeBloques'
import type { FilaDelEspejo } from '../../../services/espejoDeJornales'
import type { CampoEditable } from '../../../services/liquidacionOverrides'
import { cierreDeTotales } from '../../../services/cuadroDeJornales'
import { efectivoDelRedondeo, type TotalesDeJornaleros } from '../../../services/liquidacionPorTipo'

export interface EdicionDeFila {
  quincena: { desde: string; hasta: string }
  camposEditables: readonly CampoEditable[]
}

export function FilaJornalero({ fila, columnas, edicion, pct, abrir }: {
  fila: FilaDelEspejo; columnas: string; edicion: EdicionDeFila; pct: number | null; abrir: () => void
}) {
  const l = fila.linea
  const { quincena } = edicion
  // LA FILA PAGADA SE PINTA ENTERA (dueño, 16/09/2026): verde suave = estado positivo, y tapa los fondos de bloque.
  const fondo = filaPagada(l.pagadaEn) ? V.posSuave : undefined
  const s = l.sueldo
  // LAS DOS CATEGORÍAS CON SU $/H (dueño, 16/09/2026): la del recibo paga el blanco; la de plataforma, el negro.
  const c = categoriasDeLaFila({
    plataforma: fila.categoria ? rotuloCategoria(fila.categoria) : null, pisoPlataforma: s?.pisoCategoria ?? null,
    categoriaRecibo: s?.categoriaRecibo, valorHoraRecibo: s?.valorHoraCategoria, periodoRecibo: s?.periodoRecibo, estado: s?.estado ?? null,
  })
  return (
    // `data-fila-edicion`: Tab en una celda pasa a la siguiente editable de ESTA fila (`InlineEdit`).
    <div data-testid={`espejo-fila-${fila.personaId}`} data-tipo="jornalero" data-fila-edicion="" data-pagada={fondo ? '1' : undefined}
      style={{ ...filaGrid(columnas, ALTO_LIQ.filaAlta), background: fondo }}>
      <CeldaPersona fila={fila} fondo={fondo} quincena={quincena} camposEditables={edicion.camposEditables} abrir={abrir}
        cobro={<LoQueCobra fila={fila} />}
        detalle={(
          <div data-testid={`categorias-${fila.personaId}`} data-coinciden={c.coinciden ? '1' : '0'} title={c.titulo}>
            {/* LOS DOS RENGLONES QUEDAN (los pidió el dueño el 16/09) pero tenues; la plataforma se oscurece SÓLO
                cuando no coincide con el recibo, que es el único caso en el que hay algo que mirar. */}
            <RenglonDelDetalle>{c.recibo}</RenglonDelDetalle>
            <RenglonDelDetalle tono={c.coinciden ? undefined : V.tintaSuave}>{c.plataforma}</RenglonDelDetalle>
          </div>
        )} />
      {fila.celdas.map((d) => <CeldaDeDia key={d.fecha} celda={d} personaId={fila.personaId} nombre={fila.nombre} />)}
      <CeldaHorasPagas fila={fila} edicion={edicion} />
      {/* RECIBO BLANCO. Todo se escribe en la abierta (dueño, 14 y 15/09/2026); lo no escrito sigue derivado. */}
      <CeldaHorasBlanco fila={fila} edicion={edicion} />
      <CeldaHoraCategoria fila={fila} edicion={edicion} />
      <CeldaNeto fila={fila} edicion={edicion} />
      <CeldaPagado campo="pagadoBanco" fila={fila} edicion={edicion} />
      <CeldaSaldo fila={fila} lado="banco" />
      {/* RECIBO NEGRO · PLATAFORMA: las horas que el recibo no paga × $/h de la categoría de plataforma. */}
      <CeldaHorasNegro fila={fila} edicion={edicion} />
      <CeldaTarifa fila={fila} quincena={quincena} pct={pct} />
      <CeldaImporteNegro fila={fila} edicion={edicion} />
      <CeldaPagado campo="pagadoEfectivo" fila={fila} edicion={edicion} />
      <CeldaSaldo fila={fila} lado="efectivo" />
      {/* RESTO DEL CÁLCULO. */}
      <CeldaPresentismo fila={fila} />
      {/* EL REDONDEO SIGUE SIENDO DEL DUEÑO: los billetes que entrega en mano. No entra en ninguna cuenta. */}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <CeldaRedondeo personaId={fila.personaId} valor={l.efectivoRedondeado} enEfectivo={efectivoDelRedondeo(fila)}
          quincena={quincena} grupo={fila.grupo} bloqueada={fila.cerrada} ancho={100} />
      </div>
      <CeldaTotal fila={fila} edicion={edicion} />
      <CeldaPagadoTotal fila={fila} />
      <CeldaSaldo fila={fila} lado="total" />
      <CeldaSaldoRedondeado fila={fila} />
    </div>
  )
}

/** El subtotal de jornaleros, columna por columna. Cierra igual que cada fila. */
export function TotalJornaleros({ columnas, dias, t }: { columnas: string; dias: readonly string[]; t: TotalesDeJornaleros }) {
  const cierre = cierreDeTotales(t)
  const noCierra = cierre?.cierra === false
  return (
    <div data-testid="espejo-total" style={{ ...filaGrid(columnas, ALTO_LIQ.filaAlta), borderBottom: 'none', borderTop: `1px solid ${V.grafito}`, fontWeight: 600 }}>
      <div style={{ ...COLUMNA_FIJA, ...PERSONA_ESTIRADA }}>{`${t.personas} jornalero${t.personas === 1 ? '' : 's'}`}</div>
      {dias.map((f, i) => (
        <div key={f} style={{ textAlign: 'center', color: V.tinta }}>{t.porDia[i] == null ? '' : nHoras(t.porDia[i])}</div>
      ))}
      <Leida valor={t.horasPagas} unidad="horas" testid="espejo-total-hs" />
      <div /><div />
      <Leida valor={t.netoBandas} testid="espejo-total-neto" />
      <Leida valor={t.pago.pagadoBanco} testid="espejo-total-pagado-banco" />
      <SaldoTotal valor={t.pago.saldoBanco} testid="espejo-total-saldo-banco" />
      <div /><div />
      <Leida valor={t.negro} testid="espejo-total-negro" />
      <Leida valor={t.pago.pagadoEfectivo} testid="espejo-total-pagado-efectivo" />
      <SaldoTotal valor={t.pago.saldoEfectivo} testid="espejo-total-saldo-efectivo" />
      {/* EL TOTAL DE LA COLUMNA ES LO PERDIDO, en ámbar: es lo que cambió la plata. Lo en juego va al resumen. */}
      <div data-testid="espejo-total-presentismo" style={{ textAlign: 'right', whiteSpace: 'nowrap', color: t.presentismoPerdido > 0 ? V.warn : V.tenue }}
        title={t.presentismoPerdido > 0 ? `${t.presentismoPerdidos} perdieron el presentismo` : 'nadie perdió el presentismo'}>
        {t.presentismoPerdido > 0 ? `−${pesos(t.presentismoPerdido)}` : '·'}
      </div>
      <Leida valor={t.redondeo > 0 ? t.redondeo : null} testid="espejo-total-redondeo" />
      <div data-testid="espejo-total-cobra" style={{ textAlign: 'right', whiteSpace: 'nowrap', color: noCierra ? V.neg : V.tinta }}
        title={noCierra ? `No cierra por ${pesos(cierre?.diferencia ?? null)}` : undefined}>{pesos(t.cobra)}</div>
      <Leida valor={t.pago.pagado} testid="espejo-total-pagado" />
      <SaldoTotal valor={t.pago.saldoTotal} testid="espejo-total-saldo" />
      <Leida valor={t.saldoRedondeado > 0 ? t.saldoRedondeado : null} testid="espejo-total-saldo-redondeado" />
    </div>
  )
}

/** El total de una columna de saldo. Ámbar en negativo: ahí el cuadro pagó de más y hay que mirarlo. */
export function SaldoTotal({ valor, testid }: { valor: number; testid: string }) {
  return (
    <div data-testid={testid} style={{ textAlign: 'right', whiteSpace: 'nowrap', color: valor < 0 ? V.warn : V.tinta }}
      title={valor < 0 ? 'pagado de más por este canal: se descuenta del otro' : undefined}>{pesos(valor)}</div>
  )
}
