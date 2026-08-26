// 21 v2 · CUADRILLAS Y HH — porte medido de `21 · Cuadrillas y HH v2.dc.html`.
//
// ═══ QUÉ CAMBIÓ CONTRA LA VERSIÓN DE AGOSTO ═══
//
// La anatomía entera. Antes: título, franja de cinco tarjetas, buscador, pastillas y una tabla
// adentro de una caja con su pie de totales. El v2 borra las tarjetas y la caja —criterio 3 del
// patrón— y pone PRIMERO lo que hay que hacer: dos señales con su obstáculo y su verbo (criterio 1).
// Recién debajo va la lista, que es donde vive lo que no reclama nada.
//
// Es la ÚNICA pantalla de segundo nivel cuyo mockup pide el bloque de trabajo, y por eso reusa el
// mismo `TrabajoDeSeccion` que abren las ocho secciones del área: dos dibujos del mismo renglón
// terminan escribiendo uno «—» y el otro «0».
//
// ═══ EL PERÍODO ES UNA SOLA LECTURA, NO TRES ═══
//
// La banda muestra las HH de mes, quincena y semana a la vez (`21v2:216`): un conteo que aparece
// recién al hacer clic no sirve para elegir dónde hacer clic. Se lee la UNIÓN de las tres ventanas
// —la semana puede empezar en el mes anterior— y se agrupa tres veces en memoria.
//
// ═══ LO QUE ESTA PANTALLA NO AFIRMA ═══
//
// «Sin fichar» NO es «ausente». `presencia_del_dia` guarda MARCAS: el que no tiene teléfono, el que
// le negó el permiso al GPS y el que faltó se ven idénticos. Por eso la columna dice FICHADOS y no
// «presentes», y por eso sin lectura de presencia dice «sin leer» en vez de 0.

import type { SupabaseClient } from '@supabase/supabase-js'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Campo, CTRL } from '@/shared/components/ui'
import { Aviso } from '@/shared/components/ds'
import { IconoCrear, IconoCuadrilla, IconoPersona } from '@/shared/components/iconos'
import { TrabajoDeSeccion } from '@/shared/components/v2/TrabajoDeSeccion'
import {
  AccionPrimaria, AccionTerciaria, CostadoDeFicha, CuerpoDeFicha, Migas, SolapasDeFicha, TituloDeFicha,
} from '@/shared/components/v2/segundoNivel'
import { V } from '@/shared/components/v2/patron'
import { PanelEdicion } from '@/features/administracion/components/PanelEdicion'
import { PanelCuadrilla } from '@/features/administracion/components/PanelCuadrilla'
import { PoolSinCuadrilla } from '@/features/administracion/components/PoolSinCuadrilla'
import { CostadoCuadrillas } from '@/features/administracion/components/CostadoCuadrillas'
import { TablaCuadrillas } from '@/features/administracion/components/TablaCuadrillas'
import {
  getCapacidadDeCuadrillas, getCuadrillas, getHHDeCuadrilla, getIntegrantes, getSinCuadrilla,
} from '@/features/administracion/services/cuadrillasService'
import { rotulo, ventanaDe } from '@/features/administracion/services/periodoHH'
import { leerHHDeVentana } from '@/features/administracion/services/hhSemanaCuadrillas'
import {
  agruparPorPeriodo, esPeriodoHH, fichajePorCuadrilla, PERIODOS_HH, pieDeLaBanda, rotuloDePeriodo,
  VENTANAS, ventanaQueContiene, type PeriodoHH,
} from '@/features/administracion/services/hhPorPeriodo'
import { armarSenalesCuadrillas } from '@/features/administracion/services/senalesCuadrillas'
import { getPresencia } from '@/features/administracion/services/presenciaService'
import {
  agregarIntegrante, archivarCuadrilla, asignarACuadrilla, crearCuadrilla, editarCuadrilla,
  quitarIntegrante,
} from '@/features/administracion/services/cuadrillasActions'
import { asignarCuadrillaAObra } from '@/features/obras/services/actionsPersonal'
import { getPersonas } from '@/features/obras/services/personalService'
import { getPortafolio } from '@/features/obras/services/obrasService'
import { getCapacidadPonderada, type CategoriaCapacidad } from '@/features/obras/services/cronogramaObraService'
import type { Cuadrilla } from '@/features/administracion/types'

export const dynamic = 'force-dynamic'

const RUTA = '/administracion/personas/cuadrillas'

type Busqueda = {
  c?: string; editar?: string; pool?: string; archivadas?: string; sin?: string; p?: string
}

const hoyISO = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** Un enlace de esta pantalla: lo que no se pasa se hereda, y lo que se pasa `undefined` se borra. */
function href(sp: Busqueda, cambios: Busqueda = {}): string {
  const j = { ...sp, ...cambios }
  const p = new URLSearchParams()
  for (const k of ['archivadas', 'sin', 'p', 'c', 'editar', 'pool'] as const) {
    if (j[k]) p.set(k, j[k] as string)
  }
  const qs = p.toString()
  return `${RUTA}${qs ? `?${qs}` : ''}`
}

export default async function CuadrillasPage({ searchParams }: { searchParams: Promise<Busqueda> }) {
  const sp = await searchParams
  const supabase = await createClient()
  const verArchivadas = sp.archivadas === '1'
  const periodo: PeriodoHH = esPeriodoHH(sp.p) ? sp.p : 'mes'
  const hoy = hoyISO()

  const [listado, plantel, obras, sinCuadrilla, factores] = await Promise.all([
    getCuadrillas(supabase, verArchivadas),
    getPersonas(supabase),
    getPortafolio(supabase),
    getSinCuadrilla(supabase),
    getCapacidadPonderada(supabase),
  ])

  if (listado.error) {
    return (
      <main className="min-h-screen" style={{ background: V.fondo }}>
        <Migas volverA="/administracion/personas" padre="Personal" actual="Cuadrillas y HH" />
        <div style={{ padding: '16px 20px' }} data-testid="cuadrillas-error">
          <Aviso tono="neg" titulo="No pude leer las cuadrillas">{listado.error}</Aviso>
        </div>
      </main>
    )
  }

  const cuadrillas = listado.data ?? []
  // EL FILTRO DEL VERBO: «2 cuadrillas sin obra vigente → Asignar» tiene que aterrizar en esas dos.
  // Caer en la lista completa obliga a buscar a mano las que se acaban de contar.
  const soloSinObra = sp.sin === 'obra'
  const visibles = cuadrillas.filter((c) => !soloSinObra || !c.obras_actuales)
  const ids = visibles.map((c) => c.id)

  const ventanas = VENTANAS(hoy)
  const total = ventanaQueContiene(Object.values(ventanas))
  const [lectura, presencia] = await Promise.all([
    ids.length > 0 ? leerHHDeVentana(supabase, ids, total.desde, total.hasta) : Promise.resolve(null),
    getPresencia(supabase, hoy),
  ])
  // UNA sola vez para los tres períodos: la banda escribe los tres y el cuerpo dibuja el abierto.
  const porPeriodo = lectura ? agruparPorPeriodo(lectura, hoy) : null
  const hh = porPeriodo?.[periodo] ?? null
  const fichados = presencia.data ? new Set(presencia.data.map((f) => f.persona_id)) : null
  const fichaje = lectura && fichados
    ? fichajePorCuadrilla(lectura.vinculos, fichados)
    : undefined

  const abierta = cuadrillas.find((c) => c.id === sp.c) ?? null
  const editando = cuadrillas.find((c) => c.id === sp.editar) ?? null
  const integrantes = abierta ? (await getIntegrantes(supabase, abierta.id)).data ?? [] : []

  const senales = armarSenalesCuadrillas(
    { data: cuadrillas.filter((c) => c.activa && !c.obras_actuales).length, error: null },
    { data: (sinCuadrilla.data ?? []).length, error: sinCuadrilla.error },
    { sinObra: href(sp, { sin: 'obra', c: undefined }), pool: href(sp, { pool: '1' }) },
  )

  return (
    <main className="flex min-h-screen flex-col" style={{ background: V.fondo }}>
      <Migas volverA="/administracion/personas" padre="Personal" actual="Cuadrillas y HH" />

      <TituloDeFicha
        titulo="Cuadrillas y HH"
        bajada="Quién trabaja con quién, y cuántas horas puso cada cuadrilla en cada obra."
        acciones={
          <>
            {/* Las otras dos vistas de HH no tienen lugar propio en el mockup y sin entrada quedan
                inalcanzables: van como acciones de texto, nunca como una segunda barra de solapas. */}
            <AccionTerciaria href={`${RUTA}/asistencia`} testid="ir-asistencia">Asistencia</AccionTerciaria>
            <AccionTerciaria href={`${RUTA}/periodos`} testid="ir-periodos">Períodos de HH</AccionTerciaria>
            <AccionPrimaria
              href={href(sp, { c: 'nueva', editar: undefined, pool: undefined })}
              testid="nueva-cuadrilla" icono={<IconoCrear className="h-[14px] w-[14px]" />}
            >
              Nueva cuadrilla
            </AccionPrimaria>
          </>
        }
      />

      <TrabajoDeSeccion
        senales={senales}
        icono={IconoCuadrilla}
        iconos={{ cuadrilla: IconoCuadrilla, persona: IconoPersona }}
        vacio="Todas las cuadrillas tienen obra y todo el plantel está encuadrado."
      />

      {/* LA BANDA DE PERÍODO. Subrayado GRAFITO y no amarillo: el amarillo marca la sección abierta
          en la navegación, y acá lo que se elige es una ventana de tiempo dentro de la pantalla. */}
      <SolapasDeFicha
        testid="periodos-hh" linea={false} grafito
        solapas={PERIODOS_HH.map((p) => ({
          clave: p,
          titulo: rotuloDePeriodo(p, hoy),
          // «sin leer» y NO 0: `registros_hh` puede fallar por RLS, y un 0 diría que no se trabajó.
          cuenta: porPeriodo
            ? `${porPeriodo[p].total.toLocaleString('es-AR', { maximumFractionDigits: 0 })} HH`
            : null,
          activa: p === periodo,
          href: href(sp, { p }),
        }))}
        derecha={lectura ? pieDeLaBanda(hh?.total ?? 0, visibles.length, lectura.vinculos) : 'sin leer'}
      />

      <CuerpoDeFicha arriba={14}>
        <div className="min-w-0 flex-1">
          {soloSinObra && (
            <p style={{ fontSize: '12px', color: V.apagado, marginBottom: 10 }} data-testid="recorte-sin-obra">
              Sólo las cuadrillas sin obra vigente.{' '}
              <Link href={href(sp, { sin: undefined })} style={{ fontWeight: 500, color: V.tinta }}>Ver todas →</Link>
            </p>
          )}

          <TablaCuadrillas
            cuadrillas={visibles}
            abierta={abierta?.id}
            hrefDe={(id) => href(sp, { c: sp.c === id ? undefined : id, pool: undefined })}
            hh={hh?.porCuadrilla}
            fichaje={fichaje}
            despliegue={abierta
              ? {
                  integrantes,
                  porPersona: hh?.porPersona ?? new Map(),
                  fichadosHoy: fichados,
                  hrefEditar: href(sp, { editar: abierta.id }),
                }
              : undefined}
            vacio={soloSinObra
              ? 'Ninguna cuadrilla está sin obra vigente.'
              : 'Todavía no hay cuadrillas cargadas.'}
          />

          <p
            style={{ fontSize: '11px', lineHeight: 1.6, color: V.tenue, marginTop: 4, maxWidth: 780, textWrap: 'pretty' }}
            data-testid="nota-hh"
          >
            Las HH salen del parte diario, que es la fuente canónica: la misma hora no puede contarse
            dos veces aunque la persona figure en dos cuadrillas — por eso el total del período no es
            la suma de las filas. Una cuadrilla sin obra asignada no proyecta dotación.
            {presencia.error && ' Hoy no pude leer la presencia, así que ninguna fila afirma quién fichó.'}
            {' '}
            {/* EL ARCHIVO NO DESAPARECE: el mockup no dibuja el filtro de archivadas, pero sacarlo
                sin dejar entrada esconde cuadrillas que existen. Va como texto en la nota, que es
                donde se explica qué está viendo el que mira. */}
            <Link
              href={href(sp, { archivadas: verArchivadas ? undefined : '1' })}
              data-testid="ver-archivadas" style={{ fontWeight: 500, color: V.tinta }}
            >
              {verArchivadas ? 'Ocultar las archivadas →' : 'Ver también las archivadas →'}
            </Link>
          </p>

          {sp.pool === '1' && (
            <div style={{ marginTop: 20 }}>
              <PoolSinCuadrilla
                personas={sinCuadrilla.data ?? []}
                cuadrillas={cuadrillas.filter((c) => c.activa).map((c) => ({ id: c.id, nombre: c.nombre }))}
                factores={factores.data ?? []}
                asignar={asignarACuadrilla}
              />
            </div>
          )}
        </div>

        {sp.c === 'nueva'
          ? (
              <PanelEdicion
                titulo="Nueva cuadrilla"
                accion={crearCuadrilla}
                cerrarHref={href(sp, { c: undefined })}
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
            )
          : editando
            ? <PanelDeEdicion
                sp={sp} supabase={supabase} cuadrilla={editando}
                plantel={(plantel.data ?? []).map((p) => ({ id: p.id, nombre_completo: p.nombre_completo }))}
                obras={(obras.data ?? []).filter((o) => o.estado !== 'cerrada').map((o) => ({ id: o.obra_id, nombre: o.nombre }))}
                factores={factores.data ?? []}
              />
            : (
                <CostadoDeFicha testid="costado-cuadrillas">
                  <CostadoCuadrillas
                    porObra={hh?.porObra ?? null}
                    ventana={rotulo(ventanas[periodo])}
                    sueltos={sinCuadrilla.data ?? []}
                    sinLeerPool={Boolean(sinCuadrilla.error)}
                    hrefPool={href(sp, { pool: '1' })}
                    fueraDeCuadrilla={hh?.personasFueraDeCuadrilla ?? null}
                  />
                </CostadoDeFicha>
              )}
      </CuerpoDeFicha>
    </main>
  )
}

/**
 * EL PANEL DE EDICIÓN, APARTE DE LA SELECCIÓN.
 *
 * En el v2 elegir una cuadrilla la DESPLIEGA en la lista; editarla es otra cosa y por eso tiene su
 * propio parámetro. Con un solo `?c=` no habría forma de ver la gente de una cuadrilla sin abrir
 * también el formulario que la cambia.
 */
async function PanelDeEdicion({ sp, supabase, cuadrilla, plantel, obras, factores }: {
  sp: Busqueda
  supabase: SupabaseClient
  cuadrilla: Cuadrilla
  plantel: { id: string; nombre_completo: string }[]
  obras: { id: string; nombre: string }[]
  factores: CategoriaCapacidad[]
}) {
  const ventana = ventanaDe('quincena', hoyISO())
  const integrantes = (await getIntegrantes(supabase, cuadrilla.id, true)).data ?? []
  const vigentes = integrantes.filter((i) => !i.hasta).map((i) => i.persona_id)
  const capacidades = await getCapacidadDeCuadrillas(supabase, [cuadrilla.id])
  const hh = await getHHDeCuadrilla(supabase, vigentes, ventana.desde, ventana.hasta)

  return (
    <PanelCuadrilla
      cuadrilla={cuadrilla}
      integrantes={integrantes}
      plantel={plantel}
      obras={obras}
      hh={hh}
      ventana={rotulo(ventana)}
      capacidad={capacidades.get(cuadrilla.id) ?? null}
      factores={factores}
      // `bind` y NO una arrow: una función nueva la rechaza React en ejecución y la pantalla queda
      // en blanco sin que typecheck ni build lo vean.
      editar={editarCuadrilla.bind(null, cuadrilla.id)}
      archivar={archivarCuadrilla.bind(null, cuadrilla.id)}
      agregar={agregarIntegrante.bind(null, cuadrilla.id)}
      quitar={quitarIntegrante}
      asignarAObra={asignarCuadrillaAObra}
      cerrarHref={href(sp, { editar: undefined })}
    />
  )
}
