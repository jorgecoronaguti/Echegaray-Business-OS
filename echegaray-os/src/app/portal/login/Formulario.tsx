'use client'

import { useActionState } from 'react'
import { pedirCodigo, validarCodigo, type EstadoLogin } from './acciones'
import { IconoMail, IconoFlecha, IconoAlerta, IconoReloj } from '../iconos'

// LA ENTRADA — un mail y un código, nada más.
//
// No hay campo de contraseña porque no hay contraseña: el cliente entra con el mail que el
// administrador cargó en su ficha. Poner un campo "contraseña" deshabilitado, o un «registrate» que
// no lleva a ningún lado, sería prometer algo que el módulo decidió no tener.

const INICIAL: EstadoLogin = { paso: 'mail' }

/** El texto que ve el cliente. Un código malo y uno vencido dicen lo MISMO: la diferencia se registra. */
const MENSAJE: Record<NonNullable<EstadoLogin['error']>, string> = {
  no_habilitado: 'Ese mail no está habilitado',
  mail_invalido: 'Ese mail no está bien escrito',
  codigo_malo: 'Ese código no sirve — pedí uno nuevo',
  sin_envio: 'No pudimos enviarte el código ahora',
}

export function Formulario() {
  const [estado, enviar, pendiente] = useActionState(pedirCodigo, INICIAL)
  if (estado.paso === 'codigo') return <PasoCodigo mail={estado.mail!} />

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
      <BotonPrimario pendiente={pendiente}>Continuar</BotonPrimario>
    </form>
  )
}

function PasoCodigo({ mail }: { mail: string }) {
  const [estado, enviar, pendiente] = useActionState(validarCodigo, { paso: 'codigo', mail } as EstadoLogin)
  return (
    <form action={enviar} className="flex flex-col">
      <Cabecera />
      <input type="hidden" name="mail" value={mail} />
      <p className="mt-5 max-w-[420px] text-[13.5px] text-muted">
        Te mandamos un código a <span className="font-mono text-ink">{mail}</span>. Vence en 15 minutos.
      </p>
      <label className="sr-only" htmlFor="codigo">Código</label>
      <div
        className={
          'mt-4 flex min-h-[50px] max-w-[380px] items-center gap-[10px] rounded-[8px] border px-[14px] ' +
          (estado.error ? 'border-neg' : 'border-line-strong focus-within:border-ink')
        }
      >
        <input
          id="codigo" name="codigo" inputMode="numeric" autoComplete="one-time-code" required autoFocus
          maxLength={6} placeholder="000000"
          className="min-w-0 flex-1 bg-transparent font-mono text-lg tracking-[.35em] text-ink outline-none placeholder:text-faint"
        />
      </div>
      {estado.error ? (
        <p className="mt-3 flex items-center gap-[9px] text-neg">
          <IconoAlerta tamano={18} />
          <span className="text-[13.5px]">{MENSAJE[estado.error]}</span>
        </p>
      ) : null}
      <BotonPrimario pendiente={pendiente}>Entrar</BotonPrimario>
    </form>
  )
}

function Cabecera() {
  return (
    <>
      <span className="grid h-11 w-11 place-items-center rounded-[10px] bg-marca text-lg font-semibold text-ink">E</span>
      <span className="mt-[14px] text-[11.5px] font-semibold tracking-[.05em] text-ink-soft">
        ECHEGARAY CONSTRUCCIONES
      </span>
      <h1 className="mt-[26px] text-[28px] font-semibold tracking-[-.02em]">Ingresá</h1>
    </>
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
