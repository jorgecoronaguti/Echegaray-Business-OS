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
// ═══ EL SERVIDOR TRAE, EL CLIENTE ELIGE (Design canónico 23/08) ═══
//
// Acá sólo se lee y se atan las acciones. Elegir un paquete, buscarlo y filtrarlo pasó a
// `WorkspaceSubcontratos`, del lado del cliente: los paquetes viajan enteros en el primer render y
// cada clic era un render completo de una ruta `force-dynamic` para mostrar datos que ya estaban en
// el navegador. `?sel=` sigue existiendo y sigue abriendo el mismo paquete — el workspace lo espeja
// con `replaceState`.
//
// ═══ LO QUE ESTA PANTALLA NO INVENTA ═══
//
// El costo de hacer el paquete con gente propia. El comparador deja la celda vacía con su motivo:
// el análisis de costo por actividad todavía no existe en el modelo, y completarla con una
// estimación convertiría la comparación —que es la decisión de subcontratar o no— en un número
// fabricado con apariencia de cálculo.

import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getObra } from '@/features/obras/services/obrasService'
import { getPerfilActual } from '@/features/auth/services/authService'
import { veEconomia } from '@/features/auth/types/areas'
import { getSubcontratos } from '@/features/obras/services/subcontratosService'
import {
  agregarPersonaExterna, cambiarEstadoPaquete, crearPaquete, fijarPrecioPaquete, registrarAporte,
  registrarDocumento,
} from '@/features/obras/services/actionsSubcontratos'
import { CabeceraDeObra } from '@/features/obras/components/CabeceraDeObra'
import { SubNavTrabajo } from '@/features/obras/components/SubNavTrabajo'
import { WorkspaceSubcontratos } from '@/features/obras/components/WorkspaceSubcontratos'
import { FormNuevoPaquete } from '@/features/obras/components/FormNuevoPaquete'
import { Aviso } from '@/shared/components/ds'
import { EstadoError } from '@/shared/components/estado'
import Link from 'next/link'
import { C } from '@/features/obras/components/canon/tokens'
import { hrefEconomia } from '@/features/obras/services/vistasObra'

export const dynamic = 'force-dynamic'

export default async function SubcontratosObraPage({
  params, searchParams,
}: {
  params: Promise<{ obra: string }>
  searchParams: Promise<{ sel?: string; nuevo?: string }>
}) {
  const { obra: obraId } = await params
  const { sel, nuevo } = await searchParams
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


  return (
    // LA MISMA CABECERA QUE EL WORKSPACE (24/08 · C-CANON §12). La banda grafito propia hacía de
    // esta pantalla otra aplicación, y desde acá no se podía saltar a otra solapa de la obra.
    <main className="min-h-screen bg-surface pb-10">
      {/* LA BANDA VA DE BORDE A BORDE (mockups 02/03/05/06): el aire de 20px es
          suyo, adentro. Envuelta en el padding de la página quedaba flotando. */}
      <>
        <CabeceraDeObra
          obraId={obraId}
          obra={obra}
          // Subcontratos ES Trabajo (contrato 10): un paquete es una porción del alcance de
          // actividades que ya existen, mirado desde el lado del tercero que lo ejecuta.
          vistaActiva="tareas"
          // LA CABECERA ES LA MISMA QUE EN LAS SOLAPAS (dueño, 23/09/2026): título 21, sin rótulo de
          // pantalla ni cifras propias.
          titulo={21}
          enlazarCliente={economia}
          economiaHref={economia ? hrefEconomia(obraId) : null}
          // LA PRIMARIA DEL 07 VA EN LA CABECERA, a la derecha del título: «Nuevo paquete» de 32px.
          // Abre el alta (una sola definición: `FormNuevoPaquete`) por `?nuevo=1`.
          acciones={
            <Link href={`/obras/${obraId}/subcontratos?nuevo=1`} prefetch={false} data-testid="nuevo-paquete" style={{
              height: '32px', padding: '0 14px', borderRadius: '6px', background: C.marca, color: C.grafito, fontSize: '13px',
              fontWeight: 600, display: 'inline-flex', alignItems: 'center', textDecoration: 'none',
            }}>Nuevo paquete</Link>
          }
        />
      </>

      {/* Nivel 3: las CUATRO del 07 (Tareas · Cronograma · Parte diario · Subcontratos), emitidas en
          un solo lugar. */}
      <SubNavTrabajo obraId={obraId} sub="subcontratos" />

      {data.avisos.length > 0 && (
        <div className="flex flex-col gap-3 px-4 pt-4 lg:px-[30px]">
          {data.avisos.map((a) => (
            <Aviso key={a} tono="warn" titulo="Falta parte de esta pantalla" testid="aviso-lectura">
              {a}
            </Aviso>
          ))}
        </div>
      )}

      <>
        <WorkspaceSubcontratos
          paquetes={data.paquetes}
          economia={economia}
          obraId={obraId}
          selInicial={sel ?? null}
          nuevoInicial={nuevo === '1'}
          formularioNuevo={
            <FormNuevoPaquete
              actividades={data.actividades}
              economia={economia}
              accion={crearPaquete.bind(null, obraId)}
            />
          }
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
      </>
    </main>
  )
}
