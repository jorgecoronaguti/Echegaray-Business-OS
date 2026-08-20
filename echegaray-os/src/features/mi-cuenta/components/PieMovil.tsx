// EL PIE DE MI CUENTA EN EL TELÉFONO — los accesos y el botón de salir.
//
// ═══ POR QUÉ EXISTE Y POR QUÉ SÓLO EN MOBILE ═══
//
// En escritorio, las siete solapas están a la vista arriba y «salir» vive en el header global. En un
// teléfono de 390px el header se recorta y la barra de solapas se desplaza de costado: quien entra a
// Mi cuenta desde el teléfono no ve ni «Mis documentos» ni «Salir» sin barrer la pantalla. El
// handoff lo resuelve con una lista de accesos al pie y el cerrar sesión abajo del todo.
//
// LA ALERTA VIAJA HASTA ACÁ. «1 vencido» al lado de Mis documentos es lo único que hace que alguien
// abra esa pantalla: un acceso sin señal es un renglón que se saltea.
//
// FILAS DE 58px Y OBJETIVOS DE 44+: se toca con el dedo, en obra, y muchas veces con guante.

import Link from 'next/link'
import { logoutAction } from '@/features/auth/services/actions'

export function PieMovil({
  alertaDocumentos,
  horasDelPeriodo,
}: {
  /** `null` cuando no hay nada que avisar: un renglón que siempre dice algo deja de decir. */
  alertaDocumentos: string | null
  horasDelPeriodo: string | null
}) {
  return (
    <div className="mt-10 lg:hidden" data-testid="pie-movil">
      <div className="border-t border-line">
        <Acceso
          href="/mi-cuenta/horas"
          titulo="Mis horas"
          detalle={horasDelPeriodo}
          faltante="sin horas imputadas este mes"
        />
        <Acceso
          href="/mi-cuenta/documentos"
          titulo="Mis documentos"
          detalle={alertaDocumentos}
          faltante="al día"
          alerta={Boolean(alertaDocumentos)}
        />
        <Acceso href="/mi-cuenta/legajo" titulo="Mi legajo" detalle="categoría, alta, asignaciones" />
      </div>

      {/* SALIR AL PIE, CON BORDE Y NO EN AMARILLO: no es la acción primaria de la pantalla, es la
          última. El rojo la marca como lo que es —se pierde el contexto— sin gritarlo. */}
      <form action={logoutAction} className="mt-6">
        <button
          type="submit"
          data-testid="salir-movil"
          className="flex h-[46px] w-full items-center justify-center rounded-control border border-line text-[14px] text-neg transition-colors hover:bg-neg-soft"
        >
          Cerrar sesión
        </button>
      </form>
    </div>
  )
}

function Acceso({
  href, titulo, detalle, faltante, alerta,
}: {
  href: string
  titulo: string
  detalle?: string | null
  faltante?: string
  alerta?: boolean
}) {
  return (
    <Link
      href={href}
      className="flex min-h-[58px] items-center gap-3 border-b border-[#EFEEEA] py-2.5"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] text-ink">{titulo}</span>
        <span className={`mt-0.5 block text-[12px] ${alerta ? 'text-warn' : 'text-faint'}`}>
          {detalle ?? faltante}
        </span>
      </span>
      <span aria-hidden className="text-[15px] text-line-strong">›</span>
    </Link>
  )
}
