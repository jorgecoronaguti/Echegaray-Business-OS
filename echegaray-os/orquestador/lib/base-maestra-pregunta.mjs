// EL HUECO CONVERTIDO EN UNA PREGUNTA QUE SE PUEDE CONTESTAR. Puro, determinístico, sin modelo.
//
// ═══ EL DEFECTO MEDIDO ═══
//
// Sobre el dictado sin planos —el caso más común del mundo real, el dueño diciendo «520 m² de
// mampostería» por teléfono— el motor mapeaba **0 de 2**:
//
//   MAMPOSTERÍA LADRILLON CERÁMICO   → «T1018 exige espesor_m (e = 0,20 m) que el plano no demuestra»
//   PISO DE HORMIGON ALISADO MECÁNICO → «T1107.1 y T1107.2 quedan a 0,096: son dos opciones, no una»
//
// **Los dos rechazos son correctos y no se tocan.** Preferir la pregunta antes que suponer un
// espesor es exactamente la regla que evitó los $ 29,6 M de la platea de 50 cm, y bajar el umbral
// para que el caso «mapee» es falsear certeza: el número saldría igual de inventado, sólo que sin
// el cartel.
//
// Lo que faltaba no es tolerancia: **es el camino de vuelta.** El motor declaraba el hueco y ahí
// terminaba. Una cotización no se cierra porque el sistema tenga razón sobre lo que no sabe; se
// cierra porque alguien contesta. Este módulo convierte el hueco en una pregunta CERRADA —con las
// opciones que la Base Maestra realmente tiene y lo que cuesta cada una— y convierte la respuesta
// de vuelta en un mapeo, sin que en el medio nadie invente nada.
//
// ═══ LAS TRES REGLAS DE UNA PREGUNTA BIEN HECHA ═══
//
// 1. **Las opciones salen del catálogo, no de la imaginación.** Si la base sólo tiene mampostería
//    de ladrillón a 0,20 m, la pregunta no es «¿0,15 o 0,20?» —esa pregunta ofrece un 0,15 que no
//    existe y que nadie va a poder cotizar—. Es «la única que tenemos está analizada a 0,20: ¿el
//    muro es de 0,20?», y el «no» tiene su propia salida honesta: NO_HAY_ANALISIS.
// 2. **Cada opción viene con su plata.** Preguntar «¿cuál de estas dos?» sin decir que una sale
//    $ 17.550/m² y la otra $ 28.939/m² traslada la decisión sin trasladar la información.
// 3. **La respuesta cierra el mapeo por código, no por texto.** `responder()` no vuelve a puntuar
//    nada: toma el código elegido y lo confirma. Si la respuesta no es una de las opciones ofrecidas,
//    NO se interpreta — se rechaza. Un «creo que era el de 20» no es una respuesta.

import { ESTADO } from './plano/seleccion.mjs'
import { atributosDe } from './plano/atributos.mjs'
import { FUENTE } from './plano/fuente.mjs'
import { complementosDe } from './base-maestra-completitud.mjs'

/** Qué clase de pregunta hay que hacer. Son tres y no se mezclan: cada una se contesta distinto. */
export const TIPO_PREGUNTA = Object.freeze({
  ATRIBUTO: 'ATRIBUTO',           // falta un dato técnico que la partida exige
  CUAL_DE_ESTAS: 'CUAL_DE_ESTAS', // hay dos partidas y ninguna gana
  VAN_JUNTAS: 'VAN_JUNTAS',       // las dos candidatas son dos mitades de la misma tarea
})

/** Cómo se lee un atributo cuando se le habla a una persona. Sin esto la pregunta dice
 *  «espesor_m», que es un nombre de columna y no una pregunta.
 *
 *  Van las DOS formas —el sujeto («el espesor») y la pregunta entera («¿Qué pieza es?»)— porque no
 *  todos los atributos entran en la misma plantilla: «¿Cuál es qué pieza es?» es lo que salía con
 *  una sola, y una pregunta mal escrita se contesta mal. */
const COMO_SE_DICE = Object.freeze({
  espesor_m: { sujeto: 'el espesor', pregunta: '¿Cuál es el espesor?' },
  seccion: { sujeto: 'la sección', pregunta: '¿Cuál es la sección?' },
  metodo: { sujeto: 'el método de ejecución', pregunta: '¿Se ejecuta a mano o con máquina?' },
  terminacion: { sujeto: 'la terminación', pregunta: '¿Cuál es la terminación?' },
  ubicacion: { sujeto: 'la ubicación', pregunta: '¿Va en interior o en exterior?' },
  pieza: { sujeto: 'la pieza', pregunta: '¿Sobre qué elemento va?' },
  resistencia: { sujeto: 'la resistencia del hormigón', pregunta: '¿Qué resistencia de hormigón?' },
  material: { sujeto: 'el material', pregunta: '¿De qué material es?' },
  armadura: { sujeto: 'la armadura', pregunta: '¿Lleva armadura?' },
})

const comoSeDice = (a) => COMO_SE_DICE[a] ?? { sujeto: a, pregunta: `¿Cuál es ${a}?` }

const plata = (n) => (n === null || n === undefined ? 'sin precio' : `$ ${Math.round(Number(n)).toLocaleString('es-AR')}`)

/**
 * LAS OPCIONES REALES para un atributo que falta: las partidas del catálogo que ya pasaron todos
 * los filtros duros, con el valor que cada una exige de ese atributo. PURA.
 *
 * Se ordenan por código y no por precio: ofrecer primero la más barata es una recomendación
 * disfrazada de orden de lista.
 */
export function opcionesPorAtributo(atributo, candidatos = [], costos = {}) {
  const vistas = new Map()
  for (const c of candidatos) {
    const exige = atributosDe(c.nombre)?.[atributo]
    if (!exige) continue
    const clave = String(exige.valor)
    if (vistas.has(clave)) continue
    vistas.set(clave, Object.freeze({
      valor: exige.valor,
      literal: exige.literal,
      codigo: c.codigo,
      nombre: c.nombre,
      unidad: c.unidad,
      costoUnitario: costos[c.codigo] ?? null,
    }))
  }
  return Object.freeze([...vistas.values()].sort((a, b) => String(a.codigo).localeCompare(String(b.codigo))))
}

/**
 * LA PREGUNTA QUE CIERRA UN MAPEO QUE NO SE PUDO CERRAR. PURA.
 *
 * `mapeo` es lo que devolvió `seleccionar()`. Cuando el mapeo YA está resuelto devuelve `null`: no
 * se le pregunta a nadie algo que el código pudo decidir solo.
 *
 * `costos` es `{ codigo: costoUnitario }` y `paresComplementarios` la lista que produjo
 * `base-maestra-completitud`. Los dos entran por parámetro porque esta función es pura y no
 * consulta la base: eso lo hace su borde.
 */
export function preguntaParaCerrar(mapeo, { costos = {}, paresComplementarios = [] } = {}) {
  if (!mapeo || mapeo.estado === ESTADO.MAPEADA) return null
  const candidatos = mapeo.candidatos ?? []

  // ═══ CASO 1 · LAS DOS CANDIDATAS SON DOS MITADES ═══
  // Se pregunta ANTES que la ambigüedad porque no es una ambigüedad: es una suma. Contestar «cuál
  // de las dos» acá es contestar mal la pregunta correcta.
  const top = candidatos[0]
  if (top) {
    const complementos = complementosDe(top.codigo, paresComplementarios)
    const presentes = complementos.filter((c) => candidatos.some((k) => String(k.codigo) === String(c.codigo)))
    if (presentes.length) {
      const juntas = [top, ...presentes]
      const suma = juntas.every((j) => costos[j.codigo] !== null && costos[j.codigo] !== undefined)
        ? juntas.reduce((a, j) => a + Number(costos[j.codigo]), 0)
        : null
      return Object.freeze({
        tipo: TIPO_PREGUNTA.VAN_JUNTAS,
        elemento: mapeo.elemento ?? null,
        pregunta: `«${top.nombre.split(/\s-\s/)[0]}» está cargada en la Base Maestra partida en ${juntas.length} partidas complementarias. ¿Se cotizan las ${juntas.length} juntas?`,
        opciones: Object.freeze([
          Object.freeze({
            respuesta: 'JUNTAS', codigos: Object.freeze(juntas.map((j) => j.codigo)),
            que: `${juntas.map((j) => `${j.codigo} (${plata(costos[j.codigo])})`).join(' + ')} = ${plata(suma)} por ${top.unidad}`,
          }),
          ...juntas.map((j) => Object.freeze({
            respuesta: j.codigo, codigos: Object.freeze([j.codigo]),
            que: `sólo ${j.codigo} «${j.nombre}» — ${plata(costos[j.codigo])} por ${j.unidad}`,
          })),
        ]),
        // El costo de equivocarse, dicho en plata. Es la única forma de que quien contesta sepa
        // que ésta no es una pregunta administrativa.
        porQue: `elegir una sola cotiza una parte de la tarea: ${juntas.map((j) => `${j.codigo} sale ${plata(costos[j.codigo])}`).join(' y ')}, y juntas ${plata(suma)}`,
        recomendada: 'JUNTAS',
      })
    }
  }

  // ═══ CASO 2 · FALTA UN ATRIBUTO QUE LA PARTIDA EXIGE ═══
  const falta = (mapeo.faltan ?? [])[0]
  if (falta) {
    const opciones = opcionesPorAtributo(falta.atributo, candidatos, costos)
    return Object.freeze({
      tipo: TIPO_PREGUNTA.ATRIBUTO,
      elemento: mapeo.elemento ?? null,
      atributo: falta.atributo,
      pregunta: opciones.length === 1
        // ═══ LA PREGUNTA HONESTA CUANDO HAY UNA SOLA OPCIÓN ═══
        // Ofrecer alternativas que el catálogo no tiene es peor que no preguntar: manda a alguien a
        // elegir un espesor para el que después no va a haber análisis de precio.
        ? `${comoSeDice(falta.atributo).sujeto}: lo único analizado en la Base Maestra es «${opciones[0].literal}» (${opciones[0].codigo}, ${plata(opciones[0].costoUnitario)} por ${opciones[0].unidad}). ¿Es ése?`
        : comoSeDice(falta.atributo).pregunta,
      opciones: Object.freeze([
        ...opciones.map((o) => Object.freeze({
          respuesta: o.codigo, codigos: Object.freeze([o.codigo]), valor: o.valor,
          que: `${o.literal} → ${o.codigo} «${o.nombre}», ${plata(o.costoUnitario)} por ${o.unidad}`,
        })),
        // La salida honesta. Sin ella, la única forma de avanzar es mentir que sí.
        Object.freeze({
          respuesta: 'NO_HAY_ANALISIS', codigos: Object.freeze([]),
          que: `ninguno de ésos — entonces esta tarea no tiene análisis en la Base Maestra y hay que crearlo (queda CANDIDATO, no cotiza)`,
        }),
      ]),
      porQue: falta.literal
        ? `la partida afirma «${falta.literal}» sobre la obra y el proyecto no lo dice en ninguna parte`
        : `la partida exige ${falta.atributo} y el proyecto no lo declara`,
      recomendada: null,
    })
  }

  // ═══ CASO 3 · DOS PARTIDAS Y NINGUNA GANA ═══
  if (mapeo.estado === ESTADO.AMBIGUO && candidatos.length >= 2) {
    const [a, b] = candidatos
    return Object.freeze({
      tipo: TIPO_PREGUNTA.CUAL_DE_ESTAS,
      elemento: mapeo.elemento ?? null,
      pregunta: `Hay dos partidas igual de parecidas y no son lo mismo. ¿Cuál corresponde?`,
      opciones: Object.freeze([a, b].map((c) => Object.freeze({
        respuesta: c.codigo, codigos: Object.freeze([c.codigo]),
        que: `${c.codigo} «${c.nombre}» — ${plata(costos[c.codigo])} por ${c.unidad}`,
      }))),
      porQue: `${a.codigo} sale ${plata(costos[a.codigo])} y ${b.codigo} sale ${plata(costos[b.codigo])} por ${a.unidad}: la diferencia la decide quién sabe qué se va a construir`,
      recomendada: null,
    })
  }

  // Sin candidatos no hay pregunta cerrada posible: la respuesta es cargar una partida nueva, y eso
  // no se contesta eligiendo de una lista.
  return Object.freeze({
    tipo: TIPO_PREGUNTA.ATRIBUTO,
    elemento: mapeo.elemento ?? null,
    pregunta: 'No hay ninguna partida de la Base Maestra compatible con este elemento. ¿Se crea el análisis?',
    opciones: Object.freeze([Object.freeze({ respuesta: 'NO_HAY_ANALISIS', codigos: Object.freeze([]), que: 'crear el análisis nuevo — queda CANDIDATO y no cotiza hasta que alguien lo apruebe' })]),
    porQue: mapeo.porQue ?? 'sin candidatos compatibles',
    recomendada: null,
  })
}

/**
 * LA RESPUESTA CONVERTIDA EN MAPEO. PURA.
 *
 * No vuelve a puntuar, no reinterpreta y no acepta texto libre: busca la respuesta entre las
 * opciones que ELLA MISMA ofreció y confirma esos códigos. Una respuesta que no está en la lista se
 * rechaza con el motivo — porque «creo que era el de 20» no es una decisión que se pueda defender
 * seis meses después delante de un cliente.
 *
 * `NO_HAY_ANALISIS` NO es un fracaso: es la respuesta correcta cuando la base no tiene la tarea, y
 * deja el elemento como PARTIDA_CANDIDATA con el motivo escrito. Un candidato NO cotiza.
 */
export function responder(pregunta, respuesta, { quien = null, cuando = null } = {}) {
  if (!pregunta) return { ok: false, porQue: 'no hay pregunta que contestar' }
  const elegida = (pregunta.opciones ?? []).find((o) => String(o.respuesta) === String(respuesta))
  if (!elegida) {
    return {
      ok: false,
      porQue: `«${respuesta}» no es una de las opciones ofrecidas (${pregunta.opciones.map((o) => o.respuesta).join(', ')}): una respuesta que hay que interpretar no cierra un mapeo`,
    }
  }
  if (elegida.respuesta === 'NO_HAY_ANALISIS') {
    return Object.freeze({
      ok: true,
      estado: ESTADO.PARTIDA_CANDIDATA,
      codigos: Object.freeze([]),
      fuente: FUENTE.FALTA_DATO,
      // El registro es la mitad del valor: sin esto, la próxima corrida vuelve a preguntar lo mismo
      // y la respuesta de una persona se pierde.
      decision: Object.freeze({ pregunta: pregunta.pregunta, respuesta: elegida.respuesta, quien, cuando }),
      porQue: 'contestado: la Base Maestra no tiene análisis para esta tarea. Queda CANDIDATO — se muestra, no cotiza',
    })
  }
  return Object.freeze({
    ok: true,
    estado: ESTADO.MAPEADA,
    codigos: elegida.codigos,
    // Es EXPERIENCIA_ECSAS y no BASE_MAESTRA a propósito: el código lo eligió una persona de la
    // empresa, no el puntaje. Verificarlo es preguntarle a esa persona, no releer el catálogo.
    fuente: FUENTE.EXPERIENCIA_ECSAS,
    decision: Object.freeze({ pregunta: pregunta.pregunta, respuesta: elegida.respuesta, quien, cuando }),
    porQue: `contestado: ${elegida.que}`,
  })
}
