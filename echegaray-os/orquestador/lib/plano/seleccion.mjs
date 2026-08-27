// ELEGIR LA PARTIDA SIN QUE LA ELIJA UN MODELO. Puro, determinístico, reproducible.
//
// ═══ EL DEFECTO MEDIDO ═══
//
// Dos corridas del piloto sobre los MISMOS archivos, la MISMA Base Maestra y los MISMOS precios
// dieron partidas distintas para el mismo elemento: una eligió T1023 y la otra T1075. No cambió
// ningún dato: cambió lo que contestó el modelo, porque el modelo era el que decidía.
//
// Una cotización que no se puede repetir no se puede defender. Si el cliente pregunta por qué esta
// vez salió otro número, la respuesta «el modelo eligió distinto» no es una respuesta: es la
// confesión de que el precio no salió de la documentación.
//
// ═══ DÓNDE QUEDA CADA UNO ═══
//
//   EL MODELO INTERPRETA  → qué elemento hay, qué dice el plano, con qué texto literal.
//                            Eso se cachea por hash del archivo: misma lámina, misma lectura.
//   EL CÓDIGO DECIDE      → qué partida le corresponde. Filtros duros, puntaje reproducible,
//                            umbral, distancia mínima. Sin azar y sin red.
//
// El modelo puede seguir opinando (`veto`), pero su opinión SÓLO PUEDE RESTAR: puede bajar una
// partida decidida a AMBIGUO, nunca puede subir una que el código rechazó. Un veto no crea precio.
//
// ═══ POR QUÉ AMBIGUO ES UN ESTADO Y NO UN ERROR ═══
//
// «No sé cuál de estas dos es» es una respuesta técnica correcta y accionable: se muestran las dos
// y se pregunta. Lo que no es aceptable es que el empate lo desempate el orden en que llegaron los
// datos. Por eso el orden de los candidatos es TOTAL —puntaje, después código— y no depende de en
// qué orden vino el catálogo.

import { unidadCompatible, puntaje, palabras } from './partidas.mjs'
import { atributosDe, comparar, raiz } from './atributos.mjs'
import { FUENTE } from './fuente.mjs'

/** El resultado de intentar asignarle una partida a un elemento. */
export const ESTADO = Object.freeze({
  MAPEADA: 'MAPEADA',                     // hay una y se puede defender
  AMBIGUO: 'AMBIGUO',                     // hay dos o más y ninguna gana: la decide una persona
  PARTIDA_CANDIDATA: 'PARTIDA_CANDIDATA', // no hay ninguna suficiente, o falta un dato para elegir
})

/** Cuánto suma cada atributo que coincide. Un atributo técnico que coincide vale más que una
 *  palabra que coincide: «viga» lo dicen veinte partidas, «H21 + 30x50» lo dice una. */
const PESO_ATRIBUTO = 0.8

/** El puntaje mínimo para confirmar, y la ventaja mínima sobre el segundo. Si el segundo está más
 *  cerca que `DISTANCIA`, no hay ganador: hay dos opciones y una pregunta. */
export const UMBRAL = 0.9
export const DISTANCIA = 0.25

/** Los textos de un cómputo que describen técnicamente al elemento. PURA. */
const textoDelElemento = (c) => [c?.nombre, c?.material, c?.especificacion, c?.evidencia?.textoLiteral].filter(Boolean)

/**
 * LOS CANDIDATOS DE UN ELEMENTO, ordenados de forma TOTAL. PURA.
 *
 * Dos filtros duros y ninguno negociable: la unidad —multiplicar m³ por un precio por m² da un
 * número sin significado— y el conflicto de atributos —una partida de hormigón no puede cotizar
 * una correa metálica por más vocabulario que compartan—.
 */
export function candidatosDe(computo, tareaTipos = []) {
  const attrE = atributosDe(...textoDelElemento(computo))
  const vocabularioElemento = new Set(textoDelElemento(computo).flatMap((t) => palabras(t)).map(raiz))
  const evaluados = []
  const descartadosPorVocabulario = []
  for (const t of tareaTipos) {
    if (!unidadCompatible(computo?.unidad, t.unidad)) continue
    const attrP = atributosDe(t.nombre)
    const cmp = comparar(attrE, attrP)
    if (cmp.conflictos.length) continue
    const base = puntaje(computo, t)
    // ═══ EL BONO DE SISTEMA NO PUEDE CONFIRMAR SOLO ═══
    // Medido: «MATAFUEGO» y «LUZ DE EMERGENCIA» llegaban a 1,0 contra «INSTALACIÓN ELÉCTRICA» sin
    // compartir UNA sola palabra — el puntaje venía entero de que las dos son del sistema
    // «instalación». Compartir familia no es ser lo mismo, y sin una palabra en común no hay nada
    // que defender delante de un cliente.
    //
    // Y no bloquea: DESCARTA. Una partida sin una palabra en común no es un candidato peor, no es
    // un candidato — dejarla en la lista la ponía primera por el bono y tapaba a la que sí servía.
    // Medido: «Columna de hormigón C1» quedaba sin partida porque el primer lugar se lo llevaba una
    // que no dice «columna» en ninguna parte.
    const comunes = palabras(t.nombre).map(raiz).filter((w) => vocabularioElemento.has(w)).length
    if (!comunes) { descartadosPorVocabulario.push(t.codigo); continue }
    const score = Math.round((base + cmp.coincidencias.length * PESO_ATRIBUTO) * 1000) / 1000
    evaluados.push({
      id: t.id, codigo: t.codigo, nombre: t.nombre, unidad: t.unidad,
      puntaje: score, puntajeVocabulario: base, palabrasEnComun: comunes,
      coincidencias: cmp.coincidencias, sinRespaldo: cmp.sinRespaldo,
    })
  }
  // EL DESEMPATE POR CÓDIGO ES LO QUE HACE ESTO REPRODUCIBLE. Sin él, dos partidas con el mismo
  // puntaje quedan en el orden en que las devolvió la consulta, y ese orden no es una decisión.
  evaluados.sort((a, b) => b.puntaje - a.puntaje || String(a.codigo).localeCompare(String(b.codigo)))
  return { atributos: attrE, candidatos: evaluados, descartadosPorVocabulario }
}

/** Por qué no se pudo confirmar, dicho como se le dice a una persona. PURA. */
function porQueNo(motivo, top, segundo, computo) {
  if (motivo === 'sin_candidatos') return `no hay ninguna tarea de la Base Maestra en ${computo?.unidad ?? 'esa unidad'} compatible con «${computo?.nombre}» sin contradecir sus atributos técnicos`
  if (motivo === 'sin_respaldo') {
    const f = top.sinRespaldo.map((s) => `${s.atributo} (${top.codigo} exige «${s.literal}»)`).join(', ')
    return `«${top.codigo}» exige un atributo que el plano no demuestra: ${f}. La respuesta correcta acá es la pregunta, no un precio que lo supone`
  }
  if (motivo === 'bajo') return `el mejor candidato (${top.codigo}) apenas se parece — ${top.puntaje} sobre ${UMBRAL} exigido`
  return `«${top.codigo}» y «${segundo.codigo}» quedan a ${Math.round((top.puntaje - segundo.puntaje) * 1000) / 1000} de distancia (mínimo ${DISTANCIA}): son dos opciones, no una`
}

/**
 * LA PARTIDA DE UN CÓMPUTO. PURA — misma entrada, misma salida, siempre.
 *
 * `veto` es un conjunto de códigos que alguien (el criterio técnico del modelo, o una corrección
 * humana ya registrada) descartó para ESTE elemento. Se aplica ANTES de decidir y sólo puede sacar
 * candidatos: no existe forma de que un veto promueva a nadie.
 */
export function seleccionar(computo, tareaTipos = [], { veto = [] } = {}) {
  const { atributos, candidatos: todos } = candidatosDe(computo, tareaTipos)
  const vetados = new Set(veto.map(String))
  const candidatos = todos.filter((c) => !vetados.has(String(c.codigo)))
  const top = candidatos[0]
  const segundo = candidatos[1]

  const base = {
    elemento: computo?.id ?? null,
    atributos,
    candidatos: candidatos.slice(0, 6),
    vetados: todos.filter((c) => vetados.has(String(c.codigo))).map((c) => c.codigo),
  }
  if (!top) return { ...base, estado: ESTADO.PARTIDA_CANDIDATA, tarea: null, fuente: FUENTE.FALTA_DATO, porQue: porQueNo('sin_candidatos', null, null, computo) }
  if (top.sinRespaldo.length) return { ...base, estado: ESTADO.PARTIDA_CANDIDATA, tarea: null, fuente: FUENTE.FALTA_DATO, faltan: top.sinRespaldo, porQue: porQueNo('sin_respaldo', top, segundo, computo) }
  if (top.puntaje < UMBRAL) return { ...base, estado: ESTADO.PARTIDA_CANDIDATA, tarea: null, fuente: FUENTE.FALTA_DATO, porQue: porQueNo('bajo', top, segundo, computo) }
  if (segundo && top.puntaje - segundo.puntaje < DISTANCIA) return { ...base, estado: ESTADO.AMBIGUO, tarea: null, fuente: FUENTE.FALTA_DATO, porQue: porQueNo('empate', top, segundo, computo) }

  return {
    ...base,
    estado: ESTADO.MAPEADA,
    tarea: { id: top.id, codigo: top.codigo, nombre: top.nombre, unidad: top.unidad },
    fuente: FUENTE.BASE_MAESTRA,
    porQue: `unidad, vocabulario y ${top.coincidencias.length} atributo(s) técnico(s) coinciden — ${top.puntaje}${segundo ? `, el siguiente queda en ${segundo.puntaje}` : ', sin competencia'}`,
  }
}

/** La selección de todos los cómputos, con el recuento por estado. PURA. */
export function seleccionarTodas(computos = [], tareaTipos = [], { vetos = {} } = {}) {
  const mapeos = computos
    .filter((c) => c.cantidad !== null)
    .map((c) => ({ computo: c, ...seleccionar(c, tareaTipos, { veto: vetos[c?.id] ?? [] }) }))
  return {
    mapeos,
    mapeadas: mapeos.filter((m) => m.estado === ESTADO.MAPEADA).length,
    ambiguas: mapeos.filter((m) => m.estado === ESTADO.AMBIGUO).length,
    candidatas: mapeos.filter((m) => m.estado === ESTADO.PARTIDA_CANDIDATA).length,
  }
}

/**
 * LA HUELLA DE UNA SELECCIÓN — lo que se compara entre dos corridas para decir si dieron lo mismo.
 *
 * Es a propósito lo mínimo que importa: elemento, estado, código y cantidad. Si dos corridas tienen
 * la misma huella, produjeron la misma cotización aunque hayan tardado distinto o costado distinto.
 * PURA.
 */
export function huella(resultado) {
  return (resultado?.mapeos ?? [])
    .map((m) => `${m.elemento}|${m.estado}|${m.tarea?.codigo ?? '-'}|${m.computo?.cantidad?.valor ?? '-'}`)
    .sort()
    .join('\n')
}
