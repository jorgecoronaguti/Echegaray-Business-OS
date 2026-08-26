// 23 v2 · PROVEEDOR FICHA — porte medido de `23 · Proveedor Ficha v2.dc.html`.
//
// ═══ QUÉ CAMBIÓ CONTRA LA VERSIÓN DE AGOSTO ═══
//
// La cabecera y las cajas. Antes: un `CabeceraFicha` blanco con avatar de iniciales y el nombre a
// 21px, una tira de métricas en celdas y un cuerpo de tarjetas (`TarjetaFicha`, borde y radio). El
// v2 abre con la MIGA —«← Proveedores / Hierros del Centro»—, pone el nombre a 24px con el CUIT
// debajo en mono, y dibuja las cifras y las listas sin ninguna caja: criterio 3 del patrón.
//
// Y las dos vistas (Resumen · Comprobantes) pasaron a ser CINCO caras, que es lo que el mockup
// declara: Compras · Nombres resueltos · Obras · Paquetes · Papeles. «Resumen» era una cara que
// mezclaba tres listas distintas en una sola pantalla y obligaba a bajar para encontrar cualquiera.
//
// ═══ DE DÓNDE SALEN LOS NÚMEROS, Y DE DÓNDE NO ═══
//
// De `costos_obra`, el espejo de la pestaña Compras. NO de `compras` ni de `compra_resumen`: las dos
// existen en Postgres y las dos tienen CERO filas (medido el 21/08/2026). Leerlas habría dado una
// ficha en blanco para los 40 proveedores, indistinguible de un proveedor al que nunca se le compró.
//
// ═══ EL TOTAL NO ES EL MISMO PARA TODOS, Y SE DICE ═══
//
// `costos_obra_select` filtra por `ve_obra_texto(obra_texto)`: un jefe de obra recibe sólo los
// comprobantes de SUS obras. El dueño autorizó que vea el costo de su obra (19/08), así que el
// importe se muestra — pero el rótulo deja de ser «lo que la empresa le compró» y pasa a ser «lo que
// le compraron tus obras». Publicar un total recortado sin decirlo sería peor que no mostrarlo.
//
// ═══ LAS DOS CIFRAS DEL MOCKUP QUE NO SE DIBUJAN ═══
//
//   SALDO       exige la cuenta corriente del proveedor —lo facturado contra lo pagado— y no existe
//               ninguna tabla que la lleve. Su lugar lo ocupa CONTRATADO, que sí sale de
//               `subcontrato` y contesta la otra mitad de «cuánto le debemos de acá en adelante».
//   CONTACTO    `public.proveedores` no tiene columna de contacto, teléfono, condición de IVA ni
//               plazo de pago. Dibujarlas en «sin cargar» promete un campo que el sistema no puede
//               guardar, y quien lo intentara no encontraría dónde.

import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getPerfilActual } from '@/features/auth/services/authService'
import { veEconomia } from '@/features/auth/types/areas'
import { getProveedor } from '@/features/administracion/services/proveedoresService'
import {
  getComprobantes, getNombresDelProveedor, getPaquetesDelProveedor,
} from '@/features/administracion/services/fichaProveedorService'
import {
  comprasPorObra, conceptosProvistos, resumirProveedor,
} from '@/features/administracion/services/fichaProveedor'
import { formatearCuit } from '@/features/administracion/services/identidad'
import {
  ComprasDelProveedor, NombresDelProveedor, ObrasDelProveedor, PaquetesDelProveedor,
  PapelesDelProveedor, QueProvee, RepartoPorObra,
} from '@/features/administracion/components/ListasProveedorV2'
import { Aviso } from '@/shared/components/ds'
import { EstadoError } from '@/shared/components/estado'
import { IconoEditar } from '@/shared/components/iconos'
import { RotuloPanel, V } from '@/shared/components/v2/patron'
import {
  AccionSecundaria, AvisoDeFicha, CifrasDeFicha, CostadoDeFicha, CuerpoDeFicha, DatoDeCostado,
  Migas, PastillaFilo, SolapasDeFicha, TituloDeFicha, type CifraDeFicha,
} from '@/shared/components/v2/segundoNivel'
import { pesos } from '@/shared/components/canon/formato'

export const dynamic = 'force-dynamic'

const CARAS = ['compras', 'nombres', 'obras', 'paquetes', 'papeles'] as const
type Cara = (typeof CARAS)[number]

const esCara = (v: unknown): v is Cara =>
  typeof v === 'string' && (CARAS as readonly string[]).includes(v)

const fecha = (f: string | null) => (f ? `${f.slice(8, 10)}/${f.slice(5, 7)}/${f.slice(0, 4)}` : null)

export default async function ProveedorFichaPage({ params, searchParams }: {
  params: Promise<{ proveedor: string }>
  searchParams: Promise<{ vista?: string }>
}) {
  const { proveedor: id } = await params
  const { vista } = await searchParams
  const cara: Cara = esCara(vista) ? vista : 'compras'
  const supabase = await createClient()

  const [ficha, perfil] = await Promise.all([getProveedor(supabase, id), getPerfilActual(supabase)])
  // NO SE PUDO LEER ≠ NO EXISTE. Confundirlos esconde un problema de permisos detrás de un 404 y
  // manda a buscar el defecto al lugar equivocado.
  if (ficha.error) return <EstadoError mensaje={ficha.error} que="la ficha del proveedor" />
  if (!ficha.data) notFound()
  const proveedor = ficha.data

  const [nombres, paquetes] = await Promise.all([
    getNombresDelProveedor(supabase, proveedor.id),
    getPaquetesDelProveedor(supabase, proveedor.id),
  ])
  const norms = (nombres.data ?? []).map((n) => n.nombre_norm)
  const lectura = await getComprobantes(supabase, norms)
  const filas = lectura.data?.filas ?? []

  const resumen = resumirProveedor(filas)
  const porObra = comprasPorObra(filas)
  // «Qué provee» ocupa el lugar que el mockup le da a CONTACTO, que no tiene columna en la base.
  // Un bloque vacío en el costado se lee como «no le compramos nada»; éste sale de los conceptos
  // que ya trajeron los comprobantes, sin una consulta más.
  const conceptos = conceptosProvistos(filas)
  const conceptosTotal = new Set(filas.map((f) => f.concepto?.trim()).filter(Boolean)).size
  const declarados = (nombres.data ?? []).reduce((a, n) => a + Number(n.comprobantes ?? 0), 0)
  const completo = veEconomia(perfil.data?.rol ?? null)
  // SIN NINGÚN PAQUETE CON PRECIO, «contratado» es AUSENCIA y no cero.
  const conPrecio = (paquetes.data ?? []).filter((p) => p.precio !== null)
  const contratado = conPrecio.length === 0 ? null : conPrecio.reduce((a, p) => a + (p.precio ?? 0), 0)
  const cuit = formatearCuit(proveedor.cuit)

  const href = (v: Cara) => `/administracion/proveedores/${proveedor.id}${v === 'compras' ? '' : `?vista=${v}`}`
  const panelDeEdicion = `/administracion/proveedores?p=${proveedor.id}`

  const cifras: CifraDeFicha[] = [
    {
      rotulo: completo ? 'Comprado · histórico' : 'Comprado en tus obras',
      valor: resumen.comprado === null ? null : pesos(resumen.comprado),
      falta: 'sin comprobantes',
    },
    { rotulo: 'Comprobantes', valor: resumen.comprobantes || null, falta: 'ninguno' },
    {
      rotulo: 'Contratado',
      valor: contratado === null ? null : pesos(contratado),
      falta: 'sin paquetes',
    },
    {
      rotulo: 'Sin imputar',
      valor: resumen.sinImputar || null,
      falta: 'ninguno',
      tono: 'neg',
    },
  ]

  return (
    <main className="flex min-h-screen flex-col" style={{ background: V.fondo }}>
      <Migas volverA="/administracion/proveedores" padre="Proveedores" actual={proveedor.nombre} />

      <TituloDeFicha
        titulo={proveedor.nombre}
        bajada={cuit ?? 'sin CUIT'}
        mono
        tonoBajada={cuit ? undefined : V.warn}
        junto={
          <>
            {/* «SUBCONTRATISTA» ES UN HECHO —tiene al menos un paquete en `subcontrato`— y por eso
                se dibuja. Su AUSENCIA no afirma lo contrario: `proveedores` no tiene columna de
                rubro, así que nadie puede decir «éste vende materiales». */}
            {(paquetes.data?.length ?? 0) > 0 && (
              <PastillaFilo title="Tiene al menos un paquete de subcontrato" testid="pastilla-tipo-proveedor">
                subcontratista
              </PastillaFilo>
            )}
            {!proveedor.activo && <PastillaFilo testid="pastilla-archivado">archivado</PastillaFilo>}
          </>
        }
        // NO HAY PRIMARIA AMARILLA. El mockup dibuja «Editar» de contorno y nada más: los
        // comprobantes entran por el cargador del Sheet o por Mattermost, no por esta pantalla, y un
        // botón amarillo que no lleva a ninguna parte gasta la única primaria en una promesa falsa.
        acciones={
          <AccionSecundaria
            href={panelDeEdicion} testid="editar-proveedor"
            icono={<IconoEditar className="h-[14px] w-[14px]" />}
          >
            Editar
          </AccionSecundaria>
        }
      />

      {/* EL AVISO ES UNO SOLO Y ES EL QUE MÁS DUELE. Dos filas ámbar arriba de la ficha compiten
          entre sí y ninguna se lee; el CUIT gana porque sin él la factura no se puede registrar. */}
      {!cuit && (
        <AvisoDeFicha verbo="Cargar CUIT" href={panelDeEdicion} testid="aviso-sin-cuit">
          Sin CUIT no se puede registrar la factura de este proveedor ni cruzarlo con ARCA.
        </AvisoDeFicha>
      )}
      {cuit && resumen.sinImputar > 0 && (
        <AvisoDeFicha tono="neg" verbo="Imputar" href="/administracion/pendientes" testid="aviso-sin-imputar">
          {resumen.sinImputar === 1
            ? 'Un comprobante suyo no tiene obra imputada: su costo no le pesa a ninguna obra.'
            : `${resumen.sinImputar} comprobantes suyos no tienen obra imputada: su costo no le pesa a ninguna obra.`}
        </AvisoDeFicha>
      )}

      <CifrasDeFicha cifras={cifras} testid="cifras-proveedor" />

      <SolapasDeFicha
        testid="vistas-proveedor"
        solapas={[
          { clave: 'compras', titulo: 'Compras', cuenta: resumen.comprobantes || null, activa: cara === 'compras', href: href('compras') },
          { clave: 'nombres', titulo: 'Nombres resueltos', cuenta: (nombres.data ?? []).length || null, activa: cara === 'nombres', href: href('nombres') },
          { clave: 'obras', titulo: 'Obras', cuenta: porObra.length || null, activa: cara === 'obras', href: href('obras') },
          { clave: 'paquetes', titulo: 'Paquetes', cuenta: (paquetes.data ?? []).length || null, activa: cara === 'paquetes', href: href('paquetes') },
          // SIN CONTADOR: no hay tabla que vincule un archivo con un proveedor, así que un 0 ahí
          // afirmaría que se contaron los papeles y no hay ninguno.
          { clave: 'papeles', titulo: 'Papeles', cuenta: null, activa: cara === 'papeles', href: href('papeles') },
        ]}
      />

      <CuerpoDeFicha>
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          {lectura.error && (
            <Aviso tono="neg" titulo="No pude leer los comprobantes de este proveedor">{lectura.error}</Aviso>
          )}
          {nombres.error && (
            <Aviso tono="neg" titulo="No pude leer los nombres vinculados">{nombres.error}</Aviso>
          )}
          {!completo && filas.length > 0 && (
            <p style={{ fontSize: '12px', color: V.apagado }} data-testid="alcance-jefe-obra">
              Estás viendo los comprobantes de las obras que tenés asignadas. Los totales de arriba
              son de esas obras, no de la empresa.
            </p>
          )}

          {cara === 'compras' && (
            <ComprasDelProveedor
              filas={filas} truncado={lectura.data?.truncado ?? false} total={declarados}
            />
          )}
          {cara === 'nombres' && (
            <NombresDelProveedor
              nombres={(nombres.data ?? []).map((n) => ({
                nombre_norm: n.nombre_norm,
                comprobantes: Number(n.comprobantes ?? 0),
                manual: n.via === 'resolucion_manual',
              }))}
            />
          )}
          {cara === 'obras' && <ObrasDelProveedor filas={porObra} />}
          {cara === 'paquetes' && (
            <PaquetesDelProveedor filas={paquetes.data ?? []} error={paquetes.error} />
          )}
          {cara === 'papeles' && <PapelesDelProveedor nombre={proveedor.nombre} />}
        </div>

        <CostadoDeFicha testid="costado-proveedor">
          <RotuloPanel>Identidad</RotuloPanel>
          <DatoDeCostado k="CUIT" v={cuit} falta="sin CUIT" mono testid="dato-cuit" />
          <DatoDeCostado k="Razón social" v={proveedor.razon_social?.trim() || null} falta="sin razón social" />
          <DatoDeCostado k="Estado" v={proveedor.activo ? 'Activo' : 'Archivado'} />
          <DatoDeCostado k="Primera compra" v={fecha(resumen.primera)} falta="sin registro" />
          <DatoDeCostado k="Última compra" v={fecha(resumen.ultima)} falta="nunca" />
          <DatoDeCostado
            k="Sin importe" v={resumen.sinImporte || null} falta="ninguno"
            testid="dato-sin-importe"
          />
          <DatoDeCostado k="Notas" v={proveedor.notas?.trim() || null} falta="sin notas" />

          <div style={{ marginTop: 22 }}>
            <RotuloPanel>Dónde se le compra</RotuloPanel>
          </div>
          <RepartoPorObra filas={porObra} />

          <div style={{ marginTop: 22 }}>
            <RotuloPanel cuenta={conceptosTotal || undefined}>Qué provee</RotuloPanel>
          </div>
          <QueProvee filas={conceptos} total={conceptosTotal} />

          {/* CONTACTO, CONDICIÓN DE IVA Y PLAZO DE PAGO NO SE DIBUJAN, y se dice una vez por qué.
              El mockup los pone en un bloque propio del costado; `public.proveedores` no tiene esas
              columnas, y un renglón en «sin cargar» promete un campo donde no hay dónde guardarlo. */}
          <p
            style={{ fontSize: '11px', lineHeight: 1.6, color: V.tenue, marginTop: 22, textWrap: 'pretty' }}
            data-testid="limites-ficha"
          >
            Contacto, teléfono, condición de IVA y plazo de pago no tienen columna en{' '}
            <code>proveedores</code>: no se dibujan porque no habría dónde guardarlos. Habilitación
            para entrar a obra y certificación de cada paquete tampoco existen como dato. Todo lo
            demás —lo comprado, a qué obras fue y su actividad— se DERIVA de los comprobantes;
            ningún total se guarda al lado de sus filas.
          </p>
        </CostadoDeFicha>
      </CuerpoDeFicha>
    </main>
  )
}
