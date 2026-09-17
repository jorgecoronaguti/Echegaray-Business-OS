// CARGAR ASISTENCIA — UNA SOLA PANTALLA, EN LA COMPU Y EN EL TELÉFONO (dueño, 17/09/2026).
//
// *«la funcionalidad de carga de asistencia en mobile se hace en la sección horas y en computadora en la
// sección plantel, es una funcionalidad cruzada y errada, tenés que rehacer y hacer una sola experiencia
// de uso para ingresar a carga de asistencia, tener en cuenta todos los casos de uso»*.
//
// ═══ POR QUÉ ESTA RUTA Y NO `?vista=cargar` NI `/administracion/asistencia/cargar` ═══
//
// · `/administracion/personas?vista=…` ya son 646 líneas con tres ramas; una cuarta la volvía
//   inmantenible, y el `?obra=` de esa página significa cosas distintas en cada solapa.
// · `/administracion/asistencia` es la COLA de correcciones del plantel —otra pregunta, otra pantalla—.
// · Acá cuelga de Personal, igual que «En obra ahora» y «Cuadrillas»: hereda el layout de Personal, que
//   refresca en vivo con `asistencia_dia`, `registros_hh` y `obra_asignacion`, y el jefe de obra entra
//   porque `esAdministracion` lo incluye. La RLS decide qué obras y qué filas ve.
//
// ═══ LO QUE ESTA PÁGINA NO HACE ═══
//
// No escribe. Lee con `getCargaDelDia`, arma con `cargaDeAsistencia.ts` (puro y probado) y le pasa al
// cliente, que escribe sólo por las acciones que ya usan Plantel, Horas y `/campo/asistencia`.

import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getPerfilActual, getUsuarioActual } from '@/features/auth/services/authService'
import { esAdministracion } from '@/features/auth/types/areas'
import { Aviso } from '@/shared/components/ds'
import { FiltrosSuaves } from '@/shared/components/v2/FiltrosSuaves'
import { Migas, PantallaV2 } from '@/shared/components/v2/segundoNivel'
import { hoyEnObra } from '@/features/jefe/services/contexto'
import { correrDia, diaDeCarga, rotuloDelDia, TOKEN_DIA } from '@/features/administracion/services/diaDeJornada'
import { jornadaPorDefecto } from '@/features/administracion/services/jornadaPorDefecto'
import { hs } from '@/features/administracion/services/jornadaPorObra'
import { puedeCambiarObraActual } from '@/features/administracion/services/planDeObraActual'
import { candidatosParaTraer } from '@/features/administracion/services/traerALaObra'
import { getCargaDelDia } from '@/features/administracion/services/cargaDeAsistenciaService'
import {
  armarCargaDelDia, hrefCargaDeAsistencia, NOMBRE_SIN_OBRA, OBRA_SIN_OBRA, puedeCorregirElDia,
} from '@/features/administracion/services/cargaDeAsistencia'
import { ElegirDia } from '@/features/administracion/components/asistencia/ElegirDia'
import { TraerALaObra } from '@/features/administracion/components/asistencia/TraerALaObra'
import { CargaDeAsistencia } from '@/features/administracion/components/asistencia/carga/CargaDeAsistencia'

export const dynamic = 'force-dynamic'

export default async function CargarAsistenciaPage({ searchParams }: {
  searchParams: Promise<{ dia?: string; obra?: string }>
}) {
  const supabase = await createClient()
  const user = await getUsuarioActual(supabase)
  if (!user) redirect('/login')
  const rol = (await getPerfilActual(supabase, user.id)).data?.rol
  if (!esAdministracion(rol)) redirect('/obras')

  const sp = await searchParams
  const hoy = hoyEnObra()
  const fecha = diaDeCarga(sp.dia, hoy)
  const obraFiltro = sp.obra?.trim() || null
  const carga = await getCargaDelDia(supabase, fecha)

  const cabecera = (
    <>
      <Migas volverA="/administracion/personas" padre="Personal" actual="Cargar asistencia" />
      <div className="px-4 pb-2 pt-3 md:px-5">
        <h1 className="text-[18px] font-semibold tracking-[-0.01em] text-ink">Asistencia del día</h1>
        <p className="mt-0.5 text-[12.5px] text-muted" data-testid="jornada-del-dia">
          {jornadaPorDefecto(fecha) !== null
            ? `Dar «Está» carga ${hs(jornadaPorDefecto(fecha) ?? 0)} h en la obra de la fila; se editan al lado.`
            : 'Fin de semana: sin jornada por defecto, las horas se cargan a mano.'}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2 md:max-w-xl">
          <div className="min-w-0 flex-1">
            <ElegirDia
              dia={fecha} rotulo={rotuloDelDia(fecha)}
              hrefAyer={hrefCargaDeAsistencia({ dia: correrDia(fecha, -1), obra: obraFiltro, hoy })}
              hrefManana={hrefCargaDeAsistencia({ dia: correrDia(fecha, 1), obra: obraFiltro, hoy })}
              plantilla={hrefCargaDeAsistencia({ dia: TOKEN_DIA, obra: obraFiltro })}
            />
          </div>
          {fecha !== hoy && (
            <Link prefetch={false} href={hrefCargaDeAsistencia({ obra: obraFiltro })} data-testid="ir-a-hoy" className="inline-flex min-h-[44px] items-center px-2 text-[12.5px] text-muted underline hover:text-ink">
              Hoy
            </Link>
          )}
        </div>
      </div>
    </>
  )

  if (carga.error || !carga.data) {
    return (
      <PantallaV2 testid="pantalla-carga-asistencia">
        {cabecera}
        <div className="px-4 py-3 md:px-5">
          {/* UN DÍA QUE NO SE PUDO LEER NO SE DIBUJA COMO UN DÍA SIN MARCAR: invitaría a marcarlo de nuevo. */}
          <Aviso tono="neg" titulo="No pude leer la asistencia del día" testid="carga-error">{carga.error ?? 'Sin datos.'}</Aviso>
        </div>
      </PantallaV2>
    )
  }

  const d = carga.data
  const filas = armarCargaDelDia({ fecha, personas: d.personas, presencias: d.presencias, horas: d.horas, asignaciones: d.asignaciones })
  const nombres = Object.fromEntries(d.obras.map((o) => [o.id, o.nombre]))
  const activas = d.obras.filter((o) => o.activa).map((o) => ({ id: o.id, nombre: o.nombre }))
  const puedeMover = puedeCambiarObraActual(rol)
  const conteo = new Map<string, number>()
  for (const f of filas) conteo.set(f.obraId ?? OBRA_SIN_OBRA, (conteo.get(f.obraId ?? OBRA_SIN_OBRA) ?? 0) + 1)
  const chips = [...conteo.keys()].filter((k) => k !== OBRA_SIN_OBRA)
    .sort((a, b) => (nombres[a] ?? a).localeCompare(nombres[b] ?? b, 'es'))

  // TRAER A ALGUIEN, SÓLO CON UNA OBRA ELEGIDA Y SÓLO HOY: `TraerALaObra` mueve desde HOY, y con
  // «Todas» no hay a qué obra traerlo. Para otro día está «Mover de obra» en la fila.
  const obraParaTraer = obraFiltro && obraFiltro !== OBRA_SIN_OBRA && fecha === hoy && puedeMover && nombres[obraFiltro]
    ? obraFiltro : null

  return (
    <PantallaV2 testid="pantalla-carga-asistencia">
      {cabecera}
      <div className="px-4 pb-8 md:px-5">
        {d.avisos.map((a) => <div key={a} className="pb-2"><Aviso tono="info">{a}</Aviso></div>)}
        <FiltrosSuaves
          testid="filtro-obra-carga" rotulo="Obra"
          conteo={{ n: obraFiltro ? (conteo.get(obraFiltro) ?? 0) : filas.length, total: filas.length, sustantivo: 'personas' }}
          opciones={[
            { clave: 'todas', etiqueta: 'Todas', href: hrefCargaDeAsistencia({ dia: fecha, hoy }), activo: !obraFiltro },
            ...chips.map((id) => ({ clave: id, etiqueta: nombres[id] ?? id, cuenta: conteo.get(id), href: hrefCargaDeAsistencia({ dia: fecha, obra: id, hoy }), activo: obraFiltro === id })),
            ...(conteo.has(OBRA_SIN_OBRA)
              ? [{ clave: OBRA_SIN_OBRA, etiqueta: NOMBRE_SIN_OBRA, cuenta: conteo.get(OBRA_SIN_OBRA), href: hrefCargaDeAsistencia({ dia: fecha, obra: OBRA_SIN_OBRA, hoy }), activo: obraFiltro === OBRA_SIN_OBRA }]
              : []),
          ]}
        />
        <CargaDeAsistencia
          filas={filas} obraFiltro={obraFiltro} fecha={fecha} hoy={hoy} rotuloDia={rotuloDelDia(fecha)}
          obras={activas} nombres={nombres} cierre={d.cierre}
          permiso={puedeCorregirElDia({ rol, fecha, hoy })} puedeMover={puedeMover}
        />
        {obraParaTraer && (
          <TraerALaObra
            obraId={obraParaTraer} obraNombre={nombres[obraParaTraer]}
            candidatos={candidatosParaTraer({
              plantel: d.personas.map((p) => ({ id: p.id, nombre_completo: p.nombre })),
              asignaciones: d.asignaciones, nombresDeObra: nombres, obraId: obraParaTraer, fecha,
            })}
            error={null}
          />
        )}
      </div>
    </PantallaV2>
  )
}
