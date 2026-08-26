// PANTALLA 17 · BASE MAESTRA — TAREAS TIPO.
//
// La biblioteca de análisis de precio unitario de la empresa: qué sabe hacer Echegaray, cuánto rinde
// cada cosa y con qué se compone. Es el primer eslabón de la cadena que termina en una oferta:
//
//     Base maestra → Presupuesto → Conversión → Plan de obra → Ejecución
//
// TODO EL ESTADO COMPARTIBLE VIVE EN LA URL —tarea abierta, solapa, búsqueda y los dos paneles de
// edición— así que cualquier vista de esta pantalla se puede pegar en un mensaje y abre igual. Los
// chips de recorte NO: dependen de lo que la base diga en este momento («Con desvío» es una lectura
// de hoy), y un enlace compartido prometería una lista que mañana es otra.
//
// SIN `PageShell` (porte 25/08, canónico 17). El shell dibuja su padding, su ancho de lectura y un
// «Base maestra» a 22px que el canónico no tiene: la pantalla arranca en la banda de nivel 3, donde
// la solapa encendida ya dice dónde está parado el que mira. Lo único del shell que no se puede
// perder es `SelloDatoBueno`, y va en `Marco`.

import { createClient } from '@/lib/supabase/server'
import { Aviso } from '@/shared/components/ds'
import { SelloDatoBueno } from '@/shared/components/estado/SelloDatoBueno'
import { C } from '@/shared/components/canon'
import { PanelEdicion } from '@/features/administracion/components/PanelEdicion'
import { getPerfilActual } from '@/features/auth/services/authService'
import { veEconomia } from '@/features/auth/types/areas'
import { NavAdministracion } from '@/features/administracion/components/NavAdministracion'
import { BandaBaseMaestra, RUTA_TAREAS } from '@/features/base-maestra/components/NavBaseMaestra'
import { TareasTipo } from '@/features/base-maestra/components/TareasTipo'
import { FichaTarea, solapaDe, type Solapa } from '@/features/base-maestra/components/FichaTarea'
import { CamposTareaTipo } from '@/features/base-maestra/components/CamposTareaTipo'
import { getFichaTarea, getTareasTipo } from '@/features/base-maestra/services/tareasService'
import { corteDe } from '@/features/base-maestra/services/vistas'
import { contadores, getCuentasBaseMaestra } from '@/features/base-maestra/services/cuentas'
import { IconoCompra, IconoPresupuesto } from '@/shared/components/iconos'
import { TrabajoDeSeccion } from '@/shared/components/v2/TrabajoDeSeccion'
import { senalesDeBaseMaestra } from '@/features/base-maestra/services/senalesBaseMaestra'

import { archivarTareaTipo, crearTareaTipo, editarTareaTipo } from '@/features/base-maestra/services/tareasActions'

export const dynamic = 'force-dynamic'

/** Los dos iconos que esta sección mezcla: una tarea tipo y un recurso comprado. */
const ICONOS_BM = { presupuesto: IconoPresupuesto, compra: IconoCompra }

/** Los dos destinos de la primera línea: el recorte que produjo cada número. */
const HREFS_BM = {
  sinAnalisis: '/administracion/base-maestra/tareas?c=sinAnalisis',
  sinPrecio: '/administracion/base-maestra/recursos?tipo=sin_precio',
}


type Busqueda = { q?: string; t?: string; s?: string; nueva?: string; editar?: string; c?: string }

function href(sp: Busqueda, cambios: Partial<Busqueda>): string {
  const p = new URLSearchParams()
  const final = { ...sp, ...cambios }
  for (const k of ['q', 't', 's', 'nueva', 'editar', 'c'] as const) {
    const v = final[k]
    if (v) p.set(k, v)
  }
  const qs = p.toString()
  return qs ? `${RUTA_TAREAS}?${qs}` : RUTA_TAREAS
}

function Marco({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: C.fondo, display: 'flex', flexDirection: 'column' }}>
      <SelloDatoBueno />
      {children}
    </div>
  )
}

export default async function BaseMaestraTareasPage({ searchParams }: { searchParams: Promise<Busqueda> }) {
  const sp = await searchParams
  const supabase = await createClient()
  const perfil = await getPerfilActual(supabase)
  // EL CORTE ES PRECIO, Y LO DECIDE LA BASE. Esto es sólo la puerta: `recurso_precio` ya le devuelve
  // cero filas a un jefe de obra. Se lee el rol para poder DECIRLO —«sin permiso»— en vez de que la
  // pantalla muestre 409 precios en null como si nadie los hubiera cargado.
  const economia = veEconomia(perfil.data?.rol ?? null)

  const [listado, cuentas] = await Promise.all([
    getTareasTipo(supabase, economia),
    getCuentasBaseMaestra(supabase),
  ])

  // UNA LECTURA QUE FALLA NO SE PINTA COMO BASE VACÍA: son lo contrario. Esta pantalla ya vive con
  // una base maestra sin cargar, así que confundir las dos haría invisible cualquier caída.
  if (listado.error) {
    return (
      <Marco>
        <NavAdministracion />
        <BandaBaseMaestra activa="tareas" cuentas={contadores(cuentas)} />
        <div style={{ padding: '14px 20px' }} data-testid="tareas-error">
          <Aviso tono="neg" titulo="No pude leer la base maestra">{listado.error}</Aviso>
        </div>
      </Marco>
    )
  }

  const tareas = listado.data ?? []
  const divisiones = [...new Set(tareas.map((t) => t.division).filter((d): d is string => Boolean(d)))].sort(
    (a, b) => a.localeCompare(b, 'es'),
  )

  const senales = senalesDeBaseMaestra({
    tareas: cuentas.analisis, recursos: cuentas.precios, economia, hrefs: HREFS_BM,
  })
  const ficha = sp.t ? await getFichaTarea(supabase, sp.t, economia) : null
  const solapa: Solapa = solapaDe(sp.s, economia)

  return (
    <Marco>
      <NavAdministracion />

      {/* ═══ CRITERIO 1: LA PRIMERA LÍNEA DE CONTENIDO ES TRABAJO (`17v2:40-56`) ═══

          Lo primero que se ve no es la biblioteca: es lo que impide cotizar con ella. Las dos
          señales son las del mockup y las dos tienen fuente — «sin análisis» es `analisis_id` en
          null y «sin precio» es `costo_base` en null—, y cada verbo aterriza en el recorte que
          produjo su número. La de precio NO se le dibuja a quien no ve economía: `recurso_precio`
          le devuelve cero filas sin error, así que su cifra diría que hay 409 precios por cargar
          que están cargados. */}
      <TrabajoDeSeccion
        senales={senales}
        icono={IconoPresupuesto}
        iconos={ICONOS_BM}
        vacio={economia
          ? 'Todas las tareas tipo tienen análisis y todos los recursos tienen precio.'
          : 'Todas las tareas tipo tienen análisis.'}
      />

      {/* EL PERMISO SE DICE UNA VEZ Y EN UNA LÍNEA. Lo que el jefe de obra necesita saber es que la
          columna de costo no está vacía sino cerrada — el resto de la pantalla ya le muestra que las
          HH sí son suyas. */}
      {!economia && (
        <div style={{ padding: '12px 20px 0' }}>
          <Aviso tono="info">
            El esfuerzo y las HH son tuyos; el precio, el costo unitario y en cuántos presupuestos
            entró cada tarea quedan en Dirección y Administración. No los ves: no están vacíos.
          </Aviso>
        </div>
      )}

      {ficha?.error && (
        <div style={{ padding: '12px 20px 0' }} data-testid="ficha-error">
          <Aviso tono="neg" titulo="No pude abrir esa tarea tipo">{ficha.error}</Aviso>
        </div>
      )}

      <TareasTipo
        tareas={tareas}
        q={sp.q ?? ''}
        seleccionada={sp.t ?? null}
        economia={economia}
        cuentas={contadores(cuentas)}
        ruta={RUTA_TAREAS}
        otros={{ t: sp.t, s: sp.s }}
        // «+ Nueva tarea» del canónico, y CREA DE VERDAD: hasta hoy las tareas sólo podían entrar por
        // la importación de la Planilla para Cotizar. El alta vive en la URL (`?nueva=1`) como el
        // resto de los paneles del área: se comparte, se recarga y se cierra con el botón de atrás.
        hrefNueva={href(sp, { nueva: '1' })}
        corteInicial={corteDe(sp.c)}
        panel={
          <>
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

            {/* EDITAR LA TAREA EN EL LUGAR — «Editar tarea» es la primaria del panel del canónico, y
                antes no existía ninguna manera de cambiarle el nombre o el rubro a una tarea tipo
                desde la web. Usa los MISMOS campos que el alta: separarlos deja que con el tiempo
                acepten cosas distintas. */}
            {sp.editar && ficha?.data && sp.editar === ficha.data.tarea.id && (
              <PanelEdicion
                titulo="Editar la tarea tipo"
                subtitulo={ficha.data.tarea.codigo}
                accion={editarTareaTipo.bind(null, ficha.data.tarea.id)}
                cerrarHref={href(sp, { editar: undefined })}
                testid="panel-editar-tarea"
                ayuda="La composición —los recursos y sus cantidades— no se edita acá: se versiona desde la solapa Composición, para no reescribir hacia atrás el costo de obras ya vendidas."
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
                ayuda="El análisis —los recursos y sus cantidades— se carga después, en la ficha de la tarea. Hasta entonces la lista la muestra «sin análisis», que es lo que es."
              >
                <CamposTareaTipo divisiones={divisiones} />
              </PanelEdicion>
            )}
          </>
        }
      />
    </Marco>
  )
}
