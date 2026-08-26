// 26 v2 · CLIENTE FICHA — porte medido de `26 · Cliente Ficha v2.dc.html`.
//
// ═══ QUÉ CAMBIÓ CONTRA LA VERSIÓN DE AGOSTO ═══
//
// El marco. Antes: `PageShell` + `CabeceraCliente` (slab blanco con avatar y nombre a 21px) +
// `TiraMetricas` en celdas + un cuerpo de `Bloque`s con tablas adentro. El v2 abre con la MIGA
// —«← Clientes / La Estrella»—, pone el nombre a 24px con la razón social debajo, las cifras sin
// tarjeta y las listas sin caja: criterio 3 del patrón.
//
// Y «RESUMEN» DEJÓ DE SER UNA CARA. Repetía la tabla de Obras con los presupuestos apilados debajo:
// dos caras con otro nombre. La ficha abre por OBRAS, que es lo que el mockup pone primero, y
// ACTIVIDAD sube a cara propia — en el v2 el costado guarda lo que IDENTIFICA al cliente
// (identidad, contactos, portal) y la historia de la relación es contenido, no identidad.
//
// ═══ EL COSTADO NO CAMBIA CON LA SOLAPA ═══
//
// Es lo que hace que partir el record en caras no cueste el caso del 19/08 («¿a quién llamo?» tiene
// que contestarse desde cualquier cara). Las tres caras a sangre —cuenta corriente, esquema y
// accesos, mockups 28/32/31— son la excepción: usan la columna derecha para su propio panel.
//
// ═══ CONSULTAR NO ES ADMINISTRAR ═══
//
// El record se abre para Obras y Administración; los formularios de escritura sólo se dibujan para
// Administración. No es la cerradura —la RLS rechaza la escritura igual—, es no ofrecer un botón que
// la base va a rechazar. El predicado de pantalla SIGUE a la policy, nunca al revés.
//
// FRONTERA: el cliente CONSOLIDA, no administra. El contratado y el avance salen de `obra_panel` —o
// sea, de Compras y de Cotización—. Acá no se calcula ni se guarda un número propio.

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
import { BloqueActividad } from '@/features/clientes/components/BloqueActividad'
import { BloqueContactos } from '@/features/clientes/components/BloqueContactos'
import { BloqueDocumentos } from '@/features/clientes/components/BloqueDocumentos'
import { BloqueInformacion } from '@/features/clientes/components/BloqueInformacion'
import {
  ObrasDelCliente, PresupuestosDelCliente, type PresupuestoDeFicha,
} from '@/features/clientes/components/ListasClienteV2'
import { CuentaCorriente } from '@/features/clientes/components/cuenta/CuentaCorriente'
import { EsquemaPago } from '@/features/clientes/components/esquema/EsquemaPago'
import { AccesosPortal } from '@/features/clientes/components/accesos/AccesosPortal'
import { CamposObra } from '@/features/obras/components/CamposObra'
import { getCertificados, getCuentaCorriente } from '@/features/clientes/services/cuentaCorrienteService'
import { getEsquemaCliente } from '@/features/clientes/services/esquemaService'
import { getAccesos, getActividadPortal } from '@/features/clientes/services/accesosService'
import { registrarCobroDeCertificado } from '@/features/clientes/services/cuentaCorrienteActions'
import { editarPagoDelEsquema, publicarEsquema } from '@/features/clientes/services/esquemaActions'
import {
  habilitarAcceso, reenviarInvitacion, revocarAcceso,
} from '@/features/clientes/services/accesosActions'
import { resumenAccesos } from '@/features/clientes/services/reglasPortal'
import { cambiosSinPublicar } from '@/features/clientes/services/reglasEsquema'
import { A_SANGRE, solapaDe, solapasDeCliente } from '@/features/clientes/services/solapasCliente'
import { tasaDeConversion } from '@/features/clientes/services/tasaConversion'
import { Aviso } from '@/shared/components/ds'
import { FormAccion } from '@/shared/components/ui'
import { EstadoError } from '@/shared/components/estado'
import { crearLector } from '@/shared/components/estado/lecturas'
import { IconoCrear, IconoEditar } from '@/shared/components/iconos'
import { RotuloPanel, V } from '@/shared/components/v2/patron'
import {
  AccionPrimaria, AccionSecundaria, AvisoDeFicha, CifrasDeFicha, CostadoDeFicha, CuerpoDeFicha,
  Migas, PastillaFilo, SolapasDeFicha, TituloDeFicha, type CifraDeFicha, PantallaV2,
} from '@/shared/components/v2/segundoNivel'
import { money } from '@/shared/utils/format'

export const dynamic = 'force-dynamic'

/** Quién puede ver certificaciones, facturaciones y cobranzas. Es un ESPEJO del predicado
 *  `es_administracion()` de la RLS, y sirve sólo para explicar la ausencia: quien decide sigue
 *  siendo Postgres, que devuelve cero filas. */
const VE_CONTRACTUALES = ['direccion', 'administracion']

type Query = {
  contacto?: string; editar?: string; archivadas?: string; actividad?: string; documentos?: string
  vista?: string
  /** El nombre viejo del mismo parámetro. Sigue leyéndose para que un enlace ya compartido no caiga
   *  en otra cara sin decir por qué. No se escribe más: `url()` emite `vista`. */
  solapa?: string
  /** Abre el alta de obra, que en el v2 es la acción primaria de la cabecera y no un `details`
   *  escondido arriba de la tabla. */
  nueva?: string
}

export default async function ClientePage({ params, searchParams }: {
  params: Promise<{ cliente: string }>
  searchParams: Promise<Query>
}) {
  const { cliente: slug } = await params
  const q = await searchParams

  const supabase = await createClient()
  const { data: cliente, error } = await getCliente(supabase, slug)
  // NO EXISTE y NO PUEDO LEER son dos cosas distintas: confundirlas escondió un defecto de permisos
  // detrás de un «página no encontrada» durante horas.
  if (error) return <EstadoError mensaje={error} que="la ficha del cliente" />
  if (!cliente) notFound()

  const id = cliente.cliente_id
  const rol = (await getPerfilActual(supabase)).data?.rol ?? null
  const puedeEditar = esAdministracion(rol)
  // EL PRECIO NO ES DE TODOS: el jefe de obra no ve contratado. Decide la RLS; acá sólo se deja de
  // dibujar la métrica, para no mostrarle un rótulo económico vacío y que parezca un error.
  const veEconomia = puedeVerEconomia(rol)

  const [responsables, contactos, obras, linea, documentos, cartera] = await Promise.all([
    puedeEditar ? getResponsables(supabase) : Promise.resolve({ data: [], error: null }),
    getContactos(supabase, id),
    getObrasDelCliente(supabase, id),
    getActividadCliente(supabase, id),
    getDocumentosCliente(supabase, id),
    veEconomia ? getCartera(supabase) : Promise.resolve({ data: [], error: null }),
  ])
  // Estas lecturas se leían con `?? []`: si la de obras fallaba, la ficha decía que el cliente no
  // tiene obras. Sobre un cliente eso es una afirmación comercial sacada de un fallo de la base.
  const lector = crearLector()

  const solapa = solapaDe(q.vista, q.solapa)
  // EL DÍA DE HOY LO DECIDE EL SERVIDOR, EN EL HUSO DE LA EMPRESA. Si «vencido» lo calculara el
  // navegador, un jefe con el reloj corrido vería una mora distinta sobre el mismo cliente.
  const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' })
  const aSangre = A_SANGRE.includes(solapa)
  // Los presupuestos DE ESTE CLIENTE. El corte se hace por `cliente_id`: filtrar por el nombre
  // escrito en el presupuesto ataría la ficha a la grafía del texto.
  const presupuestos = lector.leer(cartera, []).filter((p) => p.cliente_id === id)

  const [cuenta, certificados] = solapa === 'cuenta' && veEconomia
    ? await Promise.all([getCuentaCorriente(supabase, id), getCertificados(supabase, id)])
    : [{ data: null, error: null }, { data: [], error: null }]
  const esquema = solapa === 'esquema' && veEconomia
    ? await getEsquemaCliente(supabase, id)
    : { data: null, error: null }
  const pagosDelEsquema = esquema.data?.pagos ?? []
  const sinPublicar = cambiosSinPublicar(pagosDelEsquema)
  const [accesos, actividadPortal] = solapa === 'accesos' && veEconomia
    ? await Promise.all([getAccesos(supabase, id), getActividadPortal(supabase, id)])
    : [{ data: [], error: null }, { data: [], error: null }]
  const portal = resumenAccesos(lector.leer(accesos, []))

  const conArchivadas = q.archivadas === '1'
  const todas = lector.leer(obras, [])
  const cerradas = todas.filter((o) => o.estado === 'cerrada')
  const enCurso = todas.filter((o) => o.estado === 'activa')
  const conMontoEnCurso = enCurso.filter((o) => o.monto_contratado != null)

  /** La misma dirección con un parámetro cambiado. Los demás se preservan. */
  const url = (cambio: Partial<Record<keyof Query, string | null>>) => {
    const p = new URLSearchParams(
      // `solapa` se lee pero NO se propaga: un enlace viejo abre la cara que pedía y a partir de ahí
      // la dirección se escribe con el nombre de hoy.
      Object.entries({ ...q, solapa: null, ...cambio })
        .filter(([, v]) => v != null && v !== '') as [string, string][],
    )
    const s = p.toString()
    return `/clientes/${slug}${s ? `?${s}` : ''}`
  }

  const cifras: CifraDeFicha[] = [
    { rotulo: 'Obras', valor: todas.length || null, falta: 'ninguna cargada' },
    ...(veEconomia
      ? [{
          rotulo: 'Contratado en curso',
          // NADIE CARGÓ EL MONTO ≠ CONTRATADO $ 0. Con obras en curso sin monto, la cifra lo dice
          // en vez de publicar un cero que se leería como «trabajamos gratis».
          valor: conMontoEnCurso.length
            ? money(conMontoEnCurso.reduce((s, o) => s + (o.monto_contratado ?? 0), 0))
            : null,
          falta: enCurso.length ? 'sin monto cargado' : 'sin obra en curso',
        } as CifraDeFicha]
      : []),
    { rotulo: 'Contactos', valor: lector.leer(contactos, []).length || null, falta: 'ninguno' },
    { rotulo: 'Documentos', valor: lector.leer(documentos, []).length || null, falta: 'ninguno' },
  ]

  const filasPresupuesto: PresupuestoDeFicha[] = presupuestos.map((p) => ({
    presupuesto_id: p.id,
    nombre: p.obra_nombre?.trim() || p.numero || 'sin nombre',
    estado: p.vigente ? p.estado : `${p.estado} · no vigente`,
    revision: p.version > 1 ? p.version : null,
    precio: p.precio_venta,
    total: p.precio_venta,
    // EL VERBO VIAJA COMO OBJETO Y NO COMO FUNCIÓN: una arrow creada acá y pasada a un componente
    // compila, pasa `build` y revienta en producción con React #419.
    accion: p.convertida_obra_id
      ? { texto: 'Ver la obra', href: `/obras/${p.convertida_obra_id}` }
      : p.estado === 'adjudicada'
        ? { texto: 'Convertir en obra', href: `/presupuestos/${p.id}/convertir` }
        : undefined,
  }))

  const vencido = lector.leer(cuenta, null)?.vencido ?? null
  const tasa = tasaDeConversion(presupuestos)

  return (
    <PantallaV2>
      <Migas volverA="/clientes" padre="Clientes" actual={cliente.nombre_comercial} />

      <TituloDeFicha
        titulo={cliente.nombre_comercial}
        bajada={cliente.razon_social?.trim() || null}
        junto={
          <>
            {!cliente.activo && <PastillaFilo testid="pastilla-archivado">archivado</PastillaFilo>}
            {sinPublicar > 0 && (
              <PastillaFilo testid="pastilla-sin-publicar">
                {sinPublicar} {sinPublicar === 1 ? 'cambio sin publicar' : 'cambios sin publicar'}
              </PastillaFilo>
            )}
          </>
        }
        acciones={puedeEditar
          ? (
              <>
                <AccionSecundaria
                  href={url({ editar: q.editar === '1' ? null : '1' })} testid="editar-cliente"
                  icono={<IconoEditar className="h-[14px] w-[14px]" />}
                >
                  Editar
                </AccionSecundaria>
                {/* LA ÚNICA PRIMARIA. El alta de obra vivía en un `details` arriba de la tabla, que
                    es donde no la encuentra nadie. La obra nace COLGADA DE ESTE CLIENTE. */}
                <AccionPrimaria
                  href={url({ vista: 'obras', nueva: q.nueva === 'obra' ? null : 'obra' })}
                  testid="nueva-obra" icono={<IconoCrear className="h-[14px] w-[14px]" />}
                >
                  Nueva obra
                </AccionPrimaria>
              </>
            )
          : undefined}
      />

      {/* LO QUE ESTÁ VENCIDO ARRIBA DE TODO, con su verbo. Sólo cuando la cuenta corriente se leyó:
          fuera de esa cara el dato no existe, y una barra vacía se leería como «no debe nada». */}
      {vencido != null && vencido > 0 && (
        <AvisoDeFicha tono="neg" verbo="Ver la cuenta" href={url({ vista: 'cuenta' })} testid="aviso-vencido">
          Este cliente tiene {money(vencido)} vencidos sin cobrar.
        </AvisoDeFicha>
      )}

      {lector.falla() && (
        <div style={{ padding: '14px 20px 0' }} data-testid="cliente-lectura-fallida">
          <Aviso tono="neg" titulo="Parte de esta ficha no se pudo leer">
            Lo que falta abajo NO significa que no exista: significa que la consulta falló. {lector.falla()}
          </Aviso>
        </div>
      )}

      {!aSangre && <CifrasDeFicha cifras={cifras} testid="cifras-cliente" />}

      <SolapasDeFicha
        testid="vistas-cliente"
        solapas={solapasDeCliente({
          veEconomia,
          obras: todas.length,
          presupuestos: presupuestos.length,
          documentos: lector.leer(documentos, []).length,
        }).map((s) => ({
          clave: s.clave,
          titulo: s.label,
          cuenta: s.cuenta,
          activa: solapa === s.clave,
          // Obras es la cara por defecto y por eso su enlace NO lleva parámetro: así la dirección de
          // la ficha sigue siendo `/clientes/<slug>` a secas.
          href: url({ vista: s.clave === 'obras' ? null : s.clave, nueva: null }),
        }))}
      />

      {solapa === 'cuenta' && veEconomia && (
        <div style={{ padding: '18px 20px 24px' }}>
          <CuentaCorriente
            cuenta={lector.leer(cuenta, null)}
            documentos={lector.leer(certificados, [])}
            hoy={hoy}
            registrarCobro={registrarCobroDeCertificado}
          />
        </div>
      )}

      {solapa === 'esquema' && veEconomia && (
        <div style={{ padding: '18px 20px 24px' }}>
          <EsquemaPago
            esquema={lector.leer(esquema, null)}
            hoy={hoy}
            clienteId={id}
            editarPago={editarPagoDelEsquema}
            publicarEsquema={publicarEsquema}
          />
        </div>
      )}

      {solapa === 'accesos' && veEconomia && (
        <div style={{ padding: '18px 20px 24px' }}>
          <AccesosPortal
            accesos={lector.leer(accesos, [])}
            actividad={lector.leer(actividadPortal, [])}
            // EL CRUCE CONTRA LOS CONTACTOS YA CARGADOS es el único control contra un typo en el
            // mail que se habilita. Sale de la MISMA lectura que dibuja el bloque Contactos.
            contactos={lector.leer(contactos, []).map((c) => ({ nombre: c.nombre, email: c.email, rol: c.rol }))}
            obras={todas.map((o) => ({ id: o.obra_id, nombre: o.nombre }))}
            hoy={hoy}
            clienteId={id}
            habilitarAcceso={habilitarAcceso}
            revocarAcceso={revocarAcceso}
            reenviarInvitacion={reenviarInvitacion}
          />
        </div>
      )}

      {!aSangre && (
        <CuerpoDeFicha>
          <div className="flex min-w-0 flex-1 flex-col gap-3" data-testid={`solapa-abierta-${solapa}`}>
            {solapa === 'obras' && (
              <>
                {q.nueva === 'obra' && puedeEditar && (
                  <div style={{ borderBottom: `1px solid ${V.linea}`, paddingBottom: 14, marginBottom: 4 }} data-testid="alta-obra">
                    <FormAccion accion={crearObra} testid="form-obra" enviar="Crear obra" limpiarAlOk mensajeOk="Obra creada.">
                      {/* La obra nace COLGADA DE ESTE CLIENTE. Hasta que existió `cliente_id`, las
                          tres obras de La Estrella eran tres cadenas de texto iguales por casualidad. */}
                      <input type="hidden" name="cliente_id" value={id} />
                      <CamposObra />
                    </FormAccion>
                  </div>
                )}

                <ObrasDelCliente
                  obras={conArchivadas ? todas : todas.filter((o) => o.estado !== 'cerrada')}
                  veEconomia={veEconomia}
                  vacio={cerradas.length === 0
                    ? 'Este cliente no tiene ninguna obra. Se crea desde arriba, colgada de este cliente.'
                    : 'Todas las obras de este cliente están archivadas.'}
                />

                {/* La puerta de vuelta: archivar no puede parecerse a borrar. */}
                <p style={{ fontSize: '11px', lineHeight: 1.6, color: V.tenue, maxWidth: 720 }} data-testid="pie-archivadas-cliente">
                  {cerradas.length > 0 && (conArchivadas
                    ? (
                        <>
                          Se muestran también {cerradas.length} obra{cerradas.length === 1 ? '' : 's'} archivada{cerradas.length === 1 ? '' : 's'}.{' '}
                          <a href={url({ archivadas: null })} style={{ color: V.tinta, fontWeight: 500 }}>Ocultarlas</a>.{' '}
                        </>
                      )
                    : (
                        <>
                          {cerradas.length} obra{cerradas.length === 1 ? '' : 's'} archivada{cerradas.length === 1 ? '' : 's'} fuera de esta lista.{' '}
                          <a href={url({ archivadas: '1' })} style={{ color: V.tinta, fontWeight: 500 }} data-testid="ver-archivadas-cliente">Verlas</a>.{' '}
                        </>
                      ))}
                  El contratado y el avance salen de la obra: acá no se calcula nada propio. El costo
                  real no se dibuja en la ficha del cliente — vive en la obra, que es donde se decide.
                </p>
              </>
            )}

            {veEconomia && solapa === 'presupuestos' && (
              <>
                <PresupuestosDelCliente filas={filasPresupuesto} />
                <p style={{ fontSize: '11px', lineHeight: 1.6, color: V.tenue, maxWidth: 720 }} data-testid="nota-presupuestos">
                  {/* SIN CERRADOS NO SE ESCRIBE UNA TASA: «0 %» sobre tres presupuestos abiertos
                      diría que se perdieron, y no se perdió ninguno todavía. */}
                  {tasa === null
                    ? 'Ninguno cerró todavía, así que no hay tasa de conversión que medir. '
                    : `Tasa de conversión ${tasa} % — ganados sobre cerrados, sin contar los abiertos. `}
                  Un presupuesto adjudicado se convierte en obra: el plan nace de la plantilla y cada
                  actividad guarda de qué partida salió. Las revisiones anteriores existen y se abren
                  desde adentro; sólo la vigente cuenta. Acá no se muestra margen: se lee en el
                  presupuesto, con su cascada al lado, que es donde se puede auditar.
                </p>
              </>
            )}

            {solapa === 'documentos' && (
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
            )}

            {solapa === 'actividad' && (
              <BloqueActividad
                linea={lector.leer(linea, { eventos: [], sinFecha: 0 })}
                puedeVerContractuales={VE_CONTRACTUALES.includes(rol ?? '')}
                puedeEscribir={puedeEditar}
                crearNota={crearNota.bind(null, id)}
                todo={q.actividad === 'todo'}
                urlTodo={url({ actividad: 'todo' })}
                urlPoco={url({ actividad: null })}
              />
            )}
          </div>

          {/* EL COSTADO NO CAMBIA CON LA CARA: es lo que identifica al cliente y a quién llamar. */}
          <CostadoDeFicha testid="panel-informacion">
            <RotuloPanel>Identidad</RotuloPanel>
            <BloqueInformacion
              cliente={cliente}
              responsables={lector.leer(responsables, [])}
              editar={editarCliente.bind(null, id)}
              vincularCarpeta={vincularCarpetaCliente.bind(null, id)}
              archivar={archivarCliente}
              puedeEditar={puedeEditar}
              edicionAbierta={q.editar === '1'}
            />

            <div style={{ marginTop: 22 }}>
              <RotuloPanel cuenta={lector.leer(contactos, []).length}>Contacto</RotuloPanel>
            </div>
            <BloqueContactos
              contactos={lector.leer(contactos, [])}
              enEdicion={q.contacto ?? null}
              urlDe={(c) => url({ contacto: c })}
              editar={(c) => editarContacto.bind(null, c)}
              crear={crearContacto.bind(null, id)}
              borrar={borrarContacto}
              puedeEditar={puedeEditar}
            />

            {veEconomia && (
              <>
                <div style={{ marginTop: 22 }}>
                  <RotuloPanel>Portal del cliente</RotuloPanel>
                </div>
                {/* EL RESUMEN DEL PORTAL SÓLO SE AFIRMA CUANDO SE LEYÓ. Fuera de la cara «Acceso al
                    portal» no se consulta, y un «0 habilitados» ahí diría que nadie de afuera puede
                    entrar — que es exactamente la conclusión que hace que nadie revise. */}
                <p style={{ fontSize: '12px', color: V.tenue, padding: '7px 0' }} data-testid="resumen-portal">
                  {solapa === 'accesos'
                    ? `${portal.habilitados} ${portal.habilitados === 1 ? 'acceso habilitado' : 'accesos habilitados'}`
                    : 'Se lee al abrir la cara.'}
                </p>
                <a
                  href={url({ vista: 'accesos' })} data-testid="gestionar-accesos"
                  style={{ display: 'inline-block', fontSize: '12.5px', fontWeight: 500, color: V.tinta, marginTop: 4 }}
                >
                  Gestionar accesos →
                </a>
              </>
            )}
          </CostadoDeFicha>
        </CuerpoDeFicha>
      )}
    </PantallaV2>
  )
}
