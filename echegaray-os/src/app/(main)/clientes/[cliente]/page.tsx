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
// ═══ LA CABECERA DEJÓ DE SER EL SLAB GRAFITO (24/08/2026, auditoría lado a lado del canónico) ═══
//
// Hasta hoy la ficha se coronaba con `BarraContexto`: fondo #30302F, filo amarillo, métricas
// adentro. Se eligió el 23/08 «por consistencia entre fichas» — y la consistencia era con una ficha
// que YA no se dibuja así. Puesto el mockup 26 al lado de la pantalla, el zip no tiene ninguna
// cabecera oscura: el 26 es BLANCO, con avatar de iniciales, nombre a 21px, pastilla de estado al
// lado, la línea de identidad separada por puntos medios y las solapas pegadas abajo. Es exactamente
// la anatomía que `CabeceraFicha` ya implementa para Persona (20) y Proveedor (23).
//
// Así que la consistencia se cumple mejor al revés: el cliente usa el MISMO componente que las otras
// dos fichas de entidad, no un componente distinto en nombre de parecerse a ellas.
//
// LAS MÉTRICAS BAJAN A SU TIRA. En el slab vivían adentro; el canónico las dibuja como una fila de
// celdas sobre el cuerpo (`TiraMetricas`), que es donde ya están en 20 y en 23. Los números son los
// MISMOS y salen de las mismas lecturas: no se agrega ni se recalcula ninguno.
//
// ═══ LAS SOLAPAS VUELVEN — Y ESTO REVIERTE UNA DECISIÓN DEL DUEÑO (24/08/2026) ═══
//
// Hasta ayer el índice era eso, un índice: cinco anclas que contaban y llevaban a bloques que
// estaban todos a la vista, porque el 19/08 el dueño fijó que *"el record no puede quedar detrás de
// una solapa"*. HOY ESO SE REVIERTE, por orden de máxima fidelidad al mockup del 24/08: el canónico
// 26 dibuja SOLAPAS REALES —Resumen · Obras · Presupuestos · Documentos · Cuenta, con contador
// mono— y una vista por solapa. Manda el mockup.
//
// Lo que se paga, dicho: «¿tiene el contrato cargado y a quién llamo?» vuelve a ser dos vistas.
// Se paga sólo en parte, y por eso el corte no es donde parecía: LO QUE IDENTIFICA AL CLIENTE NO
// ENTRA EN NINGUNA SOLAPA. Datos, contactos y actividad viven en el aside —es donde los dibuja el
// mockup— y se ven desde las cinco. La solapa parte lo que el cliente TIENE (obras, presupuestos,
// documentos, cuenta), nunca quién es ni a quién se llama.
//
// La lectura sigue siendo UNA sola vuelta: los contadores de las solapas necesitan los largos de
// todas las listas, así que esconder una cara no ahorra la consulta — ahorra el dibujo, que era la
// mitad cara de las dos.
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
import { getCartera } from '@/features/presupuestos/services/presupuestosService'
import { Bloque } from '@/features/clientes/components/Bloque'
import { BloqueActividad } from '@/features/clientes/components/BloqueActividad'
import { BloqueContactos } from '@/features/clientes/components/BloqueContactos'
import { BloqueDocumentos } from '@/features/clientes/components/BloqueDocumentos'
import { BloqueInformacion } from '@/features/clientes/components/BloqueInformacion'
import { BloqueObras } from '@/features/clientes/components/BloqueObras'
import { FichaPresupuestos } from '@/features/clientes/components/FichaPresupuestos'
import { CabeceraCliente } from '@/features/clientes/components/CabeceraCliente'
import { CuentaCorriente } from '@/features/clientes/components/cuenta/CuentaCorriente'
import { EsquemaPago } from '@/features/clientes/components/esquema/EsquemaPago'
import { AccesosPortal } from '@/features/clientes/components/accesos/AccesosPortal'
import { getCertificados, getCuentaCorriente } from '@/features/clientes/services/cuentaCorriente'
import { getEsquema } from '@/features/clientes/services/esquema'
import { getAccesos, getActividadPortal } from '@/features/clientes/services/accesos'
import {
  editarPago, habilitarAcceso, publicarEsquema, reenviarInvitacion, registrarCobro, revocarAcceso,
} from '@/features/clientes/services/actionsCobranza'
import { resumenAccesos } from '@/features/clientes/services/reglasPortal'
import { cambiosSinPublicar } from '@/features/clientes/services/reglasEsquema'
import { A_SANGRE, solapaDe, solapasDeCliente } from '@/features/clientes/services/solapasCliente'
import { Aviso } from '@/shared/components/ds'
import { TiraMetricas } from '@/features/administracion/components/FichaCanonica'
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
  vista?: string
  /** El nombre viejo del mismo parámetro. Sigue leyéndose para que un enlace ya compartido —o un
   *  favorito— no caiga en Resumen sin decir por qué. No se escribe más: `url()` emite `vista`. */
  solapa?: string
}

// LAS SIETE CARAS DE LA FICHA —las cinco del canónico 26 más las tres de los mockups 28, 31 y 32,
// donde «Cuenta corriente» reemplaza a la vieja «Cuenta»— y quién ve cada una viven en
// `services/solapasCliente.ts`, con test: la lista de acá abajo se dibuja, la de allá se prueba.

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
  //
  // LOS PRESUPUESTOS SÓLO PARA QUIEN VE ECONOMÍA: un presupuesto ES el precio de venta, y ésa es
  // justo la cifra que el jefe de obra no ve (la misma frontera que la métrica «Contratado»). No es
  // la cerradura —la RLS de `cotizacion_cascada` decide—, es no dibujar una solapa que va a venir
  // vacía y se va a leer como «este cliente nunca pidió un presupuesto».
  const [responsables, contactos, obras, linea, documentos, cartera] = await Promise.all([
    puedeEditar ? getResponsables(supabase) : Promise.resolve({ data: [], error: null }),
    getContactos(supabase, id),
    getObrasDelCliente(supabase, id),
    getActividadCliente(supabase, id),
    getDocumentosCliente(supabase, id),
    veEconomia ? getCartera(supabase) : Promise.resolve({ data: [], error: null }),
  ])
  // ESTAS CINCO LECTURAS SE LEÍAN CON `?? []`: si la de obras fallaba, la ficha decía que el cliente
  // no tiene obras. Sobre un cliente eso es una afirmación comercial, sacada de un fallo de la base.
  // La ficha se sigue dibujando —el resto de los bloques sirve—, pero con el cartel de qué faltó.
  const lector = crearLector()

  const solapa = solapaDe(q.vista, q.solapa)
  // EL DÍA DE HOY LO DECIDE EL SERVIDOR, EN EL HUSO DE LA EMPRESA. Si «vencido» lo calculara el
  // navegador, un jefe con el reloj corrido —o de viaje— vería una mora distinta que administración
  // sobre el mismo cliente. Mismo criterio que `/mi-cuenta`.
  const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' })
  const aSangre = A_SANGRE.includes(solapa)
  // Los presupuestos DE ESTE CLIENTE. `getCartera` trae la cartera entera —es la vista que ya usa
  // /presupuestos— y el corte se hace acá por `cliente_id`: filtrar por el nombre escrito en el
  // presupuesto ataría la ficha a la grafía del texto, que es lo que `cliente_id` vino a arreglar.
  const presupuestos = lector.leer(cartera, []).filter((p) => p.cliente_id === id)

  // LAS CARAS NUEVAS LEEN SU MATERIAL SÓLO CUANDO ESTÁN ABIERTAS. Ninguna alimenta un contador de
  // la barra de solapas —el mockup no les pone número—, así que esconderlas ahorra la consulta
  // entera y no sólo el dibujo, que es lo contrario de lo que pasa con Obras o Documentos.
  const [cuenta, certificados] = solapa === 'cuenta' && veEconomia
    ? await Promise.all([getCuentaCorriente(id), getCertificados(id)])
    : [null, []]
  const esquema = solapa === 'esquema' && veEconomia ? await getEsquema(id) : null
  // El contador de la pastilla sale de la MISMA lista que dibuja la tabla: si saliera de una
  // consulta aparte, la cabecera podría decir «2 cambios» sobre una tabla que muestra uno.
  const sinPublicar = cambiosSinPublicar(esquema?.pagos ?? [])
  const [accesos, actividadPortal] = solapa === 'accesos' && veEconomia
    ? await Promise.all([getAccesos(id), getActividadPortal(id)])
    : [[], []]
  const portal = resumenAccesos(accesos)

  const conArchivadas = q.archivadas === '1'
  const todas = lector.leer(obras, [])
  const cerradas = todas.filter((o) => o.estado === 'cerrada')

  /** La misma dirección con un parámetro cambiado. Los demás se preservan: desplegar la actividad
   *  no puede cerrar el contacto que alguien tenía abierto tres bloques más abajo. */
  const url = (cambio: Partial<Record<keyof Query, string | null>>) => {
    const p = new URLSearchParams(
      // `solapa` se lee pero NO se propaga: un enlace viejo abre la cara que pedía y a partir de
      // ahí la dirección se escribe con el nombre de hoy. Dos parámetros para lo mismo terminan
      // discrepando el día que alguien cambie uno solo.
      Object.entries({ ...q, solapa: null, ...cambio })
        .filter(([, v]) => v != null && v !== '') as [string, string][],
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
      {/* La identidad, las pastillas de la cara abierta, sus acciones y las solapas. El dibujo vive
          en `CabeceraCliente`; acá se decide QUÉ mostrarle. */}
      <CabeceraCliente
        cliente={cliente}
        solapa={solapa}
        solapas={solapasDeCliente({
          veEconomia,
          obras: todas.length,
          presupuestos: presupuestos.length,
          documentos: lector.leer(documentos, []).length,
        }).map((s) => ({
          // Resumen es la cara por defecto y por eso su enlace NO lleva parámetro: así la dirección
          // de la ficha sigue siendo `/clientes/<slug>` a secas.
          href: url({ vista: s.clave === 'resumen' ? null : s.clave }),
          label: s.label,
          cuenta: s.cuenta,
          activo: solapa === s.clave,
          testid: `solapa-${s.clave}`,
        }))}
        veEconomia={veEconomia}
        puedeEditar={puedeEditar}
        obrasEnCurso={enCurso.length}
        urlEditar={url({ editar: q.editar === '1' ? null : '1' })}
        editando={q.editar === '1'}
        vencido={cuenta?.vencido ?? null}
        sinPublicar={sinPublicar}
        portalActivo={portal.habilitados > 0}
      />

      {/* EL RESUMEN DE MÉTRICAS, sobre el cuerpo y no adentro de la cabecera: es donde lo pone el
          canónico y donde ya está en las fichas de Persona y de Proveedor. Ninguna se inventa —obras
          y contratado salen de las obras ya leídas, misma fuente que la tabla de abajo, así que no
          pueden discrepar— y ninguna escribe un cero por una ausencia.

          NO APARECE EN 28, 31 NI 32: esas caras traen sus propias cifras (saldo, vencido, DSO; el
          total del contrato; los mails habilitados) y apilar las dos tiras dejaría ocho números
          arriba, ninguno de los cuales es el de la pantalla. */}
      {!aSangre && (
      <div className="mb-6">
        <TiraMetricas
          testid="metricas-cliente"
          metricas={[
            { rotulo: 'Obras', valor: todas.length || null, falta: 'ninguna cargada' },
            ...(veEconomia
              ? [{
                  rotulo: 'Contratado en curso',
                  // NADIE CARGÓ EL MONTO ≠ CONTRATADO $ 0. Con obras en curso sin monto, la métrica
                  // lo dice en vez de publicar un cero que se leería como «trabajamos gratis».
                  valor: conMontoEnCurso.length
                    ? money(conMontoEnCurso.reduce((s, o) => s + (o.monto_contratado ?? 0), 0))
                    : null,
                  falta: enCurso.length ? 'sin monto cargado' : 'sin obra en curso',
                }]
              : []),
            { rotulo: 'Contactos', valor: lector.leer(contactos, []).length || null, falta: 'ninguno' },
            { rotulo: 'Documentos', valor: lector.leer(documentos, []).length || null, falta: 'ninguno' },
          ]}
        />
      </div>
      )}

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
          cliente antes que qué le pasó—; en escritorio la identidad se va a la derecha, fija, y la
          solapa abierta ocupa la columna ancha. El aside NO cambia con la solapa: es lo que el
          canónico 26 dibuja siempre —Datos, Contactos, Actividad— y es lo que hace que partir el
          record en cinco vistas no cueste el caso del 19/08 («¿a quién llamo?» se contesta desde
          las cinco). Sin `overflow-hidden` en ningún lado: cada tabla se desplaza sola dentro de su
          bloque, y así el teléfono no se corre de costado por culpa de la más ancha. */}
      {/* 372px y hueco de 12px — `26:180` y `26:158`. Eran 320px con 28px de hueco: el panel
          quedaba 52px más angosto que el de la cartera de al lado, así que el MISMO bloque «Datos»
          truncaba un email en la ficha y no en el panel. */}
      {/* LAS TRES CARAS NUEVAS OCUPAN EL ANCHO ENTERO. Sus mockups usan la columna derecha para el
          panel del certificado (28), del pago (32) o del alta de acceso (31): dejar además el aside
          de identidad partiría la pantalla en tres columnas y el contenido quedaría en 500px sobre
          un MacBook de 1280. La identidad sigue a un clic, en Resumen. */}
      {solapa === 'cuenta' && veEconomia && (
        <CuentaCorriente
          cuenta={cuenta}
          documentos={certificados}
          hoy={hoy}
          registrarCobro={registrarCobro}
        />
      )}

      {solapa === 'esquema' && veEconomia && (
        <EsquemaPago
          esquema={esquema}
          hoy={hoy}
          clienteId={id}
          editarPago={editarPago}
          publicarEsquema={publicarEsquema}
        />
      )}

      {solapa === 'accesos' && veEconomia && (
        <AccesosPortal
          accesos={accesos}
          actividad={actividadPortal}
          // EL CRUCE CONTRA LOS CONTACTOS YA CARGADOS es el único control contra un typo en el mail
          // que se habilita. Sale de la MISMA lectura que dibuja el bloque Contactos de la ficha.
          contactos={lector.leer(contactos, []).map((c) => ({ nombre: c.nombre, email: c.email, rol: c.rol }))}
          obras={todas.map((o) => ({ id: o.obra_id, nombre: o.nombre }))}
          hoy={hoy}
          clienteId={id}
          habilitarAcceso={habilitarAcceso}
          revocarAcceso={revocarAcceso}
          reenviarInvitacion={reenviarInvitacion}
        />
      )}

      {!aSangre && (
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_372px]">
        <aside id="panel-informacion" className="min-w-0 scroll-mt-4 space-y-6 lg:order-2" data-testid="panel-informacion">
          <div className="space-y-3">
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
          </div>

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
        </aside>

        <div className="min-w-0 space-y-8 lg:order-1" data-testid={`solapa-abierta-${solapa}`}>
          {/* RESUMEN Y OBRAS COMPARTEN LA TABLA, y no es un descuido: el canónico dibuja el resumen
              con las obras y su avance adentro, que es la respuesta a «¿cómo va este cliente?».
              La diferencia entre las dos vistas es lo que las rodea —en Obras se puede además
              desplegar las archivadas y dar de alta—, no una segunda tabla con otros números. */}
          {(solapa === 'resumen' || solapa === 'obras') && (
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
          )}

          {veEconomia && (solapa === 'resumen' || solapa === 'presupuestos') && (
            <Bloque titulo="Presupuestos" cuenta={presupuestos.length} testid="bloque-presupuestos">
              <FichaPresupuestos presupuestos={presupuestos} />
            </Bloque>
          )}

          {solapa === 'documentos' && (
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
          )}
        </div>
      </div>
      )}
    </PageShell>
  )
}
