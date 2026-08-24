'use client'

import Link from 'next/link'
import { useActionState, useState } from 'react'
import { Boton, CAMPO, Campo } from '@/shared/components/ds'
import { loginAction, type ActionState } from '../services/actions'

const initialState: ActionState = { error: null }

// ═══ VER / OCULTAR LA CONTRASEÑA (M01) ═══
//
// El diseño lo pide y en el teléfono no es una comodidad: se tipea con una mano, con guantes o con
// el sol de frente, y el único remedio a un error de tipeo invisible es borrar todo y empezar de
// nuevo. Arranca OCULTA: el estado por defecto es el seguro, y mostrarla es una decisión de quien
// está mirando su propia pantalla.
//
// ═══ POR QUÉ ESTA PANTALLA NO SE DIBUJA SOLA (Design 23/08/2026) ═══
//
// Tenía sus propios controles: `rounded border px-3 py-2` para los campos y `bg-black text-white`
// para la primaria. No era feo y ya está — era la PRIMERA pantalla del sistema afirmando que el
// negro es el color de la acción, cuando en las otras 42 la acción es el amarillo de marca. Ahora
// usa `CAMPO` y `Boton` del design system, que es lo que dibuja el resto del OS: si mañana cambia
// el borde de un campo, esta pantalla cambia con las demás en vez de quedar como la excepción que
// nadie recuerda.
//
// La primaria va en `acceso` (52px, ancho completo). El mínimo táctil de `LAYOUT_RESPONSIVE.md` es
// 44px, y acá el botón es lo ÚNICO tocable de la pantalla: no compite con nada, así que no gana
// nada por ser chico. La contraseña, además, se escribe mal seguido — el botón se toca dos veces.
//
// ═══ LO QUE NO SE IMPLEMENTA, Y POR QUÉ ═══
//
// El diseño dibuja «Quedan 3 intentos» debajo del error. Supabase NO publica cuántos intentos
// quedan —limita por su cuenta y contesta el mismo error genérico—, así que ese contador sólo podría
// salir de un estado inventado acá adentro: un número que se reinicia recargando la página y que no
// tiene ninguna relación con el momento en que la cuenta se bloquea de verdad. Un contador que
// miente es peor que ningún contador. Lo que sí se dice es que el sistema limita los intentos.
//
// El artboard M01 dibuja TELÉFONO + CÓDIGO. Acá sigue habiendo email + contraseña: el modelo de
// autenticación no es un detalle visual —cambia quién puede entrar, cómo se recupera el acceso y
// qué le manda Supabase a quién—, y esa decisión es del dueño. Lo que sí se cumple del artboard es
// todo lo demás: logo oficial sobre claro, un campo por línea con su rótulo arriba, primaria a
// ancho completo que dice qué pasa después, y la ayuda al pie separada por un hairline.

export function LoginForm() {
  const [state, formAction, pending] = useActionState(loginAction, initialState)
  const [ver, setVer] = useState(false)

  return (
    <form action={formAction} className="flex flex-col gap-4" data-testid="login-form">
      <Campo rotulo="Email">
        <input name="email" type="email" required autoComplete="email" className={CAMPO} />
      </Campo>

      <Campo
        rotulo={
          <span className="flex items-baseline justify-between gap-3">
            Contraseña
            {/* Target de 44px por alto sin ocupar 44px de alto: el `py` se lo come el `-my`, que es
                lo que evita que un enlace de 12px separe el rótulo de su campo. */}
            <button
              type="button"
              onClick={() => setVer((v) => !v)}
              data-testid="ver-contrasena"
              aria-pressed={ver}
              className="-my-3 py-3 text-[12px] text-muted underline decoration-line underline-offset-2 transition-colors hover:text-ink"
            >
              {ver ? 'ocultar' : 'ver'}
            </button>
          </span>
        }
      >
        <input
          name="password"
          type={ver ? 'text' : 'password'}
          required
          autoComplete="current-password"
          className={CAMPO}
        />
      </Campo>

      {state.error && (
        <div data-testid="login-error">
          {/* `text-neg` y no un rojo de Tailwind: el rojo del OS es #B42318 y está en un token
              porque es el MISMO rojo del impedimento de obra y del saldo negativo. Dos rojos
              distintos diciendo «problema» en la misma aplicación son dos problemas distintos. */}
          <p className="text-[13px] text-neg">{state.error}</p>
          <p className="mt-1 text-[12px] text-faint">
            El sistema limita los intentos seguidos. Si no entrás,{' '}
            <Link href="/recuperar" className="underline">recuperá la contraseña</Link>.
          </p>
        </div>
      )}

      <Boton type="submit" variante="primaria" tamano="acceso" disabled={pending} className="mt-1">
        {/* «Ingresar», la misma palabra del título: dos verbos para la misma acción en la misma
            pantalla hacen dudar de si son dos cosas. */}
        {pending ? 'Ingresando…' : 'Ingresar'}
      </Boton>

      {/* Debajo de la primaria y sin competir con ella: es la salida de quien ya falló, no la
          acción de quien llega. El diseño la ubica en el mismo lugar. */}
      <Link
        href="/recuperar"
        data-testid="ir-a-recuperar"
        className="-my-1 py-3 text-center text-[13px] text-muted underline decoration-line underline-offset-2 transition-colors hover:text-ink"
      >
        Olvidé mi contraseña
      </Link>

      {/* ═══ POR QUÉ SIGUE HABIENDO «CREAR UNA» ═══
          El artboard no dibuja alta pública, y con razón: acá no hay usuarios externos. Pero
          `/signup` EXISTE como ruta, `signupAction` llama a `supabase.auth.signUp` y
          `supabase/config.toml:176` declara `enable_signup = true`. Sacar el enlace no cierra nada
          —deja una puerta abierta y sin cartel, que es peor que una puerta con cartel—. Se queda,
          en `faint` y al pie, hasta que el registro se apague donde de verdad se apaga: la
          configuración de auth del proyecto. Queda declarado en el informe del frente. */}
      <p className="mt-2 border-t border-line pt-4 text-[12px] text-faint">
        El acceso lo da Administración. ¿No tenés cuenta?{' '}
        <Link href="/signup" className="underline decoration-line underline-offset-2 hover:text-ink">
          Crear una
        </Link>
      </p>
    </form>
  )
}
