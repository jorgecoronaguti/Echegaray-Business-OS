'use client'

// FORMULARIO CONTRA UNA SERVER ACTION — la única pieza de cliente que necesita la escritura del OS.
//
// ═══ POR QUÉ EXISTE UNA SOLA ═══
//
// El módulo tiene catorce formularios (cliente, contacto, documento, obra, actividad, avance,
// impedimento, asignación, certificado…) y todos hacen exactamente lo mismo: mandar un FormData a
// una acción del servidor, esperar, y mostrar lo que contestó. Repetir ese `useActionState` catorce
// veces es catorce lugares donde el error se puede tragar en silencio.
//
// ═══ LA REGLA QUE HACE CUMPLIR ═══
//
// EL ERROR DEL SERVIDOR SE MUESTRA SIEMPRE. La acción devuelve `{ok:false, error}` cuando la base
// rechaza la escritura —RLS, clave repetida, validación de Zod—, y esa respuesta es la única prueba
// de lo que pasó. Un formulario que se limpia y no dice nada le hace creer al jefe de obra que
// cargó algo que no existe: ese es el modo de falla que este componente existe para impedir.
//
// Sin `window.confirm` en ninguna acción: un diálogo nativo no se puede leer en el teléfono con
// guantes puestos y encima obliga a los tests a atrapar `dialog`. Lo destructivo se protege
// escribiendo qué hace al lado del botón, que además queda como evidencia en la pantalla.

import { startTransition, useActionState, useEffect, useRef, type FormEvent, type ReactNode } from 'react'

export type ResultadoAccion =
  /** `mensaje` es para cuando el resultado NO es "guardado" a secas: una carga masiva que imputó a
   *  12 personas y salteó 3 tiene que decirlo, o la persona se va creyendo que cargó 15. Cuando la
   *  acción no lo manda, se muestra el `mensajeOk` del formulario. */
  | { ok: true; id?: string; mensaje?: string }
  | { ok: false; error: string }

/** La firma de toda acción de escritura del módulo, ya atada a su id por `bind`. */
export type AccionFormulario = (form: FormData) => Promise<ResultadoAccion>

export function FormAccion({
  accion,
  children,
  enviar = 'Guardar',
  testid,
  className = '',
  limpiarAlOk = false,
  mensajeOk = 'Guardado.',
  bloqueado = false,
  motivoBloqueo,
}: {
  accion: AccionFormulario
  children: ReactNode
  enviar?: string
  testid?: string
  className?: string
  /** Para las altas: el formulario queda en blanco listo para el siguiente. En las ediciones NO,
   *  porque dejaría los campos vacíos sobre un registro que sí tiene valores. */
  limpiarAlOk?: boolean
  mensajeOk?: string
  /** LA PRIMARIA APAGADA CUANDO FALTA ALGO QUE EL SERVIDOR VA A RECHAZAR IGUAL.
   *
   *  No reemplaza la validación del servidor —la misma fila entra por otras tres puertas— y por eso
   *  el motivo se escribe AL LADO del botón: un botón gris sin explicación deja a la persona
   *  probando dónde tocar. El único caso hoy es el criterio del método manual, que la base exige
   *  con un CHECK. */
  bloqueado?: boolean
  motivoBloqueo?: ReactNode
}) {
  const ref = useRef<HTMLFormElement>(null)
  const [estado, ejecutar, pendiente] = useActionState<ResultadoAccion | null, FormData>(
    (_previo, form) => accion(form),
    null,
  )

  // EL FORMULARIO SE VACÍA CUANDO GUARDÓ, NO CUANDO SE MANDÓ.
  //
  // React 19 limpia solo todo `<form action={fn}>` en cuanto la acción termina, HAYA GUARDADO O NO.
  // Medido acá (18/08): con un certificado al que le faltaba la fecha de facturación, el servidor
  // devolvía el error correcto y la pantalla lo mostraba… sobre un formulario ya en blanco. El
  // número, la fecha y el monto recién tipeados se perdían, y había que cargar todo de nuevo para
  // corregir un campo. En un teléfono, en obra, eso es abandonar la carga.
  //
  // Por eso el envío se intercepta: `preventDefault` apaga el reseteo automático, y el formulario
  // sólo se vacía —y sólo si es un alta— cuando la acción contestó que sí.
  function enviarFormulario(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const datos = new FormData(e.currentTarget)
    startTransition(() => ejecutar(datos))
  }

  useEffect(() => {
    if (estado?.ok && limpiarAlOk) ref.current?.reset()
  }, [estado, limpiarAlOk])

  return (
    <form ref={ref} onSubmit={enviarFormulario} data-testid={testid} className={className}>
      {children}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pendiente || bloqueado}
          data-testid={testid ? `${testid}-enviar` : undefined}
          // LA PRIMARIA DEL SISTEMA, NO UN NEGRO DE TAILWIND (20/08/2026). Era `bg-slate-900`, un
          // color que no está en la paleta del handoff — y lo comparten los catorce formularios
          // del OS, así que era el botón más repetido del sistema y ninguno era de la marca.
          // Amarillo con texto grafito: #FDC900 da 1,6:1 sobre blanco y no admite texto claro.
          className="rounded-control bg-marca px-3.5 py-[7px] text-[12.5px] font-semibold text-[color:var(--os-on-marca)] transition-colors hover:brightness-[0.97] disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:text-faint disabled:hover:brightness-100"
        >
          {pendiente ? 'Guardando…' : enviar}
        </button>
        {bloqueado && motivoBloqueo && (
          <span data-testid={testid ? `${testid}-bloqueado` : undefined} className="text-[12px] text-warn">{motivoBloqueo}</span>
        )}
        {estado?.ok === true && (
          <span data-testid={testid ? `${testid}-ok` : undefined} className="text-[12px] text-pos">{estado.mensaje ?? mensajeOk}</span>
        )}
        {estado?.ok === false && (
          <span data-testid={testid ? `${testid}-error` : undefined} className="text-[12px] text-neg">{estado.error}</span>
        )}
      </div>
    </form>
  )
}

/**
 * Un botón suelto contra una acción sin campos: archivar, quitar, liberar, sellar.
 *
 * ═══ POR QUÉ LOS ARGUMENTOS VAN COMO PROP Y NO EN UNA FUNCIÓN FLECHA ═══
 *
 * `accion={() => quitar(fila.id)}` sólo se puede escribir dentro de un componente de cliente: una
 * función no cruza la frontera del servidor. Con `args`, las pantallas que son server components
 * —las tablas de Personal, Economía y Planificación— pasan la acción del servidor y su id, y no
 * necesitan volverse de cliente enteras sólo para tener un botón de borrar.
 */
export function BotonAccion<A extends unknown[] = []>({
  accion,
  args,
  children,
  testid,
  tono = 'neutral',
  className = '',
}: {
  accion: (...args: A) => Promise<ResultadoAccion>
  args?: A
  children: ReactNode
  testid?: string
  tono?: 'neutral' | 'peligro' | 'fuerte'
  className?: string
}) {
  // Los parámetros del estado y de la carga se declaran en los genéricos y no en la firma: sin
  // ellos, `useActionState` deduce que la acción no recibe nada y `ejecutar` deja de ser válido como
  // `action` de un formulario. Este botón no lee el FormData —no tiene campos—, y por eso la función
  // no los recibe.
  const [estado, ejecutar, pendiente] = useActionState<ResultadoAccion | null, FormData>(
    () => accion(...((args ?? []) as A)),
    null,
  )
  // Los tonos salen de la paleta del handoff. `slate-900`/`slate-50` eran neutros de Tailwind:
  // grises FRÍOS dentro de un sistema cuyos neutros son cálidos (salen del grafito del logo). La
  // diferencia se nota poco de a uno y mucho en una tabla con veinte de estos.
  const estilo =
    tono === 'peligro'
      ? 'border-neg/30 text-neg hover:bg-neg-soft'
      : tono === 'fuerte'
        ? 'border-transparent bg-marca font-semibold text-[color:var(--os-on-marca)] hover:brightness-[0.97]'
        : 'border-line text-muted hover:bg-surface-quiet hover:text-ink'

  return (
    <form action={ejecutar} className={`inline-flex flex-wrap items-center gap-2 ${className}`}>
      <button
        type="submit"
        disabled={pendiente}
        data-testid={testid}
        className={`rounded-control border px-2.5 py-1 text-[12px] disabled:opacity-50 ${estilo}`}
      >
        {pendiente ? '…' : children}
      </button>
      {/* El fallo NO se silencia: si la base rechaza el borrado, se ve al lado del botón. */}
      {estado?.ok === false && (
        <span data-testid={testid ? `${testid}-error` : undefined} className="text-[11px] text-neg">{estado.error}</span>
      )}
    </form>
  )
}

/** Campo de formulario: rótulo arriba, control abajo. Es el 90% del marcado de estos formularios. */
export function Campo({
  label,
  children,
  ancho = '',
  ayuda,
}: {
  label: string
  children: ReactNode
  ancho?: string
  ayuda?: string
}) {
  return (
    <label className={`flex min-w-0 flex-col text-[11px] text-faint ${ancho}`}>
      {label}
      {children}
      {ayuda && <span className="mt-0.5 text-[10px] text-faint">{ayuda}</span>}
    </label>
  )
}

/** Las clases de un input/select/textarea, en un solo lugar: catorce formularios iguales. */
export const CTRL =
  'mt-1 w-full min-w-0 rounded-control border border-line bg-white px-2 py-1.5 text-[13px] text-ink placeholder:text-faint'
