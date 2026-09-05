// EL `···` DE LA FILA — y la línea de acciones que abre DENTRO de la misma fila.
//
// `COMPONENTS.md` §Contextual action menu: *"Acciones de fila: sólo en hover o menú contextual.
// NUNCA una fila llena de botones"*. La agenda de un cliente tenía «Editar» y «Borrar» dibujados en
// cada renglón: con seis contactos son doce objetivos de clic compitiendo con los datos que la
// persona vino a leer, y uno de esos doce borra.
//
// ═══ POR QUÉ YA NO ES UN POPOVER FLOTANTE (handoff CRM / Administración v4) ═══
//
// El menú se dibujaba en `position:absolute` sobre la tabla. Tres cosas que eso rompe y la línea
// inline no: tapa la fila de abajo justo cuando hay que compararla, se recorta contra el borde de
// la tarjeta en pantallas angostas, y —la que importa— NO TIENE DÓNDE PONER EL ERROR DE LA BASE.
// «El contacto tiene un acceso al portal: revocalo primero» es una frase larga y es el resultado de
// la acción: en un popover de 180px se corta, y al cerrarse el menú se va con ella.
//
// La línea expande dentro de la fila (`colSpan` de toda la tabla), así que el error se lee al lado
// del menú, en el lugar donde alguien acaba de hacer clic.
//
// ═══ QUÉ FILA ESTÁ ABIERTA VIVE EN LA URL ═══
//
// Mismo criterio que `?contacto=` para la edición: la tabla es un componente de SERVIDOR, y volverla
// de cliente para tener un `useState` obligaría a que `editar(c.id)` —una función que devuelve una
// server action— cruzara la frontera, que es el React #419 que ya dejó pantallas en blanco. Además
// «uno abierto a la vez» sale gratis: un parámetro, un valor.
//
// EL FALLO NO SE SILENCIA: si la base rechaza el borrado —RLS, una FK, lo que sea— el mensaje de la
// FUENTE aparece en la línea. Un menú que se cierra sin haber borrado nada es indistinguible de uno
// que borró.

import Link from 'next/link'
import type { ReactNode } from 'react'
import { BotonDeFila } from './BotonDeFila'

type Resultado = { ok: true; id?: string } | { ok: false; error: string }

/** El `···` que abre y cierra la línea. Es un enlace: el estado vive en la URL. */
export function AbrirAcciones({ href, abierto, etiqueta, testid }: {
  href: string
  abierto: boolean
  etiqueta: string
  testid: string
}) {
  return (
    <Link
      href={href}
      scroll={false}
      prefetch={false}
      aria-label={etiqueta}
      aria-expanded={abierto}
      data-testid={testid}
      className={`inline-flex rounded-control px-2 py-1 text-[15px] leading-none transition-colors hover:bg-surface-quiet hover:text-ink ${
        abierto ? 'bg-surface-quiet text-ink' : 'text-faint'
      }`}
    >
      ···
    </Link>
  )
}

/**
 * LA LÍNEA DE ACCIONES, dentro de la fila. Va en una `<tr>` propia con `colSpan` completo: en una
 * tabla HTML eso es el `grid-column: 1 / -1` del diseño.
 */
export function LineaDeAcciones({ columnas, children, testid }: {
  columnas: number
  children: ReactNode
  testid: string
}) {
  return (
    <tr className="border-b border-[#EFEEEA] bg-surface-quiet">
      <td colSpan={columnas} className="px-3 py-2">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2" data-testid={testid}>
          {children}
        </div>
      </td>
    </tr>
  )
}

/** «Editar» dentro de la línea. Enlace, porque el formulario de edición también vive en la URL. */
export function AccionEnlace({ href, children, testid }: {
  href: string
  children: ReactNode
  testid?: string
}) {
  return (
    <Link
      href={href}
      scroll={false}
      prefetch={false}
      data-testid={testid}
      className="text-[12.5px] text-ink-soft underline underline-offset-2 hover:text-ink"
    >
      {children}
    </Link>
  )
}

/** La aclaración que acompaña a una acción destructiva. Sin ella, «Quitar» se lee como «Borrar». */
export function NotaDeAccion({ children }: { children: ReactNode }) {
  return <span className="text-[11.5px] text-faint">{children}</span>
}

export function AccionesContacto({
  contactoId, borrar,
}: {
  contactoId: string
  borrar: (contactoId: string) => Promise<Resultado>
}) {
  return (
    <BotonDeFila
      label="Borrar"
      testid="borrar-contacto"
      ejecutar={() => borrar(contactoId)}
    />
  )
}

export function AccionesDocumento({
  driveFileId, desvincular,
}: {
  driveFileId: string
  desvincular: (driveFileId: string) => Promise<Resultado>
}) {
  return (
    <BotonDeFila
      // QUITAR EL VÍNCULO NO BORRA EL ARCHIVO: vive en Drive y sigue ahí. Por eso la etiqueta dice
      // «el vínculo» y no «el documento» — la palabra es la diferencia entre deshacer una
      // clasificación y creer que se destruyó un contrato.
      label="Quitar el vínculo"
      testid="desvincular-documento-cliente"
      ejecutar={() => desvincular(driveFileId)}
    />
  )
}
