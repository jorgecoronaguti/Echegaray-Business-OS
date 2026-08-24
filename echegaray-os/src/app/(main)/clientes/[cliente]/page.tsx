// 01 OBRAS · EL RECORD DEL CLIENTE — todo en una pantalla.
//
// ═══ QUÉ CAMBIÓ Y POR QUÉ (19/08/2026) ═══
//
// Había cinco solapas: Información, Contactos, Obras, Actividad, Documentos. El dueño:
// *"CLIENTE = RECORD PRINCIPAL. Dentro veo: propiedades; actividad; contactos asociados; obras
// asociadas; documentos asociados."* Y el principio que lo ordena todo: **el record no puede quedar
// detrás de una solapa.**
//
// El defecto de las solapas no era estético. «¿Este cliente tiene el contrato cargado y quién es el
// contacto que hay que llamar?» son dos solapas y dos viajes al servidor, y en el medio se olvida lo
// que se vio en la primera. Con las cinco caras a la vista, la pregunta se contesta mirando.
//
// ═══ LO QUE ESTO CUESTA, DICHO ═══
//
// Antes se leía SÓLO la solapa abierta. Ahora se lee todo, en paralelo, en una sola vuelta. Es más
// trabajo por apertura y es el precio del record; se compensa recortando lo que se DIBUJA —la
// actividad y los documentos muestran los últimos, con el total al lado y el resto a un clic—, que
// es lo que hace que una ficha con 214 documentos siga siendo una pantalla.
//
// ═══ LO QUE EL CANÓNICO 26 AGREGA, Y LA SOLAPA QUE NO VUELVE (Design 23/08/2026) ═══
//
// El canónico dibuja la anatomía de ficha de entidad: **slab de identidad grafito con filo
// amarillo**, **solapas con contador mono**, **resumen de 3–4 métricas** y **aside** con
// propiedades, contactos, actividad y documentos. El aside ya estaba; lo que faltaba era el slab con
// sus métricas y el índice, y son este trabajo.
//
// LAS MÉTRICAS VAN DENTRO DEL SLAB, no en una fila aparte: es donde las pone `slab-proveedor`, que
// usa el MISMO componente, y `COMPONENTS.md` exige que las cinco fichas se vean iguales. El canónico
// las dibuja abajo; ganó la consistencia entre fichas sobre el calco de un mockup.
//
// LAS SOLAPAS SON UN ÍNDICE, NO UNA PARTICIÓN, y es una desviación deliberada. El canónico las
// dibuja como nivel 2 con una vista por solapa; su solapa por defecto («Resumen») muestra igual
// todas las caras a la vez. Acá se conserva la regla que el dueño fijó el 19/08 —*"el record no
// puede quedar detrás de una solapa"*—, así que el índice CUENTA y LLEVA a cada bloque, y ninguno
// se esconde. Partir el record rompería además el caso que lo motivó: «¿tiene el contrato cargado y
// a quién llamo?» son dos solapas y dos viajes al servidor.
//
// ═══ EL ESTADO VIAJA EN LA URL, NO EN EL NAVEGADOR ═══
//
// `?editar=1` abre el formulario de la ficha, `?contacto=<id>` el de un contacto, `?archivadas=1`
// suma las obras cerradas, `?actividad=todo` y `?documentos=todo` despliegan sus bloques. Cada
// estado es una dirección compartible y el botón «atrás» hace lo que se espera. Los `?vista=…` que
// alguien haya compartido siguen abriendo: el parámetro ya no significa nada y el record se ve
// entero, que es más de lo que ese enlace prometía.
//
// FRONTERA: el cliente CONSOLIDA, no administra. El contratado y el costo real salen de `obra_panel`
// —o sea, de Compras y de Cotización—. Acá no se calcula ni se guarda un número propio.

import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getPerfilActual } from '@/features/auth/services/authService'
import { esAdministracion, veEconomia as puedeVerEconomia } from '@/features/auth/types/areas'
import {
  getActividadCliente, getCliente, getContactos, getDocumentosCliente, getObrasDelCliente, getResponsables,
} from '@/features/clientes/services/clientesService'
import {
  archivarCliente, borrarContacto, crearContacto, crearNota, editarCliente, editarContacto,
} from '@/features/clientes/services/actions'
import {
  clasificarDocumentoCliente, desvincularDocumentoCliente, vincularCarpetaCliente, vincularDocumentoCliente,
} from '@/features/clientes/services/actionsDocumentos'
import { crearObra } from '@/features/obras/services/actions'
import { Bloque } from '@/features/clientes/components/Bloque'
import { BloqueActividad } from '@/features/clientes/components/BloqueActividad'
import { BloqueContactos } from '@/features/clientes/components/BloqueContactos'
import { BloqueDocumentos } from '@/features/clientes/components/BloqueDocumentos'
import { BloqueInformacion } from '@/features/clientes/components/BloqueInformacion'
import { BloqueObras } from '@/features/clientes/components/BloqueObras'
import { Aviso, BarraContexto, BotonEnlace, MetaContexto, Num, SubTabs } from '@/shared/components/ds'
import { EstadoError } from '@/shared/components/estado'
import { crearLector } from '@/shared/components/estado/lecturas'
import { PageShell } from '@/shared/components/ui'
import { money } from '@/shared/utils/format'

export const dynamic = 'force-dynamic'

/** Quién puede ver certificaciones, facturaciones y cobranzas. Es un ESPEJO del predicado
 *  `es_administracion()` de la RLS, y sirve sólo para explicar la ausencia: quien decide sigue
 *  siendo Postgres, que devuelve cero filas. Sin este aviso, la actividad de un jefe de obra
 *  mostraría una historia recortada como si fuera toda la historia. */
const VE_CONTRACTUALES = ['direccion', 'administracion']

type Params = { cliente: string }
type Query = {
  contacto?: string; editar?: string; archivadas?: string; actividad?: string; documentos?: string
}

export default async function ClientePage({
  params, searchParams,
}: {
  params: Promise<Params>
  searchParams: Promise<Query>
}) {
  const { cliente: slug } = await params
  const q = await searchParams

  const supabase = await createClient()
  const { data: cliente, error } = await getCliente(supabase, slug)
  // NO EXISTE y NO PUEDO LEER son dos cosas distintas: confundirlas escondió un defecto de permisos
  // detrás de un «página no encontrada» durante horas.
  if (error) {
    // El cartel COMPARTIDO: diagnostica el mensaje de la base (permisos, sesión, no se llegó),
    // ofrece Reintentar y dice desde cuándo no hay dato bueno de esta ficha.
    return <EstadoError mensaje={error} que="la ficha del cliente" />
  }
  if (!cliente) notFound()

  const id = cliente.cliente_id

  // ═══ CONSULTAR NO ES ADMINISTRAR ═══
  //
  // El dueño: *"Un usuario Obras debe poder consultar clientes, contactos, personas, proveedores…
  // VER INFORMACIÓN OPERATIVA ≠ ADMINISTRAR EL MAESTRO."* El record se abre para las dos áreas y los
  // formularios de escritura sólo se dibujan para Administración. No es la cerradura —la RLS rechaza
  // la escritura igual—, es no ofrecer un botón que la base va a rechazar.
  //
  // ═══ EL PREDICADO VOLVIÓ A SER `esAdministracion` — PORQUE LA BASE SE MOVIÓ (20/08/2026) ═══
  //
  // Historia corta de un día: el 19/08 `esAdministracion()` incorporó al jefe de obra, pero
  // `clientes_write`, `cliente_contacto_write`, `cliente_documento_write` y `obra_canonica_write`
  // se quedaron con la lista literal `('direccion','administracion')`. La pantalla le ofrecía cinco
  // formularios que la base rechazaba con 403, así que a la mañana se acotó acá a `veEconomia`.
  //
  // Esa fue la corrección correcta MIENTRAS la base decía que no: no se abre un permiso desde el
  // frontend. A la tarde el dueño resolvió la contradicción del lado que corresponde —
  // `20260820T5000` mueve las cuatro policies a `es_administracion()`— y entonces la pantalla
  // vuelve a lo que el modelo dice. Medido con el token del jefe después de la migración:
  // `POST /clientes` → 201, `PATCH` → escribe.
  //
  // La lección, que es la que importa: el predicado de pantalla SIGUE a la policy, nunca al revés.
  const rol = (await getPerfilActual(supabase)).data?.rol ?? null
  const puedeEditar = esAdministracion(rol)
  // EL PRECIO NO ES DE TODOS: el jefe de obra no ve contratado. Decide la RLS; acá sólo se deja de
  // dibujar la métrica, para no mostrarle un rótulo económico vacío y que parezca un error.
  const veEconomia = puedeVerEconomia(rol)

  // Las cinco caras del record, en una sola vuelta. Secuencial, cada una sumaría su latencia a la
  // apertura de una pantalla que antes mostraba una sola.
  const [responsables, contactos, obras, linea, documentos] = await Promise.all([
    puedeEditar ? getResponsables(supabase) : Promise.resolve({ data: [], error: null }),
    getContactos(supabase, id),
    getObrasDelCliente(supabase, id),
    getActividadCliente(supabase, id),
    getDocumentosCliente(supabase, id),
  ])
  // ESTAS CINCO LECTURAS SE LEÍAN CON `?? []`: si la de obras fallaba, la ficha decía que el cliente
  // no tiene obras. Sobre un cliente eso es una afirmación comercial, sacada de un fallo de la base.
  // La ficha se sigue dibujando —el resto de los bloques sirve—, pero con el cartel de qué faltó.
  const lector = crearLector()

  const conArchivadas = q.archivadas === '1'
  const todas = lector.leer(obras, [])
  const cerradas = todas.filter((o) => o.estado === 'cerrada')

  /** La misma dirección con un parámetro cambiado. Los demás se preservan: desplegar la actividad
   *  no puede cerrar el contacto que alguien tenía abierto tres bloques más abajo. */
  const url = (cambio: Partial<Record<keyof Query, string | null>>) => {
    const p = new URLSearchParams(
      Object.entries({ ...q, ...cambio }).filter(([, v]) => v != null && v !== '') as [string, string][],
    )
    const s = p.toString()
    return `/clientes/${slug}${s ? `?${s}` : ''}`
  }

  const enCurso = todas.filter((o) => o.estado === 'activa')
  // El contratado de las obras que HOY se están ejecutando. Sale de las obras ya leídas: es la misma
  // fuente que la tabla de abajo, así que la métrica y la tabla no pueden discrepar.
  const conMontoEnCurso = enCurso.filter((o) => o.monto_contratado != null)

  return (
    <PageShell
      title={cliente.nombre_comercial}
      // EL ENCABEZADO LO TRAE EL SLAB (`COMPONENTS.md` §Anatomía de ficha de entidad): dejar también
      // el de `PageShell` daría dos `h1` con el mismo nombre a 60px de distancia.
      encabezado={false}
    >
      {/* EL SLAB DE IDENTIDAD, con el MISMO componente que la ficha del proveedor (`slab-proveedor`).
          `COMPONENTS.md`: *"Cliente, Proveedor, Persona, Obra y Herramienta usan la MISMA
          estructura"*. Escribir uno propio para el cliente habría garantizado que el tercero lo
          copie con otro radio y otro gris — que es cómo `NavAdministracion` terminó dibujando su
          barra de solapas tres veces.

          LA MIGA DE PAN vive adentro del slab: «01 · Obras · Clientes» contradecía a la barra de
          Administración que corona la pantalla y repetía en tres niveles lo que esa barra ya dice. */}
      <div className="mb-6 -mx-4 lg:-mx-10">
        <BarraContexto
          testid="slab-cliente"
          volverA="/clientes"
          volverLabel="Clientes"
          titulo={cliente.nombre_comercial}
          meta={
            <>
              {/* EL CUIT EN MONO TABULAR: es un número que se compara contra ARCA y contra el banco,
                  y en proporcional los dígitos no se alinean con nada. La ausencia va en texto
                  normal porque no es un número — escribirla en mono la disfraza de dato. */}
              <MetaContexto rotulo="CUIT">
                {cliente.cuit ? <Num className="text-[11.5px]">{cliente.cuit}</Num> : 'sin cargar'}
              </MetaContexto>
              <MetaContexto rotulo="Razón social">{cliente.razon_social ?? 'sin cargar'}</MetaContexto>
              <MetaContexto rotulo="Responsable">{cliente.responsable_nombre ?? 'sin asignar'}</MetaContexto>
              {/* ARCHIVADO GANA SOBRE EL RESTO: es la razón por la que esta ficha no aparece en la
                  cartera, y saberlo cambia lo que se hace con ella. */}
              <MetaContexto rotulo="Estado">
                {!cliente.activo
                  ? 'archivado'
                  : enCurso.length > 0
                    ? `${enCurso.length} ${enCurso.length === 1 ? 'obra' : 'obras'} en curso`
                    : 'sin obra en curso'}
              </MetaContexto>
            </>
          }
          // EL RESUMEN DE 3–4 MÉTRICAS, en el slab y no en una fila de tarjetas: es donde lo pone la
          // ficha del proveedor, y `COMPONENTS.md` §Cuándo NO usar panel prohíbe envolver un valor
          // con su rótulo en una caja. Ninguna se inventa: obras y contratado salen de las obras ya
          // leídas —misma fuente que la tabla de abajo, así que no pueden discrepar—, contactos y
          // documentos de sus propias listas.
          kpis={[
            {
              rotulo: 'Obras',
              valor: todas.length || null,
              falta: 'ninguna cargada',
            },
            ...(veEconomia
              ? [{
                rotulo: 'Contratado en curso',
                // NADIE CARGÓ EL MONTO ≠ CONTRATADO $ 0. Con obras en curso sin monto, la métrica lo
                // dice en vez de publicar un cero que se leería como «trabajamos gratis».
                valor: conMontoEnCurso.length
                  ? money(conMontoEnCurso.reduce((s, o) => s + (o.monto_contratado ?? 0), 0))
                  : null,
                falta: enCurso.length ? 'sin monto cargado' : 'sin obra en curso',
              }]
              : []),
            { rotulo: 'Contactos', valor: lector.leer(contactos, []).length || null, falta: 'ninguno' },
            { rotulo: 'Documentos', valor: lector.leer(documentos, []).length || null, falta: 'ninguno' },
          ]}
          acciones={puedeEditar && (
            // UNA SOLA ACCIÓN EN EL SLAB. El canónico pone acá la primaria «Nueva obra»; en esta
            // pantalla esa alta ES un formulario que vive dentro del bloque Obras (`alta-obra`), y un
            // segundo botón con el mismo nombre daría dos entradas a la misma escritura. Queda
            // declarado como desviación: la primaria del objeto está en su bloque, no en el slab.
            <BotonEnlace
              href={url({ editar: q.editar === '1' ? null : '1' })}
              data-testid="editar-ficha"
            >{q.editar === '1' ? 'Cerrar edición' : 'Editar'}</BotonEnlace>
          )}
        />
      </div>

      {/* EL ÍNDICE DEL RECORD — «solapas con contador mono» del canónico, sin partir el record.
          Cada una lleva a su bloque, que está a la vista más abajo: cuenta y ubica, no esconde. */}
      <div className="mb-6">
        <SubTabs
          // `scroll` va en `true` porque estos `href` son ANCLAS: con el default (`false`) el índice
          // se dibujaba entero y al tocarlo no pasaba nada.
          scroll
          testid="indice-record"
          items={[
            { href: '#panel-informacion', label: 'Información', cuenta: null, testid: 'indice-informacion' },
            { href: '#bloque-actividad', label: 'Actividad', cuenta: lector.leer(linea, { eventos: [], sinFecha: 0 }).eventos.length, testid: 'indice-actividad' },
            { href: '#bloque-obras', label: 'Obras', cuenta: todas.length, testid: 'indice-obras' },
            { href: '#bloque-contactos', label: 'Contactos', cuenta: lector.leer(contactos, []).length, testid: 'indice-contactos' },
            { href: '#bloque-documentos', label: 'Documentos', cuenta: lector.leer(documentos, []).length, testid: 'indice-documentos' },
          ]}
        />
      </div>

      {lector.falla() && (
        <div className="mb-5" data-testid="cliente-lectura-fallida">
          <Aviso tono="neg" titulo="Parte de esta ficha no se pudo leer">
            Lo que falta abajo NO significa que no exista: significa que la consulta falló. {lector.falla()}
          </Aviso>
        </div>
      )}

      {!cliente.activo && (
        <div className="mb-5" data-testid="cliente-archivado">
          {/* QUE ESTÁ ARCHIVADO ya lo dice el slab. Lo que el slab no puede decir es cómo se
              deshace, y ésa es la única frase que queda. */}
          <Aviso tono="info">Se reactiva desde el panel de información.</Aviso>
        </div>
      )}

      {/* EL RECORD. En el teléfono es UNA columna y las propiedades van primero —quién es este
          cliente antes que qué le pasó—; en escritorio las propiedades se van a la derecha, fijas,
          y la historia y las relaciones ocupan la columna ancha. Sin `overflow-hidden` en ningún
          lado: cada tabla se desplaza sola dentro de su bloque, y así el teléfono no se corre de
          costado por culpa de la más ancha. */}
      <div className="grid grid-cols-1 gap-7 lg:grid-cols-[minmax(0,1fr)_320px]">
        <aside id="panel-informacion" className="min-w-0 scroll-mt-4 space-y-3 lg:order-2" data-testid="panel-informacion">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink">Información</h2>
          <BloqueInformacion
            cliente={cliente}
            responsables={lector.leer(responsables, [])}
            editar={editarCliente.bind(null, id)}
            vincularCarpeta={vincularCarpetaCliente.bind(null, id)}
            archivar={archivarCliente}
            puedeEditar={puedeEditar}
            edicionAbierta={q.editar === '1'}
          />
        </aside>

        <div className="min-w-0 space-y-8 lg:order-1">
          <Bloque titulo="Actividad" testid="bloque-actividad">
            <BloqueActividad
              linea={lector.leer(linea, { eventos: [], sinFecha: 0 })}
              puedeVerContractuales={VE_CONTRACTUALES.includes(rol ?? '')}
              puedeEscribir={puedeEditar}
              crearNota={crearNota.bind(null, id)}
              todo={q.actividad === 'todo'}
              urlTodo={url({ actividad: 'todo' })}
              urlPoco={url({ actividad: null })}
            />
          </Bloque>

          <Bloque titulo="Obras asociadas" cuenta={todas.length} testid="bloque-obras">
            <BloqueObras
              obras={conArchivadas ? todas : todas.filter((o) => o.estado !== 'cerrada')}
              archivadas={cerradas.length}
              conArchivadas={conArchivadas}
              urlArchivadas={url({ archivadas: '1' })}
              urlSinArchivadas={url({ archivadas: null })}
              clienteId={id}
              crearObra={crearObra}
              puedeEditar={puedeEditar}
            />
          </Bloque>

          <Bloque titulo="Contactos" cuenta={lector.leer(contactos, []).length} testid="bloque-contactos">
            <BloqueContactos
              contactos={lector.leer(contactos, [])}
              enEdicion={q.contacto ?? null}
              urlDe={(c) => url({ contacto: c })}
              editar={(c) => editarContacto.bind(null, c)}
              crear={crearContacto.bind(null, id)}
              borrar={borrarContacto}
              puedeEditar={puedeEditar}
            />
          </Bloque>

          <Bloque titulo="Documentos" cuenta={lector.leer(documentos, []).length} testid="bloque-documentos">
            <BloqueDocumentos
              documentos={lector.leer(documentos, [])}
              carpetaDriveId={cliente.drive_carpeta_id}
              vincular={vincularDocumentoCliente.bind(null, id)}
              clasificar={(f) => clasificarDocumentoCliente.bind(null, id, f)}
              desvincular={desvincularDocumentoCliente.bind(null, id)}
              puedeEditar={puedeEditar}
              todo={q.documentos === 'todo'}
              urlTodo={url({ documentos: 'todo' })}
              urlPoco={url({ documentos: null })}
            />
          </Bloque>
        </div>
      </div>
    </PageShell>
  )
}
