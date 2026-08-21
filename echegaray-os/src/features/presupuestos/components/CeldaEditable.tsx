'use client'

// UNA CELDA QUE SE EDITA EN LÍNEA Y GUARDA AL SALIR DEL CAMPO.
//
// ═══ POR QUÉ CADA CELDA ES SU PROPIO FORMULARIO ═══
//
// Porque cada una escribe SÓLO su columna. Un formulario con la fila entera manda todos los campos
// en cada guardado, y basta con que uno no esté en el DOM —porque la columna está oculta por
// permiso, o por ancho— para que se guarde `null` encima de un dato que nadie tocó. Ese defecto ya
// borró notas de estado en Herramientas; acá borraría el cómputo al corregir una unidad.
//
// ═══ NO SE GUARDA SI NO CAMBIÓ ═══
//
// `onBlur` se dispara al salir del campo aunque no se haya tocado una tecla: navegar la tabla con
// el tabulador dispararía una escritura por celda. Se compara contra el valor inicial y sólo se
// manda si es distinto.
//
// ═══ EL VACÍO SE PUEDE ESCRIBIR A PROPÓSITO ═══
//
// Borrar el contenido y salir guarda `null`, que es «sin cargar». Es la única manera de deshacer un
// cómputo cargado por error, y por eso el campo NO tiene `required`.

import { useActionState, useRef, startTransition, type FormEvent } from 'react'
import { editarCampoPartida } from '../services/actionsPartida'
import { INICIAL, type EstadoAccion } from '../services/accion'

export function CeldaEditable({
  partidaId,
  cotizacionId,
  campo,
  valor,
  alineacion = 'izquierda',
  ancho = 'w-full',
  placeholder = 'sin cargar',
  mono = false,
  deshabilitada = false,
  testid,
}: {
  partidaId: string
  cotizacionId: string
  campo: 'descripcion' | 'rubro' | 'codigo' | 'unidad' | 'cantidad' | 'hs_unitarias' | 'precio_subcontrato'
  valor: string
  alineacion?: 'izquierda' | 'derecha'
  ancho?: string
  placeholder?: string
  mono?: boolean
  /** Un presupuesto congelado no se edita: el campo se dibuja apagado y no se puede tocar. */
  deshabilitada?: boolean
  testid?: string
}) {
  const [estado, guardar, pendiente] = useActionState<EstadoAccion, FormData>(editarCampoPartida, INICIAL)
  const form = useRef<HTMLFormElement>(null)

  function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const datos = new FormData(e.currentTarget)
    startTransition(() => guardar(datos))
  }

  return (
    <form ref={form} onSubmit={enviar} className="min-w-0">
      <input type="hidden" name="partida_id" value={partidaId} />
      <input type="hidden" name="cotizacion_id" value={cotizacionId} />
      <input type="hidden" name="campo" value={campo} />
      <input
        name="valor"
        defaultValue={valor}
        disabled={deshabilitada || pendiente}
        placeholder={placeholder}
        inputMode={mono ? 'decimal' : undefined}
        aria-label={campo}
        data-testid={testid}
        onBlur={(e) => { if (e.target.value !== valor) form.current?.requestSubmit() }}
        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
        className={`${ancho} min-w-0 rounded-[4px] border border-transparent bg-transparent px-1 py-0.5 text-[11.5px] text-ink-soft outline-none transition-colors placeholder:text-faint hover:border-line focus:border-marca focus:bg-surface disabled:cursor-not-allowed disabled:text-faint ${
          alineacion === 'derecha' ? 'text-right' : ''
        } ${mono ? 'font-mono tabular-nums' : ''}`}
      />
      {/* El rechazo de la base se ve en la celda, no en un lugar que hay que ir a buscar. */}
      {estado.error && <span className="block text-[10px] leading-tight text-neg">{estado.error}</span>}
    </form>
  )
}
