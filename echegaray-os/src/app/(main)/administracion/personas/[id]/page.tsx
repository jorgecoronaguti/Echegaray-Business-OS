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

import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { BotonAccion } from '@/shared/components/ui'
import { Aviso } from '@/shared/components/ds'
import { V } from '@/shared/components/v2/patron'
import {
  AccionPrimaria, AccionSecundaria, AvisoDeFicha, CifrasDeFicha, CostadoDeFicha, CuerpoDeFicha,
  Migas, PastillaFilo, SolapasDeFicha, TituloDeFicha, type CifraDeFicha, PantallaV2,
} from '@/shared/components/v2/segundoNivel'
import { CostadoLegajo, type DatoDeLegajo } from '@/features/administracion/components/CostadoLegajo'
import { hhPorMes } from '@/features/administracion/services/hhPorMes'
import { IconoEditar, IconoObra } from '@/shared/components/iconos'
import { QuincenaDeAsistencia } from '@/features/administracion/components/QuincenaDeAsistencia'
import { ObrasDeLaPersona } from '@/features/administracion/components/ObrasDeLaPersona'
import { AnotacionesDeLaPersona } from '@/features/administracion/components/AnotacionesDeLaPersona'
import { obrasTrabajadas } from '@/features/administracion/services/obrasDePersona'
import { getObrasDeLosRegistros } from '@/features/administracion/services/obrasDePersonaService'
import {
  cifrasDeQuincena, diasDeLaQuincena, ultimasQuincenas,
} from '@/features/administracion/services/quincenaDePersona'
import { quincenaDe, rotuloQuincena } from '@/features/administracion/services/quincena'
import { getNoLaborables, getObraDeLaJornada } from '@/features/administracion/services/jornadaPorObraService'
import { getPresenciaDePersona } from '@/features/administracion/services/presenciaDelDiaService'
import { getPerfilActual, getUsuarioActual } from '@/features/auth/services/authService'
import { BloqueAsignacion, BloqueDocumentos, BloqueHoras } from '@/features/administracion/components/BloquesFicha'
import { BloqueAuditoria } from '@/features/administracion/components/BloqueAuditoria'
import { BloqueUsuario } from '@/features/administracion/components/BloqueUsuario'
import { CamposIdentidad, CamposLaboral } from '@/features/administracion/components/FormularioPersona'
import { AltaDocumento } from '@/features/administracion/components/FichaPartes'
import { LABEL_FICHA, VISTAS_FICHA, type VistaFicha } from '@/features/administracion/services/vistasFicha'
import { PanelEdicion } from '@/features/administracion/components/PanelEdicion'
import { getAsignacionesDe, getDocumentos, getPersona } from '@/features/administracion/services/personasService'
import { antiguedadEnAnios, papelesPendientes } from '@/features/administracion/services/fichaPersona'
import { veLaCuentaDeOtro } from '@/features/administracion/services/accesoPersona'
import { puedeAnotar, veAnotaciones } from '@/features/administracion/services/anotacionesPersona'
import { getAnotaciones } from '@/features/administracion/services/anotacionesService'
import { crearAnotacion } from '@/features/administracion/services/anotacionesActions'
import { getCuentaDePersona } from '@/features/administracion/services/accesoService'
import { getBitacora, TRAMO } from '@/features/administracion/services/auditoriaService'
import { getHHDePersona, resumenDelPeriodo } from '@/features/administracion/services/hhPersonaService'
import { esPeriodo, rotulo, ventanaDe, type Periodo } from '@/features/administracion/services/periodoHH'
import { darDeBaja, editarPersona, reincorporar, type GrupoEdicion } from '@/features/administracion/services/personasActions'
import { cerrarAsignacionDePersona } from '@/features/administracion/services/asignacionActions'
import { desvincularDocumento, vincularDocumento } from '@/features/administracion/services/documentosActions'
import { formatearCuit, formatearDni } from '@/features/administracion/services/identidad'
import { etiquetaCategoria } from '@/features/administracion/types'
import { oracion } from '@/shared/utils/texto'
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
      <PantallaV2>
        <Migas volverA="/administracion/personas" padre="Personal" actual="Legajo" />
        <div style={{ padding: '16px 20px' }} data-testid="ficha-error"><Aviso tono="neg">{error}</Aviso></div>
      </PantallaV2>
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
  // LAS ANOTACIONES SÓLO EN EL RESUMEN, que es donde se dibuja el bloque. Y sólo si el que mira
  // puede verlas: esconder el bloque y leer igual dejaría el texto en el HTML de la página para el
  // que sepa mirar la respuesta del servidor —el mismo criterio que la cuenta, arriba—. La RLS
  // devolvería cero filas de todos modos; esto evita hasta el viaje.
  const anotaciones = vista === 'resumen' && veAnotaciones(rolActor)
    ? await getAnotaciones(supabase, id)
    : null
  const cuantos = cuantosCambios(sp.n)
  const bitacora = vista === 'auditoria' ? await getBitacora(supabase, 'personas', id, cuantos) : null

  const vigente = (asignaciones?.data ?? []).find((a) => !a.hasta) ?? null
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
  // El error de las anotaciones entra al mismo aviso: un bloque que no se pudo leer no puede
  // dibujarse vacío como si la persona no tuviera ninguna. (La tabla ausente NO es un error: viaja
  // por `pendiente` y lo dice el propio bloque.)
  const fallo = asignaciones?.error ?? horas?.error ?? documentos?.error ?? anotaciones?.error

  // LO QUE PUBLICA LA TIRA DE MÉTRICAS. Las tres ventanas se fijan en el SERVIDOR por la misma razón
  // que la de la liquidación: el mes y el año dependen del día, y el navegador de quien mira puede
  // estar del otro lado de la medianoche.
  const hoy = new Date().toISOString().slice(0, 10)
  const mes = resumenDelPeriodo(filasHH, ventanaDe('mes', hoy).desde, ventanaDe('mes', hoy).hasta)
  const anio = resumenDelPeriodo(filasHH, `${hoy.slice(0, 4)}-01-01`, `${hoy.slice(0, 4)}-12-31`)
  // LA QUINCENA DEL RESUMEN. Dos lecturas más y sólo en esta vista: los feriados de la ventana y la
  // jornada pactada de la obra donde está. Sin ellas el bloque tendría que INVENTAR el denominador
  // —que es lo que hacía el «/ 44,0 h»— y reclamaría los sábados como días sin cargar.
  const quincena = quincenaDe(hoy)
  // LA JORNADA SALE DE LA OBRA DONDE ESTÁN LAS HORAS, no de la asignación vigente. En la base al
  // 08/09/2026 hay gente asignada a una obra que imputa a otra: tomar la jornada de la asignación
  // daría un denominador de una obra en la que esa persona no trabajó esta quincena. La asignación
  // se sigue nombrando —es el hecho contractual— y cuando las dos no coinciden, se dicen las dos.
  const obraDeLasHoras = resumenDelPeriodo(filasHH, quincena.desde, quincena.hasta)
    .obras.find((o) => o.clave !== '—') ?? null
  const obraDeLaJornada = obraDeLasHoras?.clave ?? vigente?.obra_id ?? null
  const [feriados, obraVigente, catalogoObras, presencia] = vista === 'resumen'
    ? await Promise.all([
        getNoLaborables(supabase, quincena.desde, quincena.hasta),
        obraDeLaJornada ? getObraDeLaJornada(supabase, obraDeLaJornada) : Promise.resolve(null),
        // EL CATÁLOGO DE LAS OBRAS DONDE TIENE HORAS. Se pide por los ids que ya trajeron los
        // registros, no la tabla entera, y SIN filtrar por estado: la mitad de las obras del
        // historial de una persona están cerradas y son las que el dueño pidió ver.
        getObrasDeLosRegistros(supabase, filasHH.map((f) => f.obra_canonica_id)),
        // LO QUE EL JEFE DECLARÓ EN LA VENTANA (`asistencia_dia`). Sin esta lectura la franja
        // dibujaba sólo `registros_hh`: el día marcado ausente y todavía sin horas cargadas se veía
        // «sin registrar», que es el gris de «nadie cargó» y dice otra cosa completamente distinta.
        getPresenciaDePersona(supabase, id, quincena.desde, quincena.hasta),
      ])
    : [[], null, {}, null]
  // UNA LECTURA QUE FALLÓ NO ES UNA QUINCENA SIN DECLARACIONES: `data` en `null` deja la franja
  // como estaba antes de esta lectura, y el error viaja al aviso de arriba con el resto.
  const dias = diasDeLaQuincena(filasHH, quincena, {
    feriados, hoy, presencia: presencia?.data ?? [],
  })
  // HH POR OBRA DEL AÑO: es lo que el canónico pone a la derecha de «Obras donde trabajó». Un mapa,
  // porque la lista se arma con las ASIGNACIONES —que son el hecho de haber estado— y las horas sólo
  // completan el renglón cuando existen.
  const hhPorObra = new Map(anio.obras.map((o) => [o.clave, o.horas]))

  // HH POR MES DEL COSTADO: se arma sobre los registros YA leídos. Un `group by` más contra
  // `registros_hh` daría un segundo total del mismo mes por otro camino, y el día que no coincidan
  // nadie sabría cuál mirar. Sólo se calcula cuando las horas se leyeron.
  const meses = horas ? hhPorMes(filasHH, hoy, 5) : []

  const identidad: DatoDeLegajo[] = [
    // SE MUESTRAN FORMATEADOS Y SE GUARDAN PELADOS: once cifras seguidas no se comparan de un
    // vistazo contra el papel que alguien tiene en la mano. Ver `identidad.ts`.
    { k: 'DNI', v: formatearDni(persona.dni), mono: true },
    { k: 'CUIL', v: formatearCuit(persona.cuil), mono: true },
    { k: 'Nacimiento', v: persona.fecha_nacimiento ? fecha(persona.fecha_nacimiento) : null, mono: true },
    { k: 'Nacionalidad', v: persona.nacionalidad },
    { k: 'Teléfono', v: persona.telefono, mono: true },
    { k: 'Email', v: persona.email },
    { k: 'Domicilio', v: persona.domicilio },
    {
      k: 'Emergencia',
      v: [persona.contacto_emergencia, persona.contacto_emergencia_telefono].filter(Boolean).join(' · ') || null,
    },
  ]

  const laboral: DatoDeLegajo[] = [
    { k: 'Legajo', v: persona.legajo, mono: true },
    { k: 'Ingreso', v: persona.fecha_ingreso ? fecha(persona.fecha_ingreso) : null, mono: true },
    // SE FUE SIN FECHA NO ES LO MISMO QUE NO SE FUE: de los legajos cerrados, 22 no tienen baja
    // documentada. Lo que falta es el papel, no la carga.
    {
      k: 'Baja',
      v: persona.fecha_egreso ? fecha(persona.fecha_egreso) : (egresada ? 'sin papel de baja' : 'no egresó'),
      mono: Boolean(persona.fecha_egreso),
    },
    // TRES HECHOS, TRES RÓTULOS. La CATEGORÍA es lo que la persona cobra (CCT, efecto económico); el
    // OFICIO es lo que sabe hacer; el PUESTO es el cargo tal como lo escribe la nómina. El puesto se
    // calla cuando NO agrega nada sobre la categoría.
    { k: 'Convenio', v: persona.convenio_colectivo },
    { k: 'Categoría', v: persona.categoria ? etiquetaCategoria(persona.categoria) : null },
    { k: 'Oficio', v: persona.especialidad },
    ...(pareceCategoria(persona.puesto) ? [] : [{ k: 'Puesto', v: persona.puesto }]),
    { k: 'Modalidad', v: persona.modalidad_liquidacion },
    { k: 'Notas', v: persona.notas },
    // LA RETRIBUCIÓN NO LLEGA A ESTA PANTALLA, y no por decisión de diseño: `persona_legajo` no
    // publica la columna. Se dice, en vez de dibujar «sin cargar» —que afirmaría que nadie la cargó—.
    { k: 'Retribución', v: null, falta: 'no llega a esta pantalla' },
  ]

  const asignacion: DatoDeLegajo[] = vigente
    ? [
        { k: 'Obra', v: vigente.obra_nombre ?? vigente.obra_id },
        { k: 'Actividad', v: vigente.actividad_nombre ?? 'toda la obra' },
        { k: 'Cuadrilla', v: vigente.cuadrilla, falta: 'sin cuadrilla' },
        { k: 'Rol', v: vigente.rol ?? 'integrante' },
        { k: 'Desde', v: vigente.desde ? fecha(vigente.desde) : null, mono: true },
      ]
    // SIN ASIGNACIÓN VIGENTE no se dibujan cinco renglones vacíos: se dice la única cosa que hay que
    // saber, que es dónde se resuelve.
    : [{ k: 'Obra', v: null, falta: 'sin asignación vigente' }]

  const cifras: CifraDeFicha[] = [
    // El cuarto número del canónico es «Ausencias»; acá va «Papeles pendientes» porque una ausencia
    // CON AVISO no existe como hecho cargado en `registros_hh` —hay tipo `ausencia`, pero no el
    // aviso— y dibujar el rótulo sobre un conteo de otra cosa afirmaría algo que nadie registró.
    {
      rotulo: 'HH del mes',
      // Sin las horas leídas la cifra NO dice 0: dice que no se leyeron. Un cero acá afirma que la
      // persona no trabajó este mes.
      valor: horas ? (mes.trabajadas || null) : null,
      falta: horas ? 'sin imputar' : 'se lee en Horas',
    },
    {
      rotulo: 'HH del año',
      valor: horas ? (anio.trabajadas || null) : null,
      falta: horas ? 'sin imputar' : 'se lee en Horas',
    },
    {
      rotulo: 'Antigüedad',
      valor: antiguedad === null
        ? null
        : `${antiguedad.toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} a`,
      falta: 'sin fecha de alta',
    },
    {
      rotulo: 'Papeles pendientes',
      valor: pendientes || null,
      falta: persona.en_la_empresa ? 'ninguno' : 'legajo cerrado',
      tono: 'neg',
    },
  ]

  // EL SUBTÍTULO DEL MOCKUP: oficio · convenio · desde cuándo. El oficio es lo que sabe hacer y la
  // categoría lo que cobra: cuando el oficio no está cargado, el que habla es la categoría.
  const bajada = [
    persona.especialidad?.trim()
      ?? (persona.categoria ? etiquetaCategoria(persona.categoria) : 'sin oficio cargado'),
    persona.convenio_colectivo?.trim() || null,
    persona.fecha_ingreso ? `en la empresa desde ${fecha(persona.fecha_ingreso)}` : null,
  ].filter(Boolean).join(' · ')

  return (
    <PantallaV2>
      <Migas volverA="/administracion/personas" padre="Personal" actual={oracion(persona.nombre_completo)} />

      {/* EL NOMBRE SE DIBUJA EN ORACIÓN. Llega gritado desde el legajo («CRISTIAN AGÜERO») porque así
          lo escriben las planillas de jornales. El DATO no se toca: `oracion` es de dibujo, y el
          nombre que viaja al recibo, al alta temprana y al IERIC sigue siendo el guardado. */}
      <TituloDeFicha
        titulo={oracion(persona.nombre_completo)}
        bajada={bajada}
        junto={
          <>
            <span className="font-mono" style={{ fontSize: '12px', color: V.lupa }} data-testid="legajo-numero">
              legajo {persona.legajo ?? 'sin número'}
            </span>
            {/* EL ESTADO SALE DE `en_la_empresa`, NO DE LA FECHA: hay 15 personas que se fueron sin
                baja documentada y por la fecha figurarían activas. */}
            {egresada && (
              <PastillaFilo testid="pastilla-estado-persona">
                {persona.fecha_egreso ? `inactiva desde ${fecha(persona.fecha_egreso)}` : 'ya no está en la empresa'}
              </PastillaFilo>
            )}
          </>
        }
        acciones={
          <>
            <AccionSecundaria
              href={href(vista, 'identidad')} testid="editar-legajo"
              icono={<IconoEditar className="h-[14px] w-[14px]" />}
            >
              Editar legajo
            </AccionSecundaria>
            {/* `args` y NO una función flecha: `accion={() => darDeBaja(id)}` crea una función nueva
                que React rechaza en ejecución —«Functions cannot be passed directly to Client
                Components»— y la pantalla queda EN BLANCO, sin que typecheck ni build lo vean. */}
            {egresada
              ? <BotonAccion accion={reincorporar} args={[id]} testid="reincorporar">Reincorporar</BotonAccion>
              : <BotonAccion accion={darDeBaja} args={[id]} testid="dar-de-baja">Dar de baja</BotonAccion>}
            {/* LA ÚNICA PRIMARIA, y sólo cuando hay algo que hacer con ella: una persona activa sin
                obra no suma a la proyección de dotación de ninguna. Con asignación vigente el botón
                no tendría nada que resolver, y un amarillo permanente deja de significar. */}
            {!egresada && !vigente && (
              <AccionPrimaria
                href="/obras" testid="asignar-obra"
                icono={<IconoObra className="h-[14px] w-[14px]" />}
              >
                Asignar a una obra
              </AccionPrimaria>
            )}
          </>
        }
      />

      {!egresada && !vigente && (
        <AvisoDeFicha verbo="Asignar obra" href="/obras" testid="aviso-sin-obra">
          Activo pero sin obra: no suma a la proyección de dotación de ninguna. Se asigna desde la
          solapa Personal de la obra.
        </AvisoDeFicha>
      )}
      {vigente && pendientes > 0 && (
        <AvisoDeFicha verbo="Ver papeles" href={href('documentos')} testid="aviso-papeles">
          {pendientes === 1
            ? 'Falta un papel del legajo.'
            : `Faltan ${pendientes} papeles del legajo.`}
          {' '}Ninguno vence: `documento_legajo` no guarda fecha de vencimiento, así que lo que falta
          es que estén, no que estén al día.
        </AvisoDeFicha>
      )}

      <CifrasDeFicha cifras={cifras} testid="cifras-persona" />

      <SolapasDeFicha
        testid="nav-ficha-persona"
        solapas={VISTAS_FICHA
          .filter((v) => veLaCuenta || v !== 'usuario')
          .map((v) => ({
            clave: v,
            titulo: LABEL_FICHA[v],
            // Sólo el de las solapas cuyo número la página YA leyó. «Horas» no lo lleva a propósito:
            // su fuente es `registros_hh` entera, y contarla para pintar un número al lado de una
            // solapa que nadie abrió sería pagar la consulta cara en las seis vistas.
            cuenta: v === 'asignaciones'
              ? asignaciones?.data?.length ?? null
              : v === 'documentos' ? papeles.length : null,
            activa: v === vista,
            href: href(v),
          }))}
      />

      <CuerpoDeFicha>
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          {fallo && <Aviso tono="neg">{fallo}</Aviso>}
          {/* LA PRESENCIA DECLARADA FALLA POR SU CUENTA Y NO TIRA LA FICHA: la franja queda con lo
              que sí se pudo leer —las horas— y se dice qué falta, en vez de dibujar un silencio. */}
          {presencia?.error && (
            <Aviso tono="info" testid="sin-presencia-declarada" titulo="No pude leer la presencia declarada">
              {presencia.error}
            </Aviso>
          )}

          {vista === 'resumen' && (
            <>
              <QuincenaDeAsistencia
                dias={dias}
                cifras={cifrasDeQuincena(dias, obraVigente?.data?.jornada ?? null)}
                barras={ultimasQuincenas(filasHH, hoy)}
                obra={vigente || obraDeLasHoras
                  ? {
                      nombre: vigente?.obra_nombre ?? obraDeLasHoras?.etiqueta ?? 'sin obra',
                      desde: vigente?.desde ? fecha(vigente.desde) : null,
                      jornada: obraVigente?.data?.jornada ?? null,
                      // Sólo cuando NO coinciden: repetir el mismo nombre dos veces es ruido.
                      imputadaA: obraDeLasHoras && obraDeLasHoras.clave !== vigente?.obra_id
                        ? obraDeLasHoras.etiqueta
                        : null,
                    }
                  : null}
                rotuloVentana={rotuloQuincena(quincena)}
                hrefHoras={href('horas')}
              />

              {/* DÓNDE TRABAJÓ — TODAS sus obras, cerradas incluidas. Va debajo de la quincena
                  porque contesta la pregunta siguiente: la quincena dice cómo viene ahora, ésta
                  dice de dónde viene. Las dos leen `registros_hh`, que ya está en memoria. */}
              <ObrasDeLaPersona
                obras={obrasTrabajadas(filasHH, {
                  obras: catalogoObras,
                  obraVigente: vigente?.obra_id ?? null,
                })}
                hrefAsignaciones={href('asignaciones')}
              />

              {/* ANOTACIONES — debajo de «Obras en las que trabajó» porque es la pregunta que sigue:
                  dónde estuvo, y qué pasó con él. Sólo para quien la ficha del empleador es suya
                  (dirección, administración, jefe de obra); el rol `campo` no llega ni al bloque ni
                  a las filas —la RLS le devuelve cero—, y en «Mi cuenta» no existe. */}
              {anotaciones && (
                <AnotacionesDeLaPersona
                  anotaciones={anotaciones.data ?? []}
                  pendiente={anotaciones.pendiente}
                  puedeEscribir={puedeAnotar(rolActor)}
                  anotar={crearAnotacion.bind(null, id)}
                />
              )}
            </>
          )}

          {vista === 'asignaciones' && (
            <div data-testid="bloque-asignaciones">
              <BloqueAsignacion
                asignaciones={asignaciones?.data ?? []}
                cerrar={cerrarAsignacionDePersona.bind(null, id)}
              />
              {/* LAS HH DEL AÑO POR OBRA acompañan al historial: es lo que el canónico pone al lado.
                  Una obra sin horas imputadas NO publica un cero — se calla. */}
              <p style={{ fontSize: '11px', lineHeight: 1.6, color: V.tenue, marginTop: 12, maxWidth: 720 }}>
                La misma relación que muestra Obra → Personal.
                {hhPorObra.size > 0 && ` Con horas imputadas este año en ${hhPorObra.size} ${hhPorObra.size === 1 ? 'obra' : 'obras'}.`}
              </p>
            </div>
          )}

          {vista === 'horas' && (
            <div data-testid="bloque-horas">
              <BloqueHoras
                periodo={rotulo(ventana)}
                ventana={ventana}
                horasPeriodo={resumen.trabajadas}
                porTipo={resumen.porTipo}
                porObra={resumen.obras}
                porActividad={resumen.actividades}
                registros={resumen.registros}
                historial={filasHH}
                periodoActivo={periodo}
                hrefPeriodo={(p) => `${base}?${new URLSearchParams({ v: 'horas', p })}`}
              />
            </div>
          )}

          {vista === 'documentos' && (
            <div data-testid="bloque-documentos">
              <BloqueDocumentos
                documentos={documentos?.data ?? []}
                desvincular={desvincularDocumento.bind(null, id)}
                enLaEmpresa={persona.en_la_empresa}
                carpetaDrive={persona.drive_folder_id}
              />
              <AltaDocumento vincular={vincularDocumento.bind(null, id)} />
              <p style={{ fontSize: '11px', lineHeight: 1.6, color: V.tenue, marginTop: 12, maxWidth: 720 }}>
                Vínculos a Drive: el archivo no se copia. Ninguno vence —`documento_legajo` no guarda
                fecha de vencimiento—, así que esta cara nunca dice «al día»: sería una afirmación
                sobre un control que nadie está haciendo.
              </p>
            </div>
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
              // NADIE SE SACA EL ACCESO A SÍ MISMO, y acá se sabe antes de apretar.
              esUnoMismo={cuenta.hay && cuenta.cuenta.usuarioId === actor?.id}
            />
          )}

          {vista === 'auditoria' && bitacora && (
            <div data-testid="bloque-auditoria">
              <BloqueAuditoria
                bitacora={bitacora}
                hrefMas={`${base}?${new URLSearchParams({ v: 'auditoria', n: String(cuantos + TRAMO) })}`}
              />
            </div>
          )}
        </div>

        {/* EL COSTADO ESTÁ EN LAS SEIS CARAS a propósito: quién es esta persona es el contexto de
            todo lo demás, y perderlo al mirar sus horas obliga a volver. */}
        {editar
          ? (
              <PanelEdicion
                titulo={editar === 'identidad' ? 'Editar identidad' : 'Editar datos laborales'}
                subtitulo={oracion(persona.nombre_completo)}
                accion={editarPersona.bind(null, id, editar)}
                cerrarHref={href(vista)}
                testid={`panel-editar-${editar}`}
              >
                {editar === 'identidad'
                  ? <CamposIdentidad persona={persona} />
                  : <CamposLaboral persona={persona} />}
              </PanelEdicion>
            )
          : (
              <CostadoDeFicha testid="costado-legajo">
                <CostadoLegajo
                  identidad={identidad}
                  laboral={laboral}
                  asignacion={asignacion}
                  meses={meses}
                  hrefIdentidad={href(vista, 'identidad')}
                  hrefLaboral={href(vista, 'laboral')}
                  puedeEditar
                />
              </CostadoDeFicha>
            )}
      </CuerpoDeFicha>
    </PantallaV2>
  )
}

