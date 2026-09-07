// QUÉ HACER CON CADA PERSONA AL GUARDAR EL DÍA — decidido acá, fuera de la acción.
//
// Vive en su propio archivo por una razón mecánica: un archivo `'use server'` sólo puede exportar
// funciones async, y exportar una función pura desde ahí rompe el build. Y por una mejor: el plan se
// prueba sin base y sin sesión, que es lo que hace que el defecto quede atrapado para siempre.

import { z } from 'zod'
import { esMotivo, tipoDeMotivo } from './motivoDeAusencia.ts'

export const marcaSchema = z.discriminatedUnion('estado', [
  z.object({
    persona_id: z.string().uuid(),
    estado: z.literal('presente'),
    horas: z.number().positive('Las horas tienen que ser mayores que cero')
      .max(24, 'En un día no se pueden trabajar más de 24 horas'),
  }),
  z.object({
    persona_id: z.string().uuid(),
    estado: z.literal('ausente'),
    /** Las horas que se pierden. Es la jornada de la obra, no un cero: la base exige horas > 0. */
    horas: z.number().positive().max(24),
    /** POR QUÉ NO VINO. Clave del catálogo `orquestador/lib/asistencia-motivos.mjs`, no texto
     *  libre: `notas` acepta cualquier cosa y sin una clave estable el ausentismo no se puede
     *  agrupar por causa, que es para lo que sirve el dato. Opcional: se puede marcar que alguien
     *  no vino sin saber todavía por qué, y eso es honesto — inventar el motivo no lo sería. */
    motivo: z.string().trim().refine(esMotivo, 'Ese motivo no está en el catálogo').nullable().default(null),
  }),
])

export const envioSchema = z.object({
  obra_id: z.string().trim().min(1, 'Elegí la obra'),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Elegí el día'),
  marcas: z.array(marcaSchema).min(1, 'No marcaste a nadie.'),
})

export type MarcaDeJornada = z.infer<typeof marcaSchema>

export interface FilaExistente {
  id: string
  persona_id: string
  horas: number
  tipo_hora: string
  /** Una imputación a una actividad del plan NO es la jornada que carga el jefe: `/campo/asistencia`
   *  escribe siempre `actividad_id = null`. Sin este campo el plan las trataba como intercambiables
   *  y borraba trabajo imputado a una actividad para poner la jornada del día. */
  actividad_id?: string | null
  /** El motivo guardado. Se compara para saber si la corrección lo cambió. */
  notas?: string | null
  /** Una hora improductiva lleva su causa y su significado. No se reemplaza a ciegas. */
  improductiva?: boolean | null
}

export interface PlanDeJornada {
  insertar: MarcaDeJornada[]
  actualizar: { id: string; marca: MarcaDeJornada; tipo: TipoDeMarca }[]
  borrar: string[]
  /** Lo que el plan NO tocó y por qué. La pantalla lo dice: saltear en silencio es peor que fallar. */
  intactas: { id: string; motivo: string }[]
}

export type TipoDeMarca = 'normal' | 'ausencia' | 'licencia'

/**
 * Qué `tipo_hora` le corresponde a esta marca.
 *
 * EL MOTIVO DECIDE SI ES AUSENCIA O LICENCIA, no una casilla aparte. Pedir las dos cosas sería
 * dejar que alguien guarde «vacaciones» marcado como ausencia y «faltó sin avisar» como licencia:
 * dos campos que dicen lo mismo siempre terminan diciendo cosas distintas.
 */
const tipoQuePide = (m: MarcaDeJornada): TipoDeMarca =>
  m.estado === 'ausente' ? tipoDeMotivo(m.motivo) : 'normal'

/**
 * ¿Esta fila existente es la que esta pantalla administra?
 *
 * SÓLO LAS FILAS DE LA JORNADA. Una imputación a una actividad del plan, una hora improductiva con
 * su causa, una licencia cargada por Administración y una extra al 50 % son hechos DISTINTOS que
 * alguien declaró con más información de la que tiene esta pantalla. Reemplazarlas por «la jornada
 * del día» borra esa información sin preguntar.
 *
 * El defecto original: `suyas.find((e) => esTrabajada(e.tipo_hora) ? 'normal' : 'ausencia' === quiero)`
 * agrupaba `normal`, `extra_50` y `extra_100` en un mismo cajón y `ausencia` con `licencia` en otro.
 * Con las extras primero en el resultado —y el `select` no tenía `.order()`, así que el orden lo
 * decidía PostgREST— corregir la jornada convertía 8,8 normales en 8,8 extra_50.
 */
/**
 * Qué filas administra cada pantalla.
 *
 * ═══ LA LICENCIA NO ES DEL JEFE DE OBRA ═══
 *
 * Una licencia —parte médico, vacaciones, ART, suspensión— la autoriza Administración con un papel
 * atrás. Si el jefe pudiera pisarla desde el teléfono, marcar «trabajó» sobre unas vacaciones las
 * BORRARÍA: se perdería el respaldo de un derecho que alguien reconoció, y el aviso que lo diría
 * está a 300 km de la obra. Desde `/campo` la licencia queda intacta y el acuse la nombra.
 *
 * Administración SÍ la administra: es quien la cargó y quien tiene que poder corregirla —el dueño
 * pidió justamente eso, «que todo pueda ser modificado por el administrador».
 */
const DE_LA_JORNADA: readonly string[] = ['normal', 'ausencia']

const esDeLaJornada = (e: FilaExistente, administra: boolean): boolean =>
  (DE_LA_JORNADA.includes(e.tipo_hora) || (administra && e.tipo_hora === 'licencia'))
  && !e.actividad_id && e.improductiva !== true

/** Por qué una fila existente queda intacta. Se dice con el nombre del hecho, no «se salteó». */
function motivoDeNoTocar(e: FilaExistente): string {
  if (e.actividad_id) return `tiene horas imputadas a una actividad del plan (${e.tipo_hora})`
  if (e.improductiva === true) return 'es una hora improductiva con su causa declarada'
  if (e.tipo_hora === 'licencia') {
    return 'tiene una licencia que autorizó Administración: se corrige desde ahí, no desde la obra'
  }
  return `tiene una hora ${e.tipo_hora} cargada aparte`
}

/**
 * El plan, decidido contra lo que ya está guardado.
 *
 * ═══ COINCIDENCIA EXACTA DE TIPO, NUNCA POR FAMILIA ═══
 *
 * Se corrige la fila cuyo `tipo_hora` es EXACTAMENTE el que se pide. Todo lo demás de esa persona
 * en ese día —extras, licencias, improductivas, imputaciones a una actividad— queda INTACTO y se
 * informa. Reemplazarlo sería decidir por quien lo cargó con más información.
 *
 * ═══ EL ORDEN NO PUEDE DECIDIR NADA ═══
 *
 * El resultado no depende de en qué orden vengan las filas: `esDeLaJornada` y la igualdad exacta de
 * tipo son deterministas. Aun así la lectura pide `.order('id')` — dos capas, porque de esto ya se
 * pagó una.
 *
 * ═══ QUIEN NO VIENE EN `marcas` NO SE TOCA ═══
 *
 * Guardar el día no puede convertir un silencio en una afirmación.
 */
export function planDeGuardado(
  marcas: MarcaDeJornada[],
  existentes: FilaExistente[],
  /** `true` sólo desde Administración: habilita corregir una licencia. Ver `esDeLaJornada`. */
  opciones: { administraLicencias?: boolean } = {},
): PlanDeJornada {
  const administra = opciones.administraLicencias === true
  const plan: PlanDeJornada = { insertar: [], actualizar: [], borrar: [], intactas: [] }
  for (const m of marcas) {
    const suyas = [...existentes.filter((e) => e.persona_id === m.persona_id)]
      .sort((a, b) => a.id.localeCompare(b.id))
    const quiero = tipoQuePide(m)

    for (const e of suyas.filter((x) => !esDeLaJornada(x, administra))) {
      plan.intactas.push({ id: e.id, motivo: motivoDeNoTocar(e) })
    }
    const deLaJornada = suyas.filter((x) => esDeLaJornada(x, administra))
    const misma = deLaJornada.find((e) => e.tipo_hora === quiero) ?? null
    // La OTRA fila de la jornada (la contraria: ausencia cuando se declara trabajo, y al revés) sí
    // se borra: un día no puede ser trabajado y faltado a la vez, y las dos las escribe esta misma
    // pantalla. Una segunda fila del MISMO tipo tampoco puede quedar: sería un día contado dos veces.
    for (const e of deLaJornada) if (e.id !== misma?.id) plan.borrar.push(e.id)

    if (!misma) plan.insertar.push(m)
    // EL MOTIVO CUENTA COMO CAMBIO. Corregir «faltó sin avisar» por «enfermedad» no mueve las
    // horas, y sin esto el plan decía «no había nada que cambiar» y dejaba el motivo viejo — que
    // es la diferencia entre una falta y un parte médico.
    else if (Number(misma.horas) !== m.horas || motivoDe(m) !== (misma.notas ?? null)) {
      plan.actualizar.push({ id: misma.id, marca: m, tipo: quiero })
    }
  }
  return plan
}

/** Lo que la base efectivamente devolvió por cada operación. */
export interface EscritoEnLaBase {
  insertadas: number
  actualizadas: number
  borradas: number
  intactas: { id: string; motivo: string }[]
}

/**
 * El acuse. Dice lo que PASÓ EN LA BASE, no lo que el plan pidió.
 *
 * El defecto que corrige: el acuse afirmaba «1 corregida» contando `plan.actualizar.length`, aunque
 * el `update` hubiera afectado CERO filas —porque otro la borró entremedio, o porque la policy la
 * rechazó sin error—. Un acuse que cuenta intenciones es exactamente lo que este repo prohíbe:
 * la evidencia es del efecto, no del intento. Los números vienen del `.select()` encadenado.
 */
export function acuseDe(e: EscritoEnLaBase): string {
  const partes = [
    e.insertadas > 0 ? `${e.insertadas} ${e.insertadas === 1 ? 'marca nueva' : 'marcas nuevas'}` : null,
    e.actualizadas > 0 ? `${e.actualizadas} ${e.actualizadas === 1 ? 'corregida' : 'corregidas'}` : null,
    e.borradas > 0 ? `${e.borradas} ${e.borradas === 1 ? 'reemplazada' : 'reemplazadas'}` : null,
  ].filter(Boolean)
  const nada = partes.length === 0
    ? 'No cambió nada en la base: el día ya estaba así.'
    : `Día guardado: ${partes.join(' · ')}.`
  if (e.intactas.length === 0) return nada
  // LO QUE NO SE TOCÓ SE NOMBRA. Saltear en silencio es peor que fallar: alguien creería que la
  // pantalla dejó el día como lo ve, cuando hay otra hora cargada que sigue contando.
  const [primera] = e.intactas
  return `${nada} ${e.intactas.length === 1
    ? `Quedó sin tocar una fila: ${primera.motivo}.`
    : `Quedaron ${e.intactas.length} filas sin tocar (una ${primera.motivo}).`}`
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// LA CORRECCIÓN DE UN DÍA POR ADMINISTRACIÓN
//
// El dueño: *«que todo pueda ser modificado por el administrador, asignándole obra»*. Eso es más
// que cambiar un número: es poder mover un día de una obra a otra, declararlo ausencia o borrarlo.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

export const correccionSchema = z.object({
  persona_id: z.string().uuid('Elegí a quién le corregís el día'),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Elegí el día'),
  /** De dónde salen las horas hoy. `null` = el día no tiene nada cargado todavía. */
  obra_origen: z.union([z.string().trim().min(1), z.null()]).default(null),
  obra_destino: z.string().trim().min(1, 'Elegí la obra'),
  estado: z.enum(['presente', 'ausente', 'borrar']),
  horas: z.number().positive().max(24).nullable().default(null),
  /** Por qué no vino. Decide si el día queda como `ausencia` o como `licencia`. */
  motivo: z.string().trim().refine(esMotivo, 'Ese motivo no está en el catálogo').nullable().default(null),
  /** Asignar a la persona a la obra destino en el mismo gesto. Explícito: nunca por defecto. */
  asignar: z.boolean().default(false),
}).refine((d) => d.estado !== 'presente' || d.horas !== null, {
  message: 'Poné cuántas horas hizo, o marcá que no vino',
})

export type Correccion = z.infer<typeof correccionSchema>

/**
 * ¿Este día CAMBIA DE OBRA?
 *
 * Es la única pregunta que decide si la corrección es un update o un movimiento. Sin origen no hay
 * movimiento: el día no tenía nada y se está cargando por primera vez.
 */
export const cambiaDeObra = (c: Correccion): boolean =>
  c.obra_origen !== null && c.obra_origen !== c.obra_destino

/**
 * El ORDEN en que se toca la base cuando el día se mueve de obra.
 *
 * PostgREST no da transacciones: `insertar` y `borrar` son dos viajes. El orden importa y no es
 * simétrico —es la diferencia entre un error visible y horas perdidas—:
 *
 *   INSERTAR PRIMERO. Si el insert falla, no se borró nada y el día sigue como estaba.
 *   BORRAR DESPUÉS.   Si el borrado falla, el día queda cargado en LAS DOS obras: se ve en la
 *                     grilla, la persona aparece con dos filas y alguien lo corrige.
 *
 * Al revés —borrar y después insertar— un fallo en el segundo paso deja el día en NINGUNA obra: las
 * horas desaparecen sin que nadie vea un error. Un duplicado visible siempre le gana a una pérdida
 * silenciosa. La clave única no se opone: son obras distintas, así que las dos filas conviven.
 */
export const ORDEN_DEL_MOVIMIENTO = ['insertar', 'borrar'] as const

// ── EL ERROR DE POSTGRES, EN EL IDIOMA DE QUIEN CARGA ──────────────────────────────────────────
//
// Vive acá y no en la acción por la misma razón mecánica que todo lo demás de este archivo: un
// `'use server'` sólo puede exportar funciones async, y exportar una pura desde ahí ROMPE EL BUILD.
// El typecheck no lo ve; el build sí. Y de paso se prueba sin base.

/**
 * El error de Postgres, dicho en el idioma de quien carga.
 *
 * El trigger `registros_hh_periodo_cerrado` ya escribe un mensaje pensado para una persona y se
 * muestra tal cual. Los que no —una colisión de la clave única, un permiso— salían crudos: un
 * `duplicate key value violates unique constraint "registros_hh_persona_unico"` en el teléfono de
 * un jefe de obra no es un mensaje, es ruido.
 */
export function traducirEscritura(error: { code?: string; message: string }): string {
  if (error.code === '23505') {
    return 'Alguien más cargó ese mismo día mientras estabas en esta pantalla. Recargá para ver lo '
      + 'que quedó y corregí sobre eso — para no escribir dos veces la misma jornada.'
  }
  if (error.code === '42501') {
    return 'Tu usuario no puede escribir horas en esta obra.'
  }
  // 23514 es el CHECK del período cerrado: su mensaje ya está escrito para una persona.
  return error.message
}

/** El motivo de una marca, o `null` si es un día trabajado. Es lo que va a `registros_hh.notas`. */
export const motivoDe = (m: MarcaDeJornada): string | null =>
  m.estado === 'ausente' ? (m.motivo ?? null) : null

/**
 * QUÉ SE BORRA CUANDO ADMINISTRACIÓN SACA UN DÍA — y qué NO.
 *
 * El defecto que corrige (auditoría, 07/09): `corregirJornada` con `estado: 'borrar'` hacía
 * `delete().in('id', …)` sobre TODAS las filas de esa persona en esa obra y ese día. «Sacar lo
 * cargado» borraba, además de la jornada, la imputación a una actividad del plan, la hora
 * improductiva con su causa y las extras al 50 %. El panel decía «Día borrado: 3 registros» y el
 * jefe que había cargado las extras nunca se enteraba.
 *
 * Usa EXACTAMENTE el mismo criterio que `planDeGuardado`: `esDeLaJornada`. Un solo lugar decide qué
 * filas administra esta pantalla — dos criterios para lo mismo discrepan el día que se toca uno.
 */
export function planDeBorrado(
  existentes: FilaExistente[],
  opciones: { administraLicencias?: boolean } = {},
): { borrar: string[]; intactas: { id: string; motivo: string }[] } {
  const administra = opciones.administraLicencias === true
  const ordenadas = [...existentes].sort((a, b) => a.id.localeCompare(b.id))
  return {
    borrar: ordenadas.filter((e) => esDeLaJornada(e, administra)).map((e) => e.id),
    intactas: ordenadas.filter((e) => !esDeLaJornada(e, administra))
      .map((e) => ({ id: e.id, motivo: motivoDeNoTocar(e) })),
  }
}

/** El acuse del borrado. Cuenta lo que la BASE devolvió y nombra lo que quedó. */
export function acuseDeBorrado(borradas: number, intactas: { motivo: string }[]): string {
  const cabeza = borradas === 0
    ? 'No se borró nada.'
    : `Día borrado: ${borradas} ${borradas === 1 ? 'registro' : 'registros'}.`
  if (intactas.length === 0) return cabeza
  return `${cabeza} ${intactas.length === 1
    ? `Quedó una fila sin tocar: ${intactas[0].motivo}.`
    : `Quedaron ${intactas.length} filas sin tocar (una ${intactas[0].motivo}).`}`
}
