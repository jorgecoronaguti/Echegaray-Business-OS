import type { ContratoPortal } from '../types'
import { barraContrato, type ClaveTramo } from '../reglas/contrato'
import { P } from '../estilos'
import { millonesDesnudo, millonesPortal, porcentajePortal } from '../formato'
import { VacioPortal } from './piezas'

// «SU CONTRATO» — `29`, líneas 94–129. La barra de 26px con los cuatro tramos y su leyenda.
//
// Los porcentajes salen de `reglas/contrato.ts`, con test. Acá sólo se pinta.
//
// ═══ EL TRAMO ANGOSTO NO LLEVA SU IMPORTE ADENTRO ═══
//
// El mockup escribe el número dentro de tres tramos y deja el cuarto —el fondo de reparo, 3 %— sin
// texto. No es un olvido: a 3 % de una columna de ~700px el tramo mide 21px y el número mono de 11px
// necesita 34. Escribirlo igual lo desborda sobre el tramo de al lado y se lee un importe partido.
// El corte es 6 %: por debajo, el importe vive sólo en la leyenda, donde siempre está completo.

const UMBRAL_ROTULO_DENTRO = 6

const TRAMO: Record<ClaveTramo, { fondo: string; tinta: string; borde: string }> = {
  cobrado: { fondo: P.verdeSuave, tinta: P.verdeTinta, borde: P.pos },
  sin_cobrar: { fondo: P.rojoSuave, tinta: P.rojoTinta, borde: P.neg },
  reparo: { fondo: P.grisReparo, tinta: P.tenue, borde: P.tenue },
  falta: { fondo: P.avatar, tinta: P.tenue, borde: P.lineaFuerte },
}

export function BarraContrato({ contrato }: { contrato: ContratoPortal }) {
  const barra = barraContrato(contrato)

  // Sin contrato cargado no se dibuja una barra de cero: se dice que falta el dato.
  if (!barra) {
    return (
      <div>
        <div style={{ fontSize: '12.5px', fontWeight: 600, color: P.tinta }}>Su contrato</div>
        <VacioPortal texto="Todavía no está cargado el monto del contrato de esta obra." />
      </div>
    )
  }

  const retencion = porcentajePortal(contrato.retencion_pct)

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ fontSize: '12.5px', fontWeight: 600, color: P.tinta }}>Su contrato</div>
        <span style={{ fontSize: '11.5px', color: P.tenue }}>
          {millonesPortal(contrato.monto)}
          {retencion && ` · retención ${retencion}`}
          {barra.sobre_contratado && ' · certificado por encima del contrato'}
        </span>
      </div>

      <div style={{
        display: 'flex', gap: 2, marginTop: 11, height: 26, borderRadius: 4, overflow: 'hidden',
      }}>
        {barra.tramos.filter((t) => t.pct > 0).map((t) => (
          <div
            key={t.clave}
            title={`${t.rotulo} · ${millonesPortal(t.monto)}`}
            style={{
              width: `${t.pct}%`, background: TRAMO[t.clave].fondo,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            {t.pct >= UMBRAL_ROTULO_DENTRO && (
              <span style={{
                fontFamily: "'IBM Plex Mono',monospace", fontSize: '11px', fontWeight: 600,
                color: TRAMO[t.clave].tinta,
              }}>
                {millonesDesnudo(t.monto)}
              </span>
            )}
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 14, marginTop: 9, flexWrap: 'wrap' }}>
        {barra.tramos.map((t) => (
          <div key={t.clave} style={{
            flex: 1, minWidth: 84, display: 'flex', alignItems: 'baseline', gap: 6,
          }}>
            <span style={{
              width: 7, height: 7, borderRadius: 2, background: TRAMO[t.clave].fondo,
              border: `1px solid ${TRAMO[t.clave].borde}`, flexShrink: 0,
            }} />
            <div>
              <div style={{ fontSize: '10.5px', color: P.tintaSuave, whiteSpace: 'nowrap' }}>{t.rotulo}</div>
              <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: '11px', color: P.tenue }}>
                {millonesPortal(t.monto)}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
