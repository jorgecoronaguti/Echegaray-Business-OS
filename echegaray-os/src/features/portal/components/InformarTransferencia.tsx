'use client'

import { useState, useTransition } from 'react'
import type { CertificadoPortal } from '../types'
import { P } from '../estilos'
import { millonesPortal } from '../formato'
import { informarTransferencia } from '../services/portalActions'

// «INFORMAR TRANSFERENCIA» — el formulario que se abre DEBAJO del botón del panel (`29:623`).
//
// ═══ SE CARGA ACÁ, NO EN OTRA PANTALLA ═══
//
// Es el pedido explícito del dueño para todo el rediseño. El cliente que acaba de transferir tiene
// el comprobante en la mano: si la pantalla lo manda a otro lado, no vuelve.
//
// ═══ ESTO NO MUEVE LA CAJA ═══
//
// Lo que se carga acá es un AVISO del cliente, no un cobro. La caja de la empresa la mueve el
// extracto del banco; este dato sirve para conciliar más rápido y para que Administración sepa a qué
// atribuir un crédito que aparece sin nombre. Por eso el texto dice «lo conciliamos»: prometer que
// el certificado queda pagado sería mentirle con la pantalla.

const campo: React.CSSProperties = {
  width: '100%', border: `1px solid ${P.lineaFuerte}`, borderRadius: 6, padding: '8px 10px',
  fontFamily: 'inherit', fontSize: '12.5px', color: P.tinta, marginTop: 4,
}

const rotulo: React.CSSProperties = { fontSize: '11px', color: P.apagado }

export function InformarTransferencia({ certificados, sugerido, onListo }: {
  certificados: CertificadoPortal[]
  /** El importe que el panel está mostrando: se propone, y se puede cambiar. */
  sugerido: number
  onListo: () => void
}) {
  const [certificadoId, setCertificadoId] = useState(certificados[0]?.id ?? '')
  const [monto, setMonto] = useState(String(Math.round(sugerido)))
  const [fecha, setFecha] = useState('')
  const [referencia, setReferencia] = useState('')
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null)
  const [enviando, iniciar] = useTransition()

  function enviar() {
    setAviso(null)
    iniciar(async () => {
      const r = await informarTransferencia({
        certificadoId: certificadoId || null,
        // El campo es un `<input>`: lo que sale de ahí es texto. El esquema espera un número, y
        // hasta que la firma dejó de ser `unknown` esto viajaba como string y el `safeParse` lo
        // rechazaba con «El importe tiene que ser mayor a cero» sobre un importe correcto.
        monto: Number(monto),
        fecha,
        referencia,
      })
      if (r.ok) {
        setAviso({ ok: true, texto: r.mensaje ?? 'Gracias. Lo conciliamos contra el banco y le avisamos.' })
        onListo()
      } else {
        setAviso({ ok: false, texto: r.error })
      }
    })
  }

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); if (!enviando) enviar() }}
      style={{
        marginTop: 10, border: `1px solid ${P.linea}`, borderRadius: 6, padding: '11px 12px',
        display: 'flex', flexDirection: 'column', gap: 8,
      }}
    >
      {certificados.length > 0 && (
        <label style={rotulo}>
          ¿Qué está pagando?
          <select
            value={certificadoId}
            onChange={(e) => setCertificadoId(e.target.value)}
            style={campo}
          >
            {certificados.map((c) => (
              <option key={c.id} value={c.id}>
                {c.numero} · {millonesPortal(c.monto)}
              </option>
            ))}
          </select>
        </label>
      )}

      <label style={rotulo}>
        Importe transferido
        <input
          type="number"
          inputMode="decimal"
          min="0"
          step="0.01"
          value={monto}
          onChange={(e) => setMonto(e.target.value)}
          required
          style={{ ...campo, fontFamily: "'IBM Plex Mono',monospace" }}
        />
      </label>

      <label style={rotulo}>
        Fecha de la transferencia
        <input
          type="date"
          value={fecha}
          onChange={(e) => setFecha(e.target.value)}
          required
          style={{ ...campo, fontFamily: "'IBM Plex Mono',monospace" }}
        />
      </label>

      <label style={rotulo}>
        Número o referencia
        <input
          type="text"
          value={referencia}
          onChange={(e) => setReferencia(e.target.value)}
          placeholder="el número que muestra su banco"
          required
          maxLength={120}
          style={campo}
        />
      </label>

      <button
        type="submit"
        disabled={enviando}
        style={{
          background: P.marca, color: P.tinta, fontSize: '12.5px', fontWeight: 600, borderRadius: 6,
          padding: '9px 12px', border: 'none', cursor: enviando ? 'progress' : 'pointer',
          fontFamily: 'inherit',
        }}
      >
        {enviando ? 'Enviando…' : 'Avisar de la transferencia'}
      </button>

      {aviso && (
        <p role="status" style={{
          margin: 0, fontSize: '11.5px', lineHeight: 1.5, color: aviso.ok ? P.pos : P.neg,
        }}>
          {aviso.texto}
        </p>
      )}
    </form>
  )
}
