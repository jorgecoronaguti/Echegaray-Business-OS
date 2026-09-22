// 23 v2 · PROVEEDOR FICHA — porte medido de `23 · Proveedor Ficha v2.dc.html`.
//
// ═══ QUÉ CAMBIÓ CONTRA LA VERSIÓN DE AGOSTO ═══
//
// La cabecera y las cajas. Antes: un `CabeceraFicha` blanco con avatar de iniciales y el nombre a
// 21px, una tira de métricas en celdas y un cuerpo de tarjetas (`TarjetaFicha`, borde y radio). El
// v2 abre con la MIGA —«← Proveedores / Hierros del Centro»—, pone el nombre a 24px con el CUIT
// debajo en mono, y dibuja las cifras y las listas sin ninguna caja: criterio 3 del patrón.
//
// Las caras: Compras · Nombres resueltos · Obras · Paquetes · Documentos. La «Papeles» del mockup, y
// la «Comprobantes» que la reemplazó por un día, salieron el 14/09/2026 por pedido del dueño: «quiero
// los comprobantes adjuntos al lado de cada compra hecha, tal como aparece en pestaña compras». El
// papel está en la columna derecha de la lista de compras, no en una lista aparte.
//
// «Documentos» no está en el mockup y se agregó el 09/09/2026: los contratos de subcontratistas no
// tenían dónde vivir en el OS. Es otro concepto que los comprobantes (ver `CARAS`).
//
// ═══ DE DÓNDE SALEN LOS NÚMEROS ═══
//
// De `proveedor_compra` (14/09/2026): cada fila de la réplica de Compras con el proveedor al que
// pertenece, por CUIT o —si la compra no trae CUIT— por nombre resuelto. Las cifras, el reparto por
// obra, «qué provee» y la lista salen de la MISMA lectura; antes salían de `costos_obra` por nombre, y
// esa cadena no ve las compras sin obra ni las que no pasaron por la resolución.
//
// ═══ EL TOTAL ES EL MISMO PARA TODOS LOS QUE ENTRAN ═══
//
// La vista hereda la policy de `compra_sheet` (`es_administracion()`: Dirección, Administración y
// Jefe de Obra), que es la misma que deja al jefe de obra ver la pantalla Compras entera. La ficha
// ya no recorta por obra —el recorte venía de `costos_obra`— y por eso el rótulo dejó de ser «en tus
// obras»: publicar un rótulo recortado sobre un total que no lo está sería peor que no aclararlo.
//
// ═══ LO DEL MOCKUP QUE NO SE DIBUJA ═══
//
//   SALDO       exige la cuenta corriente del proveedor —lo facturado contra lo pagado— y no existe
//               ninguna tabla que la lleve. Su lugar lo ocupa CONTRATADO, que sí sale de
//               `subcontrato` y contesta la otra mitad de «cuánto le debemos de acá en adelante».
//   IVA/PLAZO   `public.proveedores` no tiene condición de IVA ni plazo de pago. Dibujarlas en «sin
//               cargar» promete un campo que el sistema no puede guardar.
//
// ═══ CONTACTO SÍ SE DIBUJA DESDE EL 21/09/2026 ═══
//
// Pedido del dueño: «no tengo forma de agregar personas a los proveedores […] no puedo dejar asentado
// un nombre un contacto nada». Vive en `proveedor_contacto` (20260921T1000), la misma forma que
// `cliente_contacto`, y se dibuja con el MISMO bloque que la ficha del cliente, en el mismo lugar que
// el mockup le da: el costado, entre Identidad y «Dónde se le compra». Una persona por fila —el
// proveedor tiene quien vende, quien factura y quien cobra— y no una columna en `proveedores`.

import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getPerfilActual } from '@/features/auth/services/authService'
import { esAdministracion } from '@/features/auth/types/areas'
import { getProveedor } from '@/features/administracion/services/proveedoresService'
import {
  getNombresDelProveedor, getPaquetesDelProveedor,
} from '@/features/administracion/services/fichaProveedorService'
import {
  comprasPorObra, conceptosProvistos, resumirProveedor,
} from '@/features/administracion/services/fichaProveedor'
import { getComprasConPapel } from '@/features/administracion/services/comprobantesProveedorService'
import { getDeudaDeUnProveedor } from '@/features/administracion/services/deudaProveedoresService'
import {
  deudaDeLaFicha, tituloDeLaDeuda, tonoDeLaDeuda,
} from '@/features/administracion/services/deudaEnLaFicha'
import { getOpcionesDeObra } from '@/features/administracion/services/obraDeCompraService'
import {
  comoComprobantes, filtrosDeURL, SIN_OBRA, TODOS_LOS_ANIOS,
} from '@/features/administracion/services/comprobantesProveedor'
import { formatearCuit } from '@/features/administracion/services/identidad'
import { getDocumentosDelProveedor } from '@/features/administracion/services/documentosProveedorService'
import { getContactosDelProveedor } from '@/features/administracion/services/contactosProveedorService'
import { avisoSinTabla } from '@/features/administracion/services/contactosProveedor'
import {
  borrarContactoProveedor, crearContactoProveedor, editarContactoProveedor,
} from '@/features/administracion/services/contactosProveedorActions'
import { BloqueContactos, type TextosAgenda } from '@/features/clientes/components/BloqueContactos'
import {
  NombresDelProveedor, ObrasDelProveedor, PaquetesDelProveedor, QueProvee, RepartoPorObra,
} from '@/features/administracion/components/ListasProveedorV2'
import {
  ComprasDelProveedor, urlDeComprobantes,
} from '@/features/administracion/components/proveedores/ComprasDelProveedor'
import { DeudaDelProveedor } from '@/features/administracion/components/proveedores/DeudaDelProveedor'
import { DocumentosDelProveedor } from '@/features/administracion/components/proveedores/DocumentosDelProveedor'
import { getArchivosDeEntidad } from '@/features/documentos/services/carpetaDeEntidadService'
import { ArchivosDeDrive } from '@/features/documentos/components/ArchivosDeDrive'
import { Aviso } from '@/shared/components/ds'
import { EstadoError } from '@/shared/components/estado'
import { IconoEditar } from '@/shared/components/iconos'
import { RotuloPanel, V } from '@/shared/components/v2/patron'
import {
  AccionSecundaria, AvisoDeFicha, CifrasDeFicha, CostadoDeFicha, CuerpoDeFicha, DatoDeCostado,
  Migas, PastillaFilo, SolapasDeFicha, TituloDeFicha, type CifraDeFicha, PantallaV2,
} from '@/shared/components/v2/segundoNivel'
import { pesos } from '@/shared/components/canon/formato'

export const dynamic = 'force-dynamic'

// «DOCUMENTOS» NO ES SINÓNIMO DE COMPROBANTES: los comprobantes son los papeles de sus COMPRAS (viven
// en `compra_adjunto`, los mismos de Compras, y se ven al lado de cada compra); documentos es lo que
// Administración guardó contra esta ficha —contrato, póliza, habilitación, un video—. Juntarlos haría
// que dar de baja un contrato pareciera borrar una factura.
const CARAS = ['compras', 'nombres', 'obras', 'paquetes', 'documentos'] as const
type Cara = (typeof CARAS)[number]

const esCara = (v: unknown): v is Cara =>
  typeof v === 'string' && (CARAS as readonly string[]).includes(v)

/** Las caras retiradas. Hay enlaces viejos a las dos: abren la lista de compras, no un 404 mudo. */
const CARAS_RETIRADAS = new Set(['papeles', 'comprobantes'])

/** El año de hoy en San Juan: el 31/12 a las 22 h, UTC ya diría el año que viene. */
const anioDeHoy = () => Number(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/San_Juan', year: 'numeric' }).format(new Date()))

/** Las palabras de la agenda del proveedor. La forma del bloque es la del cliente. */
const TEXTOS_CONTACTOS: Partial<TextosAgenda> = {
  testid: 'contactos-proveedor',
  vacio: 'Sin contactos cargados.',
  rotuloRol: 'Rol o área',
  ejemploRol: 'comercial, administración, cobranzas',
  rotuloTelefono: 'Teléfono / WhatsApp',
  mailBloquea: false,
  conNotas: true,
}

type Consulta = {
  vista?: string; anio?: string; papel?: string; estado?: string; obra?: string
  /** Lo tipeado en el buscador. `n` es el nombre viejo del parámetro, que nunca se leyó bien. */
  q?: string; n?: string
  contacto?: string; accContacto?: string
}

/**
 * LA MISMA DIRECCIÓN CON UN CONTACTO ABIERTO —o cerrado—. Conserva la solapa y los filtros de
 * Compras: abrir la edición de un teléfono no puede tirar el año que la persona había elegido.
 */
function urlConContacto(base: string, sp: Consulta, cambios: Partial<Record<'contacto' | 'accContacto', string | null>>) {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries({ ...sp, ...cambios })) if (v) q.set(k, v)
  const s = q.toString()
  return s ? `${base}?${s}` : base
}

const fecha = (f: string | null) => (f ? `${f.slice(8, 10)}/${f.slice(5, 7)}/${f.slice(0, 4)}` : null)

export default async function ProveedorFichaPage({ params, searchParams }: {
  params: Promise<{ proveedor: string }>
  searchParams: Promise<Consulta>
}) {
  const { proveedor: id } = await params
  const sp = await searchParams
  const vista = sp.vista && CARAS_RETIRADAS.has(sp.vista) ? 'compras' : sp.vista
  const cara: Cara = esCara(vista) ? vista : 'compras'
  const supabase = await createClient()

  const [ficha, perfil] = await Promise.all([getProveedor(supabase, id), getPerfilActual(supabase)])
  // NO SE PUDO LEER ≠ NO EXISTE. Confundirlos esconde un problema de permisos detrás de un 404 y
  // manda a buscar el defecto al lugar equivocado.
  if (ficha.error) return <EstadoError mensaje={ficha.error} que="la ficha del proveedor" />
  if (!ficha.data) notFound()
  const proveedor = ficha.data

  // LAS COMPRAS LAS VE QUIEN VE COMPRAS: el mismo `esAdministracion` que corta esa pantalla. Otro rol
  // no llega a pedirlas, y su ficha dice por qué en vez de mostrar un proveedor sin compras.
  const veCompras = esAdministracion(perfil.data?.rol ?? null)
  const [nombres, paquetes, documentos, compras, opcionesObra, contactos, deudaLeida] = await Promise.all([
    getNombresDelProveedor(supabase, proveedor.id),
    getPaquetesDelProveedor(supabase, proveedor.id),
    getDocumentosDelProveedor(supabase, proveedor.id),
    veCompras ? getComprasConPapel(supabase, proveedor.id) : Promise.resolve(null),
    // EL MISMO DESPLEGABLE QUE COMPRAS, armado por la misma función: dos listas de obras válidas
    // serían dos definiciones de qué se puede elegir. Error de lectura ⇒ lista vacía ⇒ no se edita.
    veCompras && cara === 'compras' ? getOpcionesDeObra(supabase) : Promise.resolve([]),
    // LA AGENDA TIENE LA MISMA PUERTA QUE LA TABLA (`es_administracion()`). A otro rol la base le
    // devolvería cero filas sin error, y la ficha diría «sin contactos» de un proveedor que los tiene.
    veCompras ? getContactosDelProveedor(supabase, proveedor.id) : Promise.resolve(null),
    // ═══ LO QUE SE LE DEBE, EN EL MISMO VIAJE QUE TODO LO DEMÁS (dueño, 22/09/2026) ═══
    //
    // «Necesito q dentro de la ficha de cada proveedor pueda ver si tengo monto adeudado y cuanto,
    // son muchos clicks hasta llegar a ver algo y esta muy oculto en la ux». Estaba a tres clics y
    // en otra pantalla; ahora abre con la ficha, sin un clic más.
    //
    // Es la MISMA regla y la MISMA fuente que «A quién le debo» (`getDeudaDeUnProveedor` reusa
    // `deudaProveedores.ts` sobre `compra_sheet`): no hay una segunda consulta que pueda dar otro
    // número. La puerta también es la misma —`compra_sheet` es de Administración—, y por eso va
    // colgada de `veCompras`: a otro rol la base devolvería cero filas sin error y la ficha diría
    // «al día» de un proveedor al que se le deben millones.
    veCompras ? getDeudaDeUnProveedor(supabase, proveedor.id) : Promise.resolve(null),
  ])
  const filas = compras?.data ? comoComprobantes(compras.data.filas) : []

  const resumen = resumirProveedor(filas)
  const porObra = comprasPorObra(filas)
  const conceptos = conceptosProvistos(filas)
  const conceptosTotal = new Set(filas.map((f) => f.concepto?.trim()).filter(Boolean)).size
  // SIN NINGÚN PAQUETE CON PRECIO, «contratado» es AUSENCIA y no cero.
  const conPrecio = (paquetes.data ?? []).filter((p) => p.precio !== null)
  const contratado = conPrecio.length === 0 ? null : conPrecio.reduce((a, p) => a + (p.precio ?? 0), 0)
  const cuit = formatearCuit(proveedor.cuit)
  // NO SE PUDO MIRAR ≠ NO SE LE DEBE. Los dos casos que no son deuda llevan su motivo escrito, y
  // ninguno se dibuja como «$ 0» (regla de oro 2).
  const deuda = deudaDeLaFicha(
    deudaLeida?.data ?? null,
    !veCompras
      ? 'No puedo decir cuánto se le debe: los saldos salen de Compras, que es de Administración.'
      : deudaLeida?.error
        ? `No pude leer lo que se le debe: ${deudaLeida.error}`
        : null,
  )
  // El detalle comprobante por comprobante ya existe: es la fila de «A quién le debo» abierta.
  const deudaHref = deuda.clave
    ? `/administracion/proveedores?vista=deuda&d=${encodeURIComponent(deuda.clave)}`
    : null
  // ═══ EL PROVEEDOR TODAVÍA NO TIENE CARPETA EN DRIVE, Y LA FICHA LO DICE ═══
  //
  // En el Drive de la empresa NO EXISTEN carpetas por proveedor. Dónde va el papel de un proveedor
  // es una decisión abierta del dueño (PRP del puente), y hasta que la tome el bloque muestra
  // «carpeta desconocida» — que es el hecho, y hace visible la decisión pendiente.
  const archivosDrive = cara === 'documentos'
    ? await getArchivosDeEntidad(supabase, 'proveedor', proveedor.id)
    : null
  const anioActual = anioDeHoy()
  const filtros = filtrosDeURL(sp, anioActual)
  /**
   * ABRIR UNA OBRA ES FILTRAR LA LISTA DE COMPROBANTES, no abrir un panel aparte (dueño,
   * 22/09/2026). Va a la cara «Compras» —donde está la lista— con `anio=todos`, porque el monto que
   * la obra muestra es histórico y el default de la lista es el año en curso: sin esto, el monto de
   * arriba y la suma de abajo no cerrarían. El estado que ya estuviera puesto se conserva.
   */
  const hrefDeObra = (obra: string | null) =>
    urlDeComprobantes(proveedor.id, filtros, {
      anio: TODOS_LOS_ANIOS, obra: obra ?? SIN_OBRA, papel: 'todos', texto: null,
    }, anioActual)

  const href = (v: Cara) => `/administracion/proveedores/${proveedor.id}${v === 'compras' ? '' : `?vista=${v}`}`
  const panelDeEdicion = `/administracion/proveedores?p=${proveedor.id}`
  const base = `/administracion/proveedores/${proveedor.id}`

  const cifras: CifraDeFicha[] = [
    // ADEUDADO VA PRIMERO: es la pregunta con la que se abre esta ficha —«¿le debo algo?»— y el
    // único número de la tira que dispara una decisión (pagar o no pagar) en vez de describir el
    // pasado. `falta` dice «al día» o «sin leer»; nunca un cero.
    {
      rotulo: 'Adeudado',
      valor: deuda.estado === 'debe' ? pesos(deuda.total) : null,
      falta: deuda.estado === 'al-dia' ? 'al día' : 'sin leer',
      tono: tonoDeLaDeuda(deuda),
      titulo: tituloDeLaDeuda(deuda, deuda.hoyISO || 'hoy'),
    },
    {
      rotulo: 'Comprado · histórico',
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
    <PantallaV2>
      {/* «COMPRAS › PROVEEDORES › <nombre>» (dueño, 16/09/2026). Proveedores es una sección de
          Compras, y la ficha es lo único de este módulo que se abre por enlace directo desde el
          chat, desde una fila de Compras o desde el CRM: sin el ámbito, quien llega ahí ve la barra
          marcando «Compras» y no sabe por qué. El chevron sigue siendo UN solo enlace y vuelve a la
          lista, que es de donde se salió. */}
      <Migas
        volverA="/administracion/proveedores" ambito="Compras" padre="Proveedores"
        actual={proveedor.nombre}
      />

      <TituloDeFicha
        titulo={proveedor.nombre}
        bajada={cuit ?? 'sin CUIT'}
        mono
        tonoBajada={cuit ? undefined : V.warn}
        junto={
          <>
            {/* «SUBCONTRATISTA» ES UN HECHO —tiene al menos un paquete en `subcontrato`— y por eso
                se dibuja. Su AUSENCIA no afirma lo contrario. */}
            {(paquetes.data?.length ?? 0) > 0 && (
              <PastillaFilo title="Tiene al menos un paquete de subcontrato" testid="pastilla-tipo-proveedor">
                subcontratista
              </PastillaFilo>
            )}
            {!proveedor.activo && <PastillaFilo testid="pastilla-archivado">archivado</PastillaFilo>}
          </>
        }
        // NO HAY PRIMARIA AMARILLA. Los comprobantes entran por el cargador o por Mattermost, no por
        // esta cabecera; lo único que se hace acá con un papel es vincularlo desde su fila.
        acciones={
          <AccionSecundaria
            href={panelDeEdicion} testid="editar-proveedor"
            icono={<IconoEditar className="h-[14px] w-[14px]" />}
          >
            Editar
          </AccionSecundaria>
        }
      />

      {/* EL AVISO ES UNO SOLO Y ES EL QUE MÁS DUELE. */}
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

      {/* DE QUÉ ESTÁ HECHO EL NÚMERO DE ARRIBA: vencido, por vencer, sin fecha y desde cuándo. Va
          pegado a la cifra y antes de las solapas porque es lo que se mira para decidir un pago. */}
      <DeudaDelProveedor deuda={deuda} detalleHref={deudaHref} />

      <SolapasDeFicha
        testid="vistas-proveedor"
        solapas={[
          // EL CONTADOR ES LO LEÍDO, y sólo si se leyó: un 0 por error diría «no le compramos nada».
          { clave: 'compras', titulo: 'Compras', cuenta: compras?.data ? (compras.data.filas.length || null) : null, activa: cara === 'compras', href: href('compras') },
          { clave: 'nombres', titulo: 'Nombres resueltos', cuenta: (nombres.data ?? []).length || null, activa: cara === 'nombres', href: href('nombres') },
          { clave: 'obras', titulo: 'Obras', cuenta: porObra.length || null, activa: cara === 'obras', href: href('obras') },
          { clave: 'paquetes', titulo: 'Paquetes', cuenta: (paquetes.data ?? []).length || null, activa: cara === 'paquetes', href: href('paquetes') },
          {
            clave: 'documentos', titulo: 'Documentos',
            cuenta: documentos.error ? null : (documentos.data?.documentos.length || null),
            activa: cara === 'documentos', href: href('documentos'),
          },
        ]}
      />

      <CuerpoDeFicha>
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          {/* En «Compras» el error lo dice la lista; en las otras caras, arriba: las cifras vacías
              de un error de lectura no pueden leerse como un proveedor sin compras. */}
          {compras?.error && cara !== 'compras' && (
            <Aviso tono="neg" titulo="No pude leer las compras de este proveedor">{compras.error}</Aviso>
          )}
          {nombres.error && (
            <Aviso tono="neg" titulo="No pude leer los nombres vinculados">{nombres.error}</Aviso>
          )}

          {cara === 'compras' && !compras && (
            <Aviso tono="info">Las compras y sus comprobantes son de Administración.</Aviso>
          )}
          {cara === 'compras' && compras && (
            <ComprasDelProveedor
              proveedorId={proveedor.id} lectura={compras}
              filtros={filtros} anioActual={anioActual}
              opcionesObra={opcionesObra}
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
          {cara === 'obras' && <ObrasDelProveedor filas={porObra} hrefDe={compras ? hrefDeObra : undefined} />}
          {cara === 'paquetes' && (
            <PaquetesDelProveedor filas={paquetes.data ?? []} error={paquetes.error} />
          )}
          {cara === 'documentos' && (
            <DocumentosDelProveedor
              proveedorId={proveedor.id}
              documentos={documentos.data?.documentos ?? []}
              truncado={documentos.data?.truncado ?? false}
              error={documentos.error}
            />
          )}
          {cara === 'documentos' && archivosDrive && (
            <div style={{ marginTop: 32 }}>
              <ArchivosDeDrive
                datos={archivosDrive} tipo="proveedor" rol={perfil.data?.rol ?? null}
                testid="proveedor-archivos-drive"
              />
            </div>
          )}
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

          {/* CONTACTO — el lugar que le da el mockup, con el bloque de la ficha del cliente. */}
          {contactos && (
            <>
              <div style={{ marginTop: 22 }}>
                <RotuloPanel cuenta={contactos.estado === 'ok' ? contactos.contactos.length : undefined}>
                  Contacto
                </RotuloPanel>
              </div>
              {contactos.estado === 'ok' && (
                <BloqueContactos
                  contactos={contactos.contactos}
                  enEdicion={sp.contacto ?? null}
                  menuAbierto={sp.accContacto ?? null}
                  urlDe={(c) => urlConContacto(base, sp, { contacto: c })}
                  urlMenuDe={(c) => urlConContacto(base, sp, c ? { accContacto: c } : { accContacto: null, contacto: null })}
                  editar={(c) => editarContactoProveedor.bind(null, c)}
                  crear={crearContactoProveedor.bind(null, proveedor.id)}
                  borrar={borrarContactoProveedor}
                  textos={TEXTOS_CONTACTOS}
                />
              )}
              {contactos.estado === 'sin-tabla' && (
                <Aviso tono="info" testid="contactos-sin-tabla">{avisoSinTabla()}</Aviso>
              )}
              {contactos.estado === 'error' && (
                <Aviso tono="neg" titulo="No pude leer los contactos">{contactos.error}</Aviso>
              )}
            </>
          )}

          <div style={{ marginTop: 22 }}>
            <RotuloPanel>Dónde se le compra</RotuloPanel>
          </div>
          <RepartoPorObra filas={porObra} hrefDe={compras ? hrefDeObra : undefined} />

          <div style={{ marginTop: 22 }}>
            <RotuloPanel cuenta={conceptosTotal || undefined}>Qué provee</RotuloPanel>
          </div>
          <QueProvee filas={conceptos} total={conceptosTotal} />

          {/* CONDICIÓN DE IVA Y PLAZO DE PAGO NO SE DIBUJAN, y se dice una vez por qué. */}
          <p
            style={{ fontSize: '11px', lineHeight: 1.6, color: V.tenue, marginTop: 22, textWrap: 'pretty' }}
            data-testid="limites-ficha"
          >
            Condición de IVA y plazo de pago no tienen columna en <code>proveedores</code>: no se
            dibujan porque no habría dónde guardarlos. Habilitación
            para entrar a obra y certificación de cada paquete tampoco existen como dato. Todo lo
            demás —lo comprado, a qué obras fue y su actividad— se DERIVA de las compras; ningún
            total se guarda al lado de sus filas.
          </p>
        </CostadoDeFicha>
      </CuerpoDeFicha>
    </PantallaV2>
  )
}
