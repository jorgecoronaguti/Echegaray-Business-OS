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
// ═══ NO SE GUARDA SI NO CAMBIÓ — Y CONTRA QUÉ SE COMPARA ═══
//
// `onBlur` se dispara al salir del campo aunque no se haya tocado una tecla: navegar la tabla con
// el tabulador dispararía una escritura por celda. Se compara contra lo VIGENTE (`hayQueGuardar` de
// `ds/inlineEdit.ts`, la misma regla pura y probada que usa `InlineEdit`), que es lo guardado y no
// lo tecleado. QA del 17/09/2026: comparar contra el texto del campo hace que NUNCA se guarde nada,
// porque para cuando llega el `blur` el texto del campo ya es el nuevo. Se vio en el navegador: el
// código quedaba escrito en pantalla y después de recargar volvía vacío.
//
// Y por eso el valor guardado le gana a la prop hasta que el servidor la repite: `revalidatePath`
// tarda, y hasta entonces la prop sigue trayendo lo viejo. Sin esto, la celda vuelve sola a lo de
// antes tres segundos después de guardar — que es la misma trampa que ya se pagó en Liquidación.
//
// ═══ EL VACÍO SE PUEDE ESCRIBIR A PROPÓSITO ═══
//
// Borrar el contenido y salir guarda `null`, que es «sin cargar». Es la única manera de deshacer un
// cómputo cargado por error, y por eso el campo NO tiene `required`.
//
// ═══ CMD/CTRL+Z Y CMD/CTRL+SHIFT+Z (dueño, 17/09/2026) ═══
//
// Cada guardado pasa por `useGuardadoDeshacible`, el MISMO hook y la MISMA pila que ya usa
// `InlineEdit` en Liquidación y Obras: no hay una segunda implementación del deshacer. Deshacer
// vuelve a llamar a `editarCampoPartida` con el valor anterior — es una corrección más, no un
// rollback mágico, y por eso queda en el historial de la partida como cualquier otra.
//
// Por qué se dejó de usar `useActionState` con `<form>`: el hook necesita esperar el resultado del
// guardado para apilar el paso (y sólo si salió bien), y `useActionState` devuelve el estado por un
// render posterior, no por el valor de retorno. Con `useTransition` el resultado se lee donde se
// decide si hay algo que deshacer. El `<form>` no aportaba nada: nunca se enviaba sin JavaScript,
// porque el guardado ya dependía de `onBlur`.

import { useEffect, useRef, useState, useTransition } from 'react'
import { useCeldaViva, useGuardadoDeshacible, type ContextoDeGuardado } from '@/shared/components/deshacer/DeshacerProvider'
import {
  alConfirmarGuardado, alLlegarDelServidor, hayQueGuardar, valorVigente, type EstadoInline,
} from '@/shared/components/ds/inlineEdit'
import { editarCampoPartida } from '../services/actionsPartida'
import { INICIAL } from '../services/accion'

export type CampoDePartida =
  | 'descripcion' | 'rubro' | 'codigo' | 'unidad' | 'cantidad' | 'hs_unitarias' | 'precio_subcontrato'

/** Cómo se nombra la celda en el aviso de deshacer: «Cantidad de Hormigón H-21 …». */
const ROTULO: Record<CampoDePartida, string> = {
  descripcion: 'Descripción',
  rubro: 'Rubro',
  codigo: 'Código',
  unidad: 'Unidad',
  cantidad: 'Cantidad',
  hs_unitarias: 'Horas unitarias',
  precio_subcontrato: 'Precio de subcontrato',
}

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
  rotuloFila,
}: {
  partidaId: string
  cotizacionId: string
  campo: CampoDePartida
  valor: string
  alineacion?: 'izquierda' | 'derecha'
  ancho?: string
  placeholder?: string
  mono?: boolean
  /** Un presupuesto congelado no se edita: el campo se dibuja apagado y no se puede tocar. */
  deshabilitada?: boolean
  testid?: string
  /** De qué partida es, para que el aviso de deshacer diga cuál de las cuarenta filas volvió atrás. */
  rotuloFila?: string
}) {
  const [pendiente, empezar] = useTransition()
  const [error, setError] = useState<string | null>(INICIAL.error)
  // LO QUE LA CELDA MUESTRA. El texto del campo (`borrador`) y lo guardado (`estado`) son dos cosas
  // distintas: sin esa distinción no se puede decidir si hay algo que escribir. Antes era
  // `defaultValue` (no controlado), pero el deshacer necesita poder ESCRIBIR el valor restaurado en
  // la celda sin esperar los segundos del `revalidatePath`.
  const [borrador, setBorrador] = useState(valor)
  const [estado, setEstado] = useState<EstadoInline>({ delServidor: valor, pendiente: null })
  const [editando, setEditando] = useState(false)
  if (!editando && valor !== estado.delServidor) {
    const siguiente = alLlegarDelServidor(estado, valor)
    setEstado(siguiente)
    setBorrador(valorVigente(siguiente))
  }
  const vigente = valorVigente(estado)

  const clave = testid ?? `partida-${partidaId}-${campo}`
  // LO GUARDADO, LEÍBLE FUERA DEL RENDER: el deshacer consulta el valor de la celda cuando la persona
  // teclea Cmd+Z, que es mucho después de este render.
  const estadoRef = useRef(estado)
  useEffect(() => { estadoRef.current = estado })

  async function escribir(v: string, contexto?: ContextoDeGuardado): Promise<{ ok: true } | { ok: false; error: string }> {
    const fd = new FormData()
    fd.set('partida_id', partidaId)
    fd.set('cotizacion_id', cotizacionId)
    fd.set('campo', campo)
    fd.set('valor', v)
    // DESHACER VIAJA CON LO QUE ESTA CELDA VIO (18/09/2026): la acción no escribe si la base ya tiene otra cosa.
    if (contexto?.esperado !== undefined) fd.set('esperado', contexto.esperado)
    const r = await editarCampoPartida(INICIAL, fd)
    return r.ok ? { ok: true } : { ok: false, error: r.error ?? 'no se pudo guardar' }
  }

  const guardarDeshacible = useGuardadoDeshacible({
    clave,
    rotulo: rotuloFila ? `${ROTULO[campo]} de ${rotuloFila}` : ROTULO[campo],
    valorAnterior: vigente,
    guardar: escribir,
    formato: (x) => (x === '' ? placeholder : x),
    protegido: true,
  })

  useCeldaViva(clave, {
    actual: () => valorVigente(estadoRef.current),
    aplicar: (v) => { setEstado((e) => alConfirmarGuardado(e, v)); setBorrador(v) },
  })

  function guardar(v: string) {
    if (!hayQueGuardar(estado, v)) return
    empezar(async () => {
      const r = await guardarDeshacible(v)
      if (r.ok) { setEstado((e) => alConfirmarGuardado(e, v)); setError(null); return }
      // EL RECHAZO DE LA BASE DEVUELVE LA CELDA A LO QUE HABÍA: dejar en pantalla un valor que no
      // entró es la pantalla afirmando un cambio que no ocurrió.
      setBorrador(valorVigente(estadoRef.current))
      setError(r.error)
    })
  }

  return (
    <div className="min-w-0">
      <input
        name="valor"
        value={borrador}
        disabled={deshabilitada || pendiente}
        placeholder={placeholder}
        inputMode={mono ? 'decimal' : undefined}
        aria-label={campo}
        title={borrador || undefined}
        data-testid={testid}
        onChange={(e) => setBorrador(e.target.value)}
        onFocus={() => setEditando(true)}
        onBlur={(e) => { setEditando(false); guardar(e.target.value) }}
        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
        // `text-ellipsis`: una descripción más larga que la celda se recortaba en seco y parecía
        // completa (QA 24/08). Con foco el navegador vuelve a mostrar desde el cursor, como debe.
        className={`${ancho} min-w-0 truncate rounded-[4px] border border-transparent bg-transparent px-1 py-0.5 text-[11.5px] text-ink-soft outline-none transition-colors placeholder:text-faint hover:border-line focus:border-marca focus:bg-surface disabled:cursor-not-allowed disabled:text-faint ${
          alineacion === 'derecha' ? 'text-right' : ''
        } ${mono ? 'font-mono tabular-nums' : ''}`}
      />
      {/* El rechazo de la base se ve en la celda, no en un lugar que hay que ir a buscar. */}
      {error && <span className="block text-[10px] leading-tight text-neg">{error}</span>}
    </div>
  )
}
