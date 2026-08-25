'use client'

import { useState, useTransition } from 'react'
import { P } from '../estilos'
import { IcoEscudo, IcoMail } from './iconos'
import { pedirLinkPortal } from '../services/portalAuth'

// `30 · Portal Cliente Mobile.dc.html`, primera pantalla (líneas 32–58) — EL INGRESO.
//
// ═══ SIN CONTRASEÑA, Y NO ES UNA COMODIDAD ═══
//
// El mockup lo escribe: «Con el mail que Echegaray habilitó. Le llega un link y queda dentro. Sin
// contraseña.» Del otro lado hay un cliente que entra tres veces al mes: una contraseña que usa cada
// diez días es una contraseña olvidada, y cada olvido termina en un llamado a la oficina. El mail
// habilitado ES la credencial, y la lista de habilitados la maneja Administración en la pantalla 31.
//
// ═══ EL CAMPO ES UN INPUT DE VERDAD ═══
//
// El `.dc.html` dibuja el mail como un `<span>` con el valor de ejemplo, porque un mockup no tipea.
// Acá es un `<input type="email">` con las mismas medidas (`minHeight:52px`, borde `#D7D5CF`, radio
// 8, `fontSize:15px`) y con `inputMode="email"` + `autoComplete="email"`: en el teléfono eso es la
// diferencia entre el teclado con arroba y el teclado común.
//
// El botón NO navega. Manda el pedido y la respuesta se escribe debajo, en el lugar.

const ALTO_CAMPO = 52

export function IngresoPortal() {
  const [email, setEmail] = useState('')
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null)
  const [enviando, iniciar] = useTransition()

  function enviar() {
    setAviso(null)
    iniciar(async () => {
      const r = await pedirLinkPortal(email)
      setAviso(r.ok ? { ok: true, texto: r.mensaje ?? 'Te mandamos el link.' } : { ok: false, texto: r.error })
    })
  }

  return (
    <div style={{
      minHeight: '100vh', background: P.superficie, maxWidth: 390, margin: '0 auto',
      display: 'flex', flexDirection: 'column', padding: '0 24px 28px',
    }}>
      <div style={{ marginTop: 64, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/marca/isotipo.png" alt="" style={{ width: 44, height: 44, objectFit: 'contain' }} />
        <div style={{
          fontSize: '11.5px', fontWeight: 600, color: P.tinta,
          letterSpacing: '.07em', textAlign: 'center',
        }}>
          ECHEGARAY CONSTRUCCIONES
        </div>
      </div>

      <div style={{ marginTop: 56 }}>
        <h1 style={{
          fontSize: '20px', fontWeight: 600, color: P.tinta, letterSpacing: '-.01em', margin: 0,
        }}>
          Ingresar al portal
        </h1>
        <p style={{ fontSize: '13px', color: P.apagado, marginTop: 7, lineHeight: 1.5 }}>
          Con el mail que Echegaray habilitó. Le llega un link y queda dentro. Sin contraseña.
        </p>

        <form
          onSubmit={(e) => { e.preventDefault(); if (!enviando) enviar() }}
          style={{ marginTop: 24 }}
        >
          <label style={{
            display: 'flex', alignItems: 'center', gap: 10, border: `1px solid ${P.lineaFuerte}`,
            borderRadius: 8, padding: '0 14px', minHeight: ALTO_CAMPO,
          }}>
            <span style={{ display: 'flex', color: P.tenue }}><IcoMail /></span>
            <span className="sr-only">Su mail</span>
            <input
              type="email"
              name="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="su.mail@empresa.com"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="off"
              spellCheck={false}
              required
              style={{
                flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent',
                fontFamily: 'inherit', fontSize: '15px', color: P.tinta, padding: '15px 0',
              }}
            />
          </label>

          <button
            type="submit"
            disabled={enviando}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 14,
              width: '100%', background: P.marca, color: P.tinta, fontFamily: 'inherit',
              fontSize: '15px', fontWeight: 600, borderRadius: 8, minHeight: ALTO_CAMPO,
              border: 'none', cursor: enviando ? 'progress' : 'pointer', opacity: enviando ? 0.7 : 1,
            }}
          >
            {enviando ? 'Enviando…' : 'Enviarme el link'}
          </button>
        </form>

        {aviso && (
          <p
            role="status"
            style={{
              marginTop: 14, fontSize: '12.5px', lineHeight: 1.5,
              color: aviso.ok ? P.pos : P.neg,
            }}
          >
            {aviso.texto}
          </p>
        )}
      </div>

      <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'flex-start', gap: 9, paddingTop: 32 }}>
        <span style={{ display: 'flex', color: P.tenue, flexShrink: 0, marginTop: 1 }}><IcoEscudo s={15} /></span>
        <div style={{ fontSize: '11.5px', color: P.tenue, lineHeight: 1.5 }}>
          Solo ingresan los mails habilitados por Echegaray. Cada acceso queda registrado.
        </div>
      </div>
    </div>
  )
}
