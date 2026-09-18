// EL LEGAJO DE UNA PERSONA — ficha de entidad con seis solapas.
//
// ═══ LO QUE SE UNIFICÓ EL 18/09/2026 (dueño: «hay secciones que se pueden unificar») ═══
//
//   HORAS + ASIGNACIONES → «Horas y obras». Eran la misma pregunta partida en dos —dónde estuvo y
//   cuánto trabajó— y el Resumen lo delataba con DOS enlaces a dos caras de lo mismo. `?v=asignaciones`
//   sigue valiendo: lo traduce `vistaDe`. Nada se perdió; la cuenta de asignaciones que iba al lado
//   de la solapa ahora va en el rótulo de su sección, donde además dice de QUÉ es el número.
//
//   UN SOLO LENGUAJE VISUAL. El Resumen dibujaba tres cajas redondeadas (`TarjetaFicha`) sobre una
//   pantalla cuyo encabezado, cifras, retribución, horas y documentos son planos. Las tres pasaron a
//   `SeccionDeFicha`: mismo rótulo, mismo filo, misma sangría que el resto. Ni un dato se fue con la
//   caja — el título, la cuenta y el rango siguen en el rótulo de la sección.
//
//   EL AVISO DE PAPELES NOMBRA LO QUE FALTA. «Faltan 3 papeles» estaba dicho tres veces en la misma
//   pantalla (cifra, aviso, encabezado de la solapa) y en ninguna decía CUÁLES: había que abrir la
//   solapa igual. Ahora los nombra, y el salto deja de hacer falta. La cifra y el encabezado siguen.
//
//   EL AVISO DE «SIN OBRA» DICE DESDE CUÁNDO. El aviso y el botón amarillo llevaban los dos a
//   `/obras` con el mismo verbo. El botón es la acción; el aviso aporta lo que el botón no puede.
//
//   LO QUE NO SE TOCÓ Y POR QUÉ. «Usuario y permisos» y «Auditoría» piden predicados DISTINTOS
//   —`ve_economia()` y `es_administracion()`, y el jefe de obra entra a una y no a la otra—, así que
//   fundirlas movería un permiso. «Retribución» es de quien liquida sueldos, por lo mismo. Y ni un
//   número ni una regla de la retribución se modificó: sólo se la dejó donde estaba.
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
import { NotaBloque, V } from '@/shared/components/v2/patron'
import {
  AccionPrimaria, AccionSecundaria, AvisoDeFicha, CifrasDeFicha, CostadoDeFicha, CuerpoDeFicha,
  Migas, PastillaFilo, SeccionDeFicha, SolapasDeFicha, TituloDeFicha, type CifraDeFicha, PantallaV2,
} from '@/shared/components/v2/segundoNivel'
import { CostadoLegajo, type DatoDeLegajo } from '@/features/administracion/components/CostadoLegajo'
import { hhPorMes } from '@/features/administracion/services/hhPorMes'
import { IconoEditar, IconoObra } from '@/shared/components/iconos'
import { QuincenaDeAsistencia } from '@/features/administracion/components/QuincenaDeAsistencia'
import { ObrasDeLaPersona } from '@/features/administracion/components/ObrasDeLaPersona'
import { AnotacionesDeLaPersona } from '@/features/administracion/components/AnotacionesDeLaPersona'
import {
  obrasTrabajadas, tramosProgramadosDe,
} from '@/features/administracion/services/obrasDePersona'
import { getObrasDeLosRegistros } from '@/features/administracion/services/obrasDePersonaService'
import {
  cifrasDeQuincena, diasDeLaQuincena, ultimasQuincenas,
} from '@/features/administracion/services/quincenaDePersona'
import { quincenaDe, rotuloQuincena } from '@/features/administracion/services/quincena'
import { getNoLaborables, getObraDeLaJornada } from '@/features/administracion/services/jornadaPorObraService'
import { getPresenciaDePersona } from '@/features/administracion/services/presenciaDelDiaService'
import { getPerfilActual, getUsuarioActual } from '@/features/auth/services/authService'
import { BloqueAsignacion, BloqueDocumentos, BloqueHoras } from '@/features/administracion/components/BloquesFicha'
import { getArchivosDeEntidad } from '@/features/documentos/services/carpetaDeEntidadService'
import { getDocumentosSubidos } from '@/features/documentos/services/documentosSubidosService'
import { getCertificadosDeLicencia } from '@/features/documentos/services/certificadosDeLicenciaService'
import { ArchivosDeDrive } from '@/features/documentos/components/ArchivosDeDrive'
import { DocumentosSubidos } from '@/features/documentos/components/DocumentosSubidos'
import { BloqueAuditoria } from '@/features/administracion/components/BloqueAuditoria'
import { BloqueUsuario } from '@/features/administracion/components/BloqueUsuario'
import { CamposIdentidad, CamposLaboral } from '@/features/administracion/components/FormularioPersona'
import { AltaDocumento } from '@/features/administracion/components/FichaPartes'
import { LABEL_FICHA, VISTAS_FICHA, vistaDe, type VistaFicha } from '@/features/administracion/services/vistasFicha'
import { PanelEdicion } from '@/features/administracion/components/PanelEdicion'
import { getAsignacionesDe, getDocumentos, getPersona } from '@/features/administracion/services/personasService'
import {
  antiguedadEnAnios, frasePendientes, papelesPendientes, pendientesDelLegajo,
} from '@/features/administracion/services/fichaPersona'
import { veLaCuentaDeOtro } from '@/features/administracion/services/accesoPersona'
import { liquidaSueldos } from '@/features/auth/types/areas'
import { getValorHoraDelLegajo } from '@/features/administracion/services/valorHoraDelLegajoService'
import { ValorHoraDelLegajo } from '@/features/administracion/components/ValorHoraDelLegajo'
import { getRetribucionDelLegajo } from '@/features/administracion/services/retribucionDelLegajoService'
import { RetribucionDelLegajo } from '@/features/administracion/components/RetribucionDelLegajo'
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
  // `vistaDe` y no un `find`: `?v=asignaciones` dejó de ser una solapa el 18/09/2026 y sigue
  // circulando por specs, por el chat y por lo que alguien tenga en un favorito. Un `find` lo
  // habría dejado caer en el Resumen sin decir nada; el alias lo lleva a la cara que lo absorbió.
  const vista: VistaFicha = vistaDe(sp.v)
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
  // LA PUERTA DE LA PLATA: la misma que cierra la Liquidación. La cerradura sigue siendo la policy.
  const liquida = liquidaSueldos(rolActor)
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

  // EL DÍA SE FIJA UNA VEZ Y EN EL SERVIDOR. Lo usan la antigüedad, las tres ventanas de HH, la
  // quincena del resumen y el $/h vigente: calculado en el navegador, cada uno daría una respuesta
  // distinta a cada lado de la medianoche, y dos de ellos discreparían entre sí en la misma página.
  const hoy = new Date().toISOString().slice(0, 10)
  // Las TRES que el slab afirma en TODAS las vistas van juntas y en paralelo; la cara —las horas—
  // sigue corriendo sólo cuando alguien abre su solapa.
  //
  // EL $/H TAMBIÉN EN LAS SEIS, y por la misma razón que las asignaciones: la tira de arriba lo
  // AFIRMA en todas. Leerlo sólo en el Resumen escribiría «sin $/h cargado» en las otras cinco
  // sobre gente que sí tiene tarifa —el defecto que ya se pagó con «Obra actual: sin asignar»—. Son
  // cuatro consultas chicas: las de UNA persona y la escala de UNA categoría, no el módulo entero.
  const [asignaciones, documentos, valorHora] = await Promise.all([
    getAsignacionesDe(supabase, id),
    getDocumentos(supabase, id),
    getValorHoraDelLegajo(supabase, {
      personaId: id,
      cuil: persona.cuil ?? null,
      categoria: persona.categoria ?? null,
      convenio: persona.convenio_colectivo ?? null,
      // LA PUERTA, NO LA CERRADURA: la policy `liquida_sueldos()` cierra las tres tablas igual. Esto
      // evita el viaje y —lo que importa— deja decir «sin permiso» en vez de «sin dato», que es lo
      // que la RLS sola no puede distinguir: devuelve cero filas y ningún error.
      puedeVer: liquida,
      hoy,
    }),
  ])
  // LA RETRIBUCIÓN DEL AÑO SÓLO EN SU SOLAPA Y SÓLO CON PERMISO: es la lectura más cara del legajo
  // —le pregunta a la Liquidación quincena por quincena— y no se paga en las otras seis vistas.
  const retribucion = vista === 'retribucion' && liquida
    ? await getRetribucionDelLegajo(supabase, {
      personaId: id, cuil: persona.cuil ?? null, puedeVer: true, anio: Number(hoy.slice(0, 4)), hoy,
    })
    : null
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
  // LO QUE HAY EN LA CARPETA DEL LEGAJO EN DRIVE. Distinto de `getDocumentos`: eso son los papeles
  // que alguien TIPIFICÓ (alta temprana, DNI, EPP), esto es lo que ESTÁ en la carpeta —incluidos los
  // recibos que suben los scripts de la VM, que nunca se tipificaron—. Sólo en su solapa: es una
  // consulta más y las otras cinco no la dibujan.
  const archivosDrive = vista === 'documentos' ? await getArchivosDeEntidad(supabase, 'persona', id) : null
  // LOS PAPELES QUE ADMINISTRACIÓN SUBE DESDE ACÁ (DNI, alta en ARCA, libreta del IERIC). Hasta hoy
  // el legajo sólo podía VINCULAR un archivo que ya estuviera en Drive: quien tenía la foto del DNI
  // en el teléfono no tenía por dónde meterla.
  const subidos = vista === 'documentos' ? await getDocumentosSubidos(supabase, 'persona', id) : null
  const cuantos = cuantosCambios(sp.n)
  const bitacora = vista === 'auditoria' ? await getBitacora(supabase, 'personas', id, cuantos) : null

  const vigente = (asignaciones?.data ?? []).find((a) => !a.hasta) ?? null
  const papeles = documentos?.data ?? []
  const egresada = !persona.en_la_empresa
  // El slab publica los años de antigüedad. El día se fija en el SERVIDOR, igual que la ventana de
  // HH: calcularlo en el navegador daría una antigüedad distinta a cada lado de la medianoche.
  const antiguedad = antiguedadEnAnios(persona.fecha_ingreso, hoy)
  const pendientes = papelesPendientes(papeles, persona.en_la_empresa)
  // CUÁLES, NO SÓLO CUÁNTOS. El aviso los nombra: repetir por tercera vez el número obligaba a
  // abrir la solapa Documentos para contestar la pregunta que el aviso decía estar contestando.
  const nombresPendientes = pendientesDelLegajo(papeles, persona.en_la_empresa)
  // DESDE CUÁNDO ESTÁ SIN OBRA. Sale de las asignaciones YA leídas —ni una consulta más—: la última
  // que alguien cerró. El aviso y el botón amarillo llevaban los dos a `/obras` diciendo lo mismo;
  // el botón es la acción, y esto es lo que el botón no puede decir.
  const ultimaCerrada = (asignaciones?.data ?? [])
    .filter((a) => a.hasta)
    .sort((a, b) => ((a.hasta ?? '') < (b.hasta ?? '') ? 1 : -1))[0] ?? null
  const filasHH = horas?.data ?? []
  const periodo = esPeriodo(sp.p) ? sp.p : PERIODO_POR_DEFECTO
  const ventana = ventanaDe(periodo, hoy)
  const resumen = resumenDelPeriodo(filasHH, ventana.desde, ventana.hasta)
  // El error de las anotaciones entra al mismo aviso: un bloque que no se pudo leer no puede
  // dibujarse vacío como si la persona no tuviera ninguna. (La tabla ausente NO es un error: viaja
  // por `pendiente` y lo dice el propio bloque.)
  const fallo = asignaciones?.error ?? horas?.error ?? documentos?.error ?? anotaciones?.error

  // LO QUE PUBLICA LA TIRA DE MÉTRICAS. Las tres ventanas se fijan en el SERVIDOR por la misma razón
  // que la de la liquidación: el mes y el año dependen del día, y el navegador de quien mira puede
  // estar del otro lado de la medianoche.
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
  const [feriados, obraVigente, catalogoObras, presencia, certificados] = vista === 'resumen'
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
        // EL CLIP DE LA LICENCIA (16/09/2026): los certificados médicos del legajo que tocan la
        // quincena. Sólo en el resumen, que es donde se dibuja la franja.
        getCertificadosDeLicencia(supabase, { desde: quincena.desde, hasta: quincena.hasta }, id),
      ])
    : [[], null, {}, null, { data: [], error: null }]
  // UNA LECTURA QUE FALLÓ NO ES UNA QUINCENA SIN DECLARACIONES: `data` en `null` deja la franja
  // como estaba antes de esta lectura, y el error viaja al aviso de arriba con el resto.
  const dias = diasDeLaQuincena(filasHH, quincena, {
    feriados, hoy, presencia: presencia?.data ?? [], certificados: certificados.data,
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
    // LA RETRIBUCIÓN YA NO VIENE DE `persona_legajo` —que no publica la columna— sino de
    // `persona_tarifa`, que es donde vive el $/h que se paga. Es EL MISMO objeto que pinta la tira
    // de arriba: no puede decir una cosa acá y otra allá.
    { k: 'Retribución', v: valorHora.rotulo.pactado.valor, falta: valorHora.rotulo.pactado.falta ?? 'sin dato', mono: true },
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

      {/* CUÁNTO SE LE ESTÁ PAGANDO POR HORA, ARRIBA DE TODO (dueño, 15/09/2026). Va ANTES de los
          avisos y de la tira de cifras porque es la primera pregunta que se le hace a un legajo y
          hasta hoy no se contestaba acá: había que abrir Liquidación, elegir la quincena y buscar
          a la persona en la grilla. */}
      <ValorHoraDelLegajo
        rotulo={valorHora.rotulo} error={valorHora.error}
        hrefRetribucion={liquida ? href('retribucion') : null}
      />

      {!egresada && !vigente && (
        <AvisoDeFicha verbo="Asignar obra" href="/obras" testid="aviso-sin-obra">
          Activo pero sin obra: no suma a la proyección de dotación de ninguna.
          {/* NUNCA TUVO y SE LE CERRÓ LA ÚLTIMA son dos situaciones distintas, y la primera dicha
              sobre la segunda esconde que esto pasó hace tres días o hace ocho meses. */}
          {ultimaCerrada?.hasta
            ? ` Sin asignación desde el ${fecha(ultimaCerrada.hasta)}, cuando se cerró la de ${ultimaCerrada.obra_nombre ?? ultimaCerrada.obra_id}.`
            : ' Nunca tuvo una asignación a obra cargada.'}
          {' '}Se asigna desde la solapa Personal de la obra.
        </AvisoDeFicha>
      )}
      {vigente && pendientes > 0 && (
        <AvisoDeFicha verbo="Ver papeles" href={href('documentos')} testid="aviso-papeles">
          {pendientes === 1 ? 'Falta un papel del legajo' : `Faltan ${pendientes} papeles del legajo`}
          {': '}
          {/* LOS NOMBRES EN TINTA: son lo que hay que ir a buscar, y el resto del renglón es la
              aclaración. Hasta cuatro; de ahí en más, cuántos quedan — una lista de doce empuja la
              pantalla entera hacia abajo para decir algo que la solapa ya dice mejor. */}
          <span style={{ color: V.tinta }} data-testid="papeles-faltantes">
            {frasePendientes(nombresPendientes)}
          </span>
          {'. '}Ninguno vence: `documento_legajo` no guarda fecha de vencimiento, así que lo que
          falta es que estén, no que estén al día.
        </AvisoDeFicha>
      )}

      <CifrasDeFicha cifras={cifras} testid="cifras-persona" />

      <SolapasDeFicha
        testid="nav-ficha-persona"
        solapas={VISTAS_FICHA
          .filter((v) => (veLaCuenta || v !== 'usuario') && (liquida || v !== 'retribucion'))
          .map((v) => ({
            clave: v,
            titulo: LABEL_FICHA[v],
            // Sólo el de las solapas cuyo número la página YA leyó. «Horas y obras» no lo lleva a
            // propósito: su fuente es `registros_hh` entera, y contarla para pintar un número al
            // lado de una solapa que nadie abrió sería pagar la consulta cara en las seis vistas.
            // La cuenta de asignaciones —que vivía acá cuando eran solapa propia— no se perdió: va
            // en el rótulo de su sección, donde además dice de qué es el número.
            cuenta: v === 'documentos' ? papeles.length : null,
            activa: v === vista,
            href: href(v),
          }))}
      />

      <CuerpoDeFicha>
        {/* 28px ENTRE SECCIONES Y NO 16. Las tarjetas traían su propio borde, que era lo que
            separaba un bloque del siguiente; sin caja, lo único que los separa es el aire, y con
            16px el rótulo de una sección se lee como el pie de la anterior. */}
        <div className="flex min-w-0 flex-1 flex-col gap-7">
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
                cifras={cifrasDeQuincena(dias)}
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
                // A DÓNDE VA. Sale de las asignaciones que ya están leídas arriba —ni una consulta
                // más— y `hoy` es el del SERVIDOR, como todas las ventanas de esta ficha: con la
                // fecha del navegador, un pase que arranca mañana se vería como vigente del otro
                // lado de la medianoche.
                programados={tramosProgramadosDe(asignaciones?.data ?? [], hoy, catalogoObras)}
                // `?v=asignaciones` seguiría andando por el alias, pero el ancla es lo que hace que
                // unificar dos solapas no se pague: el que llega cae en la sección, no arriba de una
                // cara donde tiene que buscarla.
                hrefAsignaciones={`${href('horas')}#asignaciones`}
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

          {/* ═══ UNA SOLA CARA PARA «DÓNDE ESTUVO Y CUÁNTO TRABAJÓ» (dueño, 18/09/2026) ═══

              Eran dos solapas. Las horas no se entienden sin saber a qué obra estaba asignado quien
              las hizo, y el historial de asignaciones no dice nada sin las horas que lo respaldan:
              para cruzarlas había que ir y volver. El orden es el de la pregunta —primero lo que
              pasó, después la relación contractual que lo sostiene—, y las dos leen lo que la
              página ya tenía en memoria. */}
          {vista === 'horas' && (
            <>
              {/* SIN `derecha`, Y NO POR OLVIDO: el bloque de abajo ya publica la ventana en su
                  propia cifra («Ventana · 16/09 a 30/09»). Repetirla en el rótulo de la sección la
                  dejaba dicha dos veces a diez píxeles de distancia — que es el mismo defecto que
                  esta pasada vino a corregir, cometido de nuevo. La de «Asistencia de la quincena»
                  sí va en el rótulo porque ese bloque no la dice en ningún otro lado. */}
              <SeccionDeFicha titulo="Horas imputadas" testid="seccion-horas">
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
              </SeccionDeFicha>

              <SeccionDeFicha
                id="asignaciones" titulo="Asignaciones a obra" testid="seccion-asignaciones"
                // EL NÚMERO QUE ESTABA AL LADO DE LA SOLAPA, ahora con el rótulo que dice de qué es.
                cuenta={asignaciones?.data?.length ?? null}
              >
                <div data-testid="bloque-asignaciones">
                  <BloqueAsignacion
                    asignaciones={asignaciones?.data ?? []}
                    cerrar={cerrarAsignacionDePersona.bind(null, id)}
                  />
                  {/* LAS HH DEL AÑO POR OBRA acompañan al historial: es lo que el canónico pone al
                      lado. Una obra sin horas imputadas NO publica un cero — se calla. */}
                  <NotaBloque>
                    La misma relación que muestra Obra → Personal.
                    {hhPorObra.size > 0 && ` Con horas imputadas este año en ${hhPorObra.size} ${hhPorObra.size === 1 ? 'obra' : 'obras'}.`}
                  </NotaBloque>
                </div>
              </SeccionDeFicha>
            </>
          )}

          {/* MISMA REGLA QUE «USUARIO»: la solapa se esconde Y se cierra. Un `?v=retribucion` escrito a
              mano por el jefe de obra dice «sin permiso», no una tabla vacía que parecería «sin datos». */}
          {vista === 'retribucion' && !liquida && (
            <div data-testid="retribucion-sin-permiso">
              <Aviso tono="info" titulo="Esta solapa es de Dirección y Administración">
                Lo que se le paga a cada persona se ve donde se liquida. Sin permiso para liquidar
                sueldos no hay retribución que mostrar: no es que no esté cargada.
              </Aviso>
            </div>
          )}

          {vista === 'retribucion' && retribucion && (
            <RetribucionDelLegajo
              r={retribucion} rotulo={valorHora.rotulo}
              hrefLiquidacion="/administracion/personas?vista=liquidacion&quincena="
            />
          )}

          {/* ═══ CUATRO BLOQUES APILADOS SIN NOMBRE → CUATRO SECCIONES CON RÓTULO (18/09/2026) ═══

              El orden no cambió y ninguno se fue. Lo que cambió es que ahora se sabe qué es cada
              uno: subir un papel, los papeles que el legajo PIDE, vincular uno que ya está en Drive
              y lo que hay en la carpeta. Eran cuatro listas pegadas separadas sólo por aire, y la
              diferencia entre «el papel que falta» y «el archivo que está en la carpeta» —que es la
              que decide si alguien tiene trabajo que hacer— había que deducirla del contenido. */}
          {vista === 'documentos' && (
            <div className="flex min-w-0 flex-col gap-7" data-testid="bloque-documentos">
              {/* PRIMERO LO QUE SE SUBE DESDE ACÁ. El dueño (16/09/2026) subió un certificado a Drive
                  «porque nunca me hiciste ninguna forma de subir documentos»: la forma existía, tercera
                  en esta solapa, debajo de los papeles tipificados y del enlace a Drive. Lo que se
                  carga va arriba; lo que se espeja, después. */}
              {subidos && (
                <SeccionDeFicha titulo="Subir un papel al legajo" testid="seccion-subir-documento">
                  <DocumentosSubidos
                    datos={subidos} tipo="persona" entidadId={id} testid="persona-documentos-subidos"
                    carpetaDrive={persona.drive_folder_id}
                  />
                </SeccionDeFicha>
              )}

              <SeccionDeFicha
                titulo="Papeles del legajo" testid="seccion-papeles-legajo"
                cuenta={papeles.length}
              >
                <BloqueDocumentos
                  documentos={documentos?.data ?? []}
                  desvincular={desvincularDocumento.bind(null, id)}
                  enLaEmpresa={persona.en_la_empresa}
                  carpetaDrive={persona.drive_folder_id}
                />
                <AltaDocumento vincular={vincularDocumento.bind(null, id)} />
                <NotaBloque>
                  Vínculos a Drive: el archivo no se copia. Ninguno vence —`documento_legajo` no
                  guarda fecha de vencimiento—, así que esta cara nunca dice «al día»: sería una
                  afirmación sobre un control que nadie está haciendo.
                </NotaBloque>
              </SeccionDeFicha>

              {archivosDrive && (
                <SeccionDeFicha titulo="En la carpeta de Drive" testid="seccion-archivos-drive">
                  <ArchivosDeDrive
                    datos={archivosDrive} tipo="persona" rol={rolActor} testid="persona-archivos-drive"
                  />
                </SeccionDeFicha>
              )}
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

