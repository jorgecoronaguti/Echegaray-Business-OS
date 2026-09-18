// «ACREDITADO POR EL BANCO» — lo que el Santander certifica que le pagó a esta persona en el año, período
// por período, con la planilla y la liquidación al lado. La regla está en `haberesDelBanco.ts`; acá se pinta.
//
// Una fila que no coincide se marca y se escribe con qué difiere: la pantalla no elige entre el banco y la
// planilla en silencio. La liquidación final va aparte y rotulada (no suma a ninguna quincena, regla del
// dueño); lo que el cargador no pudo probar va en «a confirmar», con su evidencia.

import type { CSSProperties, ReactNode } from 'react'
import { V } from '@/shared/components/v2/patron'
import { pesos } from './liquidacion/formato'
import {
  FUENTE, fechaCorta, rotuloDelPeriodo, type AcreditacionDelBanco, type Cotejo, type HaberesDelBanco as Haberes,
  type PeriodoDelBanco,
} from '../services/haberesDelBanco'

const ROTULO: CSSProperties = {
  fontSize: '11px', fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: V.tenue, whiteSpace: 'nowrap',
}

function Celda({ children, izquierda = false, fuerte = false, title, tono, testid }: {
  children?: ReactNode; izquierda?: boolean; fuerte?: boolean; title?: string; tono?: string; testid?: string
}) {
  return (
    <td data-testid={testid} title={title} style={{
      textAlign: izquierda ? 'left' : 'right', fontSize: '12.5px', fontWeight: fuerte ? 600 : 400,
      color: tono ?? (fuerte ? V.tinta : V.tintaSuave), padding: '9px 8px', whiteSpace: 'nowrap',
      borderBottom: `1px solid ${V.lineaFila}`, verticalAlign: 'top',
    }}>{children}</td>
  )
}

function Comparado({ valor, cotejo, banco, testid }: { valor: number | null; cotejo: Cotejo; banco: number; testid: string }) {
  const titulo = cotejo === 'coincide' ? 'coincide con el banco'
    : cotejo === 'difiere'
      ? (valor == null || valor === 0 ? `vacía: el banco acreditó ${pesos(banco)}`
        : `difiere del banco en ${pesos(Math.round((banco - valor) * 100) / 100)}`)
      : undefined
  return (
    <Celda testid={testid} title={titulo} tono={cotejo === 'difiere' ? V.warn : undefined}>
      {valor == null || valor === 0 ? 'vacía' : pesos(valor)}
      {cotejo === 'coincide' && <span style={{ marginLeft: 4, fontSize: '11px', color: V.pos }}>=</span>}
      {cotejo === 'difiere' && <span style={{ marginLeft: 4, fontSize: '11px' }}>≠</span>}
    </Celda>
  )
}

function FilaDelPeriodo({ x }: { x: PeriodoDelBanco }) {
  const fechas = x.acreditaciones.map((a) =>
    `${fechaCorta(a.fecha)} ${pesos(a.importe)}${a.clase === 'adelanto_quincena' ? ' (adelanto)' : ''}`)
  return (
    <tr data-testid="haberes-banco-fila" data-desde={x.desde} data-difiere={x.difiere ? 'si' : 'no'}>
      <Celda izquierda title={x.acreditaciones.map((a) => a.evidencia).join(' · ') || undefined}>
        <span style={{ color: V.tinta }}>{rotuloDelPeriodo(x)}</span>
        {x.porRegla && <span style={{ marginLeft: 6, fontSize: '11px', color: V.tenue }}
          title="el período sale de la regla de fecha del cargador, no de una coincidencia al peso con la planilla">por fecha</span>}
      </Celda>
      <Celda izquierda testid="haberes-banco-fechas">
        {fechas.length ? fechas.map((f) => <div key={f}>{f}</div>) : <span style={{ color: V.warn }}>sin acreditación</span>}
      </Celda>
      <Celda fuerte testid="haberes-banco-importe">{x.acreditaciones.length ? pesos(x.banco) : '—'}</Celda>
      <Comparado testid="haberes-banco-planilla" valor={x.planilla} cotejo={x.contraPlanilla} banco={x.banco} />
      <Comparado testid="haberes-banco-liquidacion" valor={x.liquidacion} cotejo={x.contraLiquidacion} banco={x.banco} />
      <Celda izquierda tono={x.difiere ? V.warn : V.tenue} testid="haberes-banco-estado">
        {x.difiere ? 'no coincide' : 'coincide'}
      </Celda>
    </tr>
  )
}

function ListaAparte({ titulo, nota, filas, testid }: {
  titulo: string; nota: string; filas: readonly AcreditacionDelBanco[]; testid: string
}) {
  if (filas.length === 0) return null
  return (
    <div data-testid={testid}>
      <span style={ROTULO}>{titulo}</span>
      <p style={{ margin: '4px 0 6px', fontSize: '11px', color: V.apagado }}>{nota}</p>
      <ol style={{ margin: 0, padding: 0, listStyle: 'none' }}>
        {filas.map((a) => (
          <li key={`${a.fecha}-${a.importe}`} data-testid={`${testid}-fila`} style={{
            display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: 16, padding: '5px 0',
            borderTop: `1px solid ${V.lineaFila}`, fontSize: '12px',
          }}>
            <span className="font-mono tabular-nums" style={{ color: V.tenue, minWidth: 84 }}>{fechaCorta(a.fecha)}</span>
            <span className="font-mono tabular-nums" style={{ color: V.tinta, fontWeight: 600, minWidth: 110 }}>{pesos(a.importe)}</span>
            <span style={{ color: V.apagado, whiteSpace: 'normal', flex: '1 1 260px' }}>{a.evidencia}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}

export function HaberesDelBanco({ h }: { h: Haberes }) {
  const t = h.totales
  const vacio = h.periodos.length === 0 && h.finales.length === 0 && h.aConfirmar.length === 0
  return (
    <section data-testid="haberes-banco" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <span style={ROTULO}>Acreditado por el banco · {h.anio}</span>
        <p style={{ margin: '4px 0 0', fontSize: '11px', color: V.apagado }}>
          Fuente: {FUENTE} (la parte en blanco). Es la fuente más fuerte de lo pagado por banco; la planilla
          JORNALES y la liquidación van al lado como cotejo.
        </p>
      </div>
      {vacio ? (
        <p data-testid="haberes-banco-vacio" style={{ margin: 0, fontSize: '12.5px', color: V.tenue }}>
          El certificado del banco no tiene acreditaciones a esta persona en {h.anio}.
        </p>
      ) : (
        <>
          <div data-testid="haberes-banco-cifras" style={{ display: 'flex', flexWrap: 'wrap', gap: 34, rowGap: 10, fontSize: '12.5px' }}>
            <span><span style={ROTULO}>Acreditado</span> <b data-testid="haberes-banco-total">{pesos(t.acreditado)}</b></span>
            <span><span style={ROTULO}>En períodos</span> <b>{pesos(t.periodos)}</b></span>
            {t.finales > 0 && <span><span style={ROTULO}>Liquidación final</span> <b>{pesos(t.finales)}</b></span>}
            {t.aConfirmar > 0 && <span><span style={ROTULO}>A confirmar</span> <b style={{ color: V.warn }}>{pesos(t.aConfirmar)}</b></span>}
            {t.diferencias > 0 && <span style={{ color: V.warn }} data-testid="haberes-banco-diferencias">
              {t.diferencias} {t.diferencias === 1 ? 'período no coincide' : 'períodos no coinciden'} con la planilla o la liquidación</span>}
          </div>
          {h.periodos.length > 0 && (
            <div style={{ overflowX: 'auto' }}>
              <table data-testid="haberes-banco-tabla" style={{ width: '100%', borderCollapse: 'collapse', fontVariantNumeric: 'tabular-nums' }}>
                <thead>
                  <tr>
                    {['Período', 'Fecha del banco', 'Banco', 'Planilla BANCO', 'Liquidación', ''].map((r, i) => (
                      <th key={r || 'estado'} style={{
                        ...ROTULO, textAlign: i <= 1 || i === 5 ? 'left' : 'right',
                        borderBottom: `1px solid ${V.lineaFuerte}`, padding: '0 8px 6px',
                      }}>{r}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>{h.periodos.map((x) => <FilaDelPeriodo key={x.desde} x={x} />)}</tbody>
              </table>
            </div>
          )}
          <ListaAparte
            testid="haberes-banco-finales" titulo="Liquidación final"
            nota="No se suma a ninguna quincena, ni al pie ni al costo de mano de obra (regla del dueño)."
            filas={h.finales}
          />
          <ListaAparte
            testid="haberes-banco-a-confirmar" titulo="A confirmar"
            nota="El banco las pagó y ninguna regla las explica con evidencia: no se imputan a ningún período."
            filas={h.aConfirmar}
          />
        </>
      )}
      {h.errores.length > 0 && (
        <p data-testid="haberes-banco-error" style={{ margin: 0, fontSize: '11px', color: V.warn }}>No pude leer {h.errores.join(' · ')}</p>
      )}
    </section>
  )
}
