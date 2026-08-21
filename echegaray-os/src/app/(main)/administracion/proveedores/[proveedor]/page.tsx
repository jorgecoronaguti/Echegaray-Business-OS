// 23 · PROVEEDOR FICHA — la anatomía de una entidad: identidad · propiedades · relaciones · acciones.
//
// ═══ QUÉ CONTESTA ESTA PANTALLA ═══
//
// «¿Quién es este proveedor, cuánto le compramos, a qué obras fue y qué nos vende?» Hasta hoy eso
// vivía repartido entre un panel lateral de la cartera —que muestra el CUIT y poco más— y la
// pestaña Compras del Sheet. El panel sigue existiendo para elegir; la ficha es para entender.
//
// ═══ DE DÓNDE SALEN LOS NÚMEROS, Y DE DÓNDE NO ═══
//
// De `costos_obra`, el espejo de la pestaña Compras. NO de `compras` ni de `compra_resumen`: las
// dos existen en Postgres y las dos tienen CERO filas (medido el 21/08/2026). Leerlas habría dado
// una ficha en blanco para los 40 proveedores, indistinguible de un proveedor al que nunca se le
// compró — que es exactamente la confusión que la regla del NULL existe para evitar.
//
// ═══ EL TOTAL NO ES EL MISMO PARA TODOS, Y SE DICE ═══
//
// `costos_obra_select` filtra por `ve_obra_texto(obra_texto)`: un jefe de obra recibe sólo los
// comprobantes de SUS obras. El dueño autorizó que vea el costo de su obra (19/08), así que el
// importe se muestra — pero el titular deja de ser «lo que la empresa le compró» y pasa a ser «lo
// que le compraron tus obras». Publicar un total recortado sin decirlo sería peor que no mostrarlo.

import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getPerfilActual } from '@/features/auth/services/authService'
import { veEconomia } from '@/features/auth/types/areas'
import { getProveedor } from '@/features/administracion/services/proveedoresService'
import { getComprobantes, getNombresDelProveedor } from '@/features/administracion/services/fichaProveedorService'
import {
  comprasPorObra, conceptosProvistos, resumirProveedor,
} from '@/features/administracion/services/fichaProveedor'
import { formatearCuit } from '@/features/administracion/services/identidad'
import {
  ComprasPorObra, ConceptosProvistos, PropiedadesProveedor,
} from '@/features/administracion/components/ProveedorResumen'
import { TablaComprobantes } from '@/features/administracion/components/TablaComprobantes'
import { Aviso, BarraContexto, BotonEnlace, MetaContexto, Nulo, SubTabs } from '@/shared/components/ds'
import { EstadoError } from '@/shared/components/estado'
import { fecha, plataCorta } from '@/features/obras/components/formato'

export const dynamic = 'force-dynamic'

type Params = Promise<{ proveedor: string }>
type Query = Promise<{ vista?: string }>

export default async function ProveedorFichaPage({ params, searchParams }: { params: Params; searchParams: Query }) {
  const { proveedor: id } = await params
  const { vista: vistaCruda } = await searchParams
  const vista = vistaCruda === 'comprobantes' ? 'comprobantes' : 'resumen'
  const supabase = await createClient()

  const [ficha, perfil] = await Promise.all([getProveedor(supabase, id), getPerfilActual(supabase)])
  // NO SE PUDO LEER ≠ NO EXISTE. Confundirlos esconde un problema de permisos detrás de un 404 y
  // manda a buscar el defecto al lugar equivocado.
  if (ficha.error) return <EstadoError mensaje={ficha.error} que="la ficha del proveedor" />
  if (!ficha.data) notFound()
  const proveedor = ficha.data

  const nombres = await getNombresDelProveedor(supabase, proveedor.id)
  const norms = (nombres.data ?? []).map((n) => n.nombre_norm)
  const lectura = await getComprobantes(supabase, norms)
  const filas = lectura.data?.filas ?? []

  const resumen = resumirProveedor(filas)
  const porObra = comprasPorObra(filas)
  const conceptos = conceptosProvistos(filas)
  const conceptosTotal = new Set(filas.map((f) => f.concepto?.trim()).filter(Boolean)).size
  const declarados = (nombres.data ?? []).reduce((a, n) => a + Number(n.comprobantes ?? 0), 0)
  const completo = veEconomia(perfil.data?.rol ?? null)

  const href = (v?: string) =>
    `/administracion/proveedores/${proveedor.id}${v ? `?vista=${v}` : ''}`

  return (
    <main className="flex flex-col gap-5 pb-12">
      <BarraContexto
        volverA="/administracion/proveedores"
        volverLabel="Proveedores"
        titulo={proveedor.nombre}
        testid="slab-proveedor"
        // NO HAY PRIMARIA «CARGAR COMPROBANTE». El canónico la dibuja, pero los comprobantes entran
        // por el cargador del Sheet o por Mattermost, no por esta pantalla: un botón amarillo que
        // no lleva a ninguna parte gasta la única primaria del contexto en una promesa falsa. La
        // acción que sí existe es editar la ficha, y vive en el panel de la cartera.
        acciones={
          <BotonEnlace href={`/administracion/proveedores?p=${proveedor.id}`} data-testid="editar-proveedor">
            Editar
          </BotonEnlace>
        }
        meta={
          <>
            <MetaContexto rotulo="CUIT">
              {formatearCuit(proveedor.cuit) ?? 'sin CUIT'}
            </MetaContexto>
            {proveedor.razon_social?.trim() && (
              <MetaContexto rotulo="Razón social">{proveedor.razon_social}</MetaContexto>
            )}
            <MetaContexto rotulo="Estado">{proveedor.activo ? 'activo' : 'archivado'}</MetaContexto>
          </>
        }
        kpis={[
          {
            rotulo: completo ? 'Comprado' : 'Comprado en tus obras',
            valor: resumen.comprado === null ? null : plataCorta(resumen.comprado),
            falta: 'sin comprobantes',
          },
          { rotulo: 'Comprobantes', valor: resumen.comprobantes || null, falta: 'ninguno' },
          { rotulo: 'Última compra', valor: resumen.ultima ? fecha(resumen.ultima) : null, falta: 'nunca' },
          {
            rotulo: 'Sin imputar',
            valor: resumen.sinImputar || null,
            falta: 'ninguno',
            destacado: resumen.sinImputar > 0,
          },
        ]}
      />

      <div className="flex flex-col gap-5 px-4 lg:px-8">
        {lectura.error && (
          <Aviso tono="neg" titulo="No pude leer los comprobantes de este proveedor">{lectura.error}</Aviso>
        )}
        {nombres.error && (
          <Aviso tono="neg" titulo="No pude leer los nombres vinculados">{nombres.error}</Aviso>
        )}
        {!completo && filas.length > 0 && (
          <p className="text-[12px] text-muted" data-testid="alcance-jefe-obra">
            Estás viendo los comprobantes de las obras que tenés asignadas. Los totales de arriba
            son de esas obras, no de la empresa.
          </p>
        )}
        {resumen.sinImporte > 0 && (
          <p className="text-[12px] text-warn" data-testid="aviso-sin-importe">
            {resumen.sinImporte} {resumen.sinImporte === 1 ? 'comprobante llegó' : 'comprobantes llegaron'}{' '}
            sin importe. No suman cero al total: quedan afuera hasta que se cargue el monto.
          </p>
        )}

        <SubTabs
          testid="vistas-proveedor"
          items={[
            { href: href(), label: 'Resumen', activo: vista === 'resumen', testid: 'vista-resumen' },
            {
              href: href('comprobantes'), label: 'Comprobantes', cuenta: resumen.comprobantes,
              activo: vista === 'comprobantes', testid: 'vista-comprobantes',
            },
          ]}
        />

        <div className="flex flex-col gap-8 lg:flex-row lg:items-start lg:gap-10">
          <div className="flex min-w-0 flex-1 flex-col gap-8">
            {vista === 'resumen' ? (
              <>
                <ComprasPorObra filas={porObra} />
                <ConceptosProvistos filas={conceptos} total={conceptosTotal} />
              </>
            ) : (
              <TablaComprobantes
                filas={filas}
                truncado={lectura.data?.truncado ?? false}
                total={declarados}
              />
            )}
          </div>

          <PropiedadesProveedor
            filas={[
              { k: 'CUIT', v: formatearCuit(proveedor.cuit) ?? <Nulo>sin CUIT</Nulo> },
              { k: 'Razón social', v: proveedor.razon_social?.trim() || <Nulo>sin cargar</Nulo> },
              { k: 'Estado', v: proveedor.activo ? 'Activo' : 'Archivado' },
              { k: 'Primera compra', v: resumen.primera ? fecha(resumen.primera) : <Nulo>sin registro</Nulo> },
              { k: 'Comprobantes', v: resumen.comprobantes || <Nulo>ninguno</Nulo> },
              { k: 'Contacto', v: <Nulo>sin cargar</Nulo> },
              { k: 'Condición IVA', v: <Nulo>sin cargar</Nulo> },
              { k: 'Plazo de pago', v: <Nulo>sin acordar</Nulo> },
              { k: 'Notas', v: proveedor.notas?.trim() || <Nulo>sin notas</Nulo> },
            ]}
            nombres={(nombres.data ?? []).map((n) => ({
              nombre_norm: n.nombre_norm,
              comprobantes: Number(n.comprobantes ?? 0),
              manual: n.via === 'resolucion_manual',
            }))}
          />
        </div>

        {/* LAS TRES COSAS QUE ESTA FICHA TODAVÍA NO PUEDE CONTESTAR, DICHAS UNA VEZ. Repetir
            «sin cargar» en nueve propiedades explica qué falta; esto explica POR QUÉ. */}
        <p className="max-w-[760px] text-[11px] leading-relaxed text-faint" data-testid="limites-ficha">
          Contacto, condición de IVA y plazo de pago no tienen columna en <code>proveedores</code>:
          la ficha no los adivina. Los documentos del proveedor tampoco aparecen — no hay ninguna
          tabla que vincule un archivo de Drive con un proveedor, sólo con una persona o un cliente.
        </p>
      </div>
    </main>
  )
}
