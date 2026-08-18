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
// FUENTE: la vista `cliente_panel`. No recalcula un peso.

import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getClientes } from '@/features/clientes/services/clientesService'
import { separarArchivados } from '@/features/clientes/services/cartera'
import { crearCliente } from '@/features/clientes/services/actions'
import { CamposCliente } from '@/features/clientes/components/CamposCliente'
import { ListaClientes } from '@/features/clientes/components/ListaClientes'
import { PageShell, Callout, FormAccion } from '@/shared/components/ui'

export const dynamic = 'force-dynamic'

export default async function ClientesPage({
  searchParams,
}: {
  searchParams: Promise<{ archivados?: string }>
}) {
  const { archivados } = await searchParams
  const conArchivados = archivados === '1'

  const supabase = await createClient()
  const { data, error } = await getClientes(supabase)
  const { activos, archivados: guardados } = separarArchivados(data ?? [])
  const clientes = conArchivados ? [...activos, ...guardados] : activos

  return (
    <PageShell
      // SIN EYEBROW (19/08/2026). Decía «01 · OBRAS», y la barra de nivel 2 que ahora corona esta
      // pantalla dice «Administración · Clientes»: dos rótulos contradiciéndose a 40px de distancia.
      // El que sobra es éste — la barra ya contesta «dónde estoy» y encima navega.
      title="Clientes"
      subtitle="Tocá un cliente para abrir su ficha: sus obras, sus contactos, su actividad y sus documentos."
    >
      {error && <Callout tono="neg">No pude leer los clientes: {error}</Callout>}

      {!error && clientes.length === 0 && (
        <Callout tono="neutral">
          {guardados.length === 0
            ? 'Todavía no hay clientes cargados.'
            : 'Todos los clientes están archivados.'}
        </Callout>
      )}

      {clientes.length > 0 && <ListaClientes clientes={clientes} />}

      <div className="mt-3 max-w-2xl space-y-3">
        {/* LA PUERTA DE VUELTA. Un cliente archivado no es un cliente perdido: el conteo dice
            cuántos hay y el enlace los trae a la vista sin cambiar de pantalla. */}
        {guardados.length > 0 && (
          <p className="text-[12px] text-faint" data-testid="pie-archivados">
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

        {/* SIEMPRE VISIBLE, y plegado: el alta es de un rato, la lista es de todos los días. */}
        <details className="rounded-xl border border-line bg-white" data-testid="alta-cliente">
          <summary className="cursor-pointer select-none px-4 py-2.5 text-[13px] font-medium text-ink">+ Nuevo cliente</summary>
          <div className="border-t border-line p-4">
            {/* El identificador de la URL sale del nombre y se calcula en el servidor: pedirlo acá
                sería pedir que alguien invente una clave primaria. Si ya existe, la acción avisa en
                vez de crear un segundo cliente que dejaría al primero inalcanzable. */}
            <FormAccion accion={crearCliente} testid="form-cliente" enviar="Crear cliente" limpiarAlOk mensajeOk="Cliente creado.">
              <CamposCliente />
            </FormAccion>
          </div>
        </details>

        <p className="text-[12px] text-faint">
          ¿Buscás una obra y no te acordás de quién es?{' '}
          <Link href="/obras" className="text-ink underline underline-offset-2">Ver todas las obras</Link>.
        </p>
      </div>
    </PageShell>
  )
}
