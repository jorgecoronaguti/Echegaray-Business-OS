// 00 · ADMINISTRACIÓN — LA ENTRADA DEL ÁREA. NO ES UN ÍNDICE TEXTUAL.
//
// ═══ QUÉ CAMBIÓ EL 23/08/2026 (Design canónico, pantalla 00) ═══
//
// La pantalla decía dos veces lo mismo: la barra de nivel 2 nombraba las secciones arriba y, abajo,
// una lista de «maestros» repetía cada nombre con una frase explicándolo («Ficha, contactos,
// actividad, documentos y sus obras»). Diez renglones de prosa para decir a dónde lleva un enlace que
// ya estaba dibujado. Ahora:
//
//   · el contador y el ⚠ viven ADENTRO de la barra, que es donde el nombre del área ya estaba;
//   · lo accionable es una fila de chips, cada uno con su número y con el FILTRO donde se corrige;
//   · debajo queda la entidad activa —la cartera de clientes— para abrir una ficha.
//
// ═══ POR QUÉ LAS DIECISÉIS LECTURAS VAN EN UNA SOLA TANDA ═══
//
// El perfil hace falta para decidir QUÉ áreas se dibujan, pero pedirlo antes de contar convertiría la
// pantalla en dos viajes encadenados. Se lanza todo junto y se descarta después: lo que el rol no
// puede ver lo cierra la base, no el orden de las consultas.
//
// El buscador de arriba a la derecha es global a propósito: quien lo usa tiene un nombre en la mano
// —de un papel, de un WhatsApp, de una factura— y quiere la ficha, no la sección.

import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getPerfilActual } from '@/features/auth/services/authService'
import { veEconomia } from '@/features/auth/types/areas'
import { getClientes } from '@/features/clientes/services/clientesService'
import { separarArchivados } from '@/features/clientes/services/cartera'
import { PageShell } from '@/shared/components/ui'
import { Aviso, BotonEnlace, BuscadorURL, Eyebrow, TituloPanel, Vacio } from '@/shared/components/ds'
import { BarraAreas } from '@/features/administracion/components/BarraAreas'
import { BarraAtencion } from '@/features/administracion/components/BarraAtencion'
import { TablaClientesHome } from '@/features/administracion/components/TablaClientesHome'
import { buscarGlobal, type Hallazgo } from '@/features/administracion/services/entradaService'
import {
  areasDeAdministracion, atencionNoLeida, chipsDeAtencion, getConteosHome,
} from '@/features/administracion/services/homeAdministracion'

export const dynamic = 'force-dynamic'

function Resultados({ q, hallazgos }: { q: string; hallazgos: Hallazgo[] }) {
  return (
    <section className="mb-6" data-testid="resultados-busqueda">
      <Eyebrow className="mb-1">Resultados de «{q}»</Eyebrow>
      {hallazgos.length === 0 ? (
        <Vacio>Ningún cliente, persona ni proveedor coincide con «{q}».</Vacio>
      ) : (
        <ul>
          {hallazgos.map((h) => (
            <li key={h.clave} className="border-b border-[#EFEEEA] last:border-0">
              <Link href={h.href} data-testid="hallazgo" className="flex items-baseline gap-3 py-2.5 hover:bg-surface-quiet">
                <span className="w-[92px] shrink-0 text-[10px] uppercase tracking-[0.06em] text-faint">{h.maestro}</span>
                <span className="min-w-0 flex-1 truncate text-[13px] text-ink">{h.nombre}</span>
                {h.detalle && <span className="shrink-0 text-[11.5px] text-faint">{h.detalle}</span>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export default async function AdministracionPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const sp = await searchParams
  const supabase = await createClient()
  const [conteos, cartera, hallazgos, perfil] = await Promise.all([
    getConteosHome(supabase),
    getClientes(supabase),
    buscarGlobal(supabase, sp.q),
    getPerfilActual(supabase),
  ])

  const rol = perfil.data?.rol ?? null
  const vePrecio = veEconomia(rol)
  const areas = areasDeAdministracion(conteos, rol)
  const chips = chipsDeAtencion(conteos, rol)
  const { activos } = separarArchivados(cartera.data ?? [])

  return (
    <PageShell
      // SIN SUBTÍTULO: decía «Los maestros del sistema y lo que quedó sin resolver», que es una
      // descripción de la pantalla para quien ya la está mirando. La barra y los chips lo dicen solos.
      title="Administración"
      right={
        <BuscadorURL
          accion="/administracion"
          q={sp.q}
          placeholder="Buscar cliente, persona o proveedor"
          ancho="w-full sm:w-[300px]"
          testid="buscador-global"
        />
      }
    >
      <BarraAreas areas={areas} />
      <BarraAtencion chips={chips} noLeida={atencionNoLeida(conteos)} />

      {sp.q && <Resultados q={sp.q} hallazgos={hallazgos} />}

      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <TituloPanel>Clientes</TituloPanel>
        {/* El alta vive en `/clientes`: una segunda pantalla de alta sería un segundo formulario del
            mismo cliente. Acá se ofrece la puerta, no una copia. */}
        <BotonEnlace href="/clientes?nuevo=1" variante="primaria" data-testid="ir-alta-cliente">
          + Nuevo cliente
        </BotonEnlace>
      </div>

      {/* UNA LISTA VACÍA POR ERROR NO SE DIBUJA COMO «NO HAY DATOS» (INTERACTION.md §Error). */}
      {cartera.error ? (
        <Aviso tono="neg" titulo="No pude leer los clientes">{cartera.error}</Aviso>
      ) : (
        <TablaClientesHome clientes={activos} veEconomia={vePrecio} />
      )}
    </PageShell>
  )
}
