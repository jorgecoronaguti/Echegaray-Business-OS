// LAS LECTURAS DE LA ASISTENCIA POR OBRA. Una sola fuente: `registros_hh`.
//
// Ni una regla de negocio acá: lo que significa cada silencio lo deciden `jornadaPorObra.ts` y
// `quincenaPorObra.ts`, que se prueban sin base. Este archivo trae filas y nada más.
//
// ═══ QUIÉN VE QUÉ NO SE DECIDE ACÁ ═══
//
// `obra_canonica` tiene RLS por `ve_obra(id)` y `obra_asignacion` la suya: un jefe de obra ve las
// obras que tiene asignadas y Administración las ve todas. Repetir el criterio en TypeScript sería
// una segunda definición del alcance que además no protege la llamada directa a PostgREST.

import type { SupabaseClient } from '@supabase/supabase-js'
import { getAsignaciones } from '../../obras/services/personalService.ts'
import type { AsignacionVigente, FilaJornada } from './jornadaPorObra.ts'
import { armarJornada, asignadosPorObra, vigenteEn } from './jornadaPorObra.ts'
import type {
  AsignacionQuincena, ObraRotulo, PersonaRotulo, RegistroQuincena, TramoFuturoFuera,
} from './quincenaPorObra.ts'
import {
  candidatosParaTraer, type AsignacionParaTraer, type CandidatoParaTraer,
} from './traerALaObra.ts'
import { esJefeDeObra } from './vocabularioPersona.ts'

export interface ObraDeLaJornada {
  id: string
  nombre: string
  /** `obra_canonica.jornada_horas`. Lo que la casilla trae puesto. */
  jornada: number
}

export interface JornadaDelDia {
  obra: ObraDeLaJornada
  filas: (FilaJornada & { enOtraObra: { obra: string; horas: number } | null })[]
}

/** Sin jornada pactada la pantalla NO inventa una: la casilla nace vacía y se tipea. */
const JORNADA_SIN_DATO = 0

const numero = (v: unknown): number => {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) && n > 0 ? n : JORNADA_SIN_DATO
}

/**
 * La nota gris debajo del nombre.
 *
 * `rol` sólo distingue cuando dice algo: en la base al 07/09/2026 hay 20 «integrante» y 1
 * «responsable», así que escribir «integrante» debajo de nueve nombres es ruido. Se cae a la
 * ESPECIALIDAD —que es lo que el jefe usa para reconocer a alguien en la obra— y de ahí a la
 * categoría de convenio. Si no hay ninguna de las tres, no se escribe nada: inventar un «operario»
 * sería una afirmación sobre el legajo.
 */
const ROL_GENERICO = ['integrante', 'operario']

export function notaDe(a: {
  rol: string | null; persona_categoria: string | null; persona_especialidad: string | null
}): string | null {
  // SÓLO LA CATEGORÍA (dueño, 08/09/2026: «quitá rol, dejá como marca Plantel, que sólo marca
  // categoría»). Ni el rol de la asignación ni el oficio: la misma palabra que la columna
  // CATEGORÍA de Plantel, para que las dos pantallas digan lo mismo de la misma persona.
  void a.rol; void a.persona_especialidad
  return (a.persona_categoria ?? '').trim().replace('_', ' ') || null
}

export async function getObraDeLaJornada(
  supabase: SupabaseClient, obraId: string,
): Promise<{ data: ObraDeLaJornada | null; error: string | null }> {
  const { data, error } = await supabase
    .from('obra_canonica').select('id, nombre, jornada_horas').eq('id', obraId).maybeSingle()
  if (error) return { data: null, error: error.message }
  if (!data) return { data: null, error: null }
  const o = data as { id: string; nombre: string; jornada_horas: number | string | null }
  return { data: { id: o.id, nombre: o.nombre, jornada: numero(o.jornada_horas) }, error: null }
}

/**
 * Una obra, un día: quién está asignado y qué tiene cargado.
 *
 * La lista son los ASIGNADOS más quien ya tiene horas cargadas ese día aunque su asignación haya
 * terminado — si no, corregir el día de alguien que se fue sería imposible y sus horas quedarían
 * fuera de la vista de quien las tiene que revisar.
 */
export async function getJornadaDelDia(
  supabase: SupabaseClient, obraId: string, fecha: string,
): Promise<{ data: JornadaDelDia | null; error: string | null }> {
  const [obra, asignaciones, registros, enOtras, puestos] = await Promise.all([
    getObraDeLaJornada(supabase, obraId),
    getAsignaciones(supabase, obraId),
    supabase.from('registros_hh')
      .select('id, persona_id, fecha, horas, tipo_hora, notas')
      .eq('obra_canonica_id', obraId).eq('fecha', fecha).not('persona_id', 'is', null),
    // ═══ QUIÉN YA TIENE ESE DÍA CARGADO EN OTRA OBRA ═══
    // Dos personas del plantel tienen asignación vigente en DOS obras a la vez. Sin esta lectura,
    // el jefe de cada obra abría la pantalla, veía la jornada sugerida y cargaba: 17,6 hs el mismo
    // día para la misma persona, repartidas entre dos obras, sin un solo aviso.
    supabase.from('registros_hh')
      .select('persona_id, horas, tipo_hora, obra_canonica_id, obra_canonica(nombre)')
      .eq('fecha', fecha).neq('obra_canonica_id', obraId).not('persona_id', 'is', null),
    // ═══ QUIÉN ES JEFE DE OBRA (dueño, 08/09/2026) ═══
    // «Los jefes de obra no tienen que marcar si han asistido o no, ellos marcan a los demás». Quién
    // es jefe lo decide `esJefeDeObra(persona_directorio.puesto)`, el mismo criterio de la grilla y
    // del Plantel. Si la lectura falla nadie es jefe y la lista queda como antes: prefiero que el
    // jefe se vea a sí mismo en la lista a que la pantalla del día no cargue.
    puestosDe(supabase),
  ])
  if (obra.error) return { data: null, error: obra.error }
  if (!obra.data) return { data: null, error: null }
  if (asignaciones.error) return { data: null, error: asignaciones.error }
  if (registros.error) return { data: null, error: registros.error.message }

  const filasHH = (registros.data ?? []) as {
    id: string; persona_id: string; fecha: string; horas: number | string; tipo_hora: string; notas: string | null
  }[]
  const conHoras = new Set(filasHH.map((r) => r.persona_id))

  const personas = (asignaciones.data ?? [])
    .filter((a) => a.persona_nombre && (vigenteEn(a, fecha) || conHoras.has(a.persona_id)))
    .map((a) => ({
      persona_id: a.persona_id,
      nombre: a.persona_nombre as string,
      nota: notaDe(a),
      esJefe: esJefeDeObra(puestos[a.persona_id] ?? null),
    }))
  // Una sola fila por persona: dos asignaciones vigentes en la misma obra (dos frentes) no son dos
  // personas. Sin esto, el mismo nombre aparecería dos veces y el pie contaría de más.
  const unicas = [...new Map(personas.map((p) => [p.persona_id, p])).values()]
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))

  const otras = new Map<string, { obra: string; horas: number }>()
  if (!enOtras.error) {
    for (const f of (enOtras.data ?? []) as unknown as {
      persona_id: string; horas: number | string; obra_canonica: { nombre: string } | null
      obra_canonica_id: string
    }[]) {
      const previo = otras.get(f.persona_id)
      otras.set(f.persona_id, {
        obra: previo?.obra ?? f.obra_canonica?.nombre ?? f.obra_canonica_id,
        horas: (previo?.horas ?? 0) + Number(f.horas),
      })
    }
  }

  return {
    data: {
      obra: obra.data,
      filas: armarJornada({
        personas: unicas,
        registros: filasHH.map((r) => ({ ...r, horas: Number(r.horas) })),
        jornada: obra.data.jornada,
      }).map((f) => ({ ...f, enOtraObra: otras.get(f.persona.persona_id) ?? null })),
    },
    error: null,
  }
}

export interface DatosQuincenaPorObra {
  asignaciones: AsignacionQuincena[]
  /** Los pases programados que arrancan DESPUÉS de la ventana. Sólo rotulan la línea «→ obra desde
   *  el …» de la grilla; no ponen a nadie en ella — ver `TramoFuturoFuera`. */
  tramosFuera: TramoFuturoFuera[]
  registros: RegistroQuincena[]
  /** El plantel de quien dejó registros SIN tener ninguna asignación. Sin esto no hay con qué
   *  nombrar su fila y la persona desaparece de la grilla — ver `personasDe`. */
  personas: Record<string, PersonaRotulo>
  noLaborables: string[]
  /** El catálogo por id: nombre real y cliente. Es lo que evita que la pantalla escriba un slug. */
  obras: Record<string, ObraRotulo>
  /** Las obras en estado `activa`. Sólo esas se pueden marcar y sólo esas se reclaman. */
  obrasActivas: string[]
  /** `personas.puesto` por id. Vacío cuando la lectura no se pudo hacer — ver `puestosDe`. */
  puestos: Record<string, string | null>
}

/** Los feriados de la ventana. La misma tabla que lee la grilla de presencia — no una lista aparte.
 *  Se EXPORTA porque la ficha de la persona necesita exactamente esto: dos lecturas del mismo
 *  calendario discreparían el día que alguien agregue un alcance y sólo se corrija una. */
export async function getNoLaborables(
  supabase: SupabaseClient, desde: string, hasta: string,
): Promise<string[]> {
  const { data } = await supabase
    .from('calendario_no_laborable').select('fecha').gte('fecha', desde).lte('fecha', hasta)
  return ((data ?? []) as { fecha: string }[]).map((f) => f.fecha)
}

/** La ventana entera —la quincena que mira la pantalla—, de todas las obras que la sesión ve. */
export async function getQuincenaPorObra(
  supabase: SupabaseClient, desde: string, hasta: string,
): Promise<{ data: DatosQuincenaPorObra | null; error: string | null }> {
  const [asignaciones, registros, obras, noLaborables] = await Promise.all([
    getAsignaciones(supabase),
    // `notas` viaja porque ahí está la CLAVE DEL MOTIVO (`enfermedad`, `falta`…): es lo que
    // convierte una casilla «L» muda en una que dice de qué licencia se trata.
    supabase.from('registros_hh')
      .select('persona_id, obra_canonica_id, fecha, horas, tipo_hora, notas')
      .gte('fecha', desde).lte('fecha', hasta)
      .not('persona_id', 'is', null).not('obra_canonica_id', 'is', null),
    supabase.from('obra_canonica').select('id, nombre, estado, cliente_texto'),
    getNoLaborables(supabase, desde, hasta),
  ])
  if (asignaciones.error) return { data: null, error: asignaciones.error }
  if (registros.error) return { data: null, error: registros.error.message }
  if (obras.error) return { data: null, error: obras.error.message }

  const catalogo = (obras.data ?? []) as {
    id: string; nombre: string; estado: string | null; cliente_texto: string | null
  }[]
  // EL RÓTULO SALE DE LA BASE, NO DEL ID. `cliente_texto` es el nombre del cliente tal como está
  // cargado en `obra_canonica`; es lo que la columna OBRA muestra cuando la persona no tiene
  // ninguna obra activa. Sin este viaje la pantalla no tendría con qué escribir «San Francisco» y
  // caería en `sf-mamposteria`, que es lo que el dueño rechazó.
  const rotulos: Record<string, ObraRotulo> = Object.fromEntries(catalogo.map((o) => [o.id, {
    id: o.id, nombre: o.nombre, cliente: (o.cliente_texto ?? '').trim() || null, estado: o.estado,
  }]))
  // SÓLO LAS ACTIVAS SE PUEDEN MARCAR. Una obra cerrada aparecía en la grilla con sus celdas
  // editables y sus días sin marcar sumando al «1 día sin marcar»: la pantalla reclamaba cargar
  // horas de una obra que ya nadie mira, y aceptaba escribirlas.
  const activas = new Set(catalogo.filter((o) => o.estado === 'activa').map((o) => o.id))

  const filasHH = (registros.data ?? []) as {
    persona_id: string; obra_canonica_id: string; fecha: string
    horas: number | string; tipo_hora: string; notas: string | null
  }[]
  // Vigente en algún punto de la ventana, no sólo el último día: quien empezó el jueves entra, y
  // quien terminó el martes también — sus horas del lunes y el martes son reales y son de esa
  // obra. Sin nombre no se dibuja: una fila que no se puede nombrar no sirve para marcar.
  // LAS ASIGNACIONES A OBRAS NO ACTIVAS TAMBIÉN VIAJAN, MARCADAS. Filtrarlas acá era lo que hacía
  // que la pantalla mostrara una obra activa cualquiera para alguien cuya asignación vigente está
  // en una obra cerrada: la grilla no tenía con qué saber que existía. No crean filas —de eso se
  // ocupa `elegible` en `quincenaPorObra`—, pero sí pueden ser la obra vigente de alguien.
  const vigentes: AsignacionQuincena[] = (asignaciones.data ?? [])
    .filter((a) => Boolean(a.persona_nombre)
      && (!a.desde || a.desde <= hasta) && (!a.hasta || a.hasta >= desde))
    // `desde`/`hasta` VIAJAN. Estar en la ventana es lo que pone la fila en la grilla; cuál es su
    // OBRA ACTUAL lo decide la vigencia de HOY, y sin estas dos fechas la grilla no puede
    // distinguir el tramo que se cerró ayer del que se abrió hoy.
    .map((a) => ({
      persona_id: a.persona_id,
      nombre: a.persona_nombre as string,
      nota: notaDe(a),
      obra_id: a.obra_id,
      desde: a.desde ?? null,
      hasta: a.hasta ?? null,
      elegible: activas.has(a.obra_id),
    }))

  // ═══ EL PLAN NO TERMINA DONDE TERMINA LA QUINCENA ═══
  //
  // El filtro de arriba se queda con lo vigente EN la ventana, que es lo correcto para dibujar la
  // grilla. Pero un pase se programa hasta a sesenta días (`MAX_DIAS_PROGRAMACION`), y el que cae
  // pasado el último día quedaba invisible en la línea «→ obra desde el …»: el panel lo mostraba y
  // la grilla no, y dos pantallas que leen la misma fila decían cosas distintas.
  //
  // Salen de la MISMA lectura —no hay una consulta más—, y van por su propia puerta justamente para
  // que no puedan crear una fila vacía en la grilla.
  const tramosFuera: TramoFuturoFuera[] = (asignaciones.data ?? [])
    .filter((a): a is typeof a & { desde: string } => Boolean(a.desde) && (a.desde as string) > hasta)
    .map((a) => ({ persona_id: a.persona_id, obra_id: a.obra_id, desde: a.desde }))

  // ═══ QUIÉN TIENE REGISTROS Y NO SE PUEDE NOMBRAR CON UNA ASIGNACIÓN ═══
  //
  // Se lo busca en el plantel. Antes se lo descartaba en silencio: alguien con 45 licencias por
  // enfermedad cargadas y sin asignación vigente a obra activa simplemente no estaba en la
  // pantalla, y «no está en la grilla» se lee como «no pasa nada con esa persona».
  //
  // El descarte se mide contra `vigentes` —lo que la grilla va a recibir— y no contra las
  // asignaciones crudas: quien sólo tiene asignaciones a obras cerradas tampoco tiene nombre.
  // SÓLO LAS ELEGIBLES NOMBRAN. Una asignación a una obra cerrada no pone a nadie en la grilla, así
  // que tampoco puede evitar que se lo busque en el plantel: si no, quien sólo tiene obras cerradas
  // y horas cargadas volvería a quedarse sin nombre y fuera de la pantalla.
  const nombrables = new Set(vigentes.filter((a) => a.elegible).map((a) => a.persona_id))
  const sinAsignacion = [...new Set(
    filasHH.map((r) => r.persona_id).filter((id) => id && !nombrables.has(id)),
  )]

  return {
    data: {
      asignaciones: vigentes,
      tramosFuera,
      registros: filasHH.map((r) => ({
        persona_id: r.persona_id,
        obra_id: r.obra_canonica_id,
        fecha: r.fecha.slice(0, 10),
        horas: Number(r.horas),
        tipo_hora: r.tipo_hora,
        notas: r.notas,
      })),
      personas: await plantelDe(supabase, sinAsignacion),
      puestos: await puestosDe(supabase, [
        ...new Set([...vigentes.map((a) => a.persona_id), ...filasHH.map((r) => r.persona_id)]),
      ]),
      noLaborables,
      obras: rotulos,
      // Las obras que se pueden marcar. Lo que quedó fuera sigue mostrando sus horas —existen— pero
      // no se reclama ni se ofrece editar.
      obrasActivas: [...activas],
    },
    error: null,
  }
}

/**
 * Nombre y nota de un puñado de personas. `persona_plantel` es la MISMA vista de la que salen
 * todos los nombres de esta pantalla —publica sólo a quien está en la empresa—, no una segunda
 * fuente: quien no está ahí no se puede nombrar y su fila no se dibuja, porque inventarle un
 * rótulo sería peor que no mostrarla.
 */
async function plantelDe(
  supabase: SupabaseClient, ids: string[],
): Promise<Record<string, PersonaRotulo>> {
  if (ids.length === 0) return {}
  const { data } = await supabase
    .from('persona_plantel').select('id, nombre_completo, especialidad, categoria').in('id', ids)
  const filas = (data ?? []) as {
    id: string; nombre_completo: string | null; especialidad: string | null; categoria: string | null
  }[]
  return Object.fromEntries(filas
    .filter((p) => (p.nombre_completo ?? '').trim())
    .map((p) => [p.id, {
      nombre: (p.nombre_completo as string).trim(),
      nota: notaDe({
        rol: null, persona_especialidad: p.especialidad, persona_categoria: p.categoria,
      }),
    }]))
}

/**
 * EL PUESTO DE CADA UNO — lo que separa a los jefes de obra del resto (dueño, 08/09/2026).
 *
 * SALE DE `persona_directorio` Y NO DE `persona_plantel` porque `persona_plantel` no publica
 * `puesto`: sus cuatro columnas son nombre, categoría, especialidad y egreso. Agregarlo ahí es
 * cambiar una vista que leen otras cuatro pantallas, y esa migración la aplica el dueño; hasta
 * entonces esta lectura usa la vista que YA publica el campo y que YA alimenta el plantel de
 * `/administracion/personas` — la misma columna de la misma tabla, no una segunda fuente.
 *
 * UNA LECTURA QUE FALLA DEVUELVE `{}` Y NO ROMPE LA GRILLA: sin puesto nadie es jefe y la pantalla
 * queda como antes de este cambio. Lo contrario —tirar la quincena entera porque no se pudo saber
 * quién es jefe— cambiaría un agrupamiento cosmético por una pantalla sin horas.
 */
async function puestosDe(
  supabase: SupabaseClient, ids?: string[],
): Promise<Record<string, string | null>> {
  if (ids && ids.length === 0) return {}
  // SIN `ids` SE PIDE EL DIRECTORIO ENTERO. Es lo que necesita la carga del día: los ids salen de
  // las asignaciones, y esperar esa lectura para recién ahí preguntar los puestos convertiría una
  // tanda en dos viajes en serie contra una tabla de sesenta y dos filas.
  const consulta = supabase.from('persona_directorio').select('id, puesto')
  const { data } = ids ? await consulta.in('id', ids) : await consulta
  const filas = (data ?? []) as { id: string; puesto: string | null }[]
  return Object.fromEntries(filas.map((p) => [p.id, p.puesto]))
}

// ═══ LA LISTA DE OBRAS DEL PASO 1 DEL TELÉFONO (08/09/2026) ═══
//
// `leerDatosCampo` ya trae las obras activas, pero trae además pedidos, herramientas e
// impedimentos: cinco viajes para dibujar una lista de nombres. Y no dice lo único que decide cuál
// tocar — cuánta gente hay que cargar ahí.

export interface ObraParaJornada {
  id: string
  nombre: string
  jornada: number
  /** PERSONAS DISTINTAS a marcar ese día — sin los jefes de obra y sin contar dos veces a quien
   *  tiene dos asignaciones vigentes (ver `asignadosPorObra`). Es el número que la lista pone al
   *  lado del nombre y tiene que coincidir con las filas que se abren al tocar.
   *  `null` si la lectura de asignaciones falló: cero afirmaría que la obra está sin gente, y una
   *  obra sin gente es una razón para no tocarla. */
  asignados: number | null
}

/**
 * Las obras activas que quien mira puede ver, con cuánta gente hay que cargar ese día.
 *
 * El recorte lo hace la RLS de `obra_canonica` (`ve_obra`), igual que en el resto del archivo: un
 * jefe ve las suyas y Administración las ve todas. No se repite el criterio en TypeScript.
 */
export async function getObrasParaJornada(
  supabase: SupabaseClient, fecha: string,
): Promise<{ data: ObraParaJornada[]; error: string | null }> {
  const [obras, asignaciones, puestos] = await Promise.all([
    supabase.from('obra_canonica')
      .select('id, nombre, jornada_horas').eq('estado', 'activa').order('nombre'),
    // `obra_id`, NO `obra_canonica_id`. La columna de esta tabla se llama `obra_id` —lo confirma
    // `getAsignaciones`—; pedir la que no existe devuelve un error de PostgREST, el conteo cae a
    // `null` y la lista publica «sin conteo» en TODAS las obras. Se vio en la captura de 390px del
    // 08/09: nueve obras, nueve «sin conteo». El fallback fue honesto (no dijo 0) y el dato no estaba.
    // `persona_id` VIAJA, y no es decorativo: sin él el conteo suma FILAS y la misma persona con
    // dos asignaciones vigentes el mismo día cuenta dos veces. Ver `asignadosPorObra`.
    supabase.from('obra_asignacion').select('obra_id, persona_id, desde, hasta'),
    puestosDe(supabase),
  ])
  if (obras.error) return { data: [], error: obras.error.message }

  const vigentes = asignaciones.error
    ? new Map<string, number>()
    : asignadosPorObra(
      (asignaciones.data ?? []) as AsignacionVigente[],
      fecha,
      // El conteo cuenta A QUIENES HAY QUE MARCAR, y el jefe no se marca a sí mismo. Si la lectura
      // de puestos falla nadie es jefe: el número vuelve a ser el de antes, que es un número de más
      // pero no una lista rota.
      (personaId) => esJefeDeObra(puestos[personaId] ?? null),
    )

  const data = ((obras.data ?? []) as {
    id: string; nombre: string; jornada_horas: number | string | null
  }[]).map((o) => ({
    id: o.id,
    nombre: o.nombre,
    jornada: numero(o.jornada_horas),
    asignados: asignaciones.error ? null : (vigentes.get(o.id) ?? 0),
  }))
  return { data, error: null }
}

// ═══ A QUIÉN SE PUEDE TRAER A ESTA OBRA (08/09/2026, tarde) ═══
//
// La decisión —quién entra en la lista y cómo se rotula— vive en `traerALaObra.ts` con sus pruebas.
// Acá sólo están las dos lecturas. `persona_plantel` recorta por RLS igual que el resto del archivo.

/**
 * El plantel que hoy NO está en `obraId`, con el nombre de la obra donde está cada uno.
 *
 * UNA LECTURA QUE FALLA NO ES UNA LISTA VACÍA. Con `error` la pantalla muestra el texto: una lista
 * vacía diría «no hay a quién traer», que es una afirmación sobre el plantel que nadie hizo.
 */
export async function getCandidatosParaTraer(
  supabase: SupabaseClient, obraId: string, fecha: string,
): Promise<{ data: CandidatoParaTraer[]; error: string | null }> {
  const [plantel, asignaciones, obras] = await Promise.all([
    supabase.from('persona_plantel').select('id, nombre_completo').order('nombre_completo'),
    supabase.from('obra_asignacion').select('persona_id, obra_id, desde, hasta'),
    supabase.from('obra_canonica').select('id, nombre'),
  ])
  if (plantel.error) return { data: [], error: `No pude leer el plantel: ${plantel.error.message}` }
  if (asignaciones.error) {
    // SIN LAS ASIGNACIONES NO SE PUEDE ARMAR LA LISTA. Seguir con cero ofrecería a los que ya están
    // en la obra y diría «sin obra» de todo el plantel: cada renglón sería falso.
    return { data: [], error: `No pude leer las asignaciones: ${asignaciones.error.message}` }
  }
  const nombresDeObra = Object.fromEntries(
    ((obras.data ?? []) as { id: string; nombre: string }[]).map((o) => [o.id, o.nombre]),
  )
  return {
    data: candidatosParaTraer({
      plantel: (plantel.data ?? []) as { id: string; nombre_completo: string | null }[],
      asignaciones: (asignaciones.data ?? []) as AsignacionParaTraer[],
      nombresDeObra,
      obraId,
      fecha,
    }),
    error: null,
  }
}
