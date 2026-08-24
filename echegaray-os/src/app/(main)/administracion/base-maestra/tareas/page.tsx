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
import { Aviso, BotonEnlace } from '@/shared/components/ds'
import { IconoCrear } from '@/shared/components/iconos'
import { PanelEdicion } from '@/features/administracion/components/PanelEdicion'
import { getPerfilActual } from '@/features/auth/services/authService'
import { veEconomia } from '@/features/auth/types/areas'
import { NavAdministracion } from '@/features/administracion/components/NavAdministracion'
import { NavBaseMaestra, RUTA_TAREAS } from '@/features/base-maestra/components/NavBaseMaestra'
import { TareasTipo } from '@/features/base-maestra/components/TareasTipo'
import { FichaTarea, solapaDe, type Solapa } from '@/features/base-maestra/components/FichaTarea'
import { CamposTareaTipo } from '@/features/base-maestra/components/CamposTareaTipo'
import { getFichaTarea, getTareasTipo } from '@/features/base-maestra/services/tareasService'
import { archivarTareaTipo, crearTareaTipo, editarTareaTipo } from '@/features/base-maestra/services/tareasActions'

export const dynamic = 'force-dynamic'

type Busqueda = { q?: string; d?: string; t?: string; s?: string; nueva?: string; editar?: string }

function href(sp: Busqueda, cambios: Partial<Busqueda>): string {
  const p = new URLSearchParams()
  const final = { ...sp, ...cambios }
  for (const k of ['q', 'd', 't', 's', 'nueva', 'editar'] as const) {
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

  return (
    <PageShell title="Base maestra" eyebrow="Administración" subtitle="Tareas tipo">
      <NavAdministracion />
      <NavBaseMaestra activa="tareas" />

      {/* EL PERMISO SE DICE UNA VEZ Y EN UNA LÍNEA. El párrafo que había explicaba tres veces lo
          mismo; lo que el jefe de obra necesita saber es que la columna de costo no está vacía sino
          cerrada — el resto de la pantalla ya le muestra que las HH sí son suyas. */}
      {!economia && (
        <div className="mb-4">
          <Aviso tono="info">
            El esfuerzo y las HH son tuyos; el precio y el costo unitario quedan en Dirección y
            Administración. No los ves: no están vacíos.
          </Aviso>
        </div>
      )}

      {ficha?.error && (
        <div className="mb-4" data-testid="ficha-error">
          <Aviso tono="neg" titulo="No pude abrir esa tarea tipo">{ficha.error}</Aviso>
        </div>
      )}

      <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
        <TareasTipo
          tareas={tareas}
          q={sp.q ?? ''}
          division={division}
          divisiones={divisiones}
          seleccionada={sp.t ?? null}
          ruta={RUTA_TAREAS}
          otros={{ d: division ?? undefined, t: sp.t, s: sp.s }}
          // «+ Nueva tarea» del canónico 17, y CREA DE VERDAD: hasta hoy las 223 tareas sólo podían
          // entrar por la importación de la Planilla para Cotizar. El alta vive en la URL
          // (`?nueva=1`) como el resto de los paneles del área: se comparte, se recarga y se cierra
          // con el botón de atrás.
          accion={
            <BotonEnlace href={href(sp, { nueva: '1' })} variante="primaria" data-testid="nueva-tarea">
              <IconoCrear className="h-[15px] w-[15px]" />
              Nueva tarea
            </BotonEnlace>
          }
        />
        {ficha?.data && (
          <FichaTarea
            ficha={ficha.data}
            solapa={solapa}
            economia={economia}
            hrefSolapa={(s) => href(sp, { s })}
            hrefCerrar={href(sp, { t: undefined, s: undefined })}
            hrefEditar={href(sp, { editar: ficha.data.tarea.id })}
            archivar={archivarTareaTipo}
          />
        )}

        {/* EDITAR LA TAREA EN EL LUGAR — «Editar tarea» es la primaria del panel del canónico 17, y
            hasta hoy no existía ninguna manera de cambiarle el nombre o el rubro a una tarea tipo
            desde la web. El panel usa los MISMOS campos que el alta: separarlos deja que con el
            tiempo acepten cosas distintas. */}
        {sp.editar && ficha?.data && sp.editar === ficha.data.tarea.id && (
          <PanelEdicion
            titulo="Editar la tarea tipo"
            subtitulo={ficha.data.tarea.codigo}
            accion={editarTareaTipo.bind(null, ficha.data.tarea.id)}
            cerrarHref={href(sp, { editar: undefined })}
            testid="panel-editar-tarea"
            ayuda="La composición —los recursos y sus cantidades— no se edita acá: se versiona desde la solapa Análisis, para no reescribir hacia atrás el costo de obras ya vendidas."
          >
            <CamposTareaTipo divisiones={divisiones} tarea={ficha.data.tarea} />
          </PanelEdicion>
        )}

        {sp.nueva === '1' && (
          <PanelEdicion
            titulo="Nueva tarea tipo"
            accion={crearTareaTipo}
            cerrarHref={href(sp, { nueva: undefined })}
            enviar="Crear"
            testid="panel-alta-tarea"
            ayuda="El análisis —los recursos y sus cantidades— se carga después, en la ficha de la tarea. Hasta entonces la lista la muestra «Sin análisis», que es lo que es."
          >
            <CamposTareaTipo divisiones={divisiones} />
          </PanelEdicion>
        )}
      </div>
    </PageShell>
  )
}
