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
import { createClient } from '@/lib/supabase/server'
import { getPerfilActual, getUsuarioActual } from '@/features/auth/services/authService'
import { esAdministracion, veEconomia } from '@/features/auth/types/areas'
import { NavAdministracion } from '@/features/administracion/components/NavAdministracion'
import { CabeceraSeccion } from '@/shared/components/v2/CabeceraSeccion'
import { ModoDeAsistencia, solapasDePersonal } from '@/features/administracion/components/asistencia/carga/SolapasDeAsistencia'
import { Aviso } from '@/shared/components/ds'
import { PantallaV2 } from '@/shared/components/v2/segundoNivel'
import { hoyEnObra } from '@/features/jefe/services/contexto'
import { correrDia, diaDeCarga, rotuloDelDia } from '@/features/administracion/services/diaDeJornada'
import { puedeCambiarObraActual } from '@/features/administracion/services/planDeObraActual'
import { getCargaDelDia } from '@/features/administracion/services/cargaDeAsistenciaService'
import {
  armarCargaDelDia, hrefCargaDeAsistencia, NOMBRE_SIN_OBRA, OBRA_SIN_OBRA, puedeCorregirElDia,
} from '@/features/administracion/services/cargaDeAsistencia'
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
      {/* LA SOLAPA ASISTENCIA DE PERSONAL (17/09/2026): la misma barra que Plantel y Liquidación, en compu y
          teléfono, con Día · Quincena. Ésta es la cara Día. */}
      <NavAdministracion />
      <CabeceraSeccion
        testid="vistas-personal" espacioPanel={false}
        vistas={solapasDePersonal('asistencia', veEconomia(rol))}
        filtros={<ModoDeAsistencia activo="dia" obra={obraFiltro} dia={fecha} />}
      />
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

  const opcionesDeObra = [
    { clave: 'todas', etiqueta: 'Todas las obras', href: hrefCargaDeAsistencia({ dia: fecha, hoy }), activo: !obraFiltro },
    ...chips.map((id) => ({ clave: id, etiqueta: nombres[id] ?? id, cuenta: conteo.get(id), href: hrefCargaDeAsistencia({ dia: fecha, obra: id, hoy }), activo: obraFiltro === id })),
    ...(conteo.has(OBRA_SIN_OBRA)
      ? [{ clave: OBRA_SIN_OBRA, etiqueta: NOMBRE_SIN_OBRA, cuenta: conteo.get(OBRA_SIN_OBRA), href: hrefCargaDeAsistencia({ dia: fecha, obra: OBRA_SIN_OBRA, hoy }), activo: obraFiltro === OBRA_SIN_OBRA }]
      : []),
  ]

  return (
    <PantallaV2 testid="pantalla-carga-asistencia">
      {cabecera}
      {/* LA BARRA, LA TABLA Y EL PANEL SON DEL CLIENTE: el rediseño aprobado el 17/09/2026. «Traer a alguien»
          ya no es un bloque aparte: se mueve a cualquiera desde su panel, buscándolo en «Todas las obras». */}
      {d.avisos.map((a) => <div key={a} className="px-4 pt-2 md:px-8"><Aviso tono="info">{a}</Aviso></div>)}
      <CargaDeAsistencia
        filas={filas} obraFiltro={obraFiltro} fecha={fecha} hoy={hoy} rotuloDia={rotuloDelDia(fecha)}
        obras={activas} nombres={nombres} cierre={d.cierre}
        permiso={puedeCorregirElDia({ rol, fecha, hoy })} puedeMover={puedeMover} certificados={d.certificados}
        hrefAyer={hrefCargaDeAsistencia({ dia: correrDia(fecha, -1), obra: obraFiltro, hoy })}
        hrefManana={hrefCargaDeAsistencia({ dia: correrDia(fecha, 1), obra: obraFiltro, hoy })}
        hrefHoy={fecha !== hoy ? hrefCargaDeAsistencia({ obra: obraFiltro }) : null}
        opcionesDeObra={opcionesDeObra}
      />
    </PantallaV2>
  )
}
