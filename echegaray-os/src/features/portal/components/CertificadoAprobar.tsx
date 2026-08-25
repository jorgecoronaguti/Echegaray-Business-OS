'use client'

import { useState, useTransition } from 'react'
import type { CertificadoPortal, ContratoPortal } from '../types'
import { P } from '../estilos'
import { diasEntre, soloFecha } from '../reglas/aPagar'
import { haceTexto, millonesPortal, porcentajePortal } from '../formato'
import { diaMes } from '@/shared/components/canon'
import { IcoConsulta, IcoParaAprobar, IcoTilde } from './iconos'
import { TablaRubros } from './TablaRubros'
import { aprobarCertificado, observarCertificado } from '../services/portalActions'

// EL CERTIFICADO QUE ESPERA LA CONFORMIDAD DEL CLIENTE — `29`, líneas 131–237.
//
// ═══ SE APRUEBA ACÁ, NO EN OTRA PANTALLA ═══
//
// El dueño, textual: «necesito que la pantalla permita que si quiero editar edite ahí mismo, no me
// sirve que me cargue y me lleve a otro lado». Aprobar dispara la acción y la tarjeta se recarga en
// el lugar; observar abre el campo DEBAJO de la misma tarjeta, con el certificado a la vista —que es
// lo único que hace que la observación sea sobre algo concreto—.
//
// ═══ OBSERVAR NO ES RECHAZAR ═══
//
// El mockup pone «Observar» al lado de «Aprobar», sin jerarquía de peligro: el cliente devuelve el
// certificado con un motivo escrito y sigue la conversación. Por eso el botón es plano, el campo
// pide un texto de verdad (Zod exige diez caracteres) y no hay ningún cartel de confirmación.

export function CertificadoAprobar({ certificado, contrato, avanceAcumulado, montos, hoy }: {
  certificado: CertificadoPortal
  contrato: ContratoPortal
  avanceAcumulado: number | null
  montos: boolean
  /** El día en curso, en `YYYY-MM-DD`. Lo pasa el servidor: el cliente no fija la fecha del sistema. */
  hoy: string
}) {
  const [observando, setObservando] = useState(false)
  const [texto, setTexto] = useState('')
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null)
  const [trabajando, iniciar] = useTransition()

  function correr(accion: () => Promise<{ ok: true; mensaje?: string } | { ok: false; error: string }>) {
    setAviso(null)
    iniciar(async () => {
      const r = await accion()
      setAviso(r.ok
        ? { ok: true, texto: r.mensaje ?? 'Listo. Te avisamos por mail.' }
        : { ok: false, texto: r.error })
      if (r.ok) { setObservando(false); setTexto('') }
    })
  }

  const emitido = soloFecha(certificado.emitido_at)
  const periodo = [diaMes(certificado.periodo_desde), diaMes(certificado.periodo_hasta)]
    .filter(Boolean).join(' – ')

  return (
    <div style={{
      background: P.superficie, border: `1px solid ${P.ambarBorde}`, borderRadius: 10, overflow: 'hidden',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 9, padding: '12px 16px',
        background: P.ambarFondo, borderBottom: `1px solid ${P.ambarBorde}`,
      }}>
        <span style={{ display: 'flex', color: P.warn }}><IcoParaAprobar /></span>
        <div style={{ fontSize: '13px', fontWeight: 600, color: P.tinta }}>
          {certificado.numero} · esperando su aprobación
        </div>
        {emitido && (
          <span style={{ marginLeft: 'auto', fontSize: '11.5px', color: P.warn }}>
            {haceTexto(diasEntre(emitido, hoy))}
          </span>
        )}
      </div>

      <div style={{
        display: 'flex', alignItems: 'center', gap: 28, padding: '14px 16px',
        borderBottom: `1px solid ${P.lineaTenue}`, flexWrap: 'wrap',
      }}>
        {periodo && (
          <div>
            <div style={{ fontSize: '10.5px', color: P.tenue, letterSpacing: '.05em' }}>PERÍODO</div>
            <div style={{ fontSize: '13px', color: P.tinta, marginTop: 2 }}>{periodo}</div>
          </div>
        )}
        {certificado.avance_periodo_pct !== null && (
          <div>
            <div style={{ fontSize: '10.5px', color: P.tenue, letterSpacing: '.05em' }}>AVANCE DEL PERÍODO</div>
            <div style={{ fontSize: '13px', color: P.tinta, marginTop: 2 }}>
              {porcentajePortal(certificado.avance_periodo_pct, 1)}
            </div>
          </div>
        )}
        {montos && (
          <div>
            <div style={{ fontSize: '10.5px', color: P.tenue, letterSpacing: '.05em' }}>A CERTIFICAR</div>
            <div style={{
              fontFamily: "'IBM Plex Mono',monospace", fontSize: '19px', fontWeight: 600,
              color: P.tinta, marginTop: 1, letterSpacing: '-.01em',
            }}>
              {millonesPortal(certificado.monto)}
            </div>
          </div>
        )}

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            type="button"
            onClick={() => { setObservando((v) => !v); setAviso(null) }}
            disabled={trabajando}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, border: `1px solid ${P.linea}`,
              background: P.superficie, color: P.tinta, fontSize: '12.5px', fontWeight: 500,
              borderRadius: 6, padding: '8px 13px', cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            <IcoConsulta s={14} w={2} />
            Observar
          </button>
          <button
            type="button"
            onClick={() => correr(() => aprobarCertificado(certificado.id))}
            disabled={trabajando}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, background: P.marca, color: P.tinta,
              fontSize: '12.5px', fontWeight: 600, borderRadius: 6, padding: '8px 14px',
              border: 'none', cursor: trabajando ? 'progress' : 'pointer', fontFamily: 'inherit',
            }}
          >
            <IcoTilde />
            {trabajando ? 'Enviando…' : 'Aprobar'}
          </button>
        </div>
      </div>

      {observando && (
        <div style={{ padding: '12px 16px', borderBottom: `1px solid ${P.lineaTenue}` }}>
          <label style={{ fontSize: '11.5px', color: P.apagado }} htmlFor="observacion">
            ¿Qué observa de este certificado? Lo revisamos y le respondemos.
          </label>
          <textarea
            id="observacion"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            rows={3}
            style={{
              width: '100%', marginTop: 6, border: `1px solid ${P.lineaFuerte}`, borderRadius: 6,
              padding: '9px 11px', fontFamily: 'inherit', fontSize: '12.5px', color: P.tinta,
              resize: 'vertical',
            }}
          />
          <button
            type="button"
            onClick={() => correr(() => observarCertificado(certificado.id, texto))}
            disabled={trabajando}
            style={{
              marginTop: 8, background: P.marca, color: P.tinta, fontSize: '12.5px', fontWeight: 600,
              borderRadius: 6, padding: '8px 14px', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            Enviar la observación
          </button>
        </div>
      )}

      {aviso && (
        <div role="status" style={{
          padding: '10px 16px', borderBottom: `1px solid ${P.lineaTenue}`,
          fontSize: '12px', lineHeight: 1.5, color: aviso.ok ? P.pos : P.neg,
        }}>
          {aviso.texto}
        </div>
      )}

      <TablaRubros
        certificado={certificado}
        contratado={contrato.monto}
        avanceAcumulado={avanceAcumulado}
        montos={montos}
      />
    </div>
  )
}
