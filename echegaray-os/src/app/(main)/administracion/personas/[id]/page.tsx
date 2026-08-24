// EL LEGAJO DE UNA PERSONA — ficha de entidad con seis solapas.
//
// ═══ POR QUÉ NO ESTÁ TODO A LA VISTA ═══
//
// El dueño: *"NO mostrar toda la información simultáneamente en 15 cards."* La ficha tiene
// identidad, relación laboral, historial de asignaciones, horas, documentos, la cuenta con la que
// entra y la bitácora de cambios: junto es una pared. Separado, cada pregunta tiene su solapa y el
// Resumen contesta las tres que se hacen todos los días —quién es, qué categoría cobra, dónde está—.
//
// ═══ DOS SOLAPAS QUE NO SON COMO LAS OTRAS ═══
//
// «Usuario y permisos» y «Auditoría» no describen a la PERSONA: describen su CUENTA y lo que se le
// hizo a su ficha. Por eso cada una tiene su propio control de acceso, distinto del de la pantalla:
//
//   Usuario y permisos   `veLaCuentaDeOtro` = `ve_economia()`, el MISMO predicado que cierra
//                        `/administracion/usuarios`. Sin esto, la ficha sería el camino largo hasta
//                        la pantalla que la lista negra le cierra al jefe de obra.
//   Auditoría            `es_administracion()`, que es lo que la RLS de `entidad_cambio` ya exige.
//                        Por eso la retribución llega tapada desde la base: el jefe de obra entra.
//
// Y CADA SOLAPA PIDE SÓLO LO SUYO: el Resumen se abre muchas veces por día y no necesita el
// historial de horas para decir quién es esta persona.
//
// ═══ DOS LECTURAS QUE SÍ CORREN SIEMPRE, Y POR QUÉ (Design 23/08/2026) ═══
//
// La asignación vigente y los documentos se leen en las SEIS vistas. No es un descuido del
// principio de arriba: es que el slab de identidad los AFIRMA en todas.
//
// Y afirmarlos sin leerlos era un defecto real. El encabezado decía «Cuadrilla: sin cuadrilla ·
// Obra actual: sin asignar» en las solapas Horas, Documentos, Usuario y Auditoría —porque
// `asignaciones` sólo se pedía en dos— sobre personas que estaban en obra. Un control que no pudo
// mirar no dice «no está»: o mira, o se calla. Miran.
//
// Las dos son chicas (las asignaciones y los papeles de UNA persona). La cara sigue siendo `horas`,
// que lee `registros_hh` entera, y ésa sigue corriendo sólo en su solapa.
//
// ═══ Y POR QUÉ SE EDITA EN UN PANEL ═══
//
// *"Priorizar click sobre entidad/campo → panel lateral. Nada de páginas de formulario gigantes para
// cambios simples."* Corregir un teléfono no puede costar abrir una pantalla con veinte campos. El
// panel viaja en la URL (`?editar=identidad`), así que se comparte, se recarga y se cierra con el
// botón de atrás.
//
// LA RETRIBUCIÓN NO ESTÁ, y no por diseño de esta pantalla: `persona_legajo` —la única puerta por
// la que Administración llega a los campos sensibles— no publica `retribucion_pactada`. Dibujar el
// renglón en «sin cargar» diría que nadie la cargó, cuando lo que pasa es que la vista no la deja
// pasar. Se declara en el informe de este bloque.

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { BotonAccion, PageShell } from '@/shared/components/ui'
import { Aviso, Vacio } from '@/shared/components/ds'
import { Avatar } from '@/shared/components/Avatar'
import {
  CabeceraFicha, CuerpoDatos, DatoFicha, FilaTarjeta, HechoFicha, PastillaFicha, Punto,
  TarjetaFicha, TiraMetricas,
} from '@/features/administracion/components/FichaCanonica'
import { SemanaDeAsistencia } from '@/features/administracion/components/SemanaDeAsistencia'
import { semanaDePersona, totalDeLaSemana } from '@/features/administracion/services/semanaDePersona'
import { getPerfilActual, getUsuarioActual } from '@/features/auth/services/authService'
import { BloqueAsignacion, BloqueDocumentos, BloqueHoras } from '@/features/administracion/components/BloquesFicha'
import { BloqueAuditoria } from '@/features/administracion/components/BloqueAuditoria'
import { BloqueUsuario } from '@/features/administracion/components/BloqueUsuario'
import { CamposIdentidad, CamposLaboral } from '@/features/administracion/components/FormularioPersona'
import { AltaDocumento, Bloque, Dato } from '@/features/administracion/components/FichaPartes'
import { NavFicha, VISTAS_FICHA, type VistaFicha } from '@/features/administracion/components/NavFicha'
import { PanelEdicion } from '@/features/administracion/components/PanelEdicion'
import { getAsignacionesDe, getDocumentos, getPersona } from '@/features/administracion/services/personasService'
import { antiguedadEnAnios, DOCUMENTO_ESTADO, estadoDocumento, papelesPendientes } from '@/features/administracion/services/fichaPersona'
import { veLaCuentaDeOtro } from '@/features/administracion/services/accesoPersona'
import { getCuentaDePersona } from '@/features/administracion/services/accesoService'
import { getBitacora, TRAMO } from '@/features/administracion/services/auditoriaService'
import { getHHDePersona, resumenDelPeriodo } from '@/features/administracion/services/hhPersonaService'
import { esPeriodo, rotulo, ventanaDe, type Periodo } from '@/features/administracion/services/periodoHH'
import { darDeBaja, editarPersona, reincorporar, type GrupoEdicion } from '@/features/administracion/services/personasActions'
import { cerrarAsignacionDePersona } from '@/features/administracion/services/asignacionActions'
import { desvincularDocumento, vincularDocumento } from '@/features/administracion/services/documentosActions'
import { formatearCuit, formatearDni } from '@/features/administracion/services/identidad'
import { etiquetaCategoria } from '@/features/administracion/types'
import { pareceCategoria } from '@/features/administracion/services/vocabularioPersona'
import { fecha } from '@/features/obras/components/formato'

export const dynamic = 'force-dynamic'

type Busqueda = { v?: string; editar?: string; p?: string; n?: string }

/** Cuántos cambios de la bitácora se piden. El «ver más» viaja en la URL, no en un estado de cliente. */
function cuantosCambios(n: string | undefined): number {
  const pedidos = Number(n)
  // UN TOPE, Y NO POR PRUDENCIA: `?n=` viene del navegador. Sin techo, cualquiera con sesión pide
  // la bitácora entera de una persona en una sola consulta y la pantalla tarda lo que tarde.
  if (!Number.isInteger(pedidos) || pedidos <= 0) return TRAMO
  return Math.min(pedidos, TRAMO * 20)
}

// EL PERÍODO LO ELIGE QUIEN MIRA. Antes era una ventana fija de 30 días, que no coincide con NINGUNA
// liquidación: el dueño pidió *"día · semana · quincena · mes"*, y la quincena es la de la empresa
// —1 al 15 y 16 a fin de mes—. Ver `services/periodoHH.ts`, donde se calcula sin depender del reloj.
const PERIODO_POR_DEFECTO: Periodo = 'quincena'

export default async function FichaPersonaPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Busqueda>
}) {
  const { id } = await params
  // Un segmento que no es UUID (una URL mal tipeada como /personas/asistencia) caía en la consulta
  // y la pantalla mostraba el error crudo de Postgres («invalid input syntax for type uuid»).
  // El 404 amable ya existe: usarlo. (QA visual, 21/08/2026)
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) notFound()
  const sp = await searchParams
  const vista = (VISTAS_FICHA.find((v) => v === sp.v) ?? 'resumen') as VistaFicha
  const editar = sp.editar === 'identidad' || sp.editar === 'laboral' ? (sp.editar as GrupoEdicion) : null
  const base = `/administracion/personas/${id}`
  const href = (v: VistaFicha, e?: GrupoEdicion) =>
    `${base}${v === 'resumen' && !e ? '' : `?${new URLSearchParams({ ...(v !== 'resumen' ? { v } : {}), ...(e ? { editar: e } : {}) })}`}`

  const supabase = await createClient()
  // EL ROL DEL QUE MIRA se necesita en TODAS las vistas, no sólo en la de la cuenta: `NavFicha`
  // decide con él si dibuja la solapa, y una barra que cambia de largo al moverse entre solapas es
  // un defecto visual. El id del actor viaja a `getPerfilActual` para no repetir el `getUser()`.
  const [{ data: persona, error }, actor] = await Promise.all([
    getPersona(supabase, id),
    getUsuarioActual(supabase),
  ])
  const rolActor = (await getPerfilActual(supabase, actor?.id)).data?.rol ?? null
  const veLaCuenta = veLaCuentaDeOtro(rolActor)
  // NO EXISTE y NO PUEDO LEER son dos cosas distintas: confundirlas manda a buscar un defecto de
  // permisos detrás de un 404, que ya costó media jornada en este repo.
  if (error) {
    return (
      <PageShell title="No pude leer el legajo">
        <div data-testid="ficha-error"><Aviso tono="neg">{error}</Aviso></div>
      </PageShell>
    )
  }
  if (!persona) notFound()

  // Las dos que el slab afirma en TODAS las vistas van juntas y en paralelo; la cara —las horas—
  // sigue corriendo sólo cuando alguien abre su solapa.
  const [asignaciones, documentos] = await Promise.all([
    getAsignacionesDe(supabase, id),
    getDocumentos(supabase, id),
  ])
  // LAS HH TAMBIÉN EN EL RESUMEN, desde el canónico 20: la tira de métricas publica HH del mes y del
  // año, y el bloque de arriba dibuja la semana. La consulta filtra por `persona_id`, así que es la
  // de UNA persona y no la tabla entera; las otras cuatro solapas siguen sin pagarla.
  const horas = vista === 'horas' || vista === 'resumen' ? await getHHDePersona(supabase, id) : null
  // LA CUENTA NO SE LEE SI EL QUE MIRA NO PUEDE VERLA. Esconder la solapa y leer igual dejaría los
  // datos en el HTML de la página para el que sepa mirar la respuesta del servidor.
  const cuenta = vista === 'usuario' && veLaCuenta ? await getCuentaDePersona(supabase, id) : null
  const cuantos = cuantosCambios(sp.n)
  const bitacora = vista === 'auditoria' ? await getBitacora(supabase, 'personas', id, cuantos) : null

  const vigente = (asignaciones?.data ?? []).find((a) => !a.hasta) ?? null
  const cerradas = (asignaciones?.data ?? []).filter((a) => a.hasta)
  const papeles = documentos?.data ?? []
  const egresada = !persona.en_la_empresa
  // El slab publica los años de antigüedad. El día se fija en el SERVIDOR, igual que la ventana de
  // HH: calcularlo en el navegador daría una antigüedad distinta a cada lado de la medianoche.
  const antiguedad = antiguedadEnAnios(persona.fecha_ingreso, new Date().toISOString().slice(0, 10))
  const pendientes = papelesPendientes(papeles, persona.en_la_empresa)
  const filasHH = horas?.data ?? []
  const periodo = esPeriodo(sp.p) ? sp.p : PERIODO_POR_DEFECTO
  // EL DÍA SE FIJA EN EL SERVIDOR: calcularlo en el cliente daría una quincena distinta alrededor
  // de la medianoche según desde dónde se mire.
  const ventana = ventanaDe(periodo, new Date().toISOString().slice(0, 10))
  const resumen = resumenDelPeriodo(filasHH, ventana.desde, ventana.hasta)
  const fallo = asignaciones?.error ?? horas?.error ?? documentos?.error

  // LO QUE PUBLICA LA TIRA DE MÉTRICAS. Las tres ventanas se fijan en el SERVIDOR por la misma razón
  // que la de la liquidación: el mes y el año dependen del día, y el navegador de quien mira puede
  // estar del otro lado de la medianoche.
  const hoy = new Date().toISOString().slice(0, 10)
  const mes = resumenDelPeriodo(filasHH, ventanaDe('mes', hoy).desde, ventanaDe('mes', hoy).hasta)
  const anio = resumenDelPeriodo(filasHH, `${hoy.slice(0, 4)}-01-01`, `${hoy.slice(0, 4)}-12-31`)
  const semanaVentana = ventanaDe('semana', hoy)
  const dias = semanaDePersona(filasHH, semanaVentana.desde)
  // HH POR OBRA DEL AÑO: es lo que el canónico pone a la derecha de «Obras donde trabajó». Un mapa,
  // porque la lista se arma con las ASIGNACIONES —que son el hecho de haber estado— y las horas sólo
  // completan el renglón cuando existen.
  const hhPorObra = new Map(anio.obras.map((o) => [o.clave, o.horas]))

  return (
    // SIN `PageShell`: su encabezado dibuja un `h1` propio y el slab dibuja el suyo. Dos `h1` en la
    // misma pantalla no son un detalle de accesibilidad —son dos títulos compitiendo por decir qué
    // es esta pantalla—. Lo que se reusa es el MARCO exacto de `PageShell` (canvas, 40px de padding
    // en escritorio y 16 en el teléfono), que es lo único que hacía falta de él. El slab va FUERA
    // de ese padding: es una franja de borde a borde, igual que en la ficha del proveedor.
    <div className="min-h-screen bg-canvas">
      {/* EL SLAB DE IDENTIDAD — `COMPONENTS.md` §Anatomía de ficha de entidad: «Cliente, Proveedor,
          Persona, Obra y Herramienta usan la MISMA estructura: slab de identidad grafito con filo
          amarillo · nivel 2 de solapas con contador mono · resumen de métricas · aside».
          Era un `EntityHeader` blanco: correcto por sí solo, pero distinto del de Proveedor y del
          de Obra, y una persona que va de una ficha a otra no debería tener que reaprender dónde
          está el nombre. Se reusa `BarraContexto`, el mismo componente que ya corona al proveedor.

          LOS CINCO HECHOS SIGUEN SEPARADOS Y ROTULADOS: oficio (lo que sabe hacer) · categoría
          UOCRA (lo que cobra) · rol en la obra · cuadrilla · obra. El canónico los apila en una
          línea sin rótulos; acá cada uno dice su nombre porque tres de ellos se confundieron entre
          sí en este mismo módulo hace dos semanas. */}
      <CabeceraFicha
        testid="slab-persona"
        volverA="/administracion/personas"
        volverLabel="Personal"
        avatar={<Avatar nombre={persona.nombre_completo} url={null} lado={44} />}
        titulo={persona.nombre_completo}
        pastillas={
          // EL ESTADO SALE DE `en_la_empresa`, NO DE LA FECHA: hay 15 personas que se fueron sin baja
          // documentada y por la fecha figurarían activas.
          <>
            <PastillaFicha tono={egresada ? 'neg' : 'pos'} testid="pastilla-estado-persona">
              {egresada
                ? (persona.fecha_egreso ? `Inactiva desde ${fecha(persona.fecha_egreso)}` : 'Ya no está en la empresa')
                : (vigente?.obra_nombre ? `En ${vigente.obra_nombre}` : 'Activa')}
            </PastillaFicha>
            {pendientes > 0 && (
              <PastillaFicha tono="warn" testid="pastilla-papeles">
                {pendientes} {pendientes === 1 ? 'papel pendiente' : 'papeles pendientes'}
              </PastillaFicha>
            )}
          </>
        }
        hechos={
          // LOS CINCO HECHOS DEL CANÓNICO, EN SU ORDEN: oficio · obra y cuadrilla · legajo. El
          // oficio es lo que sabe hacer y la categoría lo que cobra: cuando el oficio no está
          // cargado, el que habla es la categoría, y se dice cuál de los dos es.
          <>
            <HechoFicha>
              {persona.especialidad?.trim()
                ?? (persona.categoria ? etiquetaCategoria(persona.categoria) : 'sin oficio cargado')}
            </HechoFicha>
            <Punto />
            <HechoFicha>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                <path d="M3 21h18M6 21V8l6-4 6 4v13" />
              </svg>
              {vigente
                ? [vigente.obra_nombre ?? vigente.obra_id, vigente.cuadrilla].filter(Boolean).join(' · ')
                : 'sin asignar'}
            </HechoFicha>
            <Punto />
            <HechoFicha mono>legajo {persona.legajo ?? 'sin número'}</HechoFicha>
          </>
        }
        acciones={egresada
          ? <BotonAccion accion={reincorporar} args={[id]} testid="reincorporar">Reincorporar</BotonAccion>
          // `args` y NO una función flecha: `accion={() => darDeBaja(id)}` crea una función nueva que
          // React rechaza en runtime —"Functions cannot be passed directly to Client Components"— y
          // la pantalla queda EN BLANCO, sin que ni typecheck ni build lo detecten.
          : <BotonAccion accion={darDeBaja} args={[id]} testid="dar-de-baja">Dar de baja</BotonAccion>}
        solapas={
          <NavFicha
            activa={vista}
            hrefDe={(v) => href(v)}
            ocultar={veLaCuenta ? [] : ['usuario']}
            cuentas={{ asignaciones: asignaciones?.data?.length ?? null, documentos: papeles.length }}
          />
        }
      />

      <div className="w-full px-4 py-3.5 lg:px-5">
      {fallo && <div className="mb-4"><Aviso tono="neg">{fallo}</Aviso></div>}

      <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1 space-y-3">
          {vista === 'resumen' && (
            // LA TIRA DE MÉTRICAS DEL CANÓNICO. El cuarto número del canónico es «Ausencias»; acá va
            // «Papeles pendientes» porque una ausencia con aviso NO existe como hecho cargado en
            // `registros_hh` —hay tipo `ausencia`, pero no el aviso— y dibujar el rótulo sobre un
            // conteo de otra cosa sería afirmar algo que nadie registró.
            <TiraMetricas
              testid="metricas-persona"
              metricas={[
                {
                  rotulo: 'HH DEL MES',
                  valor: mes.trabajadas || null,
                  falta: 'sin imputar',
                  detalle: mes.registros.length ? `${mes.registros.length} registros` : undefined,
                },
                {
                  rotulo: 'HH DEL AÑO',
                  valor: anio.trabajadas || null,
                  falta: 'sin imputar',
                  detalle: anio.obras.length ? `en ${anio.obras.length} ${anio.obras.length === 1 ? 'obra' : 'obras'}` : undefined,
                },
                {
                  rotulo: 'ANTIGÜEDAD',
                  valor: antiguedad === null
                    ? null
                    : `${antiguedad.toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} a`,
                  falta: 'sin fecha de alta',
                  detalle: persona.fecha_ingreso ? `desde ${fecha(persona.fecha_ingreso)}` : undefined,
                },
                {
                  rotulo: 'PAPELES PENDIENTES',
                  valor: pendientes || null,
                  falta: persona.en_la_empresa ? 'ninguno' : 'legajo cerrado',
                  tono: 'neg',
                  detalle: papeles.length ? `de ${papeles.length}` : undefined,
                },
              ]}
            />
          )}

          {vista === 'resumen' && (
            <SemanaDeAsistencia dias={dias} total={totalDeLaSemana(dias)} jornadaSemanal={44} />
          )}

          {vista === 'resumen' && (
            <TarjetaFicha
              titulo="Asignación actual"
              testid="bloque-asignacion-actual"
              icono={
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                  <path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="3.2" /><path d="M22 21v-2a4 4 0 00-3-3.8" />
                </svg>
              }
            >
              {vigente
                ? (
                    <div className="grid gap-x-10 px-4 py-1 sm:grid-cols-2">
                      <Dato k="Obra" v={vigente.obra_nombre ?? vigente.obra_id} />
                      <Dato k="Actividad" v={vigente.actividad_nombre ?? 'toda la obra'} />
                      <Dato k="Cuadrilla" v={vigente.cuadrilla} />
                      <Dato k="Rol" v={vigente.rol ?? 'integrante'} />
                      <Dato k="Desde" v={vigente.desde ? fecha(vigente.desde) : null} mono />
                    </div>
                  )
                : (
                    <div className="px-4 py-3">
                      <Vacio accion={<Link href="/obras" className="text-ink hover:underline">Ir a Obras →</Link>}>
                        Sin asignación vigente. Se asigna desde la solapa Personal de la obra.
                      </Vacio>
                    </div>
                  )}
            </TarjetaFicha>
          )}

          {/* EL HISTORIAL RECIENTE VA EN EL RESUMEN, y no porque hubiera lugar: la segunda pregunta
              que se le hace a un legajo, después de «dónde está hoy», es «dónde estuvo». Ya está
              leído para calcular la asignación vigente, así que no cuesta una consulta más. Las
              cerradas completas viven en su solapa. */}
          {vista === 'resumen' && cerradas.length > 0 && (
            <Bloque
              titulo="Estuvo antes en"
              testid="bloque-historial"
              ayuda={<Link href={href('asignaciones')} className="text-muted hover:text-ink">Ver el historial completo →</Link>}
            >
              <ul>
                {cerradas.slice(0, 4).map((a) => (
                  <li key={a.id} className="flex items-baseline justify-between gap-4 border-b border-[#EFEEEA] py-2.5 last:border-0">
                    <Link href={`/obras/${a.obra_id}`} className="min-w-0 flex-1 truncate text-[13px] text-ink hover:underline">
                      {a.obra_nombre ?? a.obra_id}
                    </Link>
                    <span className="shrink-0 font-mono text-[11.5px] tabular-nums text-faint">
                      {a.desde ? fecha(a.desde) : 'sin fecha'} → {a.hasta ? fecha(a.hasta) : 'sin fecha'}
                    </span>
                  </li>
                ))}
              </ul>
            </Bloque>
          )}

          {vista === 'asignaciones' && (
            <Bloque
              titulo="Historial de asignaciones"
              testid="bloque-asignaciones"
              ayuda="La misma relación que muestra Obra → Personal."
            >
              <BloqueAsignacion
                asignaciones={asignaciones?.data ?? []}
                cerrar={cerrarAsignacionDePersona.bind(null, id)}
              />
            </Bloque>
          )}

          {vista === 'horas' && (
            <Bloque titulo="Horas imputadas" testid="bloque-horas">
              <BloqueHoras
                periodo={rotulo(ventana)}
                horasPeriodo={resumen.trabajadas}
                porTipo={resumen.porTipo}
                porObra={resumen.obras}
                porActividad={resumen.actividades}
                registros={resumen.registros}
                historial={filasHH}
                periodoActivo={periodo}
                hrefPeriodo={(p) => `${base}?${new URLSearchParams({ v: 'horas', p })}`}
              />
            </Bloque>
          )}

          {vista === 'documentos' && (
            <Bloque titulo="Documentos" testid="bloque-documentos" ayuda="Vínculos a Drive. El archivo no se copia.">
              <BloqueDocumentos
                documentos={documentos?.data ?? []}
                desvincular={desvincularDocumento.bind(null, id)}
                enLaEmpresa={persona.en_la_empresa}
                carpetaDrive={persona.drive_folder_id}
              />
              <AltaDocumento vincular={vincularDocumento.bind(null, id)} />
            </Bloque>
          )}

          {/* LA SOLAPA SE ESCONDE Y ADEMÁS SE CIERRA. Esconder el tab evita ofrecer algo que rebota;
              este `if` es lo que impide que `?v=usuario` escrito a mano devuelva el correo y el
              estado de la cuenta de alguien a quien la lista negra le cierra `/administracion/usuarios`. */}
          {vista === 'usuario' && !veLaCuenta && (
            <div data-testid="usuario-sin-permiso">
              <Aviso tono="info" titulo="Esta solapa es de Dirección y Administración">
                La cuenta con la que alguien entra al sistema y sus permisos se ven donde se
                gestionan las cuentas. Administrar el legajo y administrar el acceso son dos cosas
                distintas.
              </Aviso>
            </div>
          )}

          {vista === 'usuario' && cuenta && (
            <BloqueUsuario
              personaId={id}
              lectura={cuenta}
              rolActor={rolActor}
              // NADIE SE SACA EL ACCESO A SÍ MISMO, y acá se sabe antes de apretar: la regla también
              // vive en `reglas.ts` y la acción la vuelve a aplicar, pero un botón que rebota no
              // explica por qué.
              esUnoMismo={cuenta.hay && cuenta.cuenta.usuarioId === actor?.id}
            />
          )}

          {vista === 'auditoria' && bitacora && (
            <Bloque
              titulo="Auditoría de cambios"
              testid="bloque-auditoria"
              ayuda="Cada cambio de la ficha, con quién y cuándo."
            >
              <BloqueAuditoria
                bitacora={bitacora}
                hrefMas={`${base}?${new URLSearchParams({ v: 'auditoria', n: String(cuantos + TRAMO) })}`}
              />
            </Bloque>
          )}
        </div>

        {/* EL ASIDE DE PROPIEDADES — `LAYOUT_RESPONSIVE.md`: «Fichas de entidad: columna ancha +
            aside de 320–360px de propiedades». Está en las cuatro solapas a propósito: quién es esta
            persona es el contexto de todo lo demás, y perderlo al mirar sus horas obliga a volver. */}
        {!editar && (
          <aside className="w-full shrink-0 space-y-3 lg:w-[372px]">
            {/* «DATOS» — el bloque de propiedades del canónico 20. Sigue partido en dos tarjetas,
                identidad y laboral, porque son los DOS grupos que el panel edita por separado:
                fundirlos en una sola daría un único «Editar» que abre veinte campos, que es
                exactamente lo que el panel lateral vino a evitar. */}
            <TarjetaFicha
              titulo="Datos"
              testid="bloque-identidad"
              indicador={
                <Link href={href(vista, 'identidad')} data-testid="bloque-identidad-editar" className="font-sans text-[11.5px] text-muted transition-colors hover:text-ink">
                  Editar
                </Link>
              }
            >
              <CuerpoDatos>
                {/* SE MUESTRAN FORMATEADOS Y SE GUARDAN PELADOS: once cifras seguidas no se comparan
                    de un vistazo contra el papel que alguien tiene en la mano. Ver `identidad.ts`. */}
                <DatoFicha k="DNI" v={formatearDni(persona.dni)} mono />
                <DatoFicha k="CUIL" v={formatearCuit(persona.cuil)} mono />
                <DatoFicha k="Nacimiento" v={persona.fecha_nacimiento ? fecha(persona.fecha_nacimiento) : null} mono />
                <DatoFicha k="Nacionalidad" v={persona.nacionalidad} />
                <DatoFicha k="Teléfono" v={persona.telefono} mono />
                <DatoFicha k="Email" v={persona.email} />
                <DatoFicha k="Domicilio" v={persona.domicilio} />
                <DatoFicha
                  k="Emergencia"
                  v={[persona.contacto_emergencia, persona.contacto_emergencia_telefono].filter(Boolean).join(' · ') || null}
                />
                <DatoFicha k="Cuadrilla" v={vigente?.cuadrilla ?? null} falta="sin cuadrilla" />
              </CuerpoDatos>
            </TarjetaFicha>

            <TarjetaFicha
              titulo="Laboral"
              testid="bloque-laboral"
              indicador={
                <Link href={href(vista, 'laboral')} data-testid="bloque-laboral-editar" className="font-sans text-[11.5px] text-muted transition-colors hover:text-ink">
                  Editar
                </Link>
              }
            >
              <CuerpoDatos>
                <DatoFicha k="Legajo" v={persona.legajo} mono />
                <DatoFicha k="Ingreso" v={persona.fecha_ingreso ? fecha(persona.fecha_ingreso) : null} mono />
                {/* SE FUE SIN FECHA NO ES LO MISMO QUE NO SE FUE: de los legajos cerrados, 22 no
                    tienen baja documentada. Lo que falta es el papel, no la carga. */}
                <DatoFicha
                  k="Baja"
                  v={persona.fecha_egreso ? fecha(persona.fecha_egreso) : (egresada ? 'sin papel de baja' : 'no egresó')}
                  mono={Boolean(persona.fecha_egreso)}
                />
                {/* TRES HECHOS, TRES RÓTULOS. La CATEGORÍA es lo que la persona cobra (CCT, efecto
                    económico); el OFICIO es lo que sabe hacer; el PUESTO es el cargo tal como lo
                    escribe la nómina. Los tres decían casi lo mismo y en los legajos donde la nómina
                    cargó «OFICIAL» en el puesto, la ficha mostraba la categoría dos veces con
                    nombres distintos. El puesto se calla cuando NO agrega nada sobre la categoría. */}
                <DatoFicha k="Convenio" v={persona.convenio_colectivo} />
                <DatoFicha k="Categoría" v={persona.categoria ? etiquetaCategoria(persona.categoria) : null} />
                <DatoFicha k="Oficio" v={persona.especialidad} />
                {!pareceCategoria(persona.puesto) && <DatoFicha k="Puesto" v={persona.puesto} />}
                <DatoFicha k="Modalidad" v={persona.modalidad_liquidacion} />
                <DatoFicha k="Notas" v={persona.notas} />
                {/* LA RETRIBUCIÓN NO LLEGA A ESTA PANTALLA, y no por decisión de diseño:
                    `persona_legajo` no publica la columna. Se dice, en vez de dibujar «sin cargar»
                    —que afirmaría que nadie la cargó—. */}
                <DatoFicha k="Retribución" v={null} falta="no llega a esta pantalla" />
              </CuerpoDatos>
            </TarjetaFicha>

            <TarjetaFicha
              titulo="Documentación"
              testid="aside-documentacion"
              tonoIndicador={pendientes > 0 ? 'neg' : 'ink'}
              indicador={papeles.length === 0
                ? <span className="font-sans text-[11.5px] text-faint">sin papeles</span>
                : (pendientes > 0
                    ? <span className="font-sans text-[11.5px] text-neg">{pendientes} {pendientes === 1 ? 'falta' : 'faltan'}</span>
                    : <span className="font-sans text-[11.5px] text-pos">al día</span>)}
              icono={
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                  <path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z" /><path d="M14 3v5h5" />
                </svg>
              }
            >
              {papeles.length === 0
                ? <p className="px-3.5 py-3 text-[12px] text-faint">Todavía no hay documentos vinculados al legajo.</p>
                : papeles.slice(0, 6).map((d) => {
                    const estado = estadoDocumento(d)
                    return (
                      <FilaTarjeta
                        key={d.id}
                        href={href('documentos')}
                        testid={`aside-doc-${d.id}`}
                        titulo={d.nombre ?? d.tipo_documento?.replace(/_/g, ' ') ?? 'sin nombre'}
                        // NO HAY VENCIMIENTO QUE MOSTRAR: `documento_legajo` no guarda fecha de
                        // vencimiento, así que la fecha que se escribe es la del documento y se
                        // rotula como tal. Pintar «vence en 20 días» sería inventarlo.
                        detalle={estado === 'cargado'
                          ? (d.fecha_documento ? `cargado ${fecha(d.fecha_documento)}` : 'cargado')
                          : DOCUMENTO_ESTADO[estado].palabra}
                        tonoDetalle={estado === 'cargado' ? 'faint' : 'neg'}
                      />
                    )
                  })}
            </TarjetaFicha>

            <TarjetaFicha
              titulo="Obras donde trabajó"
              testid="aside-obras"
              icono={
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                  <path d="M3 21h18M6 21V8l6-4 6 4v13" /><path d="M10 21v-6h4v6" />
                </svg>
              }
            >
              {(asignaciones?.data ?? []).length === 0
                ? <p className="px-3.5 py-3 text-[12px] text-faint">Sin asignaciones registradas.</p>
                : (asignaciones?.data ?? []).slice(0, 6).map((a) => (
                    <FilaTarjeta
                      key={a.id}
                      href={`/obras/${a.obra_id}`}
                      testid={`aside-obra-${a.id}`}
                      punto={a.hasta ? 'faint' : 'pos'}
                      titulo={a.obra_nombre ?? a.obra_id}
                      detalle={a.hasta
                        ? `${a.desde ? fecha(a.desde) : 'sin fecha'} → ${fecha(a.hasta)}`
                        : ['actual', a.cuadrilla].filter(Boolean).join(' · ')}
                      // LAS HH SON LAS DEL AÑO EN CURSO, que es la ventana que la tira ya leyó. Una
                      // obra sin horas imputadas NO publica un cero: se calla.
                      valor={hhPorObra.get(a.obra_id) ?? undefined}
                    />
                  ))}
            </TarjetaFicha>
          </aside>
        )}

        {editar && (
          <PanelEdicion
            titulo={editar === 'identidad' ? 'Editar identidad' : 'Editar datos laborales'}
            subtitulo={persona.nombre_completo}
            accion={editarPersona.bind(null, id, editar)}
            cerrarHref={href(vista)}
            testid={`panel-editar-${editar}`}
          >
            {editar === 'identidad'
              ? <CamposIdentidad persona={persona} />
              : <CamposLaboral persona={persona} />}
          </PanelEdicion>
        )}
      </div>
      </div>
    </div>
  )
}
