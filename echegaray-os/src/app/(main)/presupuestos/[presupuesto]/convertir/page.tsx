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
//
// ═══ LA FORMA ES LA DEL CANÓNICO 13 (24/08) ═══
//
// Una TABLA con casillas —qué partidas se convierten, en qué se convierten y cómo se van a medir—,
// la columna de 372px con la obra que va a nacer y lo que falta antes de crearla, y una barra fija
// al pie con el gesto único. Antes era una lista y un configurador de a una: convertir un
// presupuesto de veinte partidas eran veinte elecciones y veinte envíos, y el número de lo que se
// estaba por crear no aparecía en ninguna parte hasta después de crearlo.
//
// EL CONFIGURADOR SIGUE VIVO y cada fila lo enlaza (`?partida=`): partir una partida en tres
// frentes por eje es un gesto de una partida a la vez, y borrarlo para parecerse al dibujo habría
// perdido una capacidad real.

import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getPerfilActual } from '@/features/auth/services/authService'
import { esAdministracion, veEconomia } from '@/features/auth/types/areas'
import { getPartidas, getPresupuesto } from '@/features/presupuestos/services/presupuestosService'
import { getConversiones, getPlantillas } from '@/features/presupuestos/services/conversionService'
import { convertirPartidasEnLote } from '@/features/presupuestos/services/actionsConversion'
import { puedeConvertir } from '@/features/presupuestos/services/estado'
import { hh } from '@/features/presupuestos/services/formato'
import { getObra } from '@/features/obras/services/obrasService'
import { PipelineConversion } from '@/features/presupuestos/components/PipelineConversion'
import { ConfiguradorConversion } from '@/features/presupuestos/components/ConfiguradorConversion'
import { PreparacionObra } from '@/features/presupuestos/components/PreparacionObra'
import { Aviso, Ayuda, EntityHeader, Plegable } from '@/shared/components/ds'
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

  // LA OBRA ENTERA Y NO SÓLO SU NOMBRE: la columna derecha publica cliente, jefe, fechas, contrato
  // y carpeta de Drive, y son los mismos campos que el checklist mide. Dos lecturas del mismo dato
  // darían una tarjeta que dice una cosa y un checklist que dice otra.
  const [partidas, plantillas, obraRes] = await Promise.all([
    getPartidas(supabase, id),
    getPlantillas(supabase),
    presupuesto.obra_canonica_id ? getObra(supabase, presupuesto.obra_canonica_id) : Promise.resolve({ data: null, error: null }),
  ])
  const lista = partidas.data ?? []
  const conversiones = await getConversiones(supabase, lista.map((p) => p.partida_id))
  const mapa = Object.fromEntries(conversiones.data ?? new Map())

  const habilitada = puedeConvertir(presupuesto)
  const seleccionada = partidaId ? lista.find((p) => p.partida_id === partidaId) ?? null : null
  const obra = obraRes.data
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

      <div className="w-full px-4 lg:px-10">
        <PipelineConversion />
      </div>

      {!habilitada.puede && (
        <div className="px-4 pt-4 lg:px-10">
          <Aviso tono="warn" titulo="Todavía no se puede convertir" testid="conversion-bloqueada">
            {habilitada.motivo}
          </Aviso>
        </div>
      )}

      {/* LA TABLA MANDA. Se dibuja SIEMPRE —también cuando la conversión está bloqueada— porque
          decir qué falta al lado de lo que se va a convertir es la mitad de la pantalla: una lista
          vacía con un cartel arriba no deja ver qué se estaría preparando. La barra queda bloqueada
          con el motivo, que es lo que corresponde. */}
      <PreparacionObra
        partidas={lista}
        conversiones={mapa}
        plantillas={plantillas.data ?? []}
        obra={{
          id: obra?.obra_id ?? null,
          nombre: obra?.nombre ?? presupuesto.obra_nombre ?? null,
          cliente: obra?.cliente_nombre ?? obra?.cliente_texto ?? presupuesto.cliente ?? null,
          jefeObra: obra?.jefe_obra ?? null,
          inicio: obra?.fecha_inicio_plan ?? null,
          fin: obra?.fecha_fin_plan ?? null,
          montoContratado: obra?.monto_contratado ?? null,
          driveCarpeta: obra?.drive_carpeta_id ?? null,
        }}
        datos={{
          adjudicado: presupuesto.estado === 'adjudicada',
          congelado: Boolean(presupuesto.congelada_en),
          obraVinculada: Boolean(presupuesto.obra_canonica_id),
          jefeObra: obra?.jefe_obra ?? null,
          inicioPlan: obra?.fecha_inicio_plan ?? null,
          montoContratado: obra?.monto_contratado ?? null,
          driveCarpeta: obra?.drive_carpeta_id ?? null,
        }}
        hrefBase={`/presupuestos/${id}/convertir`}
        // `.bind`, no una arrow: una función creada en un Server Component no cruza a un componente
        // cliente, compila igual y deja la pantalla en blanco en producción.
        crear={convertirPartidasEnLote.bind(null, id)}
      />

      <div className="w-full px-4 pb-4 lg:px-10">
        {/* PARTIR UNA PARTIDA EN FRENTES sigue siendo un gesto de a una, y se abre DONDE ESTÁ: la
            fila enlaza acá abajo con `?partida=` y la sección se abre sola con la partida elegida.
            Cerrada no ocupa la pantalla del que sólo quiere convertir el presupuesto entero. */}
        {seleccionada && habilitada.puede && presupuesto.obra_canonica_id && (
          <div className="pt-6" id="frentes">
            <Plegable titulo={`Partir «${seleccionada.descripcion}» en frentes`} testid="configurador-frentes" abiertoPorDefecto>
              <ConfiguradorConversion
                p={seleccionada}
                plantillas={plantillas.data ?? []}
                obraId={presupuesto.obra_canonica_id}
                obraNombre={obra?.nombre ?? presupuesto.obra_nombre ?? 'Obra'}
                cotizacionId={id}
                yaConvertida={Boolean(mapa[seleccionada.partida_id])}
              />
            </Plegable>
          </div>
        )}

        {/* LAS CUATRO REGLAS PASAN A AYUDA BAJO DEMANDA (Design 23/08). No son advertencias ni
            estados: son el modelo, y el modelo lo hace cumplir `convertir_partida_a_plan` en
            Postgres — si la pantalla y la función discreparan, no se genera nada. */}
        <div className="mt-6 border-t border-line pt-3">
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

        {(partidas.error || plantillas.error || conversiones.error || obraRes.error) && (
          <div className="mt-4">
            <Aviso tono="neg" titulo="Falta parte de la información">
              {partidas.error ?? plantillas.error ?? conversiones.error ?? obraRes.error}
            </Aviso>
          </div>
        )}
      </div>
    </div>
  )
}
