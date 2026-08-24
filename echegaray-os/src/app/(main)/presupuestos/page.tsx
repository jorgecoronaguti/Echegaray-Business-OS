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
// ═══ POR QUÉ ESTA PANTALLA NO USA `PageShell` (porte 24/08) ═══
//
// `PageShell` dibuja padding 16/24px, un `h1` de 22px y un ancho de lectura. El canon 14 dibuja
// padding de 20px, título de 19px y la tabla a sangre, en una caja que llega hasta el borde del
// contenido. Meter el canon adentro del shell da la pantalla anterior con otros colores. Lo único
// del shell que NO se puede perder es `SelloDatoBueno` —es de donde `error.tsx` saca la hora del
// último dato bueno—, así que se monta acá directo.

import { createClient } from '@/lib/supabase/server'
import { getPerfilActual } from '@/features/auth/services/authService'
import { veEconomia } from '@/features/auth/types/areas'
import { getCartera, getParametroComercialVigente } from '@/features/presupuestos/services/presupuestosService'
import { getObrasDestino } from '@/features/presupuestos/services/conversionService'
import { esFiltro } from '@/features/presupuestos/services/cartera'
import { crearPresupuesto } from '@/features/presupuestos/services/actions'
import { ListaPresupuestos } from '@/features/presupuestos/components/ListaPresupuestos'
import { CamposPresupuesto } from '@/features/presupuestos/components/CamposPresupuesto'
import { Aviso } from '@/shared/components/ds'
import { EstadoError } from '@/shared/components/estado'
import { SelloDatoBueno } from '@/shared/components/estado/SelloDatoBueno'
import { PageShell, FormAccion } from '@/shared/components/ui'
import { BotonMarca, BotonPlano, C, IcoCerrar, IcoMas, TARJETA } from '@/shared/components/canon'

export const dynamic = 'force-dynamic'

export default async function PresupuestosPage({
  searchParams,
}: {
  searchParams: Promise<{ filtro?: string; nuevo?: string; sel?: string }>
}) {
  // `sel` NO dispara ninguna consulta: la fila de `cotizacion_cascada` ya trae todo lo que el panel
  // muestra. Baja sólo como estado inicial, para que el link que alguien pegó en el chat abra la
  // lista con el presupuesto abierto en vez de abrirla en blanco.
  const { filtro: filtroCrudo, nuevo, sel } = await searchParams
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

  if (error) {
    // UNA LISTA VACÍA POR ERROR NO SE DIBUJA COMO «NO HAY DATOS»: son cosas opuestas, y confundirlas
    // hace que un permiso faltante parezca una empresa sin trabajo. `EstadoError` muestra el mensaje
    // REAL de la base — p. ej. «permission denied for table cotizaciones», que apunta al arreglo.
    return (
      <PageShell title="Presupuestos">
        <EstadoError mensaje={error} que="la cartera de presupuestos" />
      </PageShell>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: C.fondo, display: 'flex', flexDirection: 'column' }}>
      <SelloDatoBueno />

      <ListaPresupuestos
        presupuestos={presupuestos}
        filtro={filtro}
        seleccionInicial={sel ?? null}
        accion={
          abierta ? (
            <BotonPlano href="/presupuestos" testid="abrir-alta-presupuesto">
              <IcoCerrar s={14} /> Cancelar
            </BotonPlano>
          ) : (
            <BotonMarca href="/presupuestos?nuevo=1" testid="abrir-alta-presupuesto">
              <IcoMas s={14} /> Nuevo presupuesto
            </BotonMarca>
          )
        }
      />

      {abierta && (
        <div style={{ padding: '0 20px 24px' }}>
          <div style={{ ...TARJETA, padding: '16px 16px 18px' }} data-testid="alta-presupuesto">
            <h2 style={{ fontSize: '13px', fontWeight: 600, color: C.tinta, margin: '0 0 10px' }}>Nuevo presupuesto</h2>
            {/* El número lo deriva la acción: `COT-<año>-<NNN>`. Pedirlo sería pedirle a alguien que
                administre a mano la clave por la que se agrupan las versiones. */}
            <FormAccion
              accion={crearPresupuesto}
              testid="form-presupuesto"
              enviar="Crear presupuesto"
              limpiarAlOk
              mensajeOk="Presupuesto creado en borrador."
            >
              <CamposPresupuesto clientes={clientes} obras={obras.data ?? []} parametro={parametro} />
            </FormAccion>
          </div>
        </div>
      )}

    </div>
  )
}
