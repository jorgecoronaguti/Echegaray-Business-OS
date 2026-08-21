// PANTALLA 17 · BASE MAESTRA — TAREAS TIPO.
//
// La biblioteca de análisis de precio unitario de la empresa: qué sabe hacer Echegaray, cuánto rinde
// cada cosa y con qué se compone. Es el primer eslabón de la cadena que termina en una oferta:
//
//     Base maestra → Presupuesto → Conversión → Plan de obra → Ejecución
//
// TODO EL ESTADO VIVE EN LA URL —tarea abierta, solapa, filtro de rubro y búsqueda— así que
// cualquier vista de esta pantalla se puede pegar en un mensaje y abre igual. Es un server component
// entero: lo único de cliente es el buscador (que filtra al teclear) y la celda de cantidad.

import { createClient } from '@/lib/supabase/server'
import { PageShell } from '@/shared/components/ui'
import { Aviso } from '@/shared/components/ds'
import { getPerfilActual } from '@/features/auth/services/authService'
import { veEconomia } from '@/features/auth/types/areas'
import { NavAdministracion } from '@/features/administracion/components/NavAdministracion'
import { NavBaseMaestra, RUTA_TAREAS } from '@/features/base-maestra/components/NavBaseMaestra'
import { TareasTipo } from '@/features/base-maestra/components/TareasTipo'
import { FichaTarea, solapaDe, type Solapa } from '@/features/base-maestra/components/FichaTarea'
import { getFichaTarea, getTareasTipo } from '@/features/base-maestra/services/tareasService'

export const dynamic = 'force-dynamic'

type Busqueda = { q?: string; d?: string; t?: string; s?: string }

function href(sp: Busqueda, cambios: Partial<Busqueda>): string {
  const p = new URLSearchParams()
  const final = { ...sp, ...cambios }
  for (const k of ['q', 'd', 't', 's'] as const) {
    const v = final[k]
    if (v) p.set(k, v)
  }
  const qs = p.toString()
  return qs ? `${RUTA_TAREAS}?${qs}` : RUTA_TAREAS
}

export default async function BaseMaestraTareasPage({ searchParams }: { searchParams: Promise<Busqueda> }) {
  const sp = await searchParams
  const supabase = await createClient()
  const perfil = await getPerfilActual(supabase)
  // EL CORTE ES PRECIO, Y LO DECIDE LA BASE. Esto es sólo la puerta: `recurso_precio` ya le devuelve
  // cero filas a un jefe de obra. Se lee el rol para poder DECIRLO —«sin permiso»— en vez de que la
  // pantalla muestre 409 precios en null como si nadie los hubiera cargado.
  const economia = veEconomia(perfil.data?.rol ?? null)

  const listado = await getTareasTipo(supabase, economia)

  // UNA LECTURA QUE FALLA NO SE PINTA COMO BASE VACÍA: son lo contrario. Esta pantalla ya vive con
  // una base maestra sin cargar, así que confundir las dos haría invisible cualquier caída.
  if (listado.error) {
    return (
      <PageShell title="Base maestra" subtitle="Tareas tipo">
        <NavAdministracion />
        <NavBaseMaestra activa="tareas" />
        <div data-testid="tareas-error">
          <Aviso tono="neg" titulo="No pude leer la base maestra">{listado.error}</Aviso>
        </div>
      </PageShell>
    )
  }

  const todas = listado.data ?? []
  const divisiones = [...new Set(todas.map((t) => t.division).filter((d): d is string => Boolean(d)))].sort(
    (a, b) => a.localeCompare(b, 'es'),
  )
  const division = sp.d && divisiones.includes(sp.d) ? sp.d : null
  const tareas = division ? todas.filter((t) => t.division === division) : todas

  const ficha = sp.t ? await getFichaTarea(supabase, sp.t, economia) : null
  const solapa: Solapa = solapaDe(sp.s, economia)

  const sinAnalisis = todas.filter((t) => t.estado === 'sin_analisis').length

  return (
    <PageShell
      title="Base maestra"
      subtitle={subtitulo(todas.length, sinAnalisis, economia)}
    >
      <NavAdministracion />
      <NavBaseMaestra activa="tareas" />

      {!economia && (
        <div className="mb-4">
          <Aviso tono="info" titulo="Ves la tarea, el análisis y las HH; no ves el costo">
            El precio y el costo unitario son económicos y quedan en Dirección y Administración. El
            rendimiento y las HH sí son tuyos: son lo que necesitás para planificar.
          </Aviso>
        </div>
      )}

      {ficha?.error && (
        <div className="mb-4" data-testid="ficha-error">
          <Aviso tono="neg" titulo="No pude abrir esa tarea tipo">{ficha.error}</Aviso>
        </div>
      )}

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <TareasTipo
          tareas={tareas}
          q={sp.q ?? ''}
          division={division}
          divisiones={divisiones}
          seleccionada={sp.t ?? null}
          ruta={RUTA_TAREAS}
          otros={{ d: division ?? undefined, t: sp.t, s: sp.s }}
        />
        {ficha?.data && (
          <FichaTarea
            ficha={ficha.data}
            solapa={solapa}
            economia={economia}
            hrefSolapa={(s) => href(sp, { s })}
            hrefCerrar={href(sp, { t: undefined, s: undefined })}
          />
        )}
      </div>
    </PageShell>
  )
}

function subtitulo(total: number, sinAnalisis: number, economia: boolean): string {
  if (total === 0) {
    return 'Tareas tipo · todavía no hay ninguna cargada'
  }
  const partes = [`${total} tareas tipo`]
  if (sinAnalisis) partes.push(`${sinAnalisis} sin análisis`)
  if (!economia) partes.push('sin permiso económico')
  return partes.join(' · ')
}
