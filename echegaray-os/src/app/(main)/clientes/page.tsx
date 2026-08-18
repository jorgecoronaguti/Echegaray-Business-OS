// 01 OBRAS · CLIENTES — la entrada del módulo.
//
// El cliente es la entidad de arriba y la obra la unidad operativa: un cliente puede tener varias
// obras (La Estrella tiene tres) y hasta ahora eso vivía como tres cadenas de texto iguales por
// casualidad. Esta lista existe para una sola decisión: con qué cliente hay que sentarse hoy.
//
// NO ES UN CRM. No hay leads, ni oportunidades, ni etapa comercial: son los clientes reales, con lo
// que ya calculan otras fuentes. La lista ES el tablero — sin tarjetas de colores ni KPIs sueltos.
//
// FUENTE: la vista `cliente_panel`, que SUMA lo que `obra_panel` ya calculó. No recalcula un peso.

import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getClientes } from '@/features/clientes/services/clientesService'
import { crearCliente } from '@/features/clientes/services/actions'
import { CamposCliente } from '@/features/clientes/components/CamposCliente'
import { PageShell, Callout, FormAccion } from '@/shared/components/ui'

export const dynamic = 'force-dynamic'

const plata = (n: number | null) => (n == null ? '—' : '$' + Math.round(n).toLocaleString('es-AR'))

export default async function ClientesPage() {
  const supabase = await createClient()
  const { data, error } = await getClientes(supabase)
  const clientes = data ?? []
  const conObraActiva = clientes.filter((c) => c.n_obras_activas > 0)

  return (
    <PageShell
      eyebrow="01 · Obras"
      title="Clientes"
      subtitle={`${conObraActiva.length} cliente${conObraActiva.length === 1 ? '' : 's'} con obra en curso. Tocá uno para ver sus obras, sus contactos y su carpeta de Drive.`}
      maxWidth="max-w-7xl"
    >
      {error && <Callout tono="neg">No pude leer los clientes: {error}</Callout>}

      {!error && clientes.length === 0 && (
        <Callout tono="info">Todavía no hay clientes cargados.</Callout>
      )}

      {clientes.length > 0 && (
        // Se desplaza en el teléfono en vez de recortarse: `overflow-hidden` ya hizo desaparecer
        // cinco columnas a 390px, que era todo lo que la pantalla existía para mostrar.
        <div className="overflow-x-auto rounded-xl border border-line bg-white">
          <table data-testid="clientes-tabla" className="w-full min-w-[680px] text-left">
            <thead>
              <tr className="border-b border-line text-[10px] uppercase tracking-wide text-faint">
                <th className="px-4 py-2.5 font-medium">Cliente</th>
                <th className="px-3 py-2.5 text-center font-medium">Obras</th>
                <th className="px-3 py-2.5 text-right font-medium">Contratado</th>
                <th className="px-3 py-2.5 text-right font-medium">Costo real</th>
                <th className="px-3 py-2.5 text-center font-medium">Restric.</th>
                <th className="px-3 py-2.5 text-center font-medium">Docs.</th>
              </tr>
            </thead>
            <tbody>
              {clientes.map((c) => (
                <tr key={c.cliente_id} className="border-b border-line/60 last:border-0 hover:bg-sky-50/50">
                  <td className="px-4 py-2.5">
                    {c.slug ? (
                      <Link href={`/clientes/${c.slug}`} className="block">
                        <span className="text-[13px] font-semibold text-ink hover:underline">{c.nombre}</span>
                        <span className="block truncate text-[11px] text-faint">{c.cuit ?? 'CUIT sin cargar'}</span>
                      </Link>
                    ) : (
                      // Sin slug no hay ficha a la que entrar. Se muestra igual: esconderlo haría
                      // que un cliente real desapareciera de la lista sin que nadie se entere.
                      <>
                        <span className="text-[13px] font-semibold text-ink">{c.nombre}</span>
                        <span className="block text-[11px] text-faint">sin identificador: no tiene ficha todavía</span>
                      </>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-center text-[12px] tabular-nums text-muted">
                    {c.n_obras === 0 ? '—' : (
                      <>
                        <span className="text-ink">{c.n_obras_activas}</span>
                        <span className="text-faint"> / {c.n_obras}</span>
                      </>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right text-[12px] tabular-nums text-muted">{plata(c.contratado)}</td>
                  <td className="px-3 py-2.5 text-right text-[12px] tabular-nums text-ink">{plata(c.costo_real)}</td>
                  <td className="px-3 py-2.5 text-center text-[12px] tabular-nums">
                    {c.restricciones_abiertas === 0
                      ? <span className="text-faint">—</span>
                      : <span className="text-muted">{c.restricciones_abiertas}</span>}
                  </td>
                  <td className="px-3 py-2.5 text-center text-[12px] tabular-nums text-muted">{c.n_documentos || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <details className="mt-4 rounded-xl border border-line bg-white" data-testid="alta-cliente">
        <summary className="cursor-pointer px-4 py-2.5 text-[13px] font-medium text-ink">Nuevo cliente</summary>
        <div className="border-t border-line p-4">
          {/* El identificador de la URL sale del nombre y se calcula en el servidor: pedirlo acá
              sería pedir que alguien invente una clave primaria. Si ya existe, la acción avisa en
              vez de crear un segundo cliente que dejaría al primero inalcanzable. */}
          <FormAccion accion={crearCliente} testid="form-cliente" enviar="Crear cliente" limpiarAlOk mensajeOk="Cliente creado.">
            <CamposCliente />
          </FormAccion>
        </div>
      </details>

      <p className="mt-3 text-[12px] text-faint">
        ¿Buscás una obra y no te acordás de quién es?{' '}
        <Link href="/obras" className="text-ink underline underline-offset-2">Ver todas las obras</Link>.
      </p>
    </PageShell>
  )
}
