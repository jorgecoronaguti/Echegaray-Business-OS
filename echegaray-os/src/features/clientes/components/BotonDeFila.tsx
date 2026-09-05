'use client'

// EL BOTÓN DESTRUCTIVO DE LA LÍNEA DE ACCIONES, con el error de la FUENTE al lado.
//
// ═══ POR QUÉ ES UN ARCHIVO PROPIO ═══
//
// Es lo ÚNICO de la línea que necesita ser de cliente: llama a una server action y tiene que
// mostrar lo que contestó. El resto de la línea —el `···`, «Editar», la aclaración— son enlaces y
// texto, y viven en la tabla, que es de servidor. Partirlo así es lo que permite que
// `BloqueContactos` siga pasando `editar(c.id)` sin cruzar una función por la frontera: ése es el
// React #419 que deja la pantalla en blanco en producción y compila sin una queja.
//
// ═══ EL MENSAJE ES EL DE LA BASE, NO UNO INVENTADO ═══
//
// «El contacto tiene un acceso al portal: revocalo primero» lo dice la FK, y es lo único que
// explica por qué el borrado no pasó. Un «no se pudo borrar» genérico deja a la persona apretando
// el mismo botón. Y un menú que se cierra sin haber borrado nada es indistinguible de uno que
// borró: por eso el error se queda en la línea hasta que se cierre a mano.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

type Resultado = { ok: true; id?: string } | { ok: false; error: string }

export function BotonDeFila({ label, ejecutar, testid }: {
  label: string
  /** Ya viene atada a su objeto: este componente no arma argumentos que el servidor no validó. */
  ejecutar: () => Promise<Resultado>
  testid: string
}) {
  const router = useRouter()
  const [pendiente, iniciar] = useTransition()
  const [error, setError] = useState<string | null>(null)

  return (
    <>
      <button
        type="button"
        data-testid={testid}
        disabled={pendiente}
        className="text-[12.5px] text-neg underline underline-offset-2 hover:text-[#912018] disabled:opacity-50"
        onClick={() =>
          iniciar(async () => {
            setError(null)
            const r = await ejecutar()
            if (!r.ok) setError(r.error)
            else router.refresh()
          })}
      >
        {pendiente ? `${label}…` : label}
      </button>
      {error && (
        <span className="text-[11.5px] text-neg" data-testid={`${testid}-error`}>{error}</span>
      )}
    </>
  )
}
