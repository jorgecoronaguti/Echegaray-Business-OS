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
// EL DESPLEGABLE NO SE CONTROLA DESDE REACT. `key={valor}` lo remonta cuando la base devuelve un
// valor distinto —o sea, cuando el guardado entró y la página se volvió a leer—, y mientras tanto el
// DOM conserva lo que la persona eligió. Sincronizarlo a mano con un efecto sería un segundo estado
// compitiendo con el de la base para decir lo mismo, y el que pierde la carrera miente.

import { startTransition, useActionState } from 'react'
import type { ResultadoAccion } from '@/shared/components/ui'

export function SelectRolDocumento({
  valor, opciones, guardar, testid,
}: {
  valor: string | null
  opciones: readonly string[]
  guardar: (form: FormData) => Promise<ResultadoAccion>
  testid?: string
}) {
  const [estado, ejecutar, pendiente] = useActionState<ResultadoAccion | null, FormData>(
    (_previo, form) => guardar(form),
    null,
  )
  // Un rol cargado antes de que existiera el vocabulario cerrado no se puede perder de vista: se
  // agrega como opción para que el desplegable muestre lo que hay de verdad.
  const lista = valor && !opciones.includes(valor) ? [valor, ...opciones] : opciones

  return (
    <span className="inline-flex items-center gap-2">
      <select
        key={valor ?? ''}
        defaultValue={valor ?? ''}
        disabled={pendiente}
        data-testid={testid}
        onChange={(e) => {
          const form = new FormData()
          form.set('rol', e.target.value)
          startTransition(() => ejecutar(form))
        }}
        className="min-w-0 rounded-control border border-line bg-white px-2 py-1 text-[12px] text-ink disabled:opacity-50"
      >
        <option value="">sin clasificar</option>
        {lista.map((r) => <option key={r} value={r}>{r}</option>)}
      </select>
      {estado?.ok === true && <span className="text-[11px] text-pos">guardado</span>}
      {estado?.ok === false && (
        <span data-testid={testid ? `${testid}-error` : undefined} className="text-[11px] text-neg">{estado.error}</span>
      )}
    </span>
  )
}
