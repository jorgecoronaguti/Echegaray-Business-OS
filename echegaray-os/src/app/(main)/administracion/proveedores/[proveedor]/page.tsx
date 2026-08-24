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
  comprasPorObra, conceptosProvistos, resumirProveedor, ultimosMovimientos,
} from '@/features/administracion/services/fichaProveedor'
import { formatearCuit } from '@/features/administracion/services/identidad'
import {
  ComprasPorObra, ConceptosProvistos, MovimientosProveedor, PropiedadesProveedor,
} from '@/features/administracion/components/ProveedorResumen'
import { TablaComprobantes } from '@/features/administracion/components/TablaComprobantes'
import { Aviso, Ayuda, BotonEnlace, Eyebrow, Nulo, SubTabs } from '@/shared/components/ds'
import {
  CabeceraFicha, HechoFicha, PastillaFicha, Punto, TiraMetricas,
} from '@/features/administracion/components/FichaCanonica'
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
    <main className="flex flex-col gap-3.5 pb-12">
      {/* LA CABECERA DEL CANÓNICO 23: blanca, con migaja, glifo de empresa, nombre a 21px, las
          pastillas de estado al lado y una sola primaria a la derecha. Las solapas van pegadas
          abajo, dentro de la misma franja, para que la activa se apoye sobre su filo. */}
      <CabeceraFicha
        testid="slab-proveedor"
        volverA="/administracion/proveedores"
        volverLabel="Proveedores"
        titulo={proveedor.nombre}
        avatar={
          <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-line bg-canvas text-muted" data-testid="glifo-proveedor">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
              <path d="M3 21h18M5 21V7l7-4 7 4v14" /><path d="M9 21v-5h6v5" /><path d="M9 10h.01M15 10h.01" />
            </svg>
          </span>
        }
        pastillas={
          <>
            <PastillaFicha tono={proveedor.activo ? 'pos' : 'neutro'} testid="pastilla-estado-proveedor">
              {proveedor.activo ? 'Activo' : 'Archivado'}
            </PastillaFicha>
            {/* EL CANÓNICO DIBUJA ADEMÁS UNA PASTILLA DE HABILITACIÓN («No habilitado») y otra de
                tipo («Subcontratista»). Ninguna de las dos tiene columna en `proveedores`: la
                habilitación depende de papeles que hoy no cuelgan de un proveedor, y el tipo no se
                carga en ningún lado. Se declaran abajo, en «Qué no puede contestar esta ficha». */}
          </>
        }
        hechos={
          <>
            <HechoFicha>{proveedor.razon_social?.trim() || 'sin razón social'}</HechoFicha>
            <Punto />
            <HechoFicha mono>{formatearCuit(proveedor.cuit) ?? 'sin CUIT'}</HechoFicha>
          </>
        }
        // NO HAY PRIMARIA «CARGAR COMPROBANTE». El canónico la dibuja, pero los comprobantes entran
        // por el cargador del Sheet o por Mattermost, no por esta pantalla: un botón amarillo que
        // no lleva a ninguna parte gasta la única primaria del contexto en una promesa falsa. La
        // acción que sí existe es editar la ficha, y vive en el panel de la cartera.
        acciones={
          <BotonEnlace href={`/administracion/proveedores?p=${proveedor.id}`} data-testid="editar-proveedor">
            Editar
          </BotonEnlace>
        }
        solapas={
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
        }
      />

      <div className="flex flex-col gap-3.5 px-4 lg:px-5">
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

        {/* LA TIRA DE MÉTRICAS DEL CANÓNICO 23. «Contratado», «Certificado» y «Cumplimiento» son de
            paquetes de subcontrato, que no existen como tabla: lo que esta ficha sí puede afirmar es
            lo comprado, sus comprobantes y qué quedó sin imputar. */}
        <TiraMetricas
          testid="metricas-proveedor"
          metricas={[
            {
              rotulo: completo ? 'COMPRADO' : 'COMPRADO EN TUS OBRAS',
              valor: resumen.comprado === null ? null : plataCorta(resumen.comprado),
              falta: 'sin comprobantes',
              detalle: porObra.length ? `en ${porObra.length} ${porObra.length === 1 ? 'obra' : 'obras'}` : undefined,
            },
            { rotulo: 'COMPROBANTES', valor: resumen.comprobantes || null, falta: 'ninguno' },
            {
              rotulo: 'ÚLTIMA COMPRA',
              valor: resumen.ultima ? fecha(resumen.ultima) : null,
              falta: 'nunca',
              detalle: resumen.primera ? `desde ${fecha(resumen.primera)}` : undefined,
            },
            {
              rotulo: 'SIN IMPUTAR',
              valor: resumen.sinImputar || null,
              falta: 'ninguno',
              tono: 'neg',
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

          {/* CONTACTO, CONDICIÓN DE IVA Y PLAZO DE PAGO SE FUERON DE ESTA LISTA (Design 23/08).
              `public.proveedores` no tiene esas columnas: dibujarlas en «sin cargar» promete un
              campo que el sistema no puede guardar, y quien lo intentara no encontraría dónde. Es
              el mismo criterio con el que `PanelProveedor` nunca las dibujó. Lo que falta se dice
              una vez, abajo, con el motivo — no nueve veces sin él. */}
          <PropiedadesProveedor
            filas={[
              { k: 'CUIT', v: formatearCuit(proveedor.cuit) ?? <Nulo>sin CUIT</Nulo> },
              { k: 'Razón social', v: proveedor.razon_social?.trim() || <Nulo>sin cargar</Nulo> },
              { k: 'Estado', v: proveedor.activo ? 'Activo' : 'Archivado' },
              { k: 'Primera compra', v: resumen.primera ? fecha(resumen.primera) : <Nulo>sin registro</Nulo> },
              { k: 'Comprobantes', v: resumen.comprobantes || <Nulo>ninguno</Nulo> },
              { k: 'Notas', v: proveedor.notas?.trim() || <Nulo>sin notas</Nulo> },
            ]}
            nombres={(nombres.data ?? []).map((n) => ({
              nombre_norm: n.nombre_norm,
              comprobantes: Number(n.comprobantes ?? 0),
              manual: n.via === 'resolucion_manual',
            }))}
          >
            <MovimientosProveedor
              filas={ultimosMovimientos(filas)}
              total={resumen.comprobantes}
              verTodoHref={href('comprobantes')}
            />

            {/* DOCUMENTOS — el cuarto bloque de la anatomía del aside. Está vacío y se dice por qué:
                un bloque ausente se lee como «este proveedor no tiene papeles», que es una
                afirmación sobre el mundo que esta pantalla no puede hacer. */}
            <section className="mt-6" data-testid="documentos-proveedor">
              <Eyebrow className="mb-1.5">Documentos</Eyebrow>
              <p className="text-[12px] leading-relaxed text-muted">
                Ninguna tabla vincula un archivo con un proveedor: hoy los documentos cuelgan de una
                persona o de un cliente. Esta ficha no puede decir si tiene los papeles al día.
              </p>
            </section>
          </PropiedadesProveedor>
        </div>

        <Ayuda titulo="Qué no puede contestar esta ficha" testid="limites-ficha">
          Habilitación para entrar a obra, tipo de proveedor (material o subcontratista), paquetes
          contratados y su certificación NO existen como dato: no hay tabla que los guarde, así que
          el canónico los dibuja y esta ficha no los puede afirmar. Contacto, condición de IVA y
          plazo de pago tampoco tienen columna en <code>proveedores</code>,
          así que no se dibujan: prometerían un campo donde no hay dónde guardarlo. Todo lo demás
          —lo comprado, a qué obras fue, qué provee y su actividad— se DERIVA de los comprobantes;
          ningún total se guarda al lado de sus filas.
        </Ayuda>
      </div>
    </main>
  )
}
