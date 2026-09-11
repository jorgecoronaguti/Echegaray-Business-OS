// LA VISTA «QUINCENA»: EL ESPEJO DEL BLOQUE DE LA PLANILLA JORNALES, ARMADO DE LO QUE YA SE CALCULA.
//
// El dueño, 11/09/2026, textual: *«No me sirve la sección Liquidación en módulo Personal, la utilidad
// es pésima, la UX es malísima, tengo que seguir usando Sheet JORNALES»*. Su modelo mental es el
// bloque de «Obreros 26» / «Oficina 26»: una fila por persona, una columna por día con las horas, y a
// la derecha $/h, total, adelanto, banco, efectivo. La app tenía las dos mitades en dos pantallas
// distintas —«Horas» los días, «Pagos» la plata— así que ninguna de las dos contestaba la pregunta
// que él hace, que es la de la fila entera.
//
// ═══ ESTO NO CALCULA NADA NUEVO. ES LA ÚNICA RAZÓN POR LA QUE PUEDE EXISTIR ═══
//
// Las horas del día las decide `celdaDelDia` (grillaHorasQuincena.ts). La cadena de pago la decide
// `liquidarLinea` + `aplicarOverrides`. El orden y los rótulos, `ordenDePersonal.ts`. Acá se PEGA una
// cosa al lado de la otra y se coteja contra la planilla. Si esta vista recalculara las horas o la
// resta, habría una tercera definición de la quincena y el dueño tendría tres números para la misma
// persona — que es peor que tener dos pantallas.
//
// ═══ EL COTEJO CONTRA LA PLANILLA NO ES DECORATIVO ═══
//
// Es la única forma de que él pueda dejar de abrir el Sheet: mientras no pueda VER que la base dice
// lo mismo que su planilla, la planilla sigue siendo la fuente y la pantalla es un adorno. El chip
// compara HORAS CRUDAS —la suma de las celdas del bloque— contra la suma de `registros_hh` en la
// misma ventana, que es lo que el importador escribe. No compara las liquidables: ésas ya aplican la
// tabla motivo → paga y no existen en la planilla, así que «difiere» sería el estado permanente.

import { celdaDelDia, type CeldaDeGrilla, type PersonaDeGrilla } from './grillaHorasQuincena.ts'
import type { CampoEditable, LineaConOverrides } from './liquidacionOverrides.ts'
import type { GrupoLiquidacion, PresenciaDeQuincena, RegistroDeQuincena } from './liquidacionQuincena.ts'
import { diasDeQuincena, esDomingo, type Quincena } from './quincena.ts'
import { ordenarComoPersonal } from './ordenDePersonal.ts'

const r2 = (n: number): number => Math.round(n * 100) / 100

/**
 * LAS COLUMNAS DE DÍA: lunes a sábado de la quincena, y el domingo SÓLO si ese domingo tiene horas.
 *
 * El dueño lo pidió así y la planilla lo hace así: el bloque no dibuja el domingo salvo cuando
 * alguien trabajó. Dibujar la columna siempre agrega quince celdas vacías por fila a una tabla que ya
 * se recorre en horizontal; esconderla cuando hay horas ESCONDERÍA HORAS, que es lo único que no se
 * puede hacer. La liquidación sigue sin considerar los domingos (decisión del 08/09/2026): acá se
 * MUESTRAN porque la fila tiene que mostrar todo lo cargado, no porque se paguen.
 */
export function diasDelEspejo(q: Quincena, diasConHoras: ReadonlySet<string>): string[] {
  return diasDeQuincena(q).filter((f) => !esDomingo(f) || diasConHoras.has(f))
}

/** Qué días de la ventana tienen alguna hora cargada. Lo único para lo que se mira el domingo. */
export function diasConHorasDe(
  registros: readonly (RegistroDeQuincena & { persona_id: string })[],
): Set<string> {
  const out = new Set<string>()
  for (const r of registros) if (Number(r.horas) > 0) out.add(r.fecha)
  return out
}

export type EstadoDeCotejo = 'coincide' | 'difiere' | 'sin-espejo'

export interface Cotejo {
  estado: EstadoDeCotejo
  /** Horas de la base − horas del bloque de la planilla. `null` cuando no hay con qué comparar. */
  diferencia: number | null
  horasEnLaPlanilla: number | null
  /** Horas de `registros_hh` EN LOS DÍAS QUE LA PLANILLA DICE TENER. Ver `cotejoConLaPlanilla`. */
  horasEnLaBase: number
  /** Cuántos días de la quincena tiene escritos la planilla. El resto no se compara. */
  diasComparados: number
  /** Cuántos días de la ventana quedaron fuera de la comparación porque la planilla no los tiene. */
  diasSinComparar: number
}

/**
 * ¿LA BASE DICE LO MISMO QUE EL BLOQUE DE LA PLANILLA?
 *
 * `sin-espejo` NO es «coincide». Sin la lectura del Sheet no se puede afirmar nada, y un chip verde
 * sobre una comparación que no se hizo es exactamente el control que no puede dar rojo: el dueño
 * dejaría de abrir la planilla creyendo que alguien comparó. La tolerancia es de una centésima de
 * hora, que es el redondeo de la propia base (`numeric`), no un margen de criterio.
 */
export function cotejoConLaPlanilla(
  horasEnLaBase: number, horasEnLaPlanilla: number | null,
  { diasComparados = 0, diasSinComparar = 0 } = {},
): Cotejo {
  if (horasEnLaPlanilla == null) {
    return {
      estado: 'sin-espejo', diferencia: null, horasEnLaPlanilla: null,
      horasEnLaBase: r2(horasEnLaBase), diasComparados, diasSinComparar,
    }
  }
  const diferencia = r2(horasEnLaBase - horasEnLaPlanilla)
  return {
    estado: Math.abs(diferencia) <= 0.01 ? 'coincide' : 'difiere',
    diferencia,
    horasEnLaPlanilla: r2(horasEnLaPlanilla),
    horasEnLaBase: r2(horasEnLaBase),
    diasComparados,
    diasSinComparar,
  }
}

/** Una celda de día del espejo: la de la grilla, más con qué fila de la base se escribe. */
export interface CeldaDelEspejo extends CeldaDeGrilla {
  /**
   * EL REGISTRO AL QUE SE LE IMPUTA LO QUE SE TECLEE, o `null` cuando hay que crear uno.
   *
   * `null` con `editable: true` es el caso que la planilla hace todo el tiempo: la celda está vacía y
   * el dueño escribe el número. La obra la deduce el servidor con `obraParaElDia`.
   */
  registroId: string | null
  /** `false` = esta celda no ofrece campo. El porqué lo decide `porQueNoSeEdita`. */
  editable: boolean
  /** Cuántas filas de la base tiene ese día. >1 obliga a elegir, y eso no lo hace la pantalla. */
  registros: number
}

export interface FilaDelEspejo {
  personaId: string
  nombre: string
  esJefe: boolean
  grupo: GrupoLiquidacion
  celdas: CeldaDelEspejo[]
  /** La cadena, tal como la publica la liquidación. Ni un número se recalcula acá. */
  linea: LineaConOverrides
  cotejo: Cotejo
  /** La quincena de ESTE cuadro está cerrada: la fila es una foto y no se escribe (R6). */
  cerrada: boolean
}

export interface DatosDelEspejo {
  quincena: Quincena
  personas: readonly PersonaDeGrilla[]
  registros: readonly (RegistroDeQuincena & { persona_id: string; id?: string })[]
  presencias: readonly (PresenciaDeQuincena & { persona_id: string })[]
  /** La línea de pago de cada persona, con su cuadro. La arma `getLiquidacionDeLaQuincena`. */
  lineas: Record<string, { grupo: GrupoLiquidacion; linea: LineaConOverrides }>
  /** Los cuadros con la quincena cerrada. */
  cuadrosCerrados: ReadonlySet<string>
  /** Horas que el bloque de la planilla declara para cada persona en esta ventana. */
  horasDeLaPlanilla: ReadonlyMap<string, number>
  /** De qué días habla la planilla, por persona. El cotejo se hace SÓLO sobre ellos. */
  diasDeLaPlanilla: ReadonlyMap<string, ReadonlySet<string>>
  /** `true` cuando se pudo leer el espejo de la planilla. `false` deja todos los chips en `sin-espejo`. */
  hayEspejo: boolean
  hoy: string
}

/**
 * LAS FILAS DEL ESPEJO, EN EL ORDEN DEL MÓDULO PERSONAL.
 *
 * Sólo entra quien tiene línea de pago: la cadena de la derecha es la mitad de la fila, y una persona
 * dibujada con los días cargados y la plata en blanco se lee como que el sistema perdió su
 * liquidación. Quién entra en la quincena ya lo decidió `plantelDeLaQuincena` — repetir el corte acá
 * sería una segunda respuesta a «¿éste está activo?».
 */
export function filasDelEspejo(d: DatosDelEspejo): FilaDelEspejo[] {
  const dias = diasDelEspejo(d.quincena, diasConHorasDe(d.registros))
  const conLinea = d.personas.filter((p) => d.lineas[p.id] != null)
  return ordenarComoPersonal(conLinea, (p) => p.nombre, (p) => p.esJefe === true).map((p) => {
    const suyos = d.registros.filter((r) => r.persona_id === p.id)
    const pres = new Map(d.presencias.filter((x) => x.persona_id === p.id).map((x) => [x.fecha, x]))
    const { grupo, linea } = d.lineas[p.id]
    const cerrada = d.cuadrosCerrados.has(grupo)
    return {
      personaId: p.id,
      nombre: p.nombre,
      esJefe: p.esJefe === true,
      grupo,
      linea,
      cerrada,
      celdas: dias.map((f) => celdaDelEspejo(f, suyos, pres.get(f), cerrada)),
      cotejo: cotejar(d, p.id, suyos, dias),
    }
  })
}

/** La suma de las celdas del día, tal cual están guardadas. Es lo que la columna «Hs» de la planilla suma. */
function horasCrudasDe(registros: readonly RegistroDeQuincena[]): number {
  return r2(registros.reduce((s, r) => s + (Number(r.horas) || 0), 0))
}

/**
 * EL COTEJO SE HACE SOBRE LOS DÍAS QUE LA PLANILLA DICE TENER, Y NO SOBRE LA VENTANA ENTERA.
 *
 * ═══ EL DEFECTO, MEDIDO EL 11/09/2026 ═══
 *
 * La planilla es un documento que se va llenando: al mediodía tenía ocho días cargados de los trece
 * de la quincena. Comparar las quince personas sobre los quince días daba «difiere 8 h» para las
 * quince —el día de hoy, que la app cargó sola y el dueño todavía no— y un chip que está siempre en
 * rojo deja de leerse. De los días que la planilla NO tiene, la planilla no afirma nada: no se puede
 * diferir contra una afirmación que nadie hizo.
 *
 * Restringido a los ocho días, catorce de las quince personas dieron EXACTO. La que no —Gonzalez
 * Tobares Juan Guillermo— difiere de verdad: tiene dos días con dos filas de la web cada uno, que el
 * importador declara intocables porque no puede elegir cuál pisa a cuál. Ese chip rojo es un dato.
 */
function cotejar(
  d: DatosDelEspejo, personaId: string,
  registros: readonly RegistroDeQuincena[], diasDeLaVista: readonly string[],
): Cotejo {
  const dias = d.diasDeLaPlanilla.get(personaId)
  if (!d.hayEspejo || !dias || dias.size === 0) {
    return cotejoConLaPlanilla(horasCrudasDe(registros), d.hayEspejo ? (d.horasDeLaPlanilla.get(personaId) ?? 0) : null, {
      diasComparados: 0,
      diasSinComparar: diasDeLaVista.length,
    })
  }
  const enLosDias = registros.filter((r) => dias.has(r.fecha))
  return cotejoConLaPlanilla(horasCrudasDe(enLosDias), d.horasDeLaPlanilla.get(personaId) ?? 0, {
    diasComparados: dias.size,
    diasSinComparar: diasDeLaVista.filter((f) => !dias.has(f)).length,
  })
}

/**
 * UNA CELDA DEL ESPEJO. La marca y las horas las decide `celdaDelDia`; acá sólo se resuelve SI SE
 * PUEDE ESCRIBIR y SOBRE QUÉ FILA.
 *
 * ═══ LAS TRES QUE NO OFRECEN CAMPO ═══
 *
 *   QUINCENA CERRADA      las horas quedaron selladas (R6). La acción lo vuelve a comprobar.
 *   MÁS DE UN REGISTRO    un solo campo tendría que elegir en silencio a cuál se le imputa. Es la
 *                         misma regla de `edicionDeGrillaHoras.ts` y no se contradice acá.
 *   AUSENCIA O LICENCIA   el número de esas celdas no son horas trabajadas: escribir encima diría
 *                         «en realidad vino» y «corregile las horas reconocidas» a la vez.
 *
 * LA QUE SÍ CAMBIÓ ES LA VACÍA. Antes `sin-cargar` tampoco se editaba «porque crear un registro
 * exige decir a qué obra se imputa»: ahora la obra la deduce `obraParaElDia` de la asignación o del
 * historial, y lo declara. Es el gesto central de la planilla y era el que faltaba.
 */
function celdaDelEspejo(
  fecha: string,
  registros: readonly (RegistroDeQuincena & { id?: string })[],
  presencia: PresenciaDeQuincena | undefined,
  cerrada: boolean,
): CeldaDelEspejo {
  const base = celdaDelDia(fecha, registros, presencia)
  const delDia = registros.filter((r) => r.fecha === fecha)
  const editable = !cerrada
    && delDia.length <= 1
    && base.marca !== 'ausencia'
    && base.marca !== 'licencia'
  return {
    ...base,
    registros: delDia.length,
    registroId: delDia.length === 1 ? (delDia[0].id ?? null) : null,
    // UN DÍA CON UN REGISTRO SIN `id` NO SE PUEDE CORREGIR y tampoco crear encima: sin el id la
    // escritura iría a ciegas. La lectura que lo alimenta pide `id`; si alguna vez deja de pedirlo,
    // la celda se apaga sola en vez de escribir sobre la fila equivocada.
    editable: editable && (delDia.length === 0 || delDia[0].id != null),
  }
}

export interface TotalesDelEspejo {
  personas: number
  /** Total por columna de día. `null` donde nadie cargó nada: no es lo mismo que 0. */
  porDia: (number | null)[]
  horas: number
  cobra: number
  adelanto: number
  yaTransferido: number
  porBanco: number
  enEfectivo: number
  total: number
  /** Cuántas filas no se pudieron liquidar. No suman, y el pie lo dice. */
  sinTarifa: number
  /** Cuántas filas difieren de la planilla, y por cuántas horas en total. */
  difieren: number
  horasDeDiferencia: number
  /** Cuántas filas no se pudieron cotejar. `sin-espejo` no es «coincide». */
  sinCotejar: number
}

/**
 * EL PIE. Suma lo que está arriba, y lo que no pudo sumar lo cuenta aparte.
 *
 * NULL NO SUMA COMO CERO. Una fila sin COBRA no se puede meter en el total como $ 0: el total
 * parecería completo y le faltaría gente. Se cuenta en `sinTarifa` para que el pie escriba «faltan 3».
 */
export function totalesDelEspejo(filas: readonly FilaDelEspejo[]): TotalesDelEspejo {
  const columnas = filas[0]?.celdas.length ?? 0
  const porDia = Array.from({ length: columnas }, (_, i) => {
    const conHoras = filas.filter((f) => f.celdas[i]?.horas != null)
    return conHoras.length === 0 ? null : r2(conHoras.reduce((s, f) => s + (f.celdas[i].horas ?? 0), 0))
  })
  const t: TotalesDelEspejo = {
    personas: filas.length, porDia, horas: 0, cobra: 0, adelanto: 0, yaTransferido: 0,
    porBanco: 0, enEfectivo: 0, total: 0, sinTarifa: 0, difieren: 0, horasDeDiferencia: 0,
    sinCotejar: 0,
  }
  for (const f of filas) {
    const l = f.linea
    if (f.cotejo.estado === 'difiere') { t.difieren++; t.horasDeDiferencia += Math.abs(f.cotejo.diferencia ?? 0) }
    if (f.cotejo.estado === 'sin-espejo') t.sinCotejar++
    if (l.sinTarifa || l.cobra == null) { t.sinTarifa++; continue }
    t.horas += Number(l.horas) || 0
    t.cobra += l.cobra
    t.adelanto += l.adelanto
    t.yaTransferido += l.yaTransferido
    t.porBanco += l.porBanco
    t.enEfectivo += Number(l.enEfectivo) || 0
    t.total += Number(l.total) || 0
  }
  for (const k of ['horas', 'cobra', 'adelanto', 'yaTransferido', 'porBanco', 'enEfectivo', 'total',
    'horasDeDiferencia'] as const) {
    t[k] = r2(t[k])
  }
  return t
}

/** Las celdas de plata que esta vista escribe, en el orden de R5. `horas` va por día, no acá. */
export const CAMPOS_DE_PAGO: readonly CampoEditable[] = [
  'adelanto', 'yaTransferido', 'porBanco',
]
