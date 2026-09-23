'use client'

// VERIFICACIÓN EN DOS PASOS — activar, confirmar con el primer código, quitar con un código.
//
// Tres estados y un solo bloque: sin factor (botón «Activar»), activando (el QR, la clave para
// cargar a mano y el campo del primer código) y activo (el factor con su fecha y «Quitar»). Nada de
// esto es un mockup: cada estado sale del servidor de Auth y cada botón lo cambia allá.
//
// El QR es un SVG que Supabase devuelve como `data:` URI: no pasa por el optimizador de imágenes ni
// por la red. La clave en texto está por lo mismo que en cualquier app: no todos pueden escanear.

import { useState, useTransition } from 'react'
import { Boton, CAMPO, Estado, Eyebrow, Num } from '@/shared/components/ds'
import { Campo, FormAccion } from '@/shared/components/ui'
import { confirmarDosPasos, iniciarDosPasos, quitarDosPasos, type InicioDosPasos } from '../services/seguridadActions'

export interface FactorActivo { id: string; nombre: string | null; desde: string | null }

export function DosPasos({ factores }: { factores: FactorActivo[] }) {
  const [inicio, setInicio] = useState<Extract<InicioDosPasos, { ok: true }> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pendiente, empezar] = useTransition()
  const [quitando, setQuitando] = useState<string | null>(null)

  if (factores.length > 0 && !inicio) {
    return (
      <section data-testid="dos-pasos-activo">
        <Eyebrow className="mb-2">Verificación en dos pasos</Eyebrow>
        <ul className="border-t border-line">
          {factores.map((f) => (
            <li key={f.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line py-2 text-[13px]">
              <Estado tono="pos" clave="activa">Activa</Estado>
              <span className="text-ink">{f.nombre ?? 'App de códigos'}</span>
              {f.desde && <span className="text-[11.5px] text-faint">desde <Num>{f.desde}</Num></span>}
              <Boton variante="discreta" className="ml-auto" onClick={() => setQuitando(quitando === f.id ? null : f.id)} data-testid="quitar-dos-pasos">
                Quitar
              </Boton>
            </li>
          ))}
        </ul>
        {quitando && (
          <div className="mt-3 max-w-[360px]">
            <FormAccion
              accion={(form) => quitarDosPasos(quitando, form)}
              testid="form-quitar-dos-pasos"
              enviar="Quitar los dos pasos"
              mensajeOk="Listo: la cuenta vuelve a entrar sólo con contraseña."
            >
              <Campo label="Código actual de la app" ayuda="Quitar el segundo paso exige probar que lo tenés.">
                <input name="codigo" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]*" maxLength={7} required className={CAMPO} />
              </Campo>
            </FormAccion>
          </div>
        )}
      </section>
    )
  }

  if (inicio) {
    return (
      <section data-testid="dos-pasos-activando">
        <Eyebrow className="mb-2">Activar los dos pasos</Eyebrow>
        <ol className="space-y-3 text-[13px] text-ink">
          <li>
            <span className="text-muted">1.</span> Abrí tu app de códigos (Google Authenticator, Authy, 1Password…) y escaneá el código:
            <div className="mt-2 inline-block rounded-card border border-line bg-white p-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={inicio.qr} alt="Código QR para la app de códigos" width={168} height={168} className="h-[168px] w-[168px]" />
            </div>
            <div className="mt-2 text-[12px] text-muted">
              Si no podés escanear, cargá esta clave a mano:{' '}
              <code className="select-all break-all font-mono text-[12px] text-ink" data-testid="clave-totp">{inicio.secreto}</code>
            </div>
          </li>
          <li>
            <span className="text-muted">2.</span> Escribí el código que muestra la app:
            <div className="mt-2 max-w-[360px]">
              <FormAccion
                accion={(form) => confirmarDosPasos(inicio.factorId, form)}
                testid="form-confirmar-dos-pasos"
                enviar="Confirmar y activar"
                mensajeOk="Activada. Desde ahora, entrar pide el código además de la contraseña."
              >
                <Campo label="Código de seis dígitos">
                  <input name="codigo" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]*" maxLength={7} required autoFocus className={CAMPO} />
                </Campo>
              </FormAccion>
            </div>
          </li>
        </ol>
        <Boton variante="discreta" className="mt-3" onClick={() => setInicio(null)}>Cancelar</Boton>
      </section>
    )
  }

  return (
    <section data-testid="dos-pasos-inactivo">
      <Eyebrow className="mb-2">Verificación en dos pasos</Eyebrow>
      <p className="max-w-[460px] text-[12.5px] leading-relaxed text-muted">
        Hoy tu cuenta entra sólo con la contraseña. Con los dos pasos, además pide un código de seis
        dígitos que genera una app en tu teléfono: quien sepa la contraseña no entra sin el teléfono.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Boton
          variante="primaria"
          disabled={pendiente}
          data-testid="activar-dos-pasos"
          onClick={() => empezar(async () => {
            setError(null)
            const r = await iniciarDosPasos()
            if (r.ok) setInicio(r)
            else setError(r.error)
          })}
        >
          {pendiente ? 'Preparando…' : 'Activar los dos pasos'}
        </Boton>
        {error && <span role="alert" className="text-[12px] text-neg" data-testid="error-dos-pasos">{error}</span>}
      </div>
    </section>
  )
}
