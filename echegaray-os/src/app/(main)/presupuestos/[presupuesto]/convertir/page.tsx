// 13 · PREPARAR OBRA DESDE PRESUPUESTO — la conversión.
//
// «El presupuesto NO es el plan de obra.» Son dos estructuras conectadas y ninguna manda sobre la
// otra: la económica ordena por contabilidad (rubro → partida → análisis) y la operativa por
// secuencia constructiva (obra → frente → actividad → paso). Lo único que las une es que cada
// actividad guarda de qué partida y de qué análisis salió — y por eso el avance físico y el costo
// consumido son la misma verdad leída de dos maneras.
//
// ═══ ESTA PANTALLA NO DECIDE NADA QUE LA BASE NO DECIDA ═══
//
// Las cuatro reglas —cantidad conservada, obra chica sin burocracia, ampliable, sin análisis se
// convierte igual— viven en `convertir_partida_a_plan`. Acá se muestran, se explican, y se llama.
// Si el control de la pantalla y el de la función discreparan, gana la función: no genera nada.

import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getPerfilActual } from '@/features/auth/services/authService'
import { esAdministracion, veEconomia } from '@/features/auth/types/areas'
import { getPartidas, getPresupuesto } from '@/features/presupuestos/services/presupuestosService'
import { getConversiones, getPlantillas, getObrasDestino } from '@/features/presupuestos/services/conversionService'
import { puedeConvertir } from '@/features/presupuestos/services/estado'
import { hh } from '@/features/presupuestos/services/formato'
import { PipelineConversion } from '@/features/presupuestos/components/PipelineConversion'
import { ListaPartidasConversion } from '@/features/presupuestos/components/ListaPartidasConversion'
import { ConfiguradorConversion } from '@/features/presupuestos/components/ConfiguradorConversion'
import { Aviso, Ayuda, EntityHeader } from '@/shared/components/ds'
import { EstadoError } from '@/shared/components/estado'

export const dynamic = 'force-dynamic'

const REGLAS = [
  ['Obra chica sin burocracia', 'Un frente y sin pasos: la partida queda como una actividad. Nadie está obligado a desglosar.'],
  ['La cantidad se conserva', 'La suma de los frentes siempre iguala la partida. Si no cierra, el sistema no genera.'],
  ['Reversible y ampliable', 'Se agregan frentes después. Lo ejecutado no se toca; se reparte el resto.'],
  ['Partidas sin análisis', 'Se convierten igual, sin HH ni plazo, marcadas como deuda de carga. Nunca cero.'],
] as const

export default async function ConvertirPage({
  params, searchParams,
}: {
  params: Promise<{ presupuesto: string }>
  searchParams: Promise<{ partida?: string }>
}) {
  const { presupuesto: id } = await params
  const { partida: partidaId } = await searchParams

  const supabase = await createClient()
  const perfil = await getPerfilActual(supabase)
  const rol = perfil.data?.rol ?? null
  // Convertir escribe en el plan de obra: la función exige `es_administracion()`. Leer el
  // presupuesto para llegar hasta acá exige `ve_economia()`. Son dos permisos y hacen falta los dos.
  if (!veEconomia(rol) || !esAdministracion(rol)) {
    return (
      <div className="px-4 py-6 lg:px-10">
        <Aviso tono="warn" titulo="Sin permiso" testid="sin-permiso">
          Convertir un presupuesto en plan de obra necesita ver el precio (Dirección o
          Administración) y escribir el plan. No es que no haya datos.
        </Aviso>
      </div>
    )
  }

  const { data: presupuesto, error } = await getPresupuesto(supabase, id)
  if (!presupuesto) {
    if (error?.startsWith('No existe')) notFound()
    return <EstadoError mensaje={error ?? 'La consulta no devolvió el presupuesto y tampoco un error.'} que="la conversión a plan de obra" />
  }

  const [partidas, plantillas, obras] = await Promise.all([
    getPartidas(supabase, id),
    getPlantillas(supabase),
    getObrasDestino(supabase),
  ])
  const lista = partidas.data ?? []
  const conversiones = await getConversiones(supabase, lista.map((p) => p.partida_id))
  const mapa = Object.fromEntries(conversiones.data ?? new Map())

  const habilitada = puedeConvertir(presupuesto)
  const seleccionada = partidaId ? lista.find((p) => p.partida_id === partidaId) ?? null : null
  const obra = obras.data?.find((o) => o.id === presupuesto.obra_canonica_id) ?? null
  const convertidas = lista.filter((p) => mapa[p.partida_id]).length

  return (
    <div className="min-h-screen bg-canvas">
      <div className="w-full px-4 pt-6 lg:px-10">
        {/* ENCABEZADO CLARO (Design 23/08). Los tres números que estaban como KPI del slab pasan a la
            línea de campos: «convertidas 3 de 8» es un contador de avance de una lista de trabajo,
            no una métrica de 20px. */}
        <EntityHeader
          volverA={`/presupuestos/${id}`}
          volverLabel={`${presupuesto.numero ?? 'Presupuesto'} · ${presupuesto.obra_nombre ?? ''}`}
          titulo="Preparar la obra"
          campos={[
            { rotulo: 'Obra', valor: obra?.nombre, falta: 'sin obra vinculada' },
            { rotulo: 'Convertidas', valor: `${convertidas} de ${lista.length}` },
            { rotulo: 'HH del contrato', valor: hh(presupuesto.hh_previstas), falta: 'sin cargar' },
          ]}
        />
      </div>

      <div className="w-full px-4 pb-4 lg:px-10">
        <PipelineConversion />

        {!habilitada.puede && (
          <div className="mt-4">
            <Aviso tono="warn" titulo="Todavía no se puede convertir" testid="conversion-bloqueada">
              {habilitada.motivo}
            </Aviso>
          </div>
        )}

        <div className="mt-5 grid gap-8 lg:grid-cols-[324px_minmax(0,1fr)]">
          <ListaPartidasConversion
            partidas={lista}
            conversiones={mapa}
            seleccionada={partidaId ?? null}
            hrefBase={`/presupuestos/${id}/convertir`}
          />

          <div className="min-w-0">
            {!seleccionada ? (
              // Estado vacío de una línea y accionable (COMPONENTS.md §Empty state). El porqué —cada
              // partida se organiza distinto en obra— está en la ayuda de abajo.
              <p className="text-[13px] text-muted" data-testid="sin-partida-elegida">
                Elegí una partida de la izquierda para convertirla.
              </p>
            ) : !habilitada.puede ? (
              <p className="text-[13px] text-muted">{habilitada.motivo}</p>
            ) : (
              <ConfiguradorConversion
                p={seleccionada}
                plantillas={plantillas.data ?? []}
                obraId={presupuesto.obra_canonica_id!}
                obraNombre={obra?.nombre ?? presupuesto.obra_nombre ?? 'Obra'}
                cotizacionId={id}
                yaConvertida={Boolean(mapa[seleccionada.partida_id])}
              />
            )}
          </div>
        </div>

        {/* LAS CUATRO REGLAS PASAN A AYUDA BAJO DEMANDA (Design 23/08). No son advertencias ni
            estados: son el modelo, y el modelo lo hace cumplir `convertir_partida_a_plan` en
            Postgres — si la pantalla y la función discreparan, no se genera nada. Un bloque de 90
            palabras permanente debajo de la lista de trabajo es exactamente el párrafo explicativo
            que el rediseño saca; el texto no se pierde. */}
        <div className="mt-8 border-t border-line pt-3">
          <Ayuda titulo="Las cuatro reglas que hace cumplir la base" testid="reglas-conversion">
            <dl className="grid gap-x-8 gap-y-2 sm:grid-cols-2">
              {REGLAS.map(([titulo, texto]) => (
                <div key={titulo}>
                  <dt className="text-[12.5px] font-medium text-ink">{titulo}</dt>
                  <dd className="text-[11.5px] leading-relaxed text-muted">{texto}</dd>
                </div>
              ))}
            </dl>
          </Ayuda>
        </div>

        {(partidas.error || plantillas.error || conversiones.error) && (
          <div className="mt-4">
            <Aviso tono="neg" titulo="Falta parte de la información">
              {partidas.error ?? plantillas.error ?? conversiones.error}
            </Aviso>
          </div>
        )}
      </div>
    </div>
  )
}
