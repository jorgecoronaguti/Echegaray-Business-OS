// ASISTENCIA — LA SEMANA. Distinta de «En obra ahora», que contesta otra pregunta.
//
// `personas/en-obra` mira el reloj de HOY: quién está adentro en este momento. Esta pantalla mira la
// SEMANA cerrada de cada persona, que es lo que Administración necesita para liquidar y para saber
// qué reclamar antes de que el mes se cierre. Las dos leen la MISMA vista (`presencia_del_dia`): dos
// consultas distintas contra `asistencia_marca` darían dos verdades sobre la misma jornada.
//
// La semana viaja en la URL (`?semana=2026-08-17`) y no en un estado de cliente: así se puede pasar
// «mirá la semana pasada» por mensaje, y recargar no devuelve a hoy.

import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Aviso, BotonEnlace, BuscadorURL, TituloPantalla, Vacio, Volver } from '@/shared/components/ds'
import { contieneEnAlguno } from '@/shared/utils/busqueda'
import { GrillaSemana } from '@/features/administracion/components/GrillaSemana'
import { SolapasHH } from '@/features/administracion/components/SolapasHH'
import {
  armarFilas, correrDias, diasDe, rotuloSemana, semanaDe,
} from '@/features/administracion/services/asistenciaSemana'
import { getDatosSemana } from '@/features/administracion/services/asistenciaSemanaService'

export const dynamic = 'force-dynamic'

type Busqueda = { semana?: string; q?: string }

const RUTA = '/administracion/personas/cuadrillas/asistencia'
const esFecha = (v: string | undefined): v is string => /^\d{4}-\d{2}-\d{2}$/.test(v ?? '')

export default async function AsistenciaSemanaPage({ searchParams }: { searchParams: Promise<Busqueda> }) {
  const sp = await searchParams
  const hoy = new Date().toISOString().slice(0, 10)
  // La fecha de la URL se normaliza a SU semana: `?semana=2026-08-19` muestra la del 17. Si no se
  // normalizara, «semana siguiente» avanzaría desde un miércoles y las semanas se solaparían.
  const semana = semanaDe(esFecha(sp.semana) ? sp.semana : hoy)

  const supabase = await createClient()
  const datos = await getDatosSemana(supabase, semana.desde, semana.hasta)

  const dias = diasDe(semana, datos.data?.fechasConDato ?? [])
  const filas = datos.data
    ? armarFilas({
        personas: datos.data.personas,
        dias,
        marcas: datos.data.marcas,
        declaraciones: datos.data.declaraciones,
        noLaborables: datos.data.noLaborables,
        correccionesPendientes: datos.data.correccionesPendientes,
        hoy,
        jornadaPorObra: datos.data.jornadaPorObra,
      })
    : []
  // El texto filtra DESPUÉS de armar la grilla, nunca antes: filtrar las marcas crudas sacaría a una
  // persona de sus propias celdas y la fila diría «sin registrar» sobre un día que sí fichó.
  const visibles = filas.filter((f) => contieneEnAlguno([f.persona.nombre_completo, f.persona.categoria], sp.q ?? ''))

  return (
    <div className="min-h-screen bg-canvas">
      <div className="w-full px-4 py-6 lg:px-10">
        <div className="mb-5">
          <Volver href="/administracion/personas">Personal</Volver>
          <TituloPantalla className="mt-2">Cuadrillas y HH</TituloPantalla>
          <div className="mt-3"><SolapasHH vista="asistencia" /></div>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-3">
          <BotonEnlace href={`${RUTA}?semana=${correrDias(semana.desde, -7)}`} data-testid="semana-anterior">
            ‹ semana anterior
          </BotonEnlace>
          <span className="text-[13px] font-medium text-ink" data-testid="rotulo-semana">{rotuloSemana(dias)}</span>
          <BotonEnlace href={`${RUTA}?semana=${correrDias(semana.desde, 7)}`} data-testid="semana-siguiente">
            semana siguiente ›
          </BotonEnlace>
          {semana.desde !== semanaDe(hoy).desde && (
            <BotonEnlace href={RUTA} data-testid="volver-a-esta-semana">esta semana</BotonEnlace>
          )}
          <BuscadorURL
            accion={RUTA}
            q={sp.q}
            placeholder="Buscar persona"
            oculto={{ semana: sp.semana }}
            ancho="w-full sm:w-[220px]"
            testid="buscar-persona-semana"
          />
        </div>

        {datos.error
          ? (
              <div data-testid="asistencia-error">
                <Aviso tono="neg" titulo="No pude leer la asistencia de la semana">{datos.error}</Aviso>
              </div>
            )
          : visibles.length === 0
            ? (
                <Vacio>
                  {sp.q
                    ? `Nadie del plantel coincide con «${sp.q}».`
                    : 'No hay nadie en el plantel activo para mostrar.'}
                </Vacio>
              )
            : <GrillaSemana filas={visibles} dias={dias} />}

        <p className="mt-4 text-[11px] leading-relaxed text-faint">
          Un día sin marcas de alguien del plantel dice «sin registro», no «ausente»: el que no tiene
          teléfono y el que faltó se ven igual desde acá. La falta la declara quien carga las horas, y
          la salida que falta se resuelve en la{' '}
          <Link className="underline hover:text-ink" href="/administracion/asistencia">bandeja de correcciones</Link>.
        </p>
      </div>
    </div>
  )
}
