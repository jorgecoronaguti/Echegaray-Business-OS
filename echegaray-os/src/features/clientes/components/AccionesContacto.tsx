'use client'

// EL `···` DE LA FILA — no dos botones por renglón.
//
// `COMPONENTS.md` §Contextual action menu: *"Acciones de fila: sólo en hover o menú contextual.
// NUNCA una fila llena de botones"*. La agenda de un cliente tenía «Editar» y «Borrar» dibujados en
// cada renglón: con seis contactos son doce objetivos de clic compitiendo con los datos que la
// persona vino a leer, y uno de esos doce borra.
//
// ═══ POR QUÉ ESTE ARCHIVO EXISTE Y NO SE RESUELVE EN LA TABLA ═══
//
// `MenuContextual` necesita un `onClick`, y una función no cruza la frontera del servidor: escribir
// `onClick={() => borrar(c.id)}` dentro de la tabla —que es un componente de servidor— compila,
// pasa el build y deja la fila muerta. La server action SÍ cruza como referencia, así que viaja
// como prop y el `onClick` se arma de este lado.
//
// EL FALLO NO SE SILENCIA: si la base rechaza el borrado —RLS, una FK, lo que sea— el mensaje de la
// fuente aparece al lado del menú. Un menú que se cierra sin haber borrado nada es indistinguible
// de uno que borró.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { MenuContextual } from '@/shared/components/ds'

type Resultado = { ok: true; id?: string } | { ok: false; error: string }

/** El menú de una fila con UNA acción de servidor destructiva y, opcionalmente, enlaces antes. */
export function MenuDeFila({
  enlaces = [],
  destructiva,
  ejecutar,
  etiqueta,
  testid,
}: {
  enlaces?: { label: string; href: string; testid?: string }[]
  destructiva: { label: string; testid?: string }
  /** Ya viene atada a su objeto: este componente no arma argumentos que el servidor no validó. */
  ejecutar: () => Promise<Resultado>
  etiqueta: string
  testid: string
}) {
  const router = useRouter()
  const [pendiente, iniciar] = useTransition()
  const [error, setError] = useState<string | null>(null)

  return (
    <span className="inline-flex items-center justify-end gap-2">
      {error && (
        <span className="text-[11px] text-neg" data-testid={`${testid}-error`}>{error}</span>
      )}
      {pendiente && <span className="text-[11px] text-faint">…</span>}
      <MenuContextual
        etiqueta={etiqueta}
        testid={testid}
        items={[
          ...enlaces.map((e) => ({ label: e.label, href: e.href, testid: e.testid })),
          {
            label: destructiva.label,
            destructiva: true,
            testid: destructiva.testid,
            onClick: () =>
              iniciar(async () => {
                setError(null)
                const r = await ejecutar()
                if (!r.ok) setError(r.error)
                else router.refresh()
              }),
          },
        ]}
      />
    </span>
  )
}

export function AccionesContacto({
  contactoId,
  href,
  enEdicion,
  borrar,
}: {
  contactoId: string
  /** La dirección que abre —o cierra— el formulario de este contacto. El estado vive en la URL. */
  href: string
  enEdicion: boolean
  borrar: (contactoId: string) => Promise<Resultado>
}) {
  return (
    <MenuDeFila
      etiqueta="Acciones del contacto"
      testid="acciones-contacto"
      enlaces={[{
        label: enEdicion ? 'Cerrar edición' : 'Editar',
        href,
        testid: enEdicion ? 'cerrar-contacto' : 'editar-contacto',
      }]}
      destructiva={{ label: 'Borrar', testid: 'borrar-contacto' }}
      ejecutar={() => borrar(contactoId)}
    />
  )
}

export function AccionesDocumento({
  driveFileId,
  desvincular,
}: {
  driveFileId: string
  desvincular: (driveFileId: string) => Promise<Resultado>
}) {
  return (
    <MenuDeFila
      etiqueta="Acciones del documento"
      testid="acciones-documento-cliente"
      destructiva={{ label: 'Quitar el vínculo', testid: 'desvincular-documento-cliente' }}
      // QUITAR EL VÍNCULO NO BORRA EL ARCHIVO: vive en Drive y sigue ahí. Por eso la etiqueta dice
      // «el vínculo» y no «el documento» — la palabra es la diferencia entre deshacer una
      // clasificación y creer que se destruyó un contrato.
      ejecutar={() => desvincular(driveFileId)}
    />
  )
}
