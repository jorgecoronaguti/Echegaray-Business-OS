// ECONOMÍA DE UNA OBRA, EN ADMINISTRACIÓN — contrato, costo, certificación y margen.
//
// ═══ POR QUÉ ESTÁ ACÁ Y NO EN LA FICHA DE LA OBRA (23/09/2026) ═══
//
// El dueño: «saca economía de las obras». La ficha de `/obras/<obra>` es OPERACIÓN —cronograma,
// personal, pedidos, partes, papeles— y la plata no va ahí. Esta pantalla es la MISMA `TabEconomia`
// que era la sexta solapa, con sus mismos servicios y sus mismas acciones de certificado: no se
// reescribió nada, se cambió de área. La ficha de la obra la enlaza con un texto discreto al final
// de las solapas, sólo para quien ve el precio.
//
// ═══ QUIÉN ENTRA ═══
//
// `veEconomia()`: Dirección y Administración. Es la misma línea COSTO / PRECIO de `areas.ts`, y la
// base ya la cierra sola —`obra_economia`, `certificados_select` y `presupuestos` responden con
// null o cero filas a quien no ve economía—. Esto es la puerta; Postgres es la cerradura.
//
// Al jefe de obra NO se le dibuja una versión recortada: la solapa vieja se la dibujaba (costo sí,
// venta no) y el pedido del dueño fue sacar la economía de la obra, no repartirla. Su costo sigue
// donde lo tiene: Operación › Compras, y la línea de costo del Resumen lo manda ahí. Si un día
// vuelve a verla, `TabEconomia` ya sabe recortar por `veComercial` y esta página se lo pasa.
//
// ═══ LO QUE LEE ═══
//
// Lo mismo que leía la solapa, y sólo eso: `obra_panel` (para el título), el recorte `economia` de
// `obra_plan_vs_real` (ocho columnas, medido en `lecturasDeVista`), `obra_economia` y los
// certificados. Cuatro lecturas en un solo `Promise.all`; lo que admite fallo parcial pasa por el
// lector y el cartel de arriba dice qué no se pudo leer.

import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getPerfilActual } from '@/features/auth/services/authService'
import { veEconomia } from '@/features/auth/types/areas'
import { getEconomiaObra, getObra, getPlanDeEconomia } from '@/features/obras/services/obrasService'
import { getCertificados } from '@/features/obras/services/contratoService'
import { borrarCertificado, crearCertificado } from '@/features/obras/services/actionsContrato'
import { TabEconomia } from '@/features/obras/components/TabEconomia'
import { EfectivoEnManos } from '@/features/efectivo/components/EfectivoEnManos'
import { codigosDeObra } from '@/shared/services/codigosDeObra'
import { rotuloDeObra } from '@/shared/utils/obra'
import { Aviso } from '@/shared/components/ds'
import { AvisoDeLectura, EstadoError } from '@/shared/components/estado'
import { crearLector } from '@/shared/components/estado/lecturas'
import { Migas, PantallaV2, TituloDeFicha } from '@/shared/components/v2/segundoNivel'
import { clienteDeObra } from '../../../../../shared/clientes/nombre.ts'

export const dynamic = 'force-dynamic'

export default async function EconomiaDeObraPage({ params }: { params: Promise<{ obra: string }> }) {
  const { obra: obraId } = await params
  const supabase = await createClient()

  const [perfil, obraRes] = await Promise.all([getPerfilActual(supabase), getObra(supabase, obraId)])
  // SIN PERMISO ≠ SIN DATOS. La base le devolvería null y cero filas a un jefe de obra, y la
  // pantalla diría «nadie cargó el contrato» de una obra que lo tiene cargado: la explicación falsa
  // de una ausencia. Se dice lo que es, antes de pedir nada.
  if (!veEconomia(perfil.data?.rol ?? null)) {
    return (
      <PantallaV2 testid="economia-obra-sin-permiso">
        <div className="px-5 pt-5">
          <Aviso tono="info" testid="sin-permiso">Esta pantalla es de Dirección y Administración.</Aviso>
        </div>
      </PantallaV2>
    )
  }
  // NO EXISTE y NO PUDE LEER son dos cosas distintas, igual que en la ficha de la obra.
  if (obraRes.error) return <EstadoError mensaje={obraRes.error} que="la economía de la obra" />
  if (!obraRes.data) notFound()
  const obra = obraRes.data

  const lector = crearLector()
  const [planRes, economiaRes, certificadosRes, codigos] = await Promise.all([
    getPlanDeEconomia(supabase, obraId),
    getEconomiaObra(supabase, obraId),
    getCertificados(supabase, obraId),
    codigosDeObra(supabase, [obraId]),
  ])
  // El plan conserva su `null`: «esta obra no tiene línea base» es un hecho distinto de «no se pudo
  // leer el plan», y `TabEconomia` dice lo primero con sus palabras y lo segundo con el cartel.
  const plan = lector.leer<NonNullable<typeof planRes.data> | null>(planRes, null)
  const economia = lector.leer(economiaRes, null)
  const certificados = lector.leer(certificadosRes, [])
  const rotulo = rotuloDeObra({ nombre: obra.nombre, codigo: codigos.get(obraId) ?? null })

  return (
    <PantallaV2 testid="economia-obra">
      {/* «OBRAS / <obra> / Economía»: el chevron vuelve a la ficha de la obra, que es de donde se
          llega. El ámbito dice de dónde cuelga, no a dónde se va. */}
      <Migas volverA={`/obras/${obraId}`} ambito="Obras" padre={rotulo} actual="Economía" />
      <TituloDeFicha
        titulo={rotulo}
        bajada={clienteDeObra(obra) ?? 'sin cliente vinculado'}
      />
      <div className="px-5 pb-6 pt-4">
        {lector.falla() && (
          <div className="pb-3.5">
            <AvisoDeLectura mensaje={lector.falla() as string} que="parte de la economía" testid="economia-lectura-fallida" />
          </div>
        )}
        <TabEconomia
          plan={plan}
          economia={economia}
          certificados={certificados}
          // `.bind(null, obraId)` Y NO UNA ARROW: una arrow escrita acá es una función nueva creada
          // en el servidor y React la rechaza en el navegador. El id va en el `bind`, nunca en un
          // campo del formulario.
          crearCert={crearCertificado.bind(null, obraId)}
          borrarCert={borrarCertificado.bind(null, obraId)}
          veComercial={veEconomia(perfil.data?.rol ?? null)}
        />
        {/* D10 · efectivo en manos de esta obra: proyección aparte, no suma a consumido. */}
        <div className="pt-6"><EfectivoEnManos obra={obraId} /></div>
      </div>
    </PantallaV2>
  )
}
