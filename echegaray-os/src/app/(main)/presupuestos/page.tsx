// 14 · PRESUPUESTOS CARTERA — la entrada del módulo.
//
// ═══ TODO EL MÓDULO ES ECONÓMICO, Y ESO NO SE RESUELVE ESCONDIENDO COLUMNAS ═══
//
// Un presupuesto ES precio: no hay una versión «sin plata» de esta pantalla. `cotizacion_partida`
// está cerrada a `ve_economia()` en la base, así que un jefe de obra que llegara acá vería la
// cascada en cero —las partidas no le llegan— y creería que la empresa cotiza gratis. Un cero
// producido por un permiso es peor que una puerta cerrada: parece un dato.
//
// Por eso la pantalla se cierra entera y lo DICE. «Sin permiso» y «sin datos» son cosas opuestas y
// confundirlas hace que un permiso faltante parezca una empresa sin trabajo.
//
// Lo que el jefe de obra sí necesita del presupuesto le llega convertido en actividades, con HH y
// sin plata — que es exactamente el corte que hace `convertir_partida_a_plan`.

import { createClient } from '@/lib/supabase/server'
import { getPerfilActual } from '@/features/auth/services/authService'
import { veEconomia } from '@/features/auth/types/areas'
import { getCartera, getParametroComercialVigente } from '@/features/presupuestos/services/presupuestosService'
import { getObrasDestino } from '@/features/presupuestos/services/conversionService'
import { esFiltro } from '@/features/presupuestos/services/cartera'
import { crearPresupuesto } from '@/features/presupuestos/services/actions'
import { ListaPresupuestos } from '@/features/presupuestos/components/ListaPresupuestos'
import { CamposPresupuesto } from '@/features/presupuestos/components/CamposPresupuesto'
import { Aviso, Ayuda, BotonEnlace } from '@/shared/components/ds'
import { EstadoError } from '@/shared/components/estado'
import { PageShell, FormAccion } from '@/shared/components/ui'

export const dynamic = 'force-dynamic'

export default async function PresupuestosPage({
  searchParams,
}: {
  searchParams: Promise<{ filtro?: string; nuevo?: string }>
}) {
  const { filtro: filtroCrudo, nuevo } = await searchParams
  const filtro = esFiltro(filtroCrudo)

  const supabase = await createClient()
  const perfil = await getPerfilActual(supabase)
  if (!veEconomia(perfil.data?.rol ?? null)) {
    return (
      <PageShell title="Presupuestos">
        <Aviso tono="warn" titulo="Sin permiso" testid="sin-permiso">
          Los presupuestos son precio: los ve Dirección y Administración. No es que no haya datos —
          es que este nivel no los ve. Lo que se cotizó llega a la obra convertido en actividades,
          con sus HH y sin plata.
        </Aviso>
      </PageShell>
    )
  }

  // El parámetro comercial vigente se lee ACÁ, en el servidor, y baja por props. Los ocho
  // porcentajes son una decisión empresarial: hasta la 4300 vivían tipeados en un `defaultValue` de
  // `CamposPresupuesto.tsx` y no eran los de la empresa — daban un coeficiente de 1,43 contra el
  // 1,68 del libro con el que se cotiza.
  const [{ data, error }, obras, parametro] = await Promise.all([
    getCartera(supabase),
    getObrasDestino(supabase),
    getParametroComercialVigente(supabase),
  ])
  const presupuestos = data ?? []

  const { data: clientesData } = await supabase
    .from('clientes').select('id, nombre_comercial').order('nombre_comercial', { ascending: true })
  const clientes = (clientesData ?? []).map((c) => ({
    id: String((c as { id: unknown }).id),
    nombre: String((c as { nombre_comercial: unknown }).nombre_comercial ?? ''),
  }))

  const abierta = nuevo === '1'

  return (
    <PageShell
      title="Presupuestos"
      right={
        !error && (
          <BotonEnlace
            href={abierta ? '/presupuestos' : '/presupuestos?nuevo=1'}
            variante={abierta ? 'secundaria' : 'primaria'}
            data-testid="abrir-alta-presupuesto"
          >
            {abierta ? 'Cancelar' : 'Nuevo presupuesto'}
          </BotonEnlace>
        )
      }
    >
      {error ? (
        // UNA LISTA VACÍA POR ERROR NO SE DIBUJA COMO «NO HAY DATOS»: son cosas opuestas, y
        // confundirlas hace que un permiso faltante parezca una empresa sin trabajo. `EstadoError`
        // muestra el mensaje REAL de la base — hoy, «permission denied for table cotizaciones»,
        // que apunta exactamente al arreglo.
        <EstadoError mensaje={error} que="la cartera de presupuestos" />
      ) : (
        <>
          {/* Los totales de la cartera bajaron al pie de la tabla, alineados con su columna: ver el
              encabezado de `ListaPresupuestos`. */}
          <ListaPresupuestos presupuestos={presupuestos} filtro={filtro} />

          {abierta && (
            <div className="mt-6 border-t border-line pt-5" data-testid="alta-presupuesto">
              <h2 className="mb-3 text-[16px] font-semibold leading-tight text-ink">Nuevo presupuesto</h2>
              {/* El número lo deriva la acción: `COT-<año>-<NNN>`. Pedirlo sería pedirle a alguien
                  que administre a mano la clave por la que se agrupan las versiones. */}
              <FormAccion accion={crearPresupuesto} testid="form-presupuesto" enviar="Crear presupuesto" limpiarAlOk mensajeOk="Presupuesto creado en borrador.">
                <CamposPresupuesto clientes={clientes} obras={obras.data ?? []} parametro={parametro} />
              </FormAccion>
            </div>
          )}

          {/* El párrafo permanente que explicaba el versionado pasó a ayuda bajo demanda: lo
              necesita quien entra por primera vez, no quien abre esta lista seis veces por día. */}
          <Ayuda titulo="Por qué hay una sola fila por presupuesto" testid="ayuda-versiones">
            La lista muestra la versión VIGENTE de cada presupuesto. Las anteriores se abren desde
            adentro: un presupuesto con cuatro versiones es una obra, no cuatro.
          </Ayuda>
        </>
      )}
    </PageShell>
  )
}
