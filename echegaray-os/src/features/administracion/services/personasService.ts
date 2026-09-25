// PERSONAS — la lectura del módulo Personal.
//
// ═══ DOS LECTURAS DISTINTAS, A PROPÓSITO ═══
//
// El LISTADO sale de `persona_directorio`, que no publica DNI, CUIL ni sueldo: la tabla global no
// los muestra (*"NO mostrar en la tabla DNI, CUIL, sueldo, teléfono, documentación ni métricas"*) y
// lo que la pantalla no muestra tampoco viaja al navegador. Hereda el RLS de `personas` por
// `security_invoker = true`, así que es de Administración sin necesidad de un `where` propio.
//
// La FICHA lee `persona_legajo`, NO la tabla. El motivo es mecánico: `authenticated` es un solo rol
// de Postgres para los cuatro roles de la aplicación, así que el grant por columna de `personas` le
// niega `dni` y `cuil` a todo el mundo por igual —incluida Administración—. `persona_legajo` corre
// como su dueño y lleva el portero adentro (`where es_administracion()`): es el único camino de la
// web a esos dos campos, y está declarado y fijado por
// `orquestador/lib/vistas-security-invoker.test.mjs`.
//
// LA ESCRITURA SÍ VA CONTRA LA TABLA: los grants de INSERT/UPDATE por columna nunca se cerraron, y
// quién puede escribir lo decide la RLS.

import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  AsignacionDePersona, DocumentoLegajo, Persona, PersonaEnDirectorio, ServiceResult,
} from '../types'
import { sinDireccion } from './vocabularioPersona.ts'
import { contieneEnAlguno } from '../../../shared/utils/busqueda.ts'

// LAS CATORCE COLUMNAS DEL LISTADO, NOMBRADAS UNA POR UNA.
//
// Era `select('*')`. Hoy `persona_directorio` no publica documento ni retribución, así que el
// asterisco no filtraba nada de más — pero la garantía dependía de que la VISTA no creciera. El día
// que alguien le agregue una columna al final (ya pasó dos veces: `obra_actual`, `en_la_empresa`),
// el asterisco se la lleva al navegador sin que nadie lo decida. La lista explícita convierte esa
// garantía en algo que este archivo sostiene solo.
const COLUMNAS_DIRECTORIO =
  'id, nombre_completo, nombre_para_mostrar, categoria, especialidad, puesto, legajo, fecha_ingreso, fecha_egreso, ' +
  'cuadrilla_id, cuadrilla, obra_actual_id, obra_actual, rol_en_obra, asignada_desde, en_la_empresa'

const COLUMNAS_FICHA =
  'id, nombre_completo, nombre_para_mostrar, iniciales_efectivo, dni, cuil, fecha_nacimiento, nacionalidad, telefono, email, domicilio, ' +
  'contacto_emergencia, contacto_emergencia_telefono, fecha_ingreso, fecha_egreso, ' +
  'convenio_colectivo, categoria, especialidad, puesto, modalidad_liquidacion, notas, ' +
  'legajo, en_la_empresa, drive_folder_id'

/**
 * Los cuatro filtros del listado.
 *
 * EL PRIMERO SE LLAMABA «TODOS» Y NUNCA MOSTRÓ A TODOS: filtraba a los que seguían en la empresa,
 * igual que ahora. No se notaba porque no había nadie dado de baja; con los 45 legajos cerrados que
 * trajo el data room, el nombre pasó a ser una mentira visible. Se llama por lo que hace.
 *
 * Ver a los que ya no están es lo que hace «Inactivos», y entre los dos está todo el mundo.
 */
export type FiltroPersonal = 'plantel' | 'en_obra' | 'sin_asignar' | 'inactivos'

export const FILTROS: { valor: FiltroPersonal; etiqueta: string }[] = [
  // «Plantel», no «En el plantel»: es el rótulo del handoff y comparte renglón con la búsqueda
  // y la primaria — tres palabras donde alcanza una empujan el resto de la línea.
  { valor: 'plantel', etiqueta: 'Plantel' },
  { valor: 'en_obra', etiqueta: 'En obra' },
  { valor: 'sin_asignar', etiqueta: 'Sin asignar' },
  { valor: 'inactivos', etiqueta: 'Inactivos' },
]

/** Los ids cuyo DNI o CUIL contiene lo buscado.
 *
 *  El listado NO trae el documento, pero buscar por documento es como Administración identifica a
 *  alguien cuando le llega un papel. Se resuelve contra `personas` —que sólo Administración lee— y
 *  se aplica como filtro de ids sobre el directorio: el dato se usa, no se publica. */
async function idsPorDocumento(supabase: SupabaseClient, q: string): Promise<string[]> {
  const digitos = q.replace(/\D/g, '')
  if (digitos.length < 4) return []
  const { data } = await supabase
    .from('persona_legajo').select('id').or(`dni.ilike.%${digitos}%,cuil.ilike.%${digitos}%`)
  return (data ?? []).map((f) => (f as { id: string }).id)
}

export async function getDirectorio(
  supabase: SupabaseClient,
  filtro: FiltroPersonal = 'plantel',
  q?: string,
): Promise<ServiceResult<PersonaEnDirectorio[]>> {
  let consulta = supabase.from('persona_directorio').select(COLUMNAS_DIRECTORIO)

  // QUIÉN ESTÁ SE PREGUNTA POR `en_la_empresa`, NO POR LA FECHA. De los 43 legajos fuera de la
  // nómina, 15 se fueron sin baja documentada: con `fecha_egreso is null` los 15 volvían al plantel.
  consulta = consulta.eq('en_la_empresa', filtro !== 'inactivos')
  if (filtro === 'en_obra') consulta = consulta.not('obra_actual_id', 'is', null)
  if (filtro === 'sin_asignar') consulta = consulta.is('obra_actual_id', null)

  // Las comas separan condiciones en un `or` de PostgREST: un término con coma partiría el filtro
  // en dos y devolvería resultados de más.
  // EL TEXTO SE FILTRA EN MEMORIA, no con `ilike`: `ilike` no ignora las tildes ni el orden de las
  // palabras, y el nombre para mostrar («Emiliano Maldonado») no está en el legajo («MALDONADO
  // BATISTA EMILIANO MIGUEL»). El plantel son decenas de filas. El documento sigue por la base.
  const busqueda = q?.replace(/[,()]/g, ' ').trim()
  const ids = busqueda ? new Set(await idsPorDocumento(supabase, busqueda)) : null

  const { data: todas, error } = await consulta.order('nombre_completo', { ascending: true })
  if (error) return { data: null, error: error.message }
  const data = busqueda
    ? ((todas ?? []) as unknown as (PersonaEnDirectorio & { cuadrilla?: string | null })[]).filter((p) =>
      ids?.has(p.id) || contieneEnAlguno([p.nombre_completo, p.nombre_para_mostrar, p.cuadrilla], busqueda))
    : todas
  // El casteo va por `unknown`: al nombrar las columnas, PostgREST deja de inferir la forma de la
  // fila y el cliente la tipa como un error genérico. El contrato de columnas de la vista lo fija
  // `orquestador/lib/vistas-security-invoker.test.mjs`, no este archivo.
  // DIRECCIÓN NO ES PLANTEL: se va acá, en la lectura, y por eso ninguno de los cuatro recortes
  // —ni «Inactivos»— puede volver a mostrarla. `vocabularioPersona.sinDireccion`.
  return { data: sinDireccion((data ?? []) as unknown as PersonaEnDirectorio[]), error: null }
}

/**
 * CUÁNTAS PERSONAS HAY EN CADA CORTE — el contador de las pastillas del canónico 19.
 *
 * Se leen aparte del listado a propósito: el contador de un filtro tiene que decir cuántas personas
 * hay en ESE corte de la empresa, no cuántas de las que sobrevivieron a la búsqueda que estoy
 * tecleando. Un chip que baja de 18 a 2 mientras escribo «Juan» no ayuda a decidir a dónde ir — que
 * es lo único para lo que existe.
 *
 * ═══ ERAN CUATRO VIAJES Y AHORA ES UNO (12/09/2026) ═══
 *
 * Eran cuatro `count` sin filas, uno por pastilla, en `Promise.all`. Lo que los hacía caros no era la
 * consulta: medido con `explain (analyze)` sobre la base real, cada `count` ejecuta en **1,4 ms**. Lo
 * caro es el VIAJE a PostgREST — 216, 224, 235 y 250 ms medidos con `PERF_TRAZA=1` contra el Supabase
 * real, y entre 2,6 s y 5,0 s cada uno en la primera carga, cuando la conexión arranca en frío.
 * Cuatro viajes de 1,4 ms de trabajo.
 *
 * Las cuatro cuentas salen de DOS columnas de las mismas filas, así que ahora se pide una vez y se
 * cuenta acá. `persona_directorio` tiene 74 filas (17 en el plantel, 57 inactivos) y esas dos columnas
 * pesan ~3 kB: traerlas cuesta menos que el viaje que se ahorra.
 *
 * LO QUE SE ACEPTA, DICHO: el día que el padrón tenga miles de filas esto manda N filas para devolver
 * cuatro números, y entonces conviene una función en la base que las cuente de una (un solo viaje
 * igual, sin las filas). El umbral es de orden de magnitud, no de decenas — a 74 filas un `count` por
 * pastilla es pagar cuatro viajes para ahorrar 3 kB.
 *
 * ═══ LAS MISMAS FILAS ALIMENTAN EL RECORTE POR OBRA (16/09/2026) ═══
 *
 * El filtro por obra del Plantel necesita exactamente estas filas —quién sigue en la empresa y en qué
 * obra está— para decir cuántas personas tiene cada obra. Pedirlas de nuevo sería un segundo viaje
 * para traer lo que ya está en memoria; y, peor, dos lecturas distintas pueden contestar cosas
 * distintas si alguien mueve a una persona entre las dos. El chip dice 5 y se ven 5 porque el número
 * y la lista salen de la MISMA lectura.
 *
 * Y SE ACEPTA QUE LAS CUATRO FALLAN JUNTAS: antes cada `count` podía fallar solo y apagaba SU
 * pastilla. Ahora un error apaga las cuatro. La garantía que importa no cambia: `null` = no se pudo
 * contar y la pastilla va sin número, NUNCA 0 — «Inactivos 0» afirma que nadie egresó nunca.
 */
export async function getConteosDeFiltro(
  supabase: SupabaseClient,
): Promise<{ conteos: Record<FiltroPersonal, number | null>; filas: FilaDeConteo[] }> {
  const { data, error } = await supabase
    .from('persona_directorio').select('en_la_empresa, obra_actual_id, obra_actual, puesto')
  // SIN FILAS NO HAY CHIPS DE OBRA, y eso es lo correcto: un recorte dibujado sobre una lectura que
  // falló prometería obras que nadie comprobó que existan.
  if (error) return {
    conteos: { plantel: null, en_obra: null, sin_asignar: null, inactivos: null },
    filas: [],
  }
  // La MISMA regla que el listado, en la MISMA lectura: si el chip contara a Dirección y la lista no
  // la mostrara, el número y las filas dejarían de ser dos caras del mismo corte.
  const filas = sinDireccion((data ?? []) as unknown as FilaDeConteo[])
  return { conteos: contarPorFiltro(filas), filas }
}

/** Lo mínimo que hace falta para contar: quién sigue en la empresa y en qué obra está. */
export interface FilaDeConteo {
  en_la_empresa: boolean | null
  obra_actual_id: string | null
  /** El rol organizacional. Ausente = no se leyó, y entonces nadie queda fuera de «Sin asignar». */
  puesto?: string | null
  /** El NOMBRE de la obra, para rotular su chip. Ausente = no se leyó; una obra que no se puede
   *  nombrar no se dibuja (un slug en pantalla es lo que el dueño pidió no ver nunca). */
  obra_actual?: string | null
}

/**
 * ¿ESTA PERSONA ESTÁ EN ESTE CORTE? La definición de las cuatro pastillas, UNA SOLA VEZ.
 *
 * La usan el contador (`contarPorFiltro`) y el recorte por obra (`recorteDeObra.ts`). Escrita dos
 * veces, el día que «Plantel» cambie de criterio los chips de obra seguirían contando con el viejo y
 * la pantalla mostraría «QP · SALÓN COMERCIAL 5» arriba de cuatro filas.
 *
 * `en_la_empresa` se compara contra `true` y contra `false`, nunca por verdad/falsedad: una fila en
 * NULL no pertenece a NINGÚN corte, que es lo que hacían los `eq()` de PostgREST que esto reemplazó.
 */
export function perteneceAlCorte(fila: FilaDeConteo, filtro: FiltroPersonal): boolean {
  const sinObra = fila.obra_actual_id === null || fila.obra_actual_id === undefined
  if (filtro === 'inactivos') return fila.en_la_empresa === false
  if (fila.en_la_empresa !== true) return false
  if (filtro === 'en_obra') return !sinObra
  if (filtro === 'sin_asignar') return sinObra
  return true
}

/**
 * LAS CUATRO CUENTAS, SIN BASE. Función pura para que el criterio de cada pastilla se pueda probar
 * contra casos que la base real hoy no tiene — y en particular el que más importa: una fila con
 * `en_la_empresa` en NULL.
 *
 * El criterio de cada corte NO se escribe acá: es `perteneceAlCorte`, el mismo que usa el recorte por
 * obra. Los `eq()` de PostgREST que esto reemplazó dejaban una fila con `en_la_empresa` en NULL
 * AFUERA de las dos pastillas, y contarla como inactiva habría cambiado un número de la pantalla sin
 * que nadie lo decidiera — por eso la regla se prueba una vez y la usan los dos.
 */
export function contarPorFiltro(filas: FilaDeConteo[]): Record<FiltroPersonal, number | null> {
  const cuenta = (filtro: FiltroPersonal) => filas.filter((f) => perteneceAlCorte(f, filtro)).length
  return {
    plantel: cuenta('plantel'),
    en_obra: cuenta('en_obra'),
    sin_asignar: cuenta('sin_asignar'),
    inactivos: cuenta('inactivos'),
  }
}

export async function getPersona(supabase: SupabaseClient, id: string): Promise<ServiceResult<Persona | null>> {
  const { data, error } = await supabase.from('persona_legajo').select(COLUMNAS_FICHA).eq('id', id).maybeSingle()
  if (error) return { data: null, error: error.message }
  // `persona_legajo` es una VISTA: PostgREST no le conoce el tipo de fila y el cliente lo infiere
  // como un error genérico. El casteo va por `unknown` a propósito — el contrato de columnas lo fija
  // `vistas-security-invoker.test.mjs`, no este archivo.
  return { data: (data as unknown as Persona) ?? null, error: null }
}

/**
 * El historial de asignaciones, vigentes y cerradas.
 *
 * Es la MISMA tabla que lee `Obra → Personal`. Los nombres de la obra, la actividad y la cuadrilla
 * se resuelven con embeds de PostgREST porque las tres son claves foráneas declaradas —a diferencia
 * de la persona, que vive en una vista y no se puede embeber.
 */
export async function getAsignacionesDe(
  supabase: SupabaseClient,
  personaId: string,
): Promise<ServiceResult<AsignacionDePersona[]>> {
  const { data, error } = await supabase
    .from('obra_asignacion')
    .select('id, obra_id, rol, cuadrilla, cuadrilla_id, actividad_id, desde, hasta, notas, ' +
      'obra_canonica(nombre), obra_actividad(nombre), cuadrilla_rel:cuadrilla_id(nombre)')
    .eq('persona_id', personaId)
    .order('hasta', { ascending: true, nullsFirst: true })
    .order('desde', { ascending: false, nullsFirst: false })
  if (error) return { data: null, error: error.message }

  type Cruda = {
    id: string; obra_id: string; rol: string | null; cuadrilla: string | null
    cuadrilla_id: string | null; actividad_id: string | null; desde: string | null
    hasta: string | null; notas: string | null
    obra_canonica: { nombre: string } | null
    obra_actividad: { nombre: string } | null
    // El embed va con ALIAS y no como `cuadrilla(...)`: la columna de texto legacy se llama igual,
    // y PostgREST devolvería una sola de las dos —silenciosamente— si compartieran nombre.
    cuadrilla_rel: { nombre: string } | null
  }
  return {
    data: ((data ?? []) as unknown as Cruda[]).map((f) => ({
      id: f.id,
      obra_id: f.obra_id,
      obra_nombre: f.obra_canonica?.nombre ?? null,
      rol: f.rol,
      cuadrilla_id: f.cuadrilla_id,
      // El texto legacy es el respaldo: las tres asignaciones cargadas hoy dicen '1' y '2'.
      cuadrilla: f.cuadrilla_rel?.nombre ?? f.cuadrilla,
      actividad_id: f.actividad_id,
      actividad_nombre: f.obra_actividad?.nombre ?? null,
      desde: f.desde,
      hasta: f.hasta,
      notas: f.notas,
    })),
    error: null,
  }
}

/** Los documentos del legajo. El archivo NO se copia: se guarda el id de Drive y se abre allá. */
export async function getDocumentos(
  supabase: SupabaseClient,
  personaId: string,
): Promise<ServiceResult<DocumentoLegajo[]>> {
  const { data, error } = await supabase
    .from('documentacion_legajo')
    .select('id, tipo_documento, nombre, drive_file_id, fecha_documento, presente, notas')
    .eq('persona_id', personaId)
    .order('fecha_documento', { ascending: false, nullsFirst: false })
  if (error) return { data: null, error: error.message }
  return { data: (data ?? []) as DocumentoLegajo[], error: null }
}

/** Las categorías que de verdad hay cargadas, para poder filtrar por una que exista —incluidas las
 *  tres fuera de convenio, que si no serían invisibles y nadie las corregiría. */
export async function getCategoriasEnUso(supabase: SupabaseClient): Promise<string[]> {
  const { data } = await supabase.from('persona_directorio').select('categoria').not('categoria', 'is', null)
  const set = new Set((data ?? []).map((f) => (f as { categoria: string }).categoria))
  return [...set].sort()
}
