// CUADRILLAS — DENTRO de Personal, no como módulo aparte.
//
// El dueño: *"Resolvelo DENTRO de Personal; no armes un módulo enorme aparte."* Por eso es una
// subruta de `/administracion/personas` y no una solapa nueva en la barra del área, que ya tiene sus
// cinco secciones declaradas. Y por eso vuelve con `← Personal`: está un nivel más abajo, así que no
// repite la barra de Administración — tres niveles a la vista es lo que prohíbe el handoff.
//
// LA CUADRILLA NO GUARDA SU OBRA NI SU GENTE «ACTUAL» EN NINGÚN CAMPO. Los integrantes son períodos
// (`cuadrilla_integrante`, con `desde`/`hasta`) y las obras se derivan de las asignaciones vigentes
// de esos integrantes. Nada de lo que se ve acá puede quedar desactualizado, porque nada se copia.

import { createClient } from '@/lib/supabase/server'
import { Campo, CTRL, PageShell } from '@/shared/components/ui'
import { Aviso, BotonEnlace, BuscadorURL, TituloPantalla, Vacio, Volver } from '@/shared/components/ds'
import { FiltrosURL } from '@/features/administracion/components/Controles'
import { PanelEdicion } from '@/features/administracion/components/PanelEdicion'
import { PanelCuadrilla } from '@/features/administracion/components/PanelCuadrilla'
import { TablaCuadrillas } from '@/features/administracion/components/TablaCuadrillas'
import { filtrarCuadrillas, getCuadrillas, getHHDeCuadrilla, getIntegrantes } from '@/features/administracion/services/cuadrillasService'
import { rotulo, ventanaDe } from '@/features/administracion/services/periodoHH'
import {
  agregarIntegrante, archivarCuadrilla, crearCuadrilla, editarCuadrilla, quitarIntegrante,
} from '@/features/administracion/services/cuadrillasActions'
import { asignarCuadrillaAObra } from '@/features/obras/services/actionsPersonal'
import { getPersonas } from '@/features/obras/services/personalService'
import { getPortafolio } from '@/features/obras/services/obrasService'

export const dynamic = 'force-dynamic'

type Busqueda = { c?: string; archivadas?: string; q?: string }

const href = (sp: Busqueda, c?: string) => {
  const p = new URLSearchParams()
  if (sp.archivadas) p.set('archivadas', sp.archivadas)
  if (sp.q) p.set('q', sp.q)
  if (c) p.set('c', c)
  const qs = p.toString()
  return `/administracion/personas/cuadrillas${qs ? `?${qs}` : ''}`
}

export default async function CuadrillasPage({ searchParams }: { searchParams: Promise<Busqueda> }) {
  const sp = await searchParams
  const supabase = await createClient()
  const verArchivadas = sp.archivadas === '1'

  const [listado, plantel, obras] = await Promise.all([
    getCuadrillas(supabase, verArchivadas),
    getPersonas(supabase),
    getPortafolio(supabase),
  ])

  if (listado.error) {
    return (
      <PageShell title="Cuadrillas">
        <div data-testid="cuadrillas-error">
          <Aviso tono="neg" titulo="No pude leer las cuadrillas">{listado.error}</Aviso>
        </div>
      </PageShell>
    )
  }

  const cuadrillas = listado.data ?? []
  // EL PANEL ABIERTO SE BUSCA SOBRE LA LISTA ENTERA, NO SOBRE LA FILTRADA: si no, escribir en el
  // buscador cerraría de golpe la cuadrilla que se estaba mirando.
  const visibles = filtrarCuadrillas(cuadrillas, sp.q ?? '')
  const alta = sp.c === 'nueva'
  const abierta = alta ? null : cuadrillas.find((c) => c.id === sp.c) ?? null
  const integrantes = abierta ? (await getIntegrantes(supabase, abierta.id, true)).data ?? [] : []

  // LAS HH SE SUMAN SOBRE LOS VIGENTES Y SOBRE LA QUINCENA DE LA EMPRESA — la misma ventana con la
  // que se liquida. Una ventana móvil de quince días daría un número que no coincide con ninguna
  // liquidación y que nadie podría verificar contra nada.
  const ventana = ventanaDe('quincena', new Date().toISOString().slice(0, 10))
  const vigentes = integrantes.filter((i) => !i.hasta).map((i) => i.persona_id)
  const hh = abierta ? await getHHDeCuadrilla(supabase, vigentes, ventana.desde, ventana.hasta) : null
  const activas = (obras.data ?? []).filter((o) => o.estado !== 'cerrada')

  return (
    // Sin `PageShell`: su encabezado dibuja un `h1` y acá el título va con su `← volver` encima, que
    // es la anatomía de una pantalla de segundo nivel. Se reusa el MARCO exacto de `PageShell`.
    <div className="min-h-screen bg-canvas">
      <div className="w-full px-4 py-6 lg:px-10">
        <div className="mb-5">
          <Volver href="/administracion/personas">Personal</Volver>
          <TituloPantalla className="mt-2">Cuadrillas</TituloPantalla>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-3">
          <BuscadorURL
            accion="/administracion/personas/cuadrillas"
            q={sp.q}
            placeholder="Buscar cuadrilla, capataz u obra"
            oculto={{ archivadas: sp.archivadas, c: sp.c }}
            ancho="w-full sm:w-[240px]"
            testid="buscar-cuadrilla"
          />
          <FiltrosURL
            testid="filtros-cuadrillas"
            opciones={[
              { label: 'Activas', href: href({ ...sp, archivadas: undefined }), activo: !verArchivadas, testid: 'ver-activas' },
              { label: 'Ver también las archivadas', href: href({ ...sp, archivadas: '1' }), activo: verArchivadas, testid: 'ver-archivadas' },
            ]}
            cuenta={{ n: visibles.length, total: cuadrillas.length }}
          />
          <BotonEnlace href={href(sp, 'nueva')} variante="primaria" className="ml-auto" data-testid="nueva-cuadrilla">
            + Nueva cuadrilla
          </BotonEnlace>
        </div>

        <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
          <div className="min-w-0 flex-1">
            {visibles.length === 0
              ? (
                  <div data-testid="cuadrillas-vacio">
                    <Vacio>
                      {sp.q
                        ? `Ninguna cuadrilla coincide con «${sp.q}».`
                        : 'Todavía no hay cuadrillas cargadas.'}
                    </Vacio>
                  </div>
                )
              : <TablaCuadrillas cuadrillas={visibles} abierta={abierta?.id} hrefDe={(id) => href(sp, id)} />}
          </div>

          {alta && (
            <PanelEdicion
              titulo="Nueva cuadrilla"
              accion={crearCuadrilla}
              cerrarHref={href({ ...sp, c: undefined })}
              enviar="Crear"
              testid="panel-alta-cuadrilla"
              ayuda="La obra no se elige acá: se deriva de las asignaciones de sus integrantes."
            >
              <div className="grid grid-cols-2 gap-2.5">
                <Campo label="Nombre" ancho="col-span-2">
                  <input name="nombre" required maxLength={120} className={CTRL} data-testid="nueva-cuadrilla-nombre" autoFocus />
                </Campo>
                <Campo label="Responsable / capataz" ancho="col-span-2" ayuda="Una persona del legajo, no un texto.">
                  <select name="responsable_id" defaultValue="" className={CTRL}>
                    <option value="">sin responsable</option>
                    {(plantel.data ?? []).map((p) => (
                      <option key={p.id} value={p.id}>{p.nombre_completo}</option>
                    ))}
                  </select>
                </Campo>
              </div>
            </PanelEdicion>
          )}

          {abierta && (
            <PanelCuadrilla
              cuadrilla={abierta}
              integrantes={integrantes}
              plantel={plantel.data ?? []}
              obras={activas.map((o) => ({ id: o.obra_id, nombre: o.nombre }))}
              hh={hh}
              ventana={rotulo(ventana)}
              // `bind` y NO una arrow: una función nueva la rechaza React en runtime y la pantalla
              // queda en blanco sin que typecheck ni build lo vean.
              editar={editarCuadrilla.bind(null, abierta.id)}
              archivar={archivarCuadrilla.bind(null, abierta.id)}
              agregar={agregarIntegrante.bind(null, abierta.id)}
              quitar={quitarIntegrante}
              asignarAObra={asignarCuadrillaAObra}
              cerrarHref={href({ ...sp, c: undefined })}
            />
          )}
        </div>
      </div>
    </div>
  )
}
