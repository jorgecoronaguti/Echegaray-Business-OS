// PRESENCIA Y HORAS SON DOS HECHOS DISTINTOS — y esta pantalla los mezclaba.
//
// ═══ EL ERROR QUE ESTE ARCHIVO EXISTE PARA IMPEDIR ═══
//
// El dueño, 08/09/2026, por TERCERA vez: *«todas las pantallas en donde aparezca el concepto de
// fichado no tiene que resolverse con las hs; está mal: una cosa es asistencia o activo en el día
// y otra cosa son las cantidades de hs»*.
//
// Este archivo ya separaba el fichaje de la carga de horas, pero seguía publicando UN SOLO campo
// `estado` donde `con_horas` era una CANTIDAD disfrazada de ESTADO: nueve horas cargadas escribían
// «con horas» en la fila y la pantalla —y quien la lee— tomaba eso por «vino», sin que nadie
// hubiera mirado a esa persona. Y `sin_cargar` fundía dos silencios distintos: «todavía no le
// cargaron las horas» y «nadie declaró si estaba».
//
// Ahora la clasificación devuelve DOS campos que no se derivan uno del otro:
//
//   PRESENCIA  presente · ausente · licencia · sin_marcar. Sale SÓLO de `asistencia_dia` (lo
//              declaró el jefe), de `asistencia_marca` (fichaje real) o de una fila de
//              `registros_hh` con `tipo_hora` de ausencia/licencia —que es una declaración, no un
//              número—. Nunca de una cantidad de horas.
//   HORAS      una CANTIDAD. `null` = nadie cargó nada, que no es cero. Se muestra al lado del
//              estado, en monoespaciada y sin color de estado: 9 h no es «bien» ni «mal».
//
// UNA PERSONA PUEDE TENER 9 H Y ESTAR «SIN MARCAR» —es lo normal hoy: el fichaje no está en uso y
// la declaración del jefe recién arrancó— Y PUEDE ESTAR «PRESENTE» CON 0 H CARGADAS. Las dos cosas
// se ven, ninguna se deduce de la otra.
//
// ═══ QUÉ SIGNIFICA CADA SILENCIO ═══
//
// Sin registro NO es ausente: es «sin marcar», neutro. La ausencia es una decisión de alguien y
// deja su propia fila. Es la misma regla que ya gobierna `jornadaPorObra.ts`, y qué hora es trabajo
// lo sigue decidiendo `tipoHora.ts` —acá no se redefine nada de eso, se reusa—.
//
// Medido el 08/09/2026: `asistencia_marca` tiene CUATRO filas en toda su historia contra 339
// registros de horas del último mes. La ausencia de una capacidad no es un dato sobre la gente.

import { combinarCeldaDia } from '../../../shared/components/ds/celdaDia.ts'
import type { PresenciaDeclarada } from '../../../shared/components/ds/celdaDia.ts'
import { contieneEnAlguno } from '../../../shared/utils/busqueda.ts'
import { esTrabajada } from '../../obras/services/tipoHora.ts'
import { hs, redondear } from './jornadaPorObra.ts'
import type { Esperado } from './presencia.ts'
import type { PresenciaGuardada } from './presenciaDelDia.ts'

/** EL ESTADO DEL DÍA DE UNA PERSONA, y nada más que eso. No hay «con horas»: una cantidad no es
 *  un estado, y quien la puso ahí hacía que 9 h significaran «vino» sin que nadie lo hubiera
 *  mirado. Tampoco hay «sin cargar», que mezclaba dos silencios distintos —«no hay horas» y «nadie
 *  declaró nada»— en una sola palabra que terminaba leyéndose como falta.
 *
 *  El dueño, 08/09/2026 (tercera vez): *«todas las pantallas en donde aparezca el concepto de
 *  fichado no tiene que resolverse con las hs; está mal: una cosa es asistencia o activo en el día
 *  y otra cosa son las cantidades de hs»*. */
export type Presencia = 'presente' | 'ausente' | 'licencia' | 'sin_marcar'

/** De dónde salió la presencia. `null` con `sin_marcar`: no hay fuente porque no hay hecho.
 *
 *  `hh` es la ausencia o la licencia declarada con `tipo_hora` en `registros_hh` — el camino viejo,
 *  y lo único que tienen los días anteriores al 08/09/2026. Es una DECLARACIÓN, no una cantidad:
 *  ninguna cantidad de horas produce jamás una `fuente`. */
export type FuentePresencia = 'declarada' | 'fichaje' | 'hh'

/** Las DOS capas del día de una persona, cada una con su fuente y ninguna derivada de la otra.
 *
 *  Se puede tener 9 h y estar `sin_marcar` (lo normal hoy: el fichaje no está en uso y la
 *  declaración del jefe recién arrancó), y se puede estar `presente` con `horas` en `null` (el jefe
 *  marcó la cuadrilla a las 7:30 y todavía nadie cargó el día). Las dos son verdades válidas.
 *
 *  `horas` en `null` NO es cero: es que nadie cargó nada, y las dos cosas se dibujan distinto. */
export interface ClasificacionDelDia {
  presencia: Presencia
  fuente: FuentePresencia | null
  horas: number | null
  motivo: string | null
  /** El jefe declaró que no vino y sin embargo el día tiene horas cargadas. Se muestra, no se
   *  resuelve: una de las dos afirmaciones se liquida y la pantalla no puede elegir cuál.
   *  OPCIONAL porque `clasificar` sólo lo escribe cuando lo hay: un `false` en cada clasificación
   *  obligaría a repetirlo a toda pantalla que arme una a mano, y su ausencia ya significa
   *  «no hay contradicción». */
  conflicto?: boolean
}

/**
 * LO ÚNICO QUE `clasificar` MIRA de una fila de `registros_hh`.
 *
 * Existe separado de `RegistroDelDia` porque la clasificación del día es la MISMA regla en dos
 * pantallas que traen columnas distintas: «En obra ahora» agrupa por obra y necesita el rótulo de
 * la obra y de la persona; la columna HOY del Plantel ya tiene el nombre en la fila y sólo pide
 * horas, tipo y motivo. Exigirle a la segunda que fabrique un `nombre` y una `obra` que no consulta
 * la habría empujado a escribir su propia copia del `if` — que es exactamente el error que este
 * archivo existe para impedir.
 */
export interface RegistroClasificable {
  horas: number
  tipo_hora: string
  notas: string | null
}

/** Una fila de `registros_hh` del día, con el rótulo de su obra y de su persona ya resueltos. */
export interface RegistroDelDia extends RegistroClasificable {
  persona_id: string
  nombre: string | null
  categoria: string | null
  obra_id: string | null
  obra: string | null
}

export interface PersonaDelDia extends ClasificacionDelDia {
  personaId: string
  nombre: string
  /** La categoría de convenio, igual que la columna CATEGORÍA de Plantel. Nunca se inventa. */
  categoria: string | null
}

/** LOS DOS CONTEOS DEL DÍA, EN DOS RENGLONES QUE NO SE MEZCLAN. Arriba, cuánta gente está en cada
 *  estado; abajo, cuántas horas hay cargadas y a cuántos les falta el número. Un solo renglón
 *  —«N de M con horas»— era el titular que convertía la carga administrativa en asistencia. */
export interface ConteoDelDia {
  presentes: number
  ausentes: number
  licencias: number
  /** Nadie declaró nada ni hay marca. NO es una falta, y por eso tiene su propia cifra. */
  sinMarcar: number
  /** Personas con al menos una hora trabajada cargada. Es una cuenta de CARGA, no de asistencia. */
  conHoras: number
  /** Las que no tienen ni una hora cargada, cualquiera sea su presencia. */
  sinHoras: number
  /** Horas trabajadas del día. Las de una ausencia declarada por `tipo_hora` no entran. */
  horas: number
}

export interface ObraDelDia extends ConteoDelDia {
  obraId: string | null
  nombre: string
  gente: PersonaDelDia[]
}

export interface AsistenciaDelDia extends ConteoDelDia {
  obras: ObraDelDia[]
  /** Cuánta gente entra en la cuenta: asignados vigentes más quien cargó sin asignación. */
  plantel: number
}

const rotulo = (id: string | null, nombre: string | null): string =>
  nombre?.trim() || id || 'Sin obra imputada'

/** La presencia de `combinarCeldaDia` traducida al vocabulario de estas pantallas. `ficho` y
 *  `presente` son la misma respuesta a «¿está?» —lo que cambia es quién lo afirmó, y eso lo dice
 *  `fuente`—; `sin_marca` se llama acá `sin_marcar`, que es lo que la pantalla escribe. */
const PRESENCIA: Record<string, Presencia> = {
  ficho: 'presente', presente: 'presente', ausente: 'ausente', licencia: 'licencia',
  sin_marca: 'sin_marcar',
}

const FUENTE: Record<string, FuentePresencia | null> = {
  declarada: 'declarada', fichaje: 'fichaje', horas: 'hh', ninguno: null,
}

/**
 * Las DOS capas del día de una persona: qué se afirmó de ella, y cuántas horas le cargaron.
 *
 * LAS HORAS NO ENTRAN EN LA PRESENCIA. Es la regla entera de esta función: `horas` se calcula y se
 * devuelve como CANTIDAD, y la presencia sale sólo de lo declarado (`asistencia_dia`), del fichaje
 * (`asistencia_marca`) o de una fila de `registros_hh` con `tipo_hora` de ausencia o licencia —que
 * es una declaración, no un número—. Cuando no hay ninguna de las tres, `sin_marcar`, en neutro.
 *
 * LO DECLARADO GANA SOBRE LO IMPUTADO: si alguien declaró que no vino, la pantalla no dice que
 * trabajó porque además exista una imputación del mismo día — lo dice como CONFLICTO y muestra las
 * dos mitades. La precedencia vive una sola vez, en `combinarCeldaDia`; acá se traduce, no se
 * re-decide. Dos criterios para la misma pregunta terminan en dos respuestas, y la que se cree es
 * la última que alguien miró.
 *
 * A diferencia de `armarJornada`, la licencia NO se colapsa dentro de «ausente»: una licencia por
 * enfermedad y una falta son dos novedades distintas para quien liquida.
 */
export function clasificar(
  registros: RegistroClasificable[], declarada: PresenciaDeclarada = null, ficho = false,
): ClasificacionDelDia {
  const enHoras = registros.find((r) => !esTrabajada(r.tipo_hora))
  const trabajadas = registros.filter((r) => esTrabajada(r.tipo_hora))
  const horas = trabajadas.length > 0 ? redondear(trabajadas.reduce((s, r) => s + r.horas, 0)) : null

  const c = combinarCeldaDia({
    declarada,
    ficho,
    horas,
    enHoras: enHoras ? (enHoras.tipo_hora === 'licencia' ? 'licencia' : 'ausente') : null,
    dia: 'habil',
  })
  const motivo = declarada && declarada !== 'presente' ? null : (enHoras?.notas?.trim() || null)
  const presencia = PRESENCIA[c.entrada.presencia]

  return {
    presencia,
    fuente: FUENTE[c.origen],
    // LAS HORAS SE DEVUELVEN SIEMPRE, incluso bajo una ausencia declarada: son el otro hecho.
    // Esconderlas ahí sería resolver el conflicto a favor de la ausencia sin decirlo, y una de las
    // dos afirmaciones se liquida.
    horas,
    motivo: presencia === 'ausente' || presencia === 'licencia' ? motivo : null,
    ...(c.conflicto ? { conflicto: true as const } : {}),
  }
}

/** Los dos conteos sobre la gente que se está mostrando. Vive una sola vez porque `filtrarAsistencia`
 *  los tiene que rehacer sobre lo visible: dos copias del mismo `filter` es como el titular termina
 *  diciendo una cosa y la lista otra. */
export function contar(gente: readonly PersonaDelDia[]): ConteoDelDia {
  const cuantos = (p: Presencia) => gente.filter((g) => g.presencia === p).length
  return {
    presentes: cuantos('presente'),
    ausentes: cuantos('ausente'),
    licencias: cuantos('licencia'),
    sinMarcar: cuantos('sin_marcar'),
    conHoras: gente.filter((g) => g.horas !== null).length,
    sinHoras: gente.filter((g) => g.horas === null).length,
    // LAS HORAS DE UN DÍA EN CONFLICTO SUMAN: están cargadas y le pesan a la obra. Restarlas sería
    // resolver el conflicto en el total y dejar el titular diciendo menos horas de las que existen.
    horas: redondear(gente.reduce((s, g) => s + (g.horas ?? 0), 0)),
  }
}

/**
 * La asistencia del día agrupada por obra.
 *
 * `esperados` son los que tienen asignación vigente (`persona_directorio`); `registros`, lo que hay
 * cargado hoy. La obra de cada uno es la del REGISTRO cuando cargó —ahí es donde pesan sus horas—,
 * y la de su asignación cuando no. Alguien que cargó en una obra a la que ya no está asignado
 * aparece igual: sus horas existen y alguien las tiene que poder ver.
 */
export function asistenciaDelDia(
  { esperados, registros, presencia = [] }: {
    esperados: Esperado[]
    registros: RegistroDelDia[]
    /** `asistencia_dia` del mismo día. Vacío = todavía nadie declaró nada, y la pantalla se
     *  comporta exactamente como antes del 08/09/2026. */
    presencia?: PresenciaGuardada[]
  },
): AsistenciaDelDia {
  const declaradaDe = new Map(presencia.map((p) => [p.persona_id, p.estado]))
  const porPersona = new Map<string, RegistroDelDia[]>()
  for (const r of registros) {
    const previos = porPersona.get(r.persona_id)
    if (previos) previos.push(r)
    else porPersona.set(r.persona_id, [r])
  }

  const filas: (PersonaDelDia & { obraId: string | null; obra: string | null })[] = []
  const vistas = new Set<string>()

  for (const e of esperados) {
    const suyos = porPersona.get(e.id) ?? []
    const donde = suyos[0]
    vistas.add(e.id)
    filas.push({
      personaId: e.id,
      nombre: e.nombre_completo,
      categoria: e.categoria,
      obraId: donde?.obra_id ?? e.obra_actual_id,
      obra: donde?.obra ?? e.obra_actual,
      ...clasificar(suyos, declaradaDe.get(e.id) ?? null),
    })
  }

  // Cargó horas y no está entre los esperados: la asignación venció, o nunca hubo. Su obra es la
  // del registro; esconderlo dejaría horas imputadas que ninguna pantalla muestra.
  for (const [personaId, suyos] of porPersona) {
    if (vistas.has(personaId)) continue
    filas.push({
      personaId,
      nombre: suyos[0].nombre ?? personaId,
      categoria: suyos[0].categoria,
      obraId: suyos[0].obra_id,
      obra: suyos[0].obra,
      ...clasificar(suyos, declaradaDe.get(personaId) ?? null),
    })
  }

  const porObra = new Map<string, PersonaDelDia[]>()
  const nombreObra = new Map<string, { obraId: string | null; nombre: string }>()
  for (const f of filas) {
    const clave = f.obraId ?? '·sin-obra'
    nombreObra.set(clave, { obraId: f.obraId, nombre: rotulo(f.obraId, f.obra) })
    const gente = porObra.get(clave) ?? []
    gente.push({
      personaId: f.personaId, nombre: f.nombre, categoria: f.categoria,
      presencia: f.presencia, fuente: f.fuente, horas: f.horas, motivo: f.motivo,
      ...(f.conflicto ? { conflicto: true as const } : {}),
    })
    porObra.set(clave, gente)
  }

  const obras = [...porObra.entries()]
    .map(([clave, gente]) => {
      const ordenada = [...gente].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
      return { ...nombreObra.get(clave)!, gente: ordenada, ...contar(ordenada) }
    })
    .sort((a, b) => b.gente.length - a.gente.length || a.nombre.localeCompare(b.nombre, 'es'))

  return { obras, plantel: filas.length, ...contar(filas) }
}

/**
 * LA BÚSQUEDA SE APLICA DESPUÉS DE CLASIFICAR, nunca antes.
 *
 * Filtrar los registros crudos sacaría la fila de horas de alguien y lo dejaría «sin cargar»: la
 * pantalla afirmaría que a una persona no se le cargó el día porque el apellido tipeado no coincide
 * con el nombre de su obra. Los conteos se rehacen sobre lo que queda visible, para que el titular
 * no diga una cosa y la lista otra.
 */
export function filtrarAsistencia(a: AsistenciaDelDia, q: string): AsistenciaDelDia {
  const t = q.trim()
  if (t === '') return a
  const obras = a.obras
    .map((o) => {
      const gente = o.gente.filter((g) => contieneEnAlguno([g.nombre, g.categoria, o.nombre], t))
      return { obraId: o.obraId, nombre: o.nombre, gente, ...contar(gente) }
    })
    .filter((o) => o.gente.length > 0)
  const gente = obras.flatMap((o) => o.gente)
  return { obras, plantel: gente.length, ...contar(gente) }
}

/**
 * EL TITULAR DE LA PRESENCIA. Una frase, cuatro cifras, y ninguna sale de un número de horas.
 *
 * Los cuatro números salen siempre, incluso en cero: un cero explícito es una respuesta, y una
 * cifra ausente obliga a quien lee a preguntarse si hubo o no. «Sin marcar» va último y sin tono:
 * es la falta de un dato, no una falta de la persona.
 */
export function resumenAsistencia(a: AsistenciaDelDia): string {
  if (a.plantel === 0) return 'Nadie con asignación vigente ni horas cargadas hoy'
  return `${a.presentes} presentes · ${a.ausentes} ausentes · ${a.licencias} licencia · ${a.sinMarcar} sin marcar`
}

/** LA SEGUNDA FRASE: la CARGA, que es otra cosa. Va aparte a propósito — pegada a la de arriba
 *  volvería a leerse como si la falta de horas dijera algo sobre quién vino. */
export function resumenHoras(a: AsistenciaDelDia): string {
  if (a.plantel === 0) return 'Sin horas cargadas'
  const personas = a.sinHoras === 1 ? '1 persona sin horas' : `${a.sinHoras} personas sin horas`
  return `${hs(a.horas)} h cargadas · ${personas}`
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// EL FICHAJE, POR SU PROPIO CAMINO
// ═══════════════════════════════════════════════════════════════════════════════════════════════

export interface ResumenFichaje {
  entradas: number
  salidas: number
  /** Sin una sola marca la pantalla NO dibuja diecisiete «no fichó»: lo dice una vez y en neutro. */
  hayMarcas: boolean
}

/** Cuántas marcas reales de entrada y de salida hay hoy. Nunca se compara contra el plantel: el
 *  denominador convertiría «esta capacidad no se usa» en «faltó gente». */
export function resumenFichaje(
  marcas: { entrada: string | null; salida: string | null }[],
): ResumenFichaje {
  const entradas = marcas.filter((m) => m.entrada != null).length
  const salidas = marcas.filter((m) => m.salida != null).length
  return { entradas, salidas, hayMarcas: entradas + salidas > 0 }
}

/** La línea del bloque de fichaje. Cuando no hay marcas explica POR QUÉ no las hay, sin culpar a
 *  nadie: la capacidad todavía no está en uso. */
export function textoFichaje(f: ResumenFichaje): string {
  if (!f.hayMarcas) {
    return 'Sin marcas de entrada/salida (el fichaje desde el celular todavía no está en uso)'
  }
  const partes = [`${f.entradas} ${f.entradas === 1 ? 'entrada' : 'entradas'}`]
  partes.push(`${f.salidas} ${f.salidas === 1 ? 'salida' : 'salidas'}`)
  return partes.join(' · ')
}
