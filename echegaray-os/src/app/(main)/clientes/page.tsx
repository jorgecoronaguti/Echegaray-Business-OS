// 01 OBRAS · CLIENTES — la entrada del módulo.
//
// El cliente es la RELACIÓN EMPRESARIAL y la obra la unidad operativa: un cliente puede tener varias
// obras (La Estrella tiene tres) y hasta hace poco eso vivía como tres cadenas de texto iguales por
// casualidad.
//
// ═══ ESTA LISTA EXISTE PARA ENCONTRAR Y ABRIR UN CLIENTE. NADA MÁS (19/08/2026) ═══
//
// El dueño: *"Quiero CLIENTE | OBRAS. Nada más para el MVP."* Se fueron responsable, contratado,
// costo real, restricciones, documentos y el CUIT como subtítulo. Ninguno de esos números se perdió:
// todos están en el record del cliente, a un clic, y los económicos además en el portafolio de
// obras, que es donde se comparan contra algo. Acá no decidían nada — nadie elige a quién llamar por
// su costo real acumulado — y le comían al nombre el 70% del ancho.
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
// ═══ EL ANCHO ES DE LECTURA, NO DE PANTALLA (Design Handoff V2) ═══
//
// `LAYOUT_RESPONSIVE.md` §Anchos: *"Listas de lectura corta (Clientes): máximo ~680px; una tabla de
// dos columnas estirada a 1440 es ilegible"*. Con el ancho completo, el nombre queda pegado a la
// izquierda y el número de obras a un metro, a la derecha, y hay que barrer la pantalla con la vista
// para leer un renglón.
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
import { esAdministracion } from '@/features/auth/types/areas'
import { getClientes } from '@/features/clientes/services/clientesService'
import { separarArchivados } from '@/features/clientes/services/cartera'
import { crearCliente } from '@/features/clientes/services/actions'
import { CamposCliente } from '@/features/clientes/components/CamposCliente'
import { ListaClientes } from '@/features/clientes/components/ListaClientes'
import { Aviso, BotonEnlace, Vacio } from '@/shared/components/ds'
import { PageShell, LECTURA, FormAccion } from '@/shared/components/ui'

export const dynamic = 'force-dynamic'

export default async function ClientesPage({
  searchParams,
}: {
  searchParams: Promise<{ archivados?: string; nuevo?: string }>
}) {
  const { archivados, nuevo } = await searchParams
  const conArchivados = archivados === '1'

  const supabase = await createClient()
  const [{ data, error }, perfil] = await Promise.all([
    getClientes(supabase),
    getPerfilActual(supabase),
  ])
  // LA CARTERA ES DE ADMINISTRACIÓN. El nivel Obras entra al record de un cliente —necesita saber
  // con quién habla en la obra que ejecuta— pero no administra el maestro. No es la cerradura: la
  // RLS rechaza la escritura igual. Es no ofrecer un botón que la base va a rechazar.
  const puedeEditar = esAdministracion(perfil.data?.rol ?? null)
  const abierta = nuevo === '1' && puedeEditar

  const { activos, archivados: guardados } = separarArchivados(data ?? [])
  const clientes = conArchivados ? [...activos, ...guardados] : activos

  return (
    <PageShell
      // SIN EYEBROW (19/08/2026). Decía «01 · OBRAS», y la barra de nivel 2 que ahora corona esta
      // pantalla dice «Administración · Clientes»: dos rótulos contradiciéndose a 40px de distancia.
      // El que sobra es éste — la barra ya contesta «dónde estoy» y encima navega.
      title="Clientes"
      subtitle="Tocá un cliente para abrir su ficha: sus obras, sus contactos, su actividad y sus documentos."
      maxWidth={LECTURA.lista}
    >
      {/* UNA LISTA VACÍA POR ERROR NO SE DIBUJA COMO «NO HAY DATOS» (INTERACTION.md §Error): el
          mensaje es el de la fuente, y la lista no se dibuja abajo fingiendo una cartera vacía. */}
      {error ? (
        <Aviso tono="neg" titulo="No pude leer los clientes">{error}</Aviso>
      ) : (
        <>
          <ListaClientes
            clientes={clientes}
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
          />

          {clientes.length === 0 && (
            <Vacio>
              {guardados.length === 0
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
                    <Link href="/clientes" className="text-ink underline underline-offset-2">Ocultarlos</Link>.
                  </>
                ) : (
                  <>
                    {guardados.length} cliente{guardados.length === 1 ? '' : 's'} archivado{guardados.length === 1 ? '' : 's'} fuera de esta lista.{' '}
                    <Link href="/clientes?archivados=1" className="text-ink underline underline-offset-2" data-testid="ver-archivados">Verlos</Link>.
                  </>
                )}
              </p>
            )}

            <p className="text-[11px] text-faint">
              El filtro es local: son pocos y la búsqueda tiene que ser instantánea. ¿Buscás una obra
              y no te acordás de quién es?{' '}
              <Link href="/obras" className="text-ink underline underline-offset-2">Ver todas las obras</Link>.
            </p>
          </div>
        </>
      )}
    </PageShell>
  )
}
