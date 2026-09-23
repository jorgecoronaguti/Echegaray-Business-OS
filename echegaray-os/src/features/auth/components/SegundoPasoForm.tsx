'use client'

import { useActionState, useEffect } from 'react'
import { C, R } from '@/shared/components/movil/tokens'
import { Icono } from '@/shared/components/movil/Iconos'
import { logoutAction } from '../services/actions'
import { verificarSegundoPaso, type EstadoSegundoPaso } from '@/features/mi-cuenta/services/seguridadActions'

// EL FORMULARIO DEL CÓDIGO — misma anatomía que el login (M01): una caja de 1.5px, el valor grande,
// la primaria de 56px. Un solo campo, seis dígitos, teclado numérico.
//
// Cuando el código pasa, la sesión ya es `aal2` y el navegador va al destino con una NAVEGACIÓN
// COMPLETA: el layout que el router tenía en caché se dibujó con la sesión `aal1` y el middleware lo
// habría rebotado de nuevo.

const INICIAL: EstadoSegundoPaso = { error: null }

export function SegundoPasoForm({ destino }: { destino: string }) {
  const [estado, accion, pendiente] = useActionState(
    async (prev: EstadoSegundoPaso, form: FormData) => {
      const r = await verificarSegundoPaso(prev, form)
      if (!r.error) window.location.assign(destino)
      return r
    },
    INICIAL,
  )

  useEffect(() => { document.querySelector<HTMLInputElement>('input[name=codigo]')?.focus() }, [])

  return (
    <form action={accion} data-testid="form-segundo-paso">
      <div style={{ fontSize: 12.5, color: C.muted, marginBottom: 7 }}>Código de seis dígitos</div>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        border: `1.5px solid ${C.lineaFuerte}`, borderRadius: R.control, padding: '14px 14px',
      }}>
        <span style={{ display: 'flex', color: C.faint, flexShrink: 0 }}><Icono nombre="llave" tamano={20} /></span>
        <input
          name="codigo"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9 ]*"
          maxLength={7}
          required
          style={{ border: 'none', background: 'transparent', fontSize: 22, letterSpacing: 4, color: C.ink, width: '100%', padding: 0, outline: 'none', fontFamily: 'inherit' }}
        />
      </div>

      {estado.error && (
        <p data-testid="segundo-paso-error" style={{ marginTop: 12, fontSize: 13, color: C.neg }}>{estado.error}</p>
      )}

      <button
        type="submit"
        disabled={pendiente}
        style={{
          marginTop: 24, minHeight: 56, width: '100%', borderRadius: R.control,
          background: pendiente ? C.inerte : C.marca, color: pendiente ? C.faint : C.ink,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9,
          fontSize: 17, fontWeight: 600, border: 'none', fontFamily: 'inherit', cursor: pendiente ? 'progress' : 'pointer',
        }}
      >
        <Icono nombre="flecha" tamano={20} />
        {pendiente ? 'Verificando…' : 'Entrar'}
      </button>

      <p style={{ marginTop: 14, textAlign: 'center', fontSize: 12.5, color: C.faint, lineHeight: 1.5 }}>
        ¿Sin el teléfono a mano? Pedile a Dirección que te quite los dos pasos desde Usuarios.
      </p>
      <button
        type="button"
        formAction={logoutAction}
        data-testid="cancelar-segundo-paso"
        style={{ display: 'block', margin: '10px auto 0', fontSize: 13, color: C.muted, textDecoration: 'underline', background: 'none', border: 'none', fontFamily: 'inherit', padding: '10px 0', cursor: 'pointer' }}
      >
        Cancelar y salir
      </button>
    </form>
  )
}
