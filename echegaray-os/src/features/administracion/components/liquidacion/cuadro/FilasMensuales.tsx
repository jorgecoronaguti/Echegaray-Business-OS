'use client'

// LA FILA Y EL TOTAL DEL CUADRO DE MENSUALES — jefes de obra y quien tiene neto mensual (dueño, 17/09/2026).
//
//   Persona │ SUELDO: asistencia (referencia) · Sueldo del mes │ RECIBO BLANCO: Banco · Pagado · Saldo │
//   EFECTIVO: Importe · Pagado · Saldo │ RESTO: Presentismo · Efect. red. · Total · Pagado · Saldo · Saldo red.
//
// ═══ NINGUNA CELDA VACÍA ═══
//
// La captura del 17/09 tenía a Maldonado y Nievas con «Recibo: sin recibo todavía · —/h» y el bloque blanco en
// blanco: no se sabía si faltaba un dato o si el sistema lo había perdido. Acá cada hueco dice qué falta —«sin recibo
// todavía», «falta recibo», «importe no cargado»— y lo que sí se puede afirmar se afirma: sin recibo el reparto entre
// banco y efectivo no se conoce, pero cuánto falta pagar en total sí (`pagoDelMensual`).

import { V } from '@/shared/components/v2/patron'
import { ALTO_LIQ, COLUMNA_FIJA } from '../solapas/tabla'
import { CeldaRedondeo } from '../CeldasDeLiquidacion'
import { horas as nHoras, pesos } from '../formato'
import { CeldaPresentismo, Leida } from './CeldasDelEspejo'
import { CeldaPagado, CeldaPagadoTotal, CeldaSaldo, CeldaSaldoRedondeado, CeldaTotal } from './CeldasBlancoNegro'
import { CeldaTarifa } from './CeldaTarifa'
import { CeldaPersona, RenglonDelDetalle } from './CeldaPersona'
import { filaPagada } from './marcaDePago'
import { filaGrid, PERSONA_ESTIRADA } from './TablaDeBloques'
import { SaldoTotal, type EdicionDeFila } from './FilasJornaleros'
import type { FilaDelEspejo } from '../../../services/espejoDeJornales'
import { rotuloDelMensual } from '../../../services/cobroMensual'
import { sinSello } from './estadoDelPago'
import {
  asistenciaDeReferencia, efectivoDelRedondeo, pagoDelMensual, type PagoDelMensual, type TotalesDeMensuales,
} from '../../../services/liquidacionPorTipo'

const FALTA_RECIBO = {
  texto: 'falta recibo',
  titulo: 'Sin recibo no se sabe cuánto va por banco y cuánto en efectivo. El saldo total sí se afirma: sueldo − pagado.',
}

const DERECHA = { textAlign: 'right' as const, whiteSpace: 'nowrap' as const, overflow: 'hidden' as const }

/** «Recibo $663.141» / «sin recibo todavía», y de dónde sale. */
export function textoDelRecibo(p: PagoDelMensual, reciboSinGiro: boolean): { texto: string; titulo: string } {
  if (p.banco == null) return { texto: 'sin recibo todavía', titulo: 'El estudio todavía no liquidó el recibo de esta quincena.' }
  const origen = p.origenBanco === 'sellado' ? 'por banco según la foto sellada al cerrar la quincena'
    : p.origenBanco === 'manual' ? 'escrito a mano' : p.origenBanco === 'giro' ? 'girado según el extracto'
    : reciboSinGiro ? 'recibo del estudio · el extracto todavía no muestra el giro' : 'recibo del estudio'
  return { texto: pesos(p.banco), titulo: origen }
}

export function FilaMensual({ fila, columnas, edicion, pct, abrir }: {
  fila: FilaDelEspejo; columnas: string; edicion: EdicionDeFila; pct: number | null; abrir: () => void
}) {
  const l = fila.linea
  const { quincena } = edicion
  const fondo = filaPagada(l.pagadaEn) ? V.posSuave : undefined
  const p = pagoDelMensual(l)
  // SIN LÍNEA SELLADA, NI «sin recibo todavía» (eso es un pendiente): la fila dice que no tiene foto.
  const recibo = fila.cerrada && p.banco == null
    ? { texto: sinSello(l) ?? '—', titulo: 'Sin línea sellada en esta quincena cerrada.' }
    : textoDelRecibo(p, l.reciboSinGiro)
  const a = asistenciaDeReferencia(fila)
  // ═══ LA CERRADA ES LA FOTO DE LA QUINCENA (auditor, 18/09/2026) ═══ Ni días vivos (no se sellan), ni «sueldo del mes»
  // (la foto es lo liquidado en la quincena), ni «falta recibo» (no hay nada pendiente de cargar en algo cerrado).
  const cerrada = fila.cerrada
  const sinSaldoCerrada = cerrada
    ? (l.sello?.conLinea
      ? { texto: 'saldo del mes', titulo: 'Cobra por mes: el saldo es del mes, no de la quincena. Lo pagado que consta se muestra al lado.' }
      : { texto: 'sin línea sellada', titulo: 'La quincena está cerrada y esta persona no tiene línea sellada: nada de esta fila es dato sellado.' })
    : null
  return (
    <div data-testid={`espejo-fila-${fila.personaId}`} data-tipo="mensual" data-fila-edicion="" data-pagada={fondo ? '1' : undefined}
      style={{ ...filaGrid(columnas, ALTO_LIQ.filaAlta), background: fondo }}>
      <CeldaPersona fila={fila} fondo={fondo} quincena={quincena} camposEditables={edicion.camposEditables} abrir={abrir}
        detalle={(
          <div data-testid={`categorias-${fila.personaId}`}>
            <RenglonDelDetalle>{`${l.esJefe ? 'Jefe de obra' : 'Mensual'} · cobra por mes`}</RenglonDelDetalle>
            <RenglonDelDetalle titulo={recibo.titulo}>
              {/* LA CERRADA DICE «Banco», NO «Recibo»: lo sellado es lo girado, y un recibo del estudio no es un giro. */}
              {p.banco == null ? (sinSello(l) ?? 'Recibo: sin recibo todavía') : `${p.origenBanco === 'sellado' ? 'Banco' : 'Recibo'}: ${recibo.texto}`}
            </RenglonDelDetalle>
          </div>
        )} />
      {/* SUELDO. La asistencia es referencia: no cobra por ella. */}
      {cerrada ? (
        <div data-testid={`asistencia-${fila.personaId}`} data-sellado="1" title="Horas selladas al cerrar la quincena. Los días no quedan en la foto."
          style={{ textAlign: 'right', fontSize: '11px', lineHeight: '13px', color: V.apagado }}>
          <div>{l.horas == null ? (sinSello(l) ?? '—') : `${nHoras(l.horas)} h selladas`}</div>
        </div>
      ) : (
        <div data-testid={`asistencia-${fila.personaId}`} title="Referencia: un mensual no cobra por hora."
          style={{ textAlign: 'right', fontSize: '11px', lineHeight: '13px', color: V.apagado }}>
          <div>{`${a.dias} día${a.dias === 1 ? '' : 's'} · ${nHoras(a.horas)} h`}</div>
          <div style={{ color: a.ausencias > 0 ? V.warn : V.tenue }}>
            {a.ausencias + a.licencias === 0 ? 'sin ausencias' : [a.ausencias ? `${a.ausencias} A` : null, a.licencias ? `${a.licencias} L` : null].filter(Boolean).join(' · ')}
          </div>
        </div>
      )}
      {cerrada ? (
        // LO LIQUIDADO EN LA QUINCENA, CON SU CUENTA SELLADA. No es un sueldo mensual y no se rotula como tal.
        <div data-testid={`sueldo-${fila.personaId}`} data-sellado="1"
          title={l.cobra == null ? 'Sin línea sellada en esta quincena cerrada.' : 'Lo liquidado en esta quincena, sellado al cerrarla. No es el sueldo del mes.'}
          style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', color: l.cobra == null ? V.tenue : V.apagado }}>
          <span style={{ fontSize: l.cobra == null ? '11px' : undefined }}>{l.cobra == null ? (sinSello(l) ?? '—') : pesos(l.cobra)}</span>
          {l.cobra != null && l.horas != null && l.valorHora != null && (
            <span style={{ fontSize: '10.5px' }}>{`quincena · ${nHoras(l.horas)} h × ${pesos(l.valorHora)}`}</span>
          )}
        </div>
      ) : (
        <div data-testid={`sueldo-${fila.personaId}`} style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
          <CeldaTarifa fila={fila} quincena={quincena} pct={pct} sinValor="cargar sueldo" />
          {l.netoMensual == null && (
            <span style={{ fontSize: '10.5px', color: l.cobra == null ? V.warn : V.apagado }}>
              {/* EL RÓTULO ÚNICO DEL MENSUAL SIN NETO (`cobroMensual.ts`): «mensual · importe no cargado» o su origen. */}
              {rotuloDelMensual(l) ?? 'mensual'}
            </span>
          )}
        </div>
      )}
      {/* RECIBO BLANCO: lo que va por banco. */}
      <div data-testid={`banco-mensual-${fila.personaId}`} title={recibo.titulo}
        style={{ ...DERECHA, color: p.banco == null ? V.tenue : V.tinta, fontSize: p.banco == null ? '11px' : undefined }}>{recibo.texto}</div>
      <CeldaPagado campo="pagadoBanco" fila={fila} edicion={edicion} />
      <CeldaSaldo fila={fila} lado="banco" pago={p} sinDato={sinSaldoCerrada ?? FALTA_RECIBO} />
      {/* EFECTIVO: sueldo − recibo. */}
      <div data-testid={`efectivo-mensual-${fila.personaId}`} title={p.negro == null ? (fila.cerrada ? recibo.titulo : FALTA_RECIBO.titulo) : `sueldo ${pesos(p.sueldo)} − recibo ${pesos(p.banco)}`}
        style={{ ...DERECHA, color: p.negro == null ? V.tenue : V.tinta, fontSize: p.negro == null ? '11px' : undefined }}>
        {p.negro == null ? (fila.cerrada ? recibo.texto : FALTA_RECIBO.texto) : pesos(p.negro)}
      </div>
      <CeldaPagado campo="pagadoEfectivo" fila={fila} edicion={edicion} />
      <CeldaSaldo fila={fila} lado="efectivo" pago={p} sinDato={sinSaldoCerrada ?? FALTA_RECIBO} />
      {/* RESTO DEL CÁLCULO. */}
      <CeldaPresentismo fila={fila} />
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <CeldaRedondeo personaId={fila.personaId} valor={l.efectivoRedondeado} enEfectivo={efectivoDelRedondeo(fila)}
          quincena={quincena} grupo={fila.grupo} bloqueada={fila.cerrada} ancho={100} />
      </div>
      <CeldaTotal fila={fila} edicion={edicion} />
      <CeldaPagadoTotal fila={fila} pago={p} />
      <CeldaSaldo fila={fila} lado="total" pago={p} sinDato={sinSaldoCerrada ?? { texto: 'sin sueldo', titulo: 'Sin sueldo cargado no hay saldo que afirmar.' }} />
      <CeldaSaldoRedondeado fila={fila} pago={p} />
    </div>
  )
}

/** El subtotal de mensuales. Lo que no suma (sin sueldo, sin recibo) se cuenta en el resumen, no como cero. */
export function TotalMensuales({ columnas, t }: { columnas: string; t: TotalesDeMensuales }) {
  const vacia = <div />
  // NADIE CON SUELDO (una cerrada sin líneas selladas de mensuales): el subtotal no es $0, es que no hay cifra.
  const sinNada = t.personas > 0 && t.sinSueldo === t.personas
  // NADIE CON RECIBO: el subtotal de banco y efectivo no se afirma («—»), igual que en cada fila.
  const sinReparto = t.sinRecibo === t.personas - t.sinSueldo
  return (
    <div data-testid="mensuales-total" style={{ ...filaGrid(columnas, ALTO_LIQ.filaAlta), borderBottom: 'none', borderTop: `1px solid ${V.grafito}`, fontWeight: 600 }}>
      <div style={{ ...COLUMNA_FIJA, ...PERSONA_ESTIRADA }}>{`${t.personas} mensual${t.personas === 1 ? '' : 'es'}`}</div>
      {vacia}
      <Leida valor={sinNada ? null : t.sueldo} testid="mensuales-total-sueldo" />
      <Leida valor={sinReparto ? null : t.banco} testid="mensuales-total-banco" />
      <Leida valor={sinNada ? null : t.pagadoBanco} testid="mensuales-total-pagado-banco" />
      {vacia}
      <Leida valor={sinReparto ? null : t.efectivo} testid="mensuales-total-efectivo" />
      <Leida valor={sinNada ? null : t.pagadoEfectivo} testid="mensuales-total-pagado-efectivo" />
      {vacia}
      <div style={{ ...DERECHA, color: V.tenue, fontWeight: 400, fontSize: '11px' }}>no aplica</div>
      <Leida valor={t.redondeo > 0 ? t.redondeo : null} testid="mensuales-total-redondeo" />
      <div data-testid="mensuales-total-cobra" style={{ ...DERECHA, color: t.noCierran > 0 ? V.neg : V.tinta }}
        title={t.noCierran > 0 ? `${t.noCierran} fila(s) no cierran por ${pesos(t.diferencia)}` : undefined}>{pesos(sinNada ? null : t.sueldo)}</div>
      <Leida valor={sinNada ? null : t.pagado} testid="mensuales-total-pagado" />
      {/* SIN NADA SELLADO NI SALDO: un «$0» de saldo diría «no se le debe nada», que nadie comprobó. */}
      {sinNada ? <Leida valor={null} testid="mensuales-total-saldo" /> : <SaldoTotal valor={t.saldoTotal} testid="mensuales-total-saldo" />}
      <Leida valor={t.saldoRedondeado > 0 ? t.saldoRedondeado : null} testid="mensuales-total-saldo-redondeado" />
    </div>
  )
}
