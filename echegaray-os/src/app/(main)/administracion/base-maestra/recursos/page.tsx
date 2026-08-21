// PANTALLA 18 · BASE MAESTRA — RECURSOS.
//
// Con qué se hace cada tarea y cuánto sale: insumos, mano de obra, equipos, las plantillas de
// secuencia y el historial de precios. Una sola columna; la tabla cambia según la sub-vista, que
// viaja en `?v=` y por eso se puede compartir.
//
// ═══ EL COSTO EMPRESA SE CALCULA, NO SE TIPEA ═══
//
// Está en el subtítulo de Mano de obra y es literal: el jornal sale de `uocra_escala` —115 filas con
// vigencia, la escala real del convenio— y las cargas de `carga_social_vigente`. Nadie escribe el
// costo por hora en ningún lado; sale de esos dos, cada uno con su fecha y su fuente.

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { PageShell } from '@/shared/components/ui'
import { Aviso } from '@/shared/components/ds'
import { getPerfilActual } from '@/features/auth/services/authService'
import { veEconomia } from '@/features/auth/types/areas'
import { NavAdministracion } from '@/features/administracion/components/NavAdministracion'
import { NavBaseMaestra, hrefRecursos, vistaDe, type VistaRecursos } from '@/features/base-maestra/components/NavBaseMaestra'
import {
  TablaEquipos, TablaInsumos, TablaManoDeObra, TablaPlantillas, TablaVersiones,
} from '@/features/base-maestra/components/TablasRecursos'
import {
  contarRecursos, getManoDeObra, getPlantillas, getRecursos, getVersionesDePrecio,
} from '@/features/base-maestra/services/recursosService'
import { fechaLarga, porcentaje } from '@/features/base-maestra/services/reglas'

export const dynamic = 'force-dynamic'

type Busqueda = { v?: string; q?: string }

export default async function BaseMaestraRecursosPage({ searchParams }: { searchParams: Promise<Busqueda> }) {
  const sp = await searchParams
  const vista = vistaDe(sp.v)
  const q = sp.q ?? ''

  const supabase = await createClient()
  const perfil = await getPerfilActual(supabase)
  const economia = veEconomia(perfil.data?.rol ?? null)

  // «Versiones de precio» es ENTERA económica: sin permiso no se abre a medias, se manda a Insumos.
  // Dejarla accesible y vacía diría cuántas versiones hay, que ya es información de precio.
  if (vista === 'precios' && !economia) redirect(hrefRecursos('insumos'))

  // Hoy entra como dato, no lo lee cada función por su cuenta: si dos partes de la pantalla
  // preguntaran la hora por separado, una corrida a medianoche podría pintar dos frescuras distintas.
  const hoy = new Date().toISOString().slice(0, 10)

  const contenido = await armar(supabase, vista, hoy, economia, q)
  if (contenido.error) {
    return (
      <Marco vista={vista} titulo={TITULO[vista]} subtitulo="">
        <div data-testid="recursos-error">
          <Aviso tono="neg" titulo="No pude leer la base maestra">{contenido.error}</Aviso>
        </div>
      </Marco>
    )
  }

  return (
    <Marco vista={vista} titulo={TITULO[vista]} subtitulo={contenido.subtitulo} economia={economia}>
      {contenido.nodo}
    </Marco>
  )
}

const TITULO: Record<VistaRecursos, string> = {
  insumos: 'Insumos',
  'mano-obra': 'Mano de obra',
  equipos: 'Equipos',
  plantillas: 'Plantillas de secuencia',
  precios: 'Versiones de precio',
}

function Marco({
  vista, titulo, subtitulo, economia, children,
}: {
  vista: VistaRecursos
  titulo: string
  subtitulo: string
  economia?: boolean
  children: React.ReactNode
}) {
  return (
    <PageShell title={titulo} eyebrow="Base maestra" subtitle={subtitulo}>
      <NavAdministracion />
      <NavBaseMaestra activa={vista} />
      {economia === false && (
        <div className="mb-4">
          <Aviso tono="info" titulo="Ves el recurso y su unidad; no ves el precio">
            El costo de cada insumo, el jornal y el costo empresa por hora son económicos y quedan en
            Dirección y Administración. Las columnas no están vacías: no se muestran.
          </Aviso>
        </div>
      )}
      {children}
    </PageShell>
  )
}

type Armado = { nodo: React.ReactNode; subtitulo: string; error: null } | { nodo: null; subtitulo: ''; error: string }

async function armar(
  supabase: Awaited<ReturnType<typeof createClient>>,
  vista: VistaRecursos,
  hoy: string,
  economia: boolean,
  q: string,
): Promise<Armado> {
  if (vista === 'mano-obra') {
    const r = await getManoDeObra(supabase, hoy)
    if (r.error || !r.data) return { nodo: null, subtitulo: '', error: r.error ?? 'sin datos' }
    const { categorias, cargas, meta } = r.data
    return {
      error: null,
      subtitulo: [
        'Convenio UOCRA Zona A · San Juan',
        meta.escala_vigente ? `escala vigente ${fechaLarga(meta.escala_vigente)}` : 'sin escala vigente cargada',
        economia ? 'el costo empresa se calcula, no se tipea' : null,
      ].filter(Boolean).join(' · '),
      nodo: (
        <>
          <TablaManoDeObra
            categorias={categorias} cargas={cargas} cargasTotal={meta.cargas_total}
            jornada={meta.jornada_horas} q={q} economia={economia}
          />
          {meta.escala_fuente && (
            <p className="mt-6 text-[11px] leading-relaxed text-faint" data-testid="fuente-escala">
              Fuente de la escala: {meta.escala_fuente}. Esta tabla no se actualiza sola —la alimentaba un
              IMPORTHTML de una pestaña que ya no existe—, así que la fecha de vigencia es parte del dato.
              {meta.cargas_total != null && ` Cargas vigentes: ${porcentaje(meta.cargas_total, 2)}.`}
            </p>
          )}
        </>
      ),
    }
  }

  if (vista === 'plantillas') {
    const r = await getPlantillas(supabase)
    if (r.error || !r.data) return { nodo: null, subtitulo: '', error: r.error ?? 'sin datos' }
    const pasos = r.data.reduce((a, p) => a + p.pasos.length, 0)
    return {
      error: null,
      subtitulo: `${r.data.length} plantillas · ${pasos} pasos · los pesos definen cuánto avanza cada uno`,
      nodo: <TablaPlantillas plantillas={r.data} q={q} />,
    }
  }

  if (vista === 'precios') {
    const r = await getVersionesDePrecio(supabase, hoy)
    if (r.error || !r.data) return { nodo: null, subtitulo: '', error: r.error ?? 'sin datos' }
    return {
      error: null,
      subtitulo: `${r.data.length} versiones · una versión es una tanda de precios con la misma fecha y la misma fuente`,
      nodo: <TablaVersiones filas={r.data} q={q} />,
    }
  }

  const r = await getRecursos(supabase, hoy)
  if (r.error || !r.data) return { nodo: null, subtitulo: '', error: r.error ?? 'sin datos' }
  const meta = contarRecursos(r.data)

  if (vista === 'equipos') {
    const equipos = r.data.filter((x) => x.tipo === 'equipo')
    return {
      error: null,
      subtitulo: `${meta.n_equipos} equipos con costo horario en la base maestra`,
      nodo: <TablaEquipos filas={equipos} q={q} economia={economia} />,
    }
  }

  const insumos = r.data.filter((x) => x.tipo === 'material')
  return {
    error: null,
    subtitulo: [
      `${meta.n_insumos} insumos`,
      `${meta.n_familias} familias`,
      economia ? 'precio de la última carga registrada' : null,
    ].filter(Boolean).join(' · '),
    nodo: <TablaInsumos filas={insumos} q={q} economia={economia} />,
  }
}
