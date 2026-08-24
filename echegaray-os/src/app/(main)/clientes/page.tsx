// 01 OBRAS · CLIENTES — la entrada del módulo.
//
// El cliente es la RELACIÓN EMPRESARIAL y la obra la unidad operativa: un cliente puede tener varias
// obras (La Estrella tiene tres) y hasta hace poco eso vivía como tres cadenas de texto iguales por
// casualidad.
//
// ═══ CAMBIO DE REGLA DECLARADO (Design 23/08/2026) ═══
//
// El 19/08 el dueño pidió *"CLIENTE | OBRAS. Nada más para el MVP"* y esta lista quedó en dos
// columnas. El canónico 25 del 23/08 —cuatro días después, y es el contrato vigente— la rediseña con
// CLIENTE · EN EJECUCIÓN · OBRAS · CONTRATADO y tres recortes. Se implementa el contrato más nuevo.
//
// **HAY QUE MIRARLO.** Es la reversión de una decisión explícita del dueño, y el test que la defendía
// (`clientes-record.spec.ts`) se actualizó con el mismo rótulo. Lo que NO volvió, porque no tiene
// fuente, está declarado en `ListaClientes.tsx`: la tasa de conversión de presupuestos y el último
// movimiento.
//
// NO ES UN EMBUDO COMERCIAL. No hay leads, ni oportunidades, ni etapa de venta: son los clientes
// reales de la empresa.
//
// ═══ ARCHIVAR TIENE EFECTO ═══
//
// `archivarCliente` escribía `activo = false` y esta lista NO FILTRABA: el cliente archivado seguía
// acá igual que antes. Ahora sale de la lista —mismo criterio que el portafolio de obras— y el pie
// dice cuántos hay guardados y cómo verlos, porque archivar no puede parecerse a borrar.
//
// ═══ EL ANCHO SIGUE A LAS COLUMNAS (Design 23/08) ═══
//
// `LAYOUT_RESPONSIVE.md` §Anchos acotaba esta lista a 680px, y era lo correcto MIENTRAS tuvo dos
// columnas: una tabla de dos columnas estirada a 1440 es ilegible. Con cuatro columnas —y una de
// ellas nombres de obra— 680px estrangula justo la que se lee. La regla no cambió; cambió la tabla.
//
// ═══ EL ALTA ES UN ESTADO DE LA DIRECCIÓN ═══
//
// `?nuevo=1`. Era un `<details>` con estado en el navegador, y el handoff pide la primaria amarilla
// AL LADO del buscador — un `<summary>` tiene que ser el primer hijo de su `<details>`, así que ese
// botón no podía vivir en la fila del buscador sin dejar de ser el control que abre el formulario.
// Con el estado en la URL el botón es un botón, el formulario aparece donde tiene que aparecer, y de
// yapa la dirección con el alta abierta se puede pasar por chat (regla 10 de UX_PRINCIPLES).
//
// FUENTE: la vista `cliente_panel`. No recalcula un peso.

import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getPerfilActual } from '@/features/auth/services/authService'
import { esAdministracion, veEconomia as puedeVerEconomia } from '@/features/auth/types/areas'
import { getClientes, getObrasEnEjecucion } from '@/features/clientes/services/clientesService'
import { esVistaCartera, recortarCartera, separarArchivados } from '@/features/clientes/services/cartera'
import { crearCliente } from '@/features/clientes/services/actions'
import { CamposCliente } from '@/features/clientes/components/CamposCliente'
import { ListaClientes, type ObraEnCurso } from '@/features/clientes/components/ListaClientes'
import { FiltrosURL } from '@/features/administracion/components/Controles'
import { Aviso, BotonEnlace, Vacio } from '@/shared/components/ds'
import { PageShell, LECTURA, FormAccion } from '@/shared/components/ui'

export const dynamic = 'force-dynamic'

type Query = { archivados?: string; nuevo?: string; vista?: string }

/** Un recorte con su contador en mono, como pide COMPONENTS.md §Secondary tabs / Filters. */
function ChipCartera({ t, n }: { t: string; n: number }) {
  return (
    <span className="inline-flex items-baseline gap-1.5">
      {t}
      <span className="font-mono text-[11px] tabular-nums text-faint">{n}</span>
    </span>
  )
}

export default async function ClientesPage({
  searchParams,
}: {
  searchParams: Promise<Query>
}) {
  const sp = await searchParams
  const conArchivados = sp.archivados === '1'
  const vista = esVistaCartera(sp.vista) ? sp.vista : 'todo'

  const supabase = await createClient()
  const [{ data, error }, perfil, enEjecucion] = await Promise.all([
    getClientes(supabase),
    getPerfilActual(supabase),
    getObrasEnEjecucion(supabase),
  ])
  const rol = perfil.data?.rol ?? null
  // LA CARTERA ES DE ADMINISTRACIÓN. El nivel Obras entra al record de un cliente —necesita saber
  // con quién habla en la obra que ejecuta— pero no administra el maestro. No es la cerradura: la
  // RLS rechaza la escritura igual. Es no ofrecer un botón que la base va a rechazar.
  const puedeEditar = esAdministracion(rol)
  // EL PRECIO NO ES DE TODOS. `veEconomia` decide si la columna CONTRATADO se dibuja: el jefe de
  // obra no ve venta ni contratado, y eso ya lo dice el modelo de roles — acá sólo se respeta.
  const veEconomia = puedeVerEconomia(rol)
  const abierta = sp.nuevo === '1' && puedeEditar

  const { activos, archivados: guardados } = separarArchivados(data ?? [])
  const todos = conArchivados ? [...activos, ...guardados] : activos
  const clientes = recortarCartera(todos, vista)

  /** La misma dirección con lo que se le cambie. El alta abierta se cierra: el formulario de un
   *  cliente nuevo no tiene nada que ver con qué recorte de la cartera se está mirando. */
  const url = ({ v = vista, arch = conArchivados }: { v?: string | null; arch?: boolean } = {}) => {
    const p = new URLSearchParams()
    if (arch) p.set('archivados', '1')
    if (v && v !== 'todo') p.set('vista', v)
    const s = p.toString()
    return `/clientes${s ? `?${s}` : ''}`
  }

  const porCliente: Record<string, ObraEnCurso[]> = Object.fromEntries(enEjecucion)

  return (
    <PageShell
      // SIN EYEBROW (19/08/2026). Decía «01 · OBRAS», y la barra de nivel 2 que ahora corona esta
      // pantalla dice «Administración · Clientes»: dos rótulos contradiciéndose a 40px de distancia.
      // El que sobra es éste — la barra ya contesta «dónde estoy» y encima navega.
      title="Clientes"
      // SIN SUBTÍTULO (Design 23/08). Decía «Tocá un cliente para abrir su ficha: sus obras, sus
      // contactos, su actividad y sus documentos» — o sea, explicaba que una fila de una tabla se
      // puede clicar. «No se explica lo que el diseño muestra» (COMPONENTS.md §Texto en la interfaz).
      // ANCHO COMPLETO desde el canónico 25: con dos columnas, 680px era el ancho correcto —una
      // tabla de dos columnas estirada a 1440 es ilegible—. Con CLIENTE · EN EJECUCIÓN · OBRAS ·
      // CONTRATADO, 680px estrangula el nombre de la obra en curso, que es la columna que se lee.
      maxWidth={LECTURA.completo}
    >
      {/* UNA LISTA VACÍA POR ERROR NO SE DIBUJA COMO «NO HAY DATOS» (INTERACTION.md §Error): el
          mensaje es el de la fuente, y la lista no se dibuja abajo fingiendo una cartera vacía. */}
      {error ? (
        <Aviso tono="neg" titulo="No pude leer los clientes">{error}</Aviso>
      ) : (
        <>
          <ListaClientes
            clientes={clientes}
            enEjecucion={porCliente}
            veEconomia={veEconomia}
            accion={puedeEditar && (
              <BotonEnlace
                href={abierta ? '/clientes' : '/clientes?nuevo=1'}
                variante={abierta ? 'secundaria' : 'primaria'}
                data-testid="abrir-alta-cliente"
                className="shrink-0"
              >
                {abierta ? 'Cancelar' : '+ Nuevo cliente'}
              </BotonEnlace>
            )}
            filtros={
              /* LOS TRES RECORTES DEL CANÓNICO. Van por la URL —el filtro puesto se comparte por
                 enlace y el botón de atrás lo deshace— y su contador sale de la MISMA lista que se
                 dibuja: un chip que dijera 4 con la tabla mostrando 3 sería un tercer número. */
              <FiltrosURL
                testid="filtro-cartera"
                opciones={[
                  { label: <ChipCartera t="Todos" n={todos.length} />, href: url({ v: null }), activo: vista === 'todo', testid: 'filtro-cartera-todo' },
                  {
                    label: <ChipCartera t="Con obra activa" n={recortarCartera(todos, 'activos').length} />,
                    href: url({ v: 'activos' }), activo: vista === 'activos', testid: 'filtro-cartera-activos',
                  },
                  {
                    label: <ChipCartera t="Datos faltantes" n={recortarCartera(todos, 'sin-datos').length} />,
                    href: url({ v: 'sin-datos' }), activo: vista === 'sin-datos', testid: 'filtro-cartera-sin-datos',
                  },
                ]}
              />
            }
          />

          {clientes.length === 0 && (
            <Vacio accion={vista !== 'todo' ? <Link href={url({ v: null })} className="text-ink underline underline-offset-2">Ver todos</Link> : undefined}>
              {vista !== 'todo'
                ? 'Ningún cliente entra en este recorte.'
                : guardados.length === 0
                  ? 'Todavía no hay clientes cargados.'
                  : 'Todos los clientes están archivados.'}
            </Vacio>
          )}

          {abierta && (
            <div className="mt-6 border-t border-line pt-5" data-testid="alta-cliente">
              <h2 className="mb-3 text-[16px] font-semibold leading-tight text-ink">Nuevo cliente</h2>
              {/* El identificador de la URL sale del nombre y se calcula en el servidor: pedirlo acá
                  sería pedir que alguien invente una clave primaria. Si ya existe, la acción avisa
                  en vez de crear un segundo cliente que dejaría al primero inalcanzable. */}
              <FormAccion accion={crearCliente} testid="form-cliente" enviar="Crear cliente" limpiarAlOk mensajeOk="Cliente creado.">
                <CamposCliente />
              </FormAccion>
            </div>
          )}

          <div className="mt-5 space-y-2">
            {/* LA PUERTA DE VUELTA. Un cliente archivado no es un cliente perdido: el conteo dice
                cuántos hay y el enlace los trae a la vista sin cambiar de pantalla. */}
            {guardados.length > 0 && (
              <p className="text-[11px] text-faint" data-testid="pie-archivados">
                {conArchivados ? (
                  <>
                    Se muestran también {guardados.length} cliente{guardados.length === 1 ? '' : 's'} archivado{guardados.length === 1 ? '' : 's'}.{' '}
                    {/* El recorte se preserva al ocultar los archivados: perderlo obligaría a
                        volver a elegirlo, y quien mira «Datos faltantes» lo mira por algo. */}
                    <Link href={url({ arch: false })} className="text-ink underline underline-offset-2">Ocultarlos</Link>.
                  </>
                ) : (
                  <>
                    {guardados.length} cliente{guardados.length === 1 ? '' : 's'} archivado{guardados.length === 1 ? '' : 's'} fuera de esta lista.{' '}
                    <Link href={url({ arch: true })} className="text-ink underline underline-offset-2" data-testid="ver-archivados">Verlos</Link>.
                  </>
                )}
              </p>
            )}

            {/* SE FUE EL PÁRRAFO PERMANENTE (Design 23/08, «menos palabras»). Decía que el filtro es
                local —una nota de implementación que a quien busca un cliente no le sirve para
                nada— y ofrecía ir a Obras, que ya está en la navegación de nivel 2. */}
          </div>
        </>
      )}
    </PageShell>
  )
}
