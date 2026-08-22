// 10 · OBRA SUBCONTRATISTAS — los paquetes que ejecuta un tercero dentro de esta obra.
//
// ═══ POR QUÉ ES UNA PANTALLA Y NO UNA SOLAPA MÁS ═══
//
// Las solapas de la obra son seis y ese tope está declarado en `page.tsx`. Ésta cuelga de Tareas
// —el paquete es una porción del alcance de actividades que ya existen, no un trabajo paralelo— y
// vive en su propia URL por la misma razón que Cronograma y Dotación: se manda por chat, y un
// estado guardado en el navegador abriría otra pantalla del otro lado.
//
// ═══ LA PLATA NO SE ESCONDE: NO SE PIDE ═══
//
// `veEconomia` decide si se piden las vistas económicas. No es la cerradura —la cerradura está en
// Postgres: los GRANT de columna de la 3400 y los porteros dentro de `subcontrato_costo`—, es la
// puerta: sin esto el servidor le mandaría al navegador de un jefe de obra un JSON con precios que
// la pantalla después esconde con un `if`. Esconder no es no mandar.
//
// ═══ LO QUE ESTA PANTALLA NO INVENTA ═══
//
// El costo de hacer el paquete con gente propia. El comparador deja la celda vacía con su motivo:
// el análisis de costo por actividad todavía no existe en el modelo, y completarla con una
// estimación convertiría la comparación —que es la decisión de subcontratar o no— en un número
// fabricado con apariencia de cálculo.

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getObra } from '@/features/obras/services/obrasService'
import { getPerfilActual } from '@/features/auth/services/authService'
import { veEconomia } from '@/features/auth/types/areas'
import { getSubcontratos } from '@/features/obras/services/subcontratosService'
import { armarComparacion } from '@/features/obras/services/subcontratosReglas'
import {
  agregarPersonaExterna, cambiarEstadoPaquete, crearPaquete, fijarPrecioPaquete, registrarAporte,
  registrarDocumento,
} from '@/features/obras/services/actionsSubcontratos'
import { BarraContextoObra } from '@/features/obras/components/BarraContextoObra'
import { TablaSubcontratos } from '@/features/obras/components/TablaSubcontratos'
import { PanelSubcontrato } from '@/features/obras/components/PanelSubcontrato'
import { ComparadorPropioSubcontrato } from '@/features/obras/components/ComparadorPropioSubcontrato'
import { FormNuevoPaquete } from '@/features/obras/components/FormNuevoPaquete'
import { Aviso, SubTabs } from '@/shared/components/ds'
import { EstadoError } from '@/shared/components/estado'

export const dynamic = 'force-dynamic'

export default async function SubcontratosObraPage({
  params, searchParams,
}: {
  params: Promise<{ obra: string }>
  searchParams: Promise<{ sel?: string }>
}) {
  const { obra: obraId } = await params
  const { sel } = await searchParams
  const supabase = await createClient()

  const economia = veEconomia((await getPerfilActual(supabase)).data?.rol ?? null)
  const { data: obra, error: errorObra } = await getObra(supabase, obraId)
  // NO EXISTE y NO PUDE LEER son dos cosas distintas: un `grant` que falta se veía como «página no
  // encontrada» y buscar un defecto de permisos detrás de un 404 es buscarlo donde no está.
  if (errorObra) return <EstadoError mensaje={errorObra} que="los subcontratos de la obra" />
  if (!obra) notFound()

  const hoy = new Date().toISOString().slice(0, 10)
  const { data, error } = await getSubcontratos(supabase, obraId, economia, hoy)
  if (error || !data) {
    return <EstadoError mensaje={error ?? 'sin datos'} que="los subcontratos de la obra" />
  }

  const seleccionado = data.paquetes.find((p) => p.id === sel) ?? null
  const href = (id: string | null) =>
    id ? `/obras/${obraId}/subcontratos?sel=${id}` : `/obras/${obraId}/subcontratos`

  const comparacion = seleccionado
    ? armarComparacion(
      {
        paquete: {
          cantidad: seleccionado.cantidad,
          unidad: seleccionado.unidad,
          precio_contratado: seleccionado.precio_contratado,
          aportes: seleccionado.aportes_total,
          costo_real: seleccionado.costo_real,
          hh_apoyo: seleccionado.hh_apoyo,
          personas_externas: seleccionado.personas_externas,
          fecha_inicio_plan: seleccionado.fecha_inicio_plan,
          fecha_fin_plan: seleccionado.fecha_fin_plan,
        },
        actividad: seleccionado.vinculos[0] ?? null,
      },
      economia,
    )
    : null

  const bloqueados = data.paquetes.filter((p) => p.revision.bloqueos.length > 0)

  return (
    <main className="flex flex-col gap-4 pb-10">
      <BarraContextoObra
        volverA={`/obras/${obraId}`}
        volverLabel={`Obras · ${obra.nombre}`}
        titulo="Subcontratos"
        kpis={[
          { rotulo: 'Paquetes', valor: `${data.paquetes.length}` },
          {
            rotulo: 'Sin poder iniciar',
            valor: bloqueados.length === 0 ? '0' : `${bloqueados.length}`,
          },
          {
            rotulo: 'Gente de terceros',
            valor: `${data.paquetes.reduce((t, p) => t + p.personas_externas, 0)}`,
          },
        ]}
      />

      <div className="flex flex-col gap-4 px-4 lg:px-8">
        {/* Nivel 3: las dos maneras de mirar el MISMO alcance de la obra — lo que hace el plantel
            propio y lo que hace un tercero. */}
        <SubTabs
          testid="subtabs-subcontratos"
          items={[
            { href: `/obras/${obraId}?vista=tareas&sub=arbol`, label: 'Actividades' },
            { href: `/obras/${obraId}/subcontratos`, label: 'Subcontratos', activo: true, testid: 'sub-subcontratos' },
          ]}
        />

        {data.avisos.map((a) => (
          <Aviso key={a} tono="warn" titulo="Falta parte de esta pantalla" testid="aviso-lectura">
            {a}
          </Aviso>
        ))}

        <FormNuevoPaquete
          actividades={data.actividades}
          economia={economia}
          accion={crearPaquete.bind(null, obraId)}
        />

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_384px]">
          <div className="flex min-w-0 flex-col gap-6">
            <TablaSubcontratos
              paquetes={data.paquetes}
              seleccionado={seleccionado?.id ?? null}
              economia={economia}
              href={href}
            />
            {comparacion && seleccionado && (
              <ComparadorPropioSubcontrato
                filas={comparacion}
                titulo="Propio vs subcontrato"
                subtitulo={`${seleccionado.vinculos[0]?.actividad ?? seleccionado.nombre} · antes de firmar`}
              />
            )}
          </div>

          {seleccionado ? (
            <PanelSubcontrato
              paquete={seleccionado}
              economia={economia}
              cerrarHref={href(null)}
              /* `.bind(null, obraId)` Y NO UNA ARROW: una arrow escrita acá es una función nueva
                 creada en el servidor, no la acción. React la rechaza en tiempo de ejecución y la
                 pantalla queda en blanco — ni el typecheck ni el build lo ven. */
              acciones={{
                aporte: registrarAporte.bind(null, obraId),
                persona: agregarPersonaExterna.bind(null, obraId),
                documento: registrarDocumento.bind(null, obraId),
                precio: fijarPrecioPaquete.bind(null, obraId),
                estado: cambiarEstadoPaquete.bind(null, obraId),
              }}
            />
          ) : (
            /* 22/08/2026 · «Tocá un paquete para ver…» se borró: la lista de la izquierda es
               clicleable y el panel aparece al tocarla — describir el gesto no lo enseña, lo repite.
               El enlace a las actividades SÍ queda: es la única forma de salir de acá sin volver
               por el menú, y no se deduce de ninguna otra cosa de la pantalla. */
            <aside className="rounded-card border border-line bg-surface p-4">
              <Link
                href={`/obras/${obraId}?vista=tareas&sub=arbol`}
                className="text-[12.5px] font-medium text-ink hover:underline"
              >
                Ver las actividades de la obra
              </Link>
            </aside>
          )}
        </div>
      </div>
    </main>
  )
}
