'use client'

import Link from 'next/link'
import { useActionState, useState } from 'react'
import { C, R } from '@/shared/components/movil/tokens'
import { Icono } from '@/shared/components/movil/Iconos'
import { loginAction, type ActionState } from '../services/actions'

const initialState: ActionState = { error: null }

// M01 · ENTRAR — porte literal de `M01 · Login.dc.html`.
//
// ═══ LO QUE SE PORTA ═══
//
// El campo del mockup es una caja de `1.5px solid` con radio 12 y `padding:14px`, con un icono de
// 20px a la izquierda y el valor en 18px SIN borde propio: el borde es de la caja, no del `input`.
// La primaria mide 56px, es amarilla cuando se puede seguir e inerte cuando no, y su TEXTO dice qué
// falta —«Poné tu teléfono»— en vez de quedar en gris sin explicación.
//
// ═══ LO QUE NO SE PORTA, Y NO ES UN OLVIDO ═══
//
// El artboard pide TELÉFONO + CÓDIGO de cuatro dígitos. Acá sigue habiendo email + contraseña: el
// modelo de autenticación no es un detalle visual —cambia quién puede entrar, cómo se recupera el
// acceso y qué le manda Supabase a quién—, y esa decisión es del dueño. Las cuatro celdas del
// código no se dibujan vacías «para que se parezca»: una pantalla que muestra un control que no
// hace nada enseña que la pantalla miente.
//
// Tampoco se dibuja «Quedan 3 intentos»: Supabase no publica cuántos quedan y ese contador sólo
// podría salir de un estado inventado en el cliente, que se reinicia recargando la página. Lo que
// sí se dice es que el sistema limita los intentos.
//
// ═══ VER / OCULTAR LA CONTRASEÑA ═══
//
// En el teléfono no es una comodidad: se tipea con una mano, con guantes o con el sol de frente, y
// el único remedio a un error de tipeo invisible es borrar todo y empezar. Arranca OCULTA: el
// estado por defecto es el seguro.

export function LoginForm() {
  const [state, formAction, pending] = useActionState(loginAction, initialState)
  const [ver, setVer] = useState(false)
  const [email, setEmail] = useState('')
  const [clave, setClave] = useState('')

  const listo = email.trim().length > 3 && clave.length > 0

  return (
    <form action={formAction} data-testid="login-form">
      <Rotulo>Usuario</Rotulo>
      <Caja llena={email.trim() !== ''}>
        <span style={{ display: 'flex', color: C.faint, flexShrink: 0 }}><Icono nombre="id" tamano={20} /></span>
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="tu.correo@ecsas.com.ar"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={CAMPO_M01}
        />
      </Caja>

      <div style={{ marginTop: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 7 }}>
          <span style={{ fontSize: 12.5, color: C.muted }}>Contraseña</span>
          <button
            type="button"
            onClick={() => setVer((v) => !v)}
            data-testid="ver-contrasena"
            aria-pressed={ver}
            style={{
              marginLeft: 'auto', fontSize: 12.5, color: C.inkSuave, padding: 4,
              background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            {ver ? 'ocultar' : 'ver'}
          </button>
        </div>
        <Caja llena={clave !== ''}>
          <span style={{ display: 'flex', color: C.faint, flexShrink: 0 }}><Icono nombre="llave" tamano={20} /></span>
          <input
            name="password"
            type={ver ? 'text' : 'password'}
            required
            autoComplete="current-password"
            value={clave}
            onChange={(e) => setClave(e.target.value)}
            style={CAMPO_M01}
          />
        </Caja>
      </div>

      {state.error && (
        <div data-testid="login-error" style={{ marginTop: 16 }}>
          {/* El rojo sale de `C.neg`, que es el MISMO del impedimento de obra: dos rojos distintos
              diciendo «problema» en la misma aplicación son dos problemas distintos. */}
          <p style={{ fontSize: 13, color: C.neg }}>{state.error}</p>
          <p style={{ marginTop: 4, fontSize: 12, color: C.faint }}>
            El sistema limita los intentos seguidos. Si no entrás,{' '}
            <Link href="/recuperar" style={{ textDecoration: 'underline' }}>recuperá la contraseña</Link>.
          </p>
        </div>
      )}

      <button
        type="submit"
        disabled={pending}
        style={{
          marginTop: 24, minHeight: 56, width: '100%', borderRadius: R.control,
          background: listo && !pending ? C.marca : C.inerte,
          color: listo && !pending ? C.ink : C.faint,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9,
          fontSize: 17, fontWeight: 600, border: 'none', fontFamily: 'inherit',
          cursor: pending ? 'progress' : 'pointer',
        }}
      >
        <Icono nombre={listo ? 'flecha' : 'llave'} tamano={20} />
        {pending ? 'Ingresando…' : listo ? 'Entrar' : 'Poné tu usuario y tu contraseña'}
      </button>

      {/* Debajo de la primaria y sin competir con ella: es la salida de quien ya falló, no la
          acción de quien llega. El mockup la ubica en el mismo lugar. */}
      <Link
        href="/recuperar"
        data-testid="ir-a-recuperar"
        style={{
          display: 'block', marginTop: 14, textAlign: 'center', fontSize: 13, color: C.muted,
          textDecoration: 'underline', textUnderlineOffset: 2, padding: '10px 0',
        }}
      >
        Olvidé mi contraseña
      </Link>

      {/* ═══ POR QUÉ SIGUE HABIENDO «CREAR UNA» ═══
          El artboard no dibuja alta pública, y con razón: acá no hay usuarios externos. Pero
          `/signup` EXISTE como ruta, `signupAction` llama a `supabase.auth.signUp` y
          `supabase/config.toml` declara `enable_signup = true`. Sacar el enlace no cierra nada
          —deja una puerta abierta y sin cartel, que es peor que una puerta con cartel—. Se queda,
          apagado y al pie, hasta que el registro se apague donde de verdad se apaga: la
          configuración de auth del proyecto. */}
      <p style={{ marginTop: 18, fontSize: 12, color: C.faint }}>
        El acceso lo da Administración. ¿No tenés cuenta?{' '}
        <Link href="/signup" style={{ textDecoration: 'underline' }}>Crear una</Link>.
      </p>
    </form>
  )
}

const CAMPO_M01 = {
  border: 'none', background: 'transparent', fontSize: 18, color: C.ink, width: '100%',
  padding: 0, outline: 'none', fontFamily: 'inherit',
} as const

function Rotulo({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 12.5, color: C.muted, marginBottom: 7 }}>{children}</div>
}

/** La caja del campo: el borde se ENCIENDE cuando hay algo escrito, como en el mockup (`bordeTel`). */
function Caja({ children, llena }: { children: React.ReactNode; llena: boolean }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      border: `1.5px solid ${llena ? C.lineaFuerte : C.linea}`,
      borderRadius: R.control, padding: '14px 14px',
    }}>
      {children}
    </div>
  )
}
