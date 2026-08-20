import { createClient } from '@/lib/supabase/server'
import { Aviso } from '@/shared/components/ds'
import { PageShell } from '@/shared/components/ui'
import { NavOperacion } from '@/features/integraciones/components/NavOperacion'
import { FuentesLista } from '@/features/integraciones/components/FuentesLista'
import { getIntegraciones } from '@/features/integraciones/services/integracionesService'
import type { Integracion } from '@/features/integraciones/types'

// OPERACIÓN · FUENTES — de dónde sale lo que muestran las otras tres vistas.
//
// ═══ POR QUÉ ESTA PANTALLA ES UNA VISTA DE OPERACIÓN Y NO UN MÓDULO APARTE ═══
//
// Pedidos, Herramientas y Movimientos leen tablas que ALGUIEN de afuera llena (el Sheet de AppSheet,
// el orquestador). La pregunta «¿esta lista está completa?» no se contesta mirando la lista: se
// contesta mirando si la fuente está viva y cuándo corrió por última vez. Por eso vive al lado, en
// la misma barra, y no en un módulo de administración que nadie abre cuando duda de un dato.
//
// ═══ QUÉ SE RETIRÓ, Y POR QUÉ ═══
//
// El rollup «Operación por obra» que estaba acá clasificaba las obras con su propia lista de
// ubicaciones (`NO_OBRA`: ALMACEN, TALLER, OFICINA…), una SEGUNDA definición de qué texto es una
// obra que convive con `obra_alias` —la canónica, la que usan `obra_costo_real`, la ficha de la obra
// y ahora estas tres listas—. Las dos daban cuentas distintas para la misma obra. Lo que contestaba
// («cuántas herramientas y pedidos tiene cada obra») lo contestan hoy Pedidos y Herramientas con la
// columna Obra resuelta por el diccionario canónico. El servicio sigue existiendo y `/control-obras`
// lo sigue usando: no se borró nada, se dejó de publicar el número duplicado.

export const dynamic = 'force-dynamic'

async function cargar(): Promise<{ error: string | null; integraciones: Integracion[] }> {
  try {
    const supabase = await createClient()
    const res = await getIntegraciones(supabase)
    if (res.error !== null) return { error: res.error, integraciones: [] }
    return { error: null, integraciones: res.data }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Error al conectar con Supabase', integraciones: [] }
  }
}

export default async function IntegracionesPage() {
  const { error, integraciones } = await cargar()
  const sinSesion = (error ?? '').toLowerCase().includes('permission denied')

  return (
    <PageShell
      title="Operación"
      subtitle="Dónde y cómo se conecta el OS con los sistemas de la empresa, y qué falta para desbloquear cada uno. El estado y la salud los escribe el propio OS."
    >
      <div className="space-y-5">
        <NavOperacion activa="fuentes" cuenta={error ? null : integraciones.length} />

        {error ? (
          <Aviso
            tono="neg"
            titulo={sinSesion ? 'No hay sesión: RLS bloquea la lectura del registro de fuentes.' : 'Supabase no respondió.'}
            testid="page-error"
          >
            {error}
          </Aviso>
        ) : (
          <FuentesLista integraciones={integraciones} />
        )}
      </div>
    </PageShell>
  )
}
