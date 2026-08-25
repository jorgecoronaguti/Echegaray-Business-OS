'use client'

import type { CertificadoPortal, DatosDeCobro } from '../types'
import type { CorteAPagar } from '../reglas/aPagar'
import { estadoEnPantalla } from '../reglas/estado'
import { P } from '../estilos'
import { millonesPortal } from '../formato'
import { IcoPago, IcoReloj, IcoSubir } from './iconos'
import { InformarTransferencia } from './InformarTransferencia'

// EL PANEL «A PAGAR AHORA» — `29`, líneas 595–629.
//
// Caja blanca con borde #FBD9D4, cabecera #FEF3F2 con el total en mono de 27px, las filas de lo que
// se debe, y al pie los dos botones y el CBU.
//
// ═══ «PAGAR» NO COBRA: MUESTRA CÓMO PAGAR ═══
//
// El OS no tiene pasarela de pago ni la va a tener por esta pantalla — el cliente paga por
// transferencia, como paga hoy. El botón despliega EN EL LUGAR lo que hace falta para transferir
// (importe y CBU) y, al lado, el aviso de que ya transfirió. Poner un «Pagar» que abre un checkout
// inexistente sería el botón falso que este repo ya pagó una vez.
//
// ═══ SIN DEUDA VENCIDA EL PANEL NO GRITA ═══
//
// El mockup dibuja el caso rojo porque su dato de ejemplo tiene $ 8,20 M vencidos. Un cliente al día
// merece el mismo bloque en tono neutro con lo que viene: pintarle de rojo «$ 0,00 M» sería
// inventarle una mora, y esconder el bloque le sacaría la única forma de ver qué le toca pagar.

export type BloqueAbierto = 'no' | 'pagar' | 'informar'

export function PanelAPagar({ corte, cobro, montos, hoy, abierto, onAbrir }: {
  corte: CorteAPagar
  cobro: DatosDeCobro
  montos: boolean
  /** El día en curso, resuelto EN EL SERVIDOR. Leer el reloj del navegador acá haría que el HTML
   *  del servidor y el del cliente digan cosas distintas a la medianoche, y React lo descarta entero. */
  hoy: string
  /** Qué bloque está desplegado. LO GOBIERNA LA PANTALLA, no el panel: «Pagar» también se aprieta
   *  desde una fila de la tabla de certificados, y dos estados para el mismo bloque se desincronizan. */
  abierto: BloqueAbierto
  onAbrir: (b: BloqueAbierto) => void
}) {
  if (!montos) return null

  const hayVencido = corte.vencidos.length > 0
  const filas = hayVencido ? corte.vencidos : corte.proximos.slice(0, 3)
  if (filas.length === 0) return null

  const total = hayVencido ? corte.total_vencido : corte.total_proximo

  return (
    <div style={{
      background: P.superficie,
      border: `1px solid ${hayVencido ? P.rojoBorde : P.linea}`,
      borderRadius: 10, overflow: 'hidden',
    }}>
      <div style={{
        padding: '14px 16px 15px',
        background: hayVencido ? P.rojoFondo : P.superficieTenue,
        borderBottom: `1px solid ${hayVencido ? P.rojoBorde : P.linea}`,
      }}>
        <div style={{
          fontSize: '10.5px', color: hayVencido ? P.rojoTinta : P.tenue, letterSpacing: '.05em',
        }}>
          {hayVencido ? 'A PAGAR AHORA' : 'PRÓXIMOS PAGOS'}
        </div>
        <div style={{
          fontFamily: "'IBM Plex Mono',monospace", fontSize: '27px', fontWeight: 600,
          color: hayVencido ? P.neg : P.tinta, marginTop: 2, letterSpacing: '-.02em',
        }}>
          {millonesPortal(total)}
        </div>
        {hayVencido && corte.dias_mas_antigua !== null && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6, fontSize: '11.5px',
            color: P.rojoTinta, marginTop: 3,
          }}>
            <IcoReloj s={13} />
            la más antigua hace {corte.dias_mas_antigua} días
          </div>
        )}
      </div>

      {filas.map((c: CertificadoPortal) => {
        const e = estadoEnPantalla(c, hoy)
        return (
          <div key={c.id} style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '11px 16px',
            borderBottom: `1px solid ${P.lineaTenue}`,
          }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: '12px', color: P.tinta }}>
                {c.numero}{c.obra_nombre ? ` · ${c.obra_nombre}` : ''}
              </div>
              <div style={{
                fontSize: '11px', marginTop: 1,
                color: e.clave === 'vencido' ? P.neg : e.clave === 'en_revision' ? P.warn : P.tenue,
              }}>
                {e.clave === 'vencido' && e.dias !== null
                  ? `vencido hace ${Math.abs(e.dias)} días`
                  : e.clave === 'en_revision' ? 'en revisión' : e.nota ?? e.rotulo}
              </div>
            </div>
            <span style={{
              fontFamily: "'IBM Plex Mono',monospace", fontSize: '12.5px', color: P.tinta, flexShrink: 0,
            }}>
              {millonesPortal(c.monto)}
            </span>
          </div>
        )
      })}

      <div style={{ padding: '13px 16px 15px' }}>
        <button
          type="button"
          onClick={() => onAbrir(abierto === 'pagar' ? 'no' : 'pagar')}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, width: '100%',
            background: P.marca, color: P.tinta, fontSize: '13px', fontWeight: 600, borderRadius: 6,
            padding: '11px 12px', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          <IcoPago w={2} />
          Pagar
        </button>

        {abierto === 'pagar' && (
          <div style={{
            marginTop: 10, border: `1px solid ${P.linea}`, borderRadius: 6, padding: '11px 12px',
            fontSize: '12px', color: P.apagado, lineHeight: 1.55,
          }}>
            Se paga por transferencia a la cuenta de Echegaray Construcciones.
            <div style={{ marginTop: 6, color: P.tinta }}>
              Importe: <span style={{ fontFamily: "'IBM Plex Mono',monospace" }}>{millonesPortal(total)}</span>
            </div>
            {cobro.cbu && (
              <div style={{ fontFamily: "'IBM Plex Mono',monospace", marginTop: 2, color: P.tinta }}>
                CBU {cobro.cbu}
              </div>
            )}
            <div style={{ marginTop: 6 }}>
              Cuando la haga, avísenos con «Informar transferencia» y la conciliamos contra el banco.
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={() => onAbrir(abierto === 'informar' ? 'no' : 'informar')}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, marginTop: 8,
            width: '100%', border: `1px solid ${P.linea}`, background: P.superficie, color: P.tintaSuave,
            fontSize: '12.5px', fontWeight: 500, borderRadius: 6, padding: '9px 12px',
            cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          <IcoSubir />
          Informar transferencia
        </button>

        {abierto === 'informar' && (
          <InformarTransferencia
            certificados={filas}
            sugerido={total}
            onListo={() => onAbrir('no')}
          />
        )}

        {/* El CBU es de la empresa: sin él cargado, la línea no se inventa. */}
        {cobro.cbu && (
          <div style={{
            fontSize: '11px', color: P.tenue, marginTop: 11, lineHeight: 1.5,
            fontFamily: "'IBM Plex Mono',monospace",
          }}>
            CBU {cobro.cbu}
          </div>
        )}
      </div>
    </div>
  )
}
