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
import { kpisDeCartera } from '@/features/presupuestos/services/cartera'
import { esFiltro } from '@/features/presupuestos/services/cartera'
import { plata, porcentaje } from '@/features/presupuestos/services/formato'
import { crearPresupuesto } from '@/features/presupuestos/services/actions'
import { ListaPresupuestos } from '@/features/presupuestos/components/ListaPresupuestos'
import { CamposPresupuesto } from '@/features/presupuestos/components/CamposPresupuesto'
import { Aviso, BotonEnlace } from '@/shared/components/ds'
import { EstadoError } from '@/shared/components/estado'
import { PageShell, StatTile, FormAccion } from '@/shared/components/ui'

export const dynamic = 'force-dynamic'

const MARGEN_OBJETIVO = 17

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
      <PageShell title="Presupuestos" subtitle="La cartera de ofertas de la empresa.">
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
  const k = kpisDeCartera(presupuestos)

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
      subtitle="Lo que está en la calle, lo que se ganó y con qué margen. Tocá uno para abrir su cómputo."
    >
      {error ? (
        // UNA LISTA VACÍA POR ERROR NO SE DIBUJA COMO «NO HAY DATOS»: son cosas opuestas, y
        // confundirlas hace que un permiso faltante parezca una empresa sin trabajo. `EstadoError`
        // muestra el mensaje REAL de la base — hoy, «permission denied for table cotizaciones»,
        // que apunta exactamente al arreglo.
        <EstadoError mensaje={error} que="la cartera de presupuestos" />
      ) : (
        <>
          <div className="mb-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-4" data-testid="kpis-cartera">
            <StatTile
              label="Cotizado abierto"
              value={plata(k.cotizadoAbierto) ?? 'sin cargar'}
              hint={`${k.nAbiertos} ${k.nAbiertos === 1 ? 'presupuesto' : 'presupuestos'} esperando respuesta`}
            />
            <StatTile
              label="Adjudicado"
              value={plata(k.adjudicado) ?? 'sin cargar'}
              tono="pos"
              hint={`${k.nAdjudicados} ${k.nAdjudicados === 1 ? 'obra' : 'obras'}`}
            />
            <StatTile
              label="Conversión"
              // Sin ningún presupuesto con respuesta NO es 0 %: es que todavía nadie contestó.
              value={porcentaje(k.conversionPct, 'auto') ?? 'sin dato'}
              hint={k.nConRespuesta === 0
                ? 'ninguno tuvo respuesta todavía'
                : `${k.nAdjudicados} de ${k.nConRespuesta} con respuesta`}
            />
            <StatTile
              label="Margen adjudicado"
              value={porcentaje(k.margenPonderadoPct) ?? 'sin dato'}
              tono={k.margenPonderadoPct !== null && k.margenPonderadoPct < MARGEN_OBJETIVO ? 'warn' : 'ink'}
              hint={k.nConMargen === 0 ? 'sin adjudicados con margen' : `ponderado por monto · objetivo ${MARGEN_OBJETIVO} %`}
            />
          </div>

          <ListaPresupuestos
            presupuestos={presupuestos}
            filtro={filtro}
            accion={
              <BotonEnlace
                href={abierta ? '/presupuestos' : '/presupuestos?nuevo=1'}
                variante={abierta ? 'secundaria' : 'primaria'}
                data-testid="abrir-alta-presupuesto"
                className="shrink-0"
              >
                {abierta ? 'Cancelar' : 'Nuevo presupuesto'}
              </BotonEnlace>
            }
          />

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

          <p className="mt-5 text-[11px] text-faint">
            La lista muestra la versión VIGENTE de cada presupuesto. Las anteriores se abren desde
            adentro: un presupuesto con cuatro versiones es una obra, no cuatro.
          </p>
        </>
      )}
    </PageShell>
  )
}
