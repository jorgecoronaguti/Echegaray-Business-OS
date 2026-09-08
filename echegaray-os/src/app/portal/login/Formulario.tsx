'use client'

import { useActionState } from 'react'
import { entrar, entrarComo, type EstadoLogin } from './acciones'
import { IconoMail, IconoFlecha, IconoAlerta, IconoReloj } from '../iconos'

// LA ENTRADA — el mail y nada más.
//
// No hay campo de contraseña porque no hay contraseña, y ya no hay código: el cliente entra con el
// mail que el administrador cargó en su ficha. Poner un campo "contraseña" deshabilitado, o un
// «registrate» que no lleva a ningún lado, sería prometer algo que el módulo decidió no tener.

const INICIAL: EstadoLogin = {}

const MENSAJE: Record<NonNullable<EstadoLogin['error']>, string> = {
  no_habilitado: 'Ese mail no está habilitado',
  mail_invalido: 'Ese mail no está bien escrito',
}

export function Formulario() {
  const [estado, enviar, pendiente] = useActionState(entrar, INICIAL)
  // Un mail que alcanza varios clientes elige acá, en la PUERTA. Adentro el portal es idéntico para
  // todos: un cliente de verdad alcanza uno solo y nunca ve este paso.
  if (estado.elegir?.length) return <Elegir mail={estado.mail!} clientes={estado.elegir} />
  const hayError = Boolean(estado.error)
  return (
    <form action={enviar} className="flex flex-col">
      <Cabecera />
      <label className="sr-only" htmlFor="mail">Su mail</label>
      <div
        className={
          'mt-5 flex min-h-[50px] max-w-[380px] items-center gap-[10px] rounded-[8px] border px-[14px] ' +
          (hayError ? 'border-neg' : 'border-line-strong focus-within:border-ink')
        }
      >
        <span className={hayError ? 'text-neg' : 'text-faint'}><IconoMail tamano={18} /></span>
        <input
          id="mail" name="mail" type="email" autoComplete="email" required autoFocus
          defaultValue={estado.mail ?? ''}
          placeholder="su mail"
          className="min-w-0 flex-1 bg-transparent font-mono text-sm text-ink outline-none placeholder:text-faint"
        />
      </div>

      {hayError ? (
        <>
          <p className="mt-3 flex max-w-[380px] items-center gap-[9px] text-neg">
            <IconoAlerta tamano={18} />
            <span className="text-[13.5px]">{MENSAJE[estado.error!]}</span>
          </p>
          {estado.error === 'no_habilitado' ? (
            <p className="mt-[22px] flex max-w-[420px] items-center gap-[9px] text-muted">
              <IconoReloj tamano={17} />
              <span className="text-[13px]">Pídale a Echegaray que lo agregue a su ficha</span>
            </p>
          ) : null}
        </>
      ) : null}

      {/* Cuando el mail no está habilitado el botón sigue ahí: el cliente corrige y reintenta. */}
      <BotonPrimario pendiente={pendiente}>Entrar</BotonPrimario>
      <PuertaDeAdentro />
    </form>
  )
}

function Elegir({ mail, clientes }: { mail: string; clientes: { id: string; nombre: string }[] }) {
  const [, enviar, pendiente] = useActionState(entrarComo, {} as EstadoLogin)
  return (
    <form action={enviar} className="flex flex-col">
      <Cabecera />
      <input type="hidden" name="mail" value={mail} />
      <p className="mt-5 max-w-[420px] text-[13.5px] text-muted">Su mail alcanza más de un cliente. ¿Cuál quiere ver?</p>
      <div className="mt-4 flex max-w-[380px] flex-col gap-2">
        {clientes.map((c) => (
          <button
            key={c.id}
            type="submit"
            name="cliente"
            value={c.id}
            disabled={pendiente}
            className="flex min-h-[50px] items-center justify-between gap-3 rounded-[8px] border border-line-strong px-[14px] text-left text-[15px] text-ink transition-colors hover:border-ink disabled:opacity-60"
          >
            <span className="min-w-0 truncate">{c.nombre}</span>
            <IconoFlecha tamano={18} />
          </button>
        ))}
      </div>
    </form>
  )
}

function Cabecera() {
  return (
    <>
      {/* EL LOGO COMPLETO, no el isotipo: la puerta es donde hay lugar y donde más importa que se
          reconozca de quién es la pantalla. El nombre escrito debajo se retira — el logo YA lo dice,
          y repetirlo pone dos marcas donde hay una. */}
      <img src="/marca/logo.png" alt="Echegaray Construcciones" width={196} height={44}
        className="h-auto w-[196px] max-w-full" />
      <h1 className="mt-[26px] text-[28px] font-semibold tracking-[-.02em]">Ingresá</h1>
    </>
  )
}

/**
 * ═══ LA ÚNICA LÍNEA DE ESTE MÓDULO QUE NO LE HABLA AL CLIENTE (08/09/2026) ═══
 *
 * Y está acá porque el cruce pasa de verdad: alguien de adentro que abre `/portal/login` NO es
 * rebotado —`destinoPorRol` deja pasar la puerta y la salida del portal a propósito, para que el
 * dueño pueda cerrar la sesión de una vista previa sin terminar dentro de su propio sistema—, así
 * que ve esta pantalla, pone su mail de trabajo y recibe «Ese mail no está habilitado». El único
 * rebotado es el nivel campo, y va a parar a `/hoy` sin que nadie le diga por qué.
 *
 * Es una línea de 12,5px al pie, debajo de la acción, sin icono y sin color: para el cliente es
 * ruido que puede ignorar de un vistazo; para el empleado es la salida. Es lo mínimo que cierra el
 * cruce en la dirección que faltaba, y es lo único que cambia en `src/app/portal/**`.
 */
function PuertaDeAdentro() {
  return (
    <p className="mt-6 max-w-[380px] text-[12.5px] text-faint">
      ¿Trabajás en Echegaray?{' '}
      {/* `<a>` y no `<Link>`: se cruza de aplicación. El portal y el OS no comparten sesión ni
          layout, y prefetchear una ruta del OS desde la puerta del cliente sería traer bytes de un
          sistema que él no usa. */}
      <a href="/login" className="text-muted underline underline-offset-2">Entrá por acá</a>
    </p>
  )
}

function BotonPrimario({ pendiente, children }: { pendiente: boolean; children: string }) {
  return (
    <button
      type="submit"
      disabled={pendiente}
      className="mt-3 flex min-h-[50px] max-w-[380px] items-center justify-center gap-[9px] rounded-[8px] bg-marca text-[15px] font-semibold text-ink disabled:opacity-60"
    >
      <span>{pendiente ? 'Un momento…' : children}</span>
      {pendiente ? null : <IconoFlecha tamano={18} />}
    </button>
  )
}
