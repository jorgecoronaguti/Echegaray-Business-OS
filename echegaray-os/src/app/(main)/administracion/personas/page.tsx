// PERSONAL — la entrada al módulo. Buscar, filtrar, crear, y entrar a una ficha.
//
// El dueño dibujó esta pantalla y dijo *"Nada más salvo razón operativa fuerte"*: UNA línea con la
// búsqueda, los cuatro filtros, Cuadrillas y el alta, y debajo la tabla. Lo que NO está es tan
// deliberado como lo que está —ni DNI, ni CUIL, ni teléfono, ni retribución, ni métricas— y no está
// de verdad: el listado sale de `persona_directorio` con sus columnas nombradas una por una, así que
// esos campos tampoco viajan al navegador aunque alguien abra las herramientas de desarrollo.
//
// Es una vista de GESTIÓN, no un tablero: sin tarjetas, sin cifras arriba, sin gráficos. Todo el
// estado vive en la URL y es un server component entero — no hay un `useState` que se pierda al
// recargar ni una segunda copia de los datos en el navegador.

import { createClient } from '@/lib/supabase/server'
import { PageShell } from '@/shared/components/ui'
import { Aviso, BotonEnlace, BuscadorURL, Franja, Vacio } from '@/shared/components/ds'
import { IconoCrear, IconoCuadrilla, IconoPersona } from '@/shared/components/iconos'
import { NavAdministracion } from '@/features/administracion/components/NavAdministracion'
import { FiltrosURL } from '@/features/administracion/components/Controles'
import { CamposAlta } from '@/features/administracion/components/FormularioPersona'
import { PanelEdicion } from '@/features/administracion/components/PanelEdicion'
import { TablaPersonas } from '@/features/administracion/components/TablaPersonas'
import { FILTROS, getDirectorio, type FiltroPersonal } from '@/features/administracion/services/personasService'
import { metricasDelListado } from '@/features/administracion/services/resumenPersonal'
import { crearPersona } from '@/features/administracion/services/personasActions'

export const dynamic = 'force-dynamic'

type Busqueda = { q?: string; f?: string; nueva?: string }

function armarHref(base: Busqueda, filtro?: FiltroPersonal, nueva?: boolean): string {
  const params = new URLSearchParams()
  if (base.q) params.set('q', base.q)
  const f = filtro ?? base.f
  if (f && f !== 'plantel') params.set('f', f)
  if (nueva) params.set('nueva', '1')
  const qs = params.toString()
  return `/administracion/personas${qs ? `?${qs}` : ''}`
}

/** Qué decir cuando no hay ninguna fila: una línea, y que diga qué hacer. */
function vacioDe(filtro: FiltroPersonal, q?: string) {
  if (filtro === 'sin_asignar') return 'Todo el plantel está asignado a una obra.'
  if (filtro === 'en_obra') return 'Nadie tiene una asignación vigente. Se asigna desde la solapa Personal de la obra.'
  if (filtro === 'inactivos') return 'Nadie egresó del plantel.'
  return q ? `Ninguna persona coincide con «${q}».` : 'Todavía no hay personas cargadas.'
}

export default async function PersonalPage({ searchParams }: { searchParams: Promise<Busqueda> }) {
  const sp = await searchParams
  const filtro = (FILTROS.find((f) => f.valor === sp.f)?.valor ?? 'plantel') as FiltroPersonal
  const supabase = await createClient()
  const listado = await getDirectorio(supabase, filtro, sp.q)

  // EL ERROR DE LA BASE SE MUESTRA, NO SE PINTA COMO LISTA VACÍA. Una tabla en blanco porque la RLS
  // rechazó la consulta es indistinguible de una tabla en blanco porque no hay personas, y la
  // diferencia entre las dos es todo. Esta pantalla estuvo muerta un día por eso mismo
  // ("permission denied for table personas") y este mensaje es lo que permitió encontrarlo.
  if (listado.error) {
    return (
      <PageShell title="Personal">
        <NavAdministracion />
        <div data-testid="personas-error">
          <Aviso tono="neg" titulo="No pude leer el legajo">{listado.error}</Aviso>
        </div>
      </PageShell>
    )
  }

  const personas = listado.data ?? []

  return (
    <PageShell title="Personal">
      <NavAdministracion />

      {/* UNA SOLA LÍNEA: buscar · filtros · Cuadrillas · la acción primaria. Cuadrillas va discreta
          porque es NAVEGACIÓN, no una acción — y vive DENTRO de Personal, no como sección nueva. */}
      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-3">
        <BuscadorURL
          accion="/administracion/personas"
          q={sp.q}
          placeholder="Buscar…"
          oculto={{ f: filtro === 'plantel' ? undefined : filtro }}
          ancho="w-full sm:w-[208px]"
          testid="buscar-persona"
        />
        <FiltrosURL
          testid="filtros-personal"
          opciones={FILTROS.map((f) => ({
            label: f.etiqueta,
            href: armarHref(sp, f.valor),
            activo: f.valor === filtro,
            testid: `filtro-${f.valor}`,
          }))}
        />
        <div className="ml-auto flex items-center gap-4">
          {/* «En obra ahora» va al lado de Cuadrillas y por el mismo motivo: es NAVEGACIÓN dentro de
              Personal, no una sección nueva del sistema. Quién está hoy y quién es el plantel son la
              misma pregunta mirada a dos distancias. */}
          {/* UNA ACCIÓN = UN ICONO (Design 23/08). Los tres son de `shared/components/iconos`, que
              es la única fuente de iconografía del OS: el «+» tipográfico de la primaria era el
              único signo dibujado con una tipografía en toda la barra. */}
          <BotonEnlace href="/administracion/personas/en-obra" variante="discreta" data-testid="ir-en-obra">
            <IconoPersona className="h-[15px] w-[15px]" />
            En obra ahora
          </BotonEnlace>
          <BotonEnlace href="/administracion/personas/cuadrillas" variante="discreta" data-testid="ir-cuadrillas">
            <IconoCuadrilla className="h-[15px] w-[15px]" />
            Cuadrillas
          </BotonEnlace>
          <BotonEnlace href={armarHref(sp, filtro, true)} variante="primaria" data-testid="nueva-persona">
            <IconoCrear className="h-[15px] w-[15px]" />
            Nueva persona
          </BotonEnlace>
        </div>
      </div>

      <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1">
          {personas.length === 0
            ? <div data-testid="personas-vacio"><Vacio>{vacioDe(filtro, sp.q)}</Vacio></div>
            : <TablaPersonas personas={personas} conBaja={filtro === 'inactivos'} />}
        </div>

        {sp.nueva === '1' && (
          <PanelEdicion
            titulo="Nueva persona"
            accion={crearPersona}
            cerrarHref={armarHref(sp, filtro)}
            enviar="Crear"
            testid="panel-alta-persona"
            ayuda="DNI, CUIL, teléfono y retribución se cargan en el legajo, no en el listado."
          >
            <CamposAlta />
          </PanelEdicion>
        )}
      </div>

      {/* EL PÁRRAFO SE FUE, LOS NÚMEROS SE QUEDARON (Design 23/08, §Status bar). Decía «17 personas
          · el estado sale de la pertenencia vigente, no de la fecha de baja»: una frase permanente
          explicando una regla que la columna ESTADO ya aplica sola. El pie contesta de un vistazo
          las tres preguntas que se le hacen al plantel, y cada número se llama por el conjunto que
          contó — la regla del rótulo vive en `resumenPersonal.ts`, con su prueba.

          VA FUERA DE LA FILA, no debajo de la tabla: es el pie de la PANTALLA y va de borde a borde
          (por eso el `-mx` que sangra el padding de `PageShell`). Adentro de la columna se metería
          por debajo del panel de alta cuando está abierto. */}
      {personas.length > 0 && (
        <div className="-mx-4 mt-4 lg:-mx-10">
          <Franja
            testid="franja-personal"
            metricas={metricasDelListado({ filtro, buscando: Boolean(sp.q?.trim()), personas })}
          />
        </div>
      )}
    </PageShell>
  )
}
