'use client'

// CLASIFICAR UN DOCUMENTO DESDE LA LISTA — un desplegable que guarda al soltarlo.
//
// ═══ POR QUÉ NO HAY BOTÓN «GUARDAR» ═══
//
// Clasificar 214 archivos es una tarea de una sola mano: elegir, elegir, elegir. Un botón por fila
// duplica los clics y convierte diez minutos en veinte, y a la mitad se abandona. El `onChange`
// manda el cambio; el resultado se ve al lado —«guardado» o el error de la base— porque un
// desplegable que se mueve solo y no dice nada es indistinguible de uno que no guardó.
//
// EL FALLO NUNCA SE SILENCIA: si la RLS rechaza la escritura (un jefe de obra no clasifica papeles
// del cliente), el error queda escrito al lado del desplegable. Un guardado que no entró y no dice
// nada es la peor de las fallas: deja a alguien convencido de que clasificó algo que sigue sin
// clasificar.
//
// ═══ CMD/CTRL+Z Y CMD/CTRL+SHIFT+Z (dueño, 17/09/2026) ═══
//
// Clasificar 214 archivos con la mano dormida es exactamente donde se clasifica mal, y hasta hoy no
// había vuelta atrás. La elección se apila en la pila de la plataforma y deshacer llama a la MISMA
// acción con el rol anterior. `clave` es obligatoria: sin ella las 214 filas comparten paso y Cmd+Z
// desclasificaría el archivo equivocado.
//
// EL DESPLEGABLE PASÓ A SER CONTROLADO. Antes era `key={valor}` + `defaultValue`, que conserva en el
// DOM lo que la persona eligió hasta que la base responde. El deshacer necesita poder ESCRIBIR el rol
// restaurado en el desplegable sin esperar la relectura, y eso un campo no controlado no lo permite.
//
// LO GUARDADO LE GANA A LA PROP HASTA QUE EL SERVIDOR LA REPITE (`EstadoInline` de `ds/inlineEdit.ts`,
// la misma regla pura y probada que usa `InlineEdit`). QA en el navegador, 17/09/2026: sin esto, un
// Cmd+Shift+Z escribía «contrato» en la base —se comprobó recargando— pero la pantalla volvía a
// «sin clasificar» un segundo después, porque el `revalidatePath` del paso anterior llegaba tarde con
// el valor viejo. La pantalla desmintiendo lo que acababa de hacer es peor que no hacerlo.

import { useEffect, useRef, useState, useTransition } from 'react'
import { useCeldaViva, useGuardadoDeshacible } from '@/shared/components/deshacer/DeshacerProvider'
import { alConfirmarGuardado, alLlegarDelServidor, valorVigente, type EstadoInline } from '@/shared/components/ds/inlineEdit'
import type { ResultadoAccion } from '@/shared/components/ui'

export function SelectRolDocumento({
  valor, opciones, guardar, testid, clave, rotulo,
}: {
  valor: string | null
  opciones: readonly string[]
  guardar: (form: FormData) => Promise<ResultadoAccion>
  testid?: string
  /** Qué archivo es, para el deshacer. Una clave por fila, nunca el `testid` compartido. */
  clave: string
  /** Cómo se nombra en el aviso: «Rol de contrato-quattropani.pdf». */
  rotulo: string
}) {
  const [acuse, setAcuse] = useState<ResultadoAccion | null>(null)
  const [pendiente, empezar] = useTransition()
  const [estado, setEstadoInline] = useState<EstadoInline>({ delServidor: valor ?? '', pendiente: null })
  if ((valor ?? '') !== estado.delServidor) setEstadoInline(alLlegarDelServidor(estado, valor ?? ''))
  const rol = valorVigente(estado)
  const estadoRef = useRef(estado)
  useEffect(() => { estadoRef.current = estado })
  // Un rol cargado antes de que existiera el vocabulario cerrado no se puede perder de vista: se
  // agrega como opción para que el desplegable muestre lo que hay de verdad.
  const lista = rol && !opciones.includes(rol) ? [rol, ...opciones] : opciones

  const guardarDeshacible = useGuardadoDeshacible({
    clave, rotulo, valorAnterior: rol,
    formato: (v) => (v === '' ? 'sin clasificar' : v),
    guardar: async (v) => {
      const form = new FormData()
      form.set('rol', v)
      const r = await guardar(form)
      return r.ok ? { ok: true as const } : { ok: false as const, error: r.error }
    },
  })

  useCeldaViva(clave, {
    actual: () => valorVigente(estadoRef.current),
    aplicar: (v) => setEstadoInline((e) => alConfirmarGuardado(e, v)),
  })

  // OCUPA SU CELDA Y SE ENCOGE CON ELLA. Con ancho intrínseco, a 390px el desplegable sobresalía de
  // la columna y el recorte le cortaba la flecha: parecía roto.
  return (
    <span className="flex w-full min-w-0 items-center gap-2">
      <select
        value={rol}
        disabled={pendiente}
        data-testid={testid}
        onChange={(e) => {
          const nuevo = e.target.value
          setEstadoInline((x) => alConfirmarGuardado(x, nuevo))
          empezar(async () => {
            const r = await guardarDeshacible(nuevo)
            setAcuse(r.ok ? { ok: true } : { ok: false, error: r.error })
            // El rechazo devuelve el desplegable a lo que había: dejarlo en un rol que la base no
            // aceptó es la pantalla afirmando una clasificación que no existe.
            if (!r.ok) setEstadoInline((x) => ({ delServidor: x.delServidor, pendiente: null }))
          })
        }}
        // «SIN CLASIFICAR» VA EN ÁMBAR también cuando el desplegable es editable: un archivo sin
        // rol es un archivo que la búsqueda no va a encontrar nunca, y el color es lo que hace que
        // alguien lo clasifique. En la vista de sólo lectura ya iba así; acá no, y era la misma
        // ausencia dicha de dos maneras dentro de la misma columna.
        className={`min-w-0 flex-1 rounded-control border border-line-strong bg-surface px-2 py-1 text-[12.5px] disabled:bg-surface-sunken disabled:text-faint ${
          rol ? 'text-ink' : 'text-warn'
        }`}
      >
        <option value="">sin clasificar</option>
        {lista.map((r) => <option key={r} value={r}>{r}</option>)}
      </select>
      {acuse?.ok === true && <span className="text-[11px] text-pos">guardado</span>}
      {acuse?.ok === false && (
        <span data-testid={testid ? `${testid}-error` : undefined} className="text-[11px] text-neg">{acuse.error}</span>
      )}
    </span>
  )
}
