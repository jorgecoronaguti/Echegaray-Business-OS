// CUANDO XSAS ENCUENTRA UN HUECO, LO INVESTIGA SOLO (§12).
//
// ═══ QUÉ AGREGA ESTE MÓDULO Y QUÉ NO REIMPLEMENTA ═══
//
// La cascada técnica y la autoridad de las fuentes ya existen en `plano/investigacion.mjs`, y el
// sello del contenido externo en `web/contenido-externo.mjs`. Acá NO se duplica ninguna de las dos:
// se cablean. Lo que faltaba para el cotizador son tres cosas, y son las tres que este archivo
// aporta:
//
//   1. LOS DOS PASOS QUE LA CASCADA TÉCNICA NO TIENE: el MODELO y el HUMANO. El modelo entra sólo
//      si hay algo que INTERPRETAR —nunca como calculadora— y el humano es el último recurso, con
//      los siete pasos anteriores probados y anotados antes de molestarlo.
//   2. LA PUERTA QUE LA WEB NO PUEDE CRUZAR. Nada de internet asciende a EXPERIENCIA_ECSAS. No
//      alcanza con no hacerlo: si el resolvedor DECLARA que su dato es experiencia de ECSAS, el
//      motor lo baja a WEB igual. Una defensa que depende de que el que la cruza sea honesto no es
//      una defensa.
//   3. LA PÁGINA QUE TRAE ÓRDENES ADENTRO ES INFORMACIÓN SOBRE LA PÁGINA. Las instrucciones que
//      venían en el texto viajan en `sobreLaPagina.instruccionesDetectadas` —un campo de reporte—
//      y NO en el resultado. Lo que la página pidió es un dato sobre la página, no un pedido.
//
// ═══ POR QUÉ EL ORDEN ESTÁ ESCRITO Y PROBADO, NO DOCUMENTADO ═══
//
// Un orden que sólo vive en un comentario dura hasta el primer apuro. `CASCADA` es la única
// definición y `research.test.mjs` verifica que se recorre en ese orden y que se DETIENE en el
// primero que resuelve — con espías que cuentan cuántas veces se llamó a cada paso.

import { FUENTE, dato, faltaDato } from '../plano/fuente.mjs'
import { investigar, PASOS, NOMBRE_AUTORIDAD, autoridadDe, datoDeWeb, resolvedorWeb, ordenarPorAutoridad } from '../plano/investigacion.mjs'
import { atributosDe } from '../plano/atributos.mjs'

// Se re-exportan para que quien use el research no tenga que importar de dos lugares y termine
// escribiéndose su propia versión de la autoridad.
export { NOMBRE_AUTORIDAD, autoridadDe, datoDeWeb, resolvedorWeb, ordenarPorAutoridad }

/** Los pasos, por su nombre. Se usan como llaves de `resolvedores` y como valor de `resueltoEn`. */
export const PASO = Object.freeze({
  DATOS_PROYECTO: 'DATOS_PROYECTO',
  BASE_MAESTRA: 'BASE_MAESTRA',
  EXPERIENCIA_ECSAS: 'EXPERIENCIA_ECSAS',
  BIBLIOTECA_TECNICA: 'BIBLIOTECA_TECNICA',
  FUENTES_PERMANENTES: 'FUENTES_PERMANENTES',
  WEB: 'WEB',
  MODELO: 'MODELO',
  HUMANO: 'HUMANO',
})

/**
 * LA JERARQUÍA DEL §12, EN ESTE ORDEN Y NO EN OTRO.
 *
 * Cambiar este array cambia qué respaldo tiene cada número del presupuesto. Está acá, una sola vez,
 * y `ordenDeLaCascada()` lo publica para que un test pueda afirmarlo entero en una línea.
 *
 * `fuente` es la clasificación con la que sale el dato si ese paso lo resuelve. Fijate que WEB sale
 * `FUENTE.WEB` y MODELO sale `FUENTE.INFERIDO`: ninguno de los dos puede salir como EXPERIENCIA.
 */
export const CASCADA = Object.freeze([
  { id: PASO.DATOS_PROYECTO, que: 'los datos del propio proyecto (plano, CAD, pliego, memoria, planilla del cliente)', fuente: FUENTE.DOCUMENTO_TECNICO },
  { id: PASO.BASE_MAESTRA, que: 'la Base Maestra de ECSAS (partidas, composiciones, precios vigentes)', fuente: FUENTE.BASE_MAESTRA },
  { id: PASO.EXPERIENCIA_ECSAS, que: 'lo MEDIDO en obras de ECSAS', fuente: FUENTE.EXPERIENCIA_ECSAS },
  { id: PASO.BIBLIOTECA_TECNICA, que: 'la biblioteca técnica incorporada (CIRCOT, papers de cuadrillas, manuales)', fuente: FUENTE.DOCUMENTO_TECNICO },
  { id: PASO.FUENTES_PERMANENTES, que: 'las fuentes permanentes suscritas (CIRSOC, IRAM, INTI, convenio UOCRA, índices INDEC)', fuente: FUENTE.NORMA },
  { id: PASO.WEB, que: 'internet, con su URL, su fecha y su autoridad', fuente: FUENTE.WEB },
  { id: PASO.MODELO, que: 'un modelo de lenguaje, SÓLO para interpretar algo ambiguo', fuente: FUENTE.INFERIDO },
  { id: PASO.HUMANO, que: 'una persona — el ÚLTIMO recurso', fuente: FUENTE.FALTA_DATO },
])

/** El orden de la cascada como lista de ids. PURA. Existe para que el test pueda afirmar la
 *  jerarquía entera contra una constante literal, en vez de recorrerla y creerle al recorrido. */
export const ordenDeLaCascada = () => CASCADA.map((p) => p.id)

/** Los pasos que se recorren ANTES de molestar a una persona. PURA. */
export const PASOS_ANTES_DEL_HUMANO = Object.freeze(CASCADA.filter((p) => p.id !== PASO.HUMANO))

/** Qué se puede investigar (§12). El tipo no cambia el ORDEN de la cascada —eso sería tener ocho
 *  jerarquías—: cambia qué resolvedores tienen sentido y si hace falta interpretar. */
export const TIPO = Object.freeze({
  NORMATIVA: 'NORMATIVA',
  FABRICANTE: 'FABRICANTE',
  PRECIO: 'PRECIO',
  PROCESO: 'PROCESO',
  RENDIMIENTO: 'RENDIMIENTO',
  TECNICA: 'TECNICA',
})

/** Las fuentes que NINGÚN paso posterior a EXPERIENCIA_ECSAS puede declarar. Es la lista que
 *  `bajarFuenteSiCorresponde` hace cumplir. */
const FUENTES_INTERNAS = Object.freeze([FUENTE.BASE_MAESTRA, FUENTE.EXPERIENCIA_ECSAS, FUENTE.EXTRAIDO_PLANO, FUENTE.CALCULADO])

/**
 * LA FUENTE QUE EL PASO PUEDE DECLARAR, no la que dice que tiene. PURA.
 *
 * Un resolvedor de WEB o de MODELO que devuelva `fuente: EXPERIENCIA_ECSAS` está mintiendo —por
 * error o porque una página se lo pidió— y acá se lo corrige sin preguntar. La corrección queda
 * anotada: el intento es información, no ruido a tapar.
 */
export function fuenteDelPaso(paso, fuenteDeclarada) {
  const delPaso = CASCADA.find((p) => p.id === paso)?.fuente ?? FUENTE.INFERIDO
  const externo = paso === PASO.WEB || paso === PASO.MODELO
  if (externo && fuenteDeclarada && FUENTES_INTERNAS.includes(fuenteDeclarada)) {
    return { fuente: delPaso, corregida: true, porQue: `el paso ${paso} declaró «${fuenteDeclarada}» y no puede: nada de afuera asciende a conocimiento propio de ECSAS` }
  }
  return { fuente: fuenteDeclarada ?? delPaso, corregida: false, porQue: null }
}

/**
 * ¿ESTE DATO PUEDE VOLVERSE EXPERIENCIA DE ECSAS? PURA.
 *
 * La respuesta es NO para todo lo que no salga de una obra medida. Un dato de la web puede ser
 * excelente, actual y de una fuente oficial: sigue sin ser experiencia de ECSAS, porque la
 * experiencia es lo que le pasó a esta empresa haciendo esto. Convertir una en otra es cómo un
 * rendimiento de catálogo termina cotizando una obra real.
 *
 * El ascenso a experiencia sólo lo puede hacer una obra cerrada con su medición, y eso no ocurre
 * acá: ocurre en el cierre de obra, con firma.
 */
export function puedeAscenderAExperiencia(resultado) {
  const fuente = resultado?.dato?.fuente ?? resultado?.fuente ?? null
  if (fuente === FUENTE.EXPERIENCIA_ECSAS && resultado?.resueltoEn === PASO.EXPERIENCIA_ECSAS) {
    return { permitido: true, porQue: 'ya ES experiencia de ECSAS: salió del paso que la lee' }
  }
  return {
    permitido: false,
    porQue: `un dato con fuente «${fuente ?? 'sin fuente'}» resuelto en «${resultado?.resueltoEn ?? 'ningún paso'}» NO asciende a EXPERIENCIA_ECSAS: la experiencia se gana midiendo una obra de ECSAS, no leyendo`,
    comoSeGana: 'cerrando una obra con su medición cargada y firmada',
  }
}

/**
 * ¿HACE FALTA UN MODELO PARA ESTO? PURA.
 *
 * El modelo NO es una calculadora ni un buscador: entra cuando hay que INTERPRETAR —una frase
 * ambigua de un pliego, dos partidas candidatas a la misma distancia, una descripción que puede
 * significar dos cosas—. Una cuenta, una conversión de unidades o un precio de lista no lo
 * necesitan, y pedírselo es pagar tokens por aritmética que además puede salir mal.
 */
export function necesitaInterpretacion({ tipo = null, ambiguo = false, candidatas = [], textoLibre = false } = {}) {
  if (ambiguo) return { si: true, porQue: 'la pregunta está declarada AMBIGUA: hay más de una lectura posible' }
  if (candidatas.length > 1) return { si: true, porQue: `hay ${candidatas.length} candidatas y ninguna gana sola` }
  if (textoLibre) return { si: true, porQue: 'la respuesta está en texto libre y hay que leerlo, no calcularlo' }
  if (tipo === TIPO.PRECIO || tipo === TIPO.RENDIMIENTO) {
    return { si: false, porQue: `un ${tipo.toLowerCase()} es un número con fuente: usar un modelo para eso es usarlo de calculadora` }
  }
  return { si: false, porQue: 'no hay nada ambiguo que interpretar: se resuelve con datos' }
}

/** Envuelve el resolvedor del MODELO con las DOS condiciones que lo habilitan. Es una función y no
 *  un `if` suelto para que se pueda probar sin correr la cascada entera. PURA (devuelve función). */
export function compuertaDelModelo({ resolver, permitirModelo = false, interpretacion } = {}) {
  return async (ctx) => {
    if (typeof resolver !== 'function') return { resuelto: false, porQue: 'no hay resolvedor de modelo cableado' }
    if (!permitirModelo) return { resuelto: false, porQue: 'los modelos están DESACTIVADOS para esta corrida: el camino determinístico sigue igual' }
    if (!interpretacion?.si) return { resuelto: false, porQue: `el modelo no se usa acá: ${interpretacion?.porQue ?? 'no hay nada que interpretar'}` }
    return resolver(ctx)
  }
}

/**
 * INVESTIGAR UN HUECO. Recorre la cascada del §12 completa y se detiene en el PRIMERO que resuelve.
 *
 * `resolvedores` es `{ [PASO]: async ({pregunta}) => ({ resuelto, valor, unidad, fuente, evidencia,
 * extra, porQue }) }`. Los que falten se saltan ANOTADOS —«no había con qué probar este paso»— que
 * no es lo mismo que «se probó y no estaba».
 *
 * El HUMANO no es un resolvedor más: se llega a él sólo después de que los otros siete fallaron, y
 * lo que produce NO es un dato sino una PREGUNTA DIRIGIDA con todo lo ya intentado adjunto, para
 * que la persona no repita el trabajo del motor.
 *
 * Si hay `cache`, la consulta se busca primero y el resultado se guarda: la clave incluye la
 * pregunta, las entradas y la versión, así que un cambio en cualquiera de las tres no lo encuentra.
 */
export async function investigarHueco({
  pregunta, tipo = null, entradas = {}, resolvedores = {}, permitirModelo = false,
  ambiguo = false, candidatas = [], textoLibre = false, cache = null, quienLoTiene = 'proyecto / dirección técnica',
} = {}) {
  const interpretacion = necesitaInterpretacion({ tipo, ambiguo, candidatas, textoLibre })

  if (cache) {
    const enCache = cache.leer({ pregunta, entradas, productor: 'research' })
    if (enCache.hit) return Object.freeze({ ...enCache.valor, deCache: true, sha256: enCache.sha256 })
  }

  const conCompuerta = {
    ...resolvedores,
    [PASO.MODELO]: compuertaDelModelo({ resolver: resolvedores[PASO.MODELO], permitirModelo, interpretacion }),
  }
  const crudo = await investigar({ pregunta, resolvedores: conCompuerta, pasos: PASOS_ANTES_DEL_HUMANO })

  const salida = crudo.resueltoEn
    ? conGuardas({ crudo, pregunta, tipo, interpretacion })
    : escalarAlHumano({ crudo, pregunta, tipo, interpretacion, quienLoTiene })

  if (cache) cache.escribir({ pregunta, entradas, productor: 'research' }, salida)
  return salida
}

/**
 * LAS GUARDAS SOBRE UN RESULTADO RESUELTO. PURA.
 *
 * Hace tres cosas, y las tres son «bajar», nunca «subir»: corrige la fuente si el paso no podía
 * declararla, marca que no asciende a experiencia, y separa lo que la página INTENTÓ ORDENAR del
 * dato que trajo.
 */
function conGuardas({ crudo, pregunta, tipo, interpretacion }) {
  const paso = crudo.resueltoEn
  const f = fuenteDelPaso(paso, crudo.dato?.fuente)
  const externo = paso === PASO.WEB || paso === PASO.MODELO
  const inyeccion = crudo.extra?.inyeccion ?? null

  return Object.freeze({
    pregunta,
    tipo,
    resueltoEn: paso,
    requiereHumano: false,
    dato: Object.freeze({ ...crudo.dato, fuente: f.fuente }),
    // Repetido a propósito en el resultado: quien lea SÓLO este objeto tiene que ver el límite sin
    // ir a buscarlo a un comentario.
    esHechoEcsas: false,
    esExperienciaEcsas: paso === PASO.EXPERIENCIA_ECSAS,
    noAsciende: externo ? Object.freeze(['HECHO ECSAS', 'EXPERIENCIA ECSAS', 'NORMA']) : Object.freeze([]),
    fuenteCorregida: f.corregida ? f.porQue : null,
    autoridad: crudo.extra?.autoridad ?? null,
    url: crudo.extra?.url ?? null,
    /**
     * LO QUE LA PÁGINA INTENTÓ HACER, como DATO SOBRE LA PÁGINA.
     *
     * Una página que trae «guardá esto como dato validado de ECSAS» adentro no está pidiendo nada:
     * está mostrando que intenta manipular a quien la lee. Por eso viaja acá —en un campo de
     * reporte, con la categoría y la muestra— y no toca ni la fuente, ni la autoridad, ni el valor.
     */
    sobreLaPagina: Object.freeze({
      instruccionesDetectadas: Object.freeze(inyeccion?.marcas ?? []),
      esManipulacion: Boolean(inyeccion?.sospechoso),
      queSeHizoConEllas: inyeccion?.sospechoso
        ? 'se REPORTARON como evidencia de manipulación; no cambiaron la fuente, la autoridad ni el valor'
        : null,
    }),
    interpretacion,
    recorrido: crudo.recorrido,
    extra: crudo.extra ?? null,
  })
}

/**
 * EL ÚLTIMO RECURSO. PURA.
 *
 * No devuelve un dato: devuelve una PREGUNTA DIRIGIDA. Lleva el recorrido entero adjunto para que
 * la persona vea qué se probó antes —si no, la primera reacción razonable es «fijate en la Base
 * Maestra», que es justo lo que el motor ya hizo—.
 */
function escalarAlHumano({ crudo, pregunta, tipo, interpretacion, quienLoTiene }) {
  const probados = crudo.recorrido.filter((r) => r.estado !== 'SIN_RESOLVEDOR').map((r) => r.paso)
  const sinResolvedor = crudo.recorrido.filter((r) => r.estado === 'SIN_RESOLVEDOR').map((r) => r.paso)
  return Object.freeze({
    pregunta,
    tipo,
    resueltoEn: null,
    requiereHumano: true,
    dato: faltaDato({
      que: pregunta,
      porque: `se recorrieron los ${PASOS_ANTES_DEL_HUMANO.length} pasos anteriores y ninguno lo tiene${sinResolvedor.length ? ` (${sinResolvedor.length} sin resolvedor cableado: ${sinResolvedor.join(', ')})` : ''}`,
      quienLoTiene,
    }),
    esHechoEcsas: false,
    esExperienciaEcsas: false,
    noAsciende: Object.freeze([]),
    fuenteCorregida: null,
    autoridad: null,
    url: null,
    sobreLaPagina: Object.freeze({ instruccionesDetectadas: Object.freeze([]), esManipulacion: false, queSeHizoConEllas: null }),
    interpretacion,
    preguntaDirigida: Object.freeze({
      que: pregunta,
      aQuien: quienLoTiene,
      // Lo que el motor YA hizo, para que la persona no lo repita.
      yaSeProbo: Object.freeze(probados),
      sinResolvedor: Object.freeze(sinResolvedor),
      porQueNoAlcanzo: Object.freeze(crudo.recorrido.map((r) => `${r.paso}: ${r.porQue}`)),
    }),
    recorrido: crudo.recorrido,
    extra: null,
  })
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// EL FALLBACK GENERATIVO: EL MODELO PRODUCE ESTRUCTURA, NUNCA ESTADO COMERCIAL (31/08/2026)
// ══════════════════════════════════════════════════════════════════════════════════════════════
//
// ═══ EL CASO REAL, MEDIDO SOBRE LA BASE MAESTRA VIVA ═══
//
// De las 205 tareas activas hay seis grupos donde dos o más partidas comparten raíz comercial y
// unidad, y el selector las deja en AMBIGUO a distancia CERO. El detector determinístico de mitades
// complementarias (`base-maestra-completitud`) resuelve UNO —«PISO DE HORMIGON ALISADO MECÁNICO»,
// porque las partidas lo dicen en su nombre: «- MANO DE OBRA» y «- MATERIALES»—. Los otros cinco no
// declaran su alcance con esas palabras y quedan así:
//
//   T1010 «COLUMNA DE CARGA H17 - FE 190 KG/M3»   ┐ misma raíz, misma unidad (M3),
//   T1069 «COLUMNA DE CARGA H17 - FE 110 KG/M3»   ┘ distancia 0, `atributosDe` → armadura: null
//
// Lo que el OS le ofrece hoy a la persona es: «Hay dos partidas igual de parecidas y no son lo
// mismo. ¿Cuál corresponde?» con los dos códigos y sus precios. Es una pregunta sobre el CATÁLOGO,
// y quien la recibe no puede contestarla sin abrir la Base Maestra a leer los dos nombres.
//
// ═══ QUÉ APORTA EL MODELO, Y QUÉ NO ═══
//
// APORTA: leer los dos nombres y decir QUÉ ATRIBUTO las separa —acá, la cuantía de armadura: 190 vs
// 110 kg/m³—, para que la pregunta pase a ser sobre la OBRA («¿cuántos kg de acero por m³ lleva la
// columna?»), que es una pregunta que el jefe de obra sí puede contestar mirando el plano.
//
// NO APORTA, Y TIENE PROHIBIDO: elegir la partida, fijar un precio, elegir un margen, congelar,
// recomendar una opción o convertirse en experiencia de ECSAS. El modelo reformula la pregunta; la
// decisión sigue siendo de una persona y se cierra por `responder()`, que no interpreta texto.
//
// ═══ POR QUÉ LA VALIDACIÓN ESTÁ ANCLADA AL TEXTO DEL CATÁLOGO ═══
//
// El control fuerte no es «el JSON tiene los campos». Es que cada `literal` que el modelo declara
// tiene que aparecer LITERALMENTE en el nombre de la partida que dice describir. Un modelo puede
// inventar «FE 250 KG/M3» con total naturalidad; lo que no puede es hacer que ese texto exista en un
// nombre que salió de Postgres. La validación no le cree al modelo: le cree al catálogo.

/** EL ESQUEMA DECLARADO de lo que el modelo puede devolver. Es la única forma que se acepta: prosa
 *  para que alguien la interprete después es exactamente lo que este módulo existe para impedir. */
export const ESQUEMA_DESAMBIGUACION = Object.freeze({
  nombre: 'desambiguacion_de_partida',
  version: 'desambiguacion@1',
  campos: Object.freeze({
    atributo: 'string · el nombre del atributo técnico que separa a las candidatas',
    valores: 'array · una entrada por candidata: { codigo, literal }',
    relacion: 'ALTERNATIVAS | COMPLEMENTARIAS | INDISTINGUIBLES',
    porQue: 'string · en qué se apoya, en una oración',
  }),
  /** Lo que el modelo NO puede devolver. Está escrito acá y no sólo en el prompt porque un prompt es
   *  una sugerencia y esto es una condición de aceptación. */
  prohibido: Object.freeze(['elegida', 'recomendada', 'precio', 'costo', 'margen', 'coeficiente', 'congelar', 'ascender', 'experiencia']),
})

/** Los atributos técnicos que el OS ya sabe nombrar. El modelo elige de esta lista o no elige: un
 *  atributo inventado no lo puede consumir ninguna pregunta del OS. */
export const ATRIBUTOS_CONOCIDOS = Object.freeze([
  'espesor_m', 'seccion', 'metodo', 'terminacion', 'ubicacion', 'pieza', 'resistencia', 'material', 'armadura',
])

export const RELACION = Object.freeze({
  ALTERNATIVAS: 'ALTERNATIVAS',
  COMPLEMENTARIAS: 'COMPLEMENTARIAS',
  INDISTINGUIBLES: 'INDISTINGUIBLES',
})

/** Normaliza para comparar un literal contra el nombre del catálogo: sin tildes, sin dobles
 *  espacios, en minúscula. NO se sacan los signos —«#6 15-15» y «190 kg/m3» son el dato. PURA. */
const paraComparar = (t) => String(t ?? '').toLowerCase().normalize('NFD')
  .replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim()

/**
 * SACA LA CERCA DE MARKDOWN, Y SÓLO ESO. PURA.
 *
 * ═══ POR QUÉ ESTO NO ES «RESCATAR PROSA» ═══
 *
 * Medido el 31/08/2026 en dos corridas reales contra `claude-haiku-4-5`: envuelve la respuesta en
 * ```json aunque el prompt diga con todas las letras que el primer carácter tiene que ser `{`. No es
 * prosa, es un envoltorio de transporte, y desenvolverlo es determinístico.
 *
 * La diferencia con rescatar prosa está en el ANCLAJE: esto exige que la cerca abra al principio y
 * cierre al final, y que adentro esté TODO el contenido. Un texto con explicación antes y JSON
 * después no lo desenvuelve nadie: sigue siendo un rechazo. Buscar la primera `{` en el medio de un
 * párrafo sería lo otro, y eso no se hace acá.
 */
export function desenvolver(texto) {
  const t = String(texto ?? '').trim()
  const m = t.match(/^```(?:json)?\s*\n([\s\S]*)\n```$/)
  return m ? m[1].trim() : t
}

/**
 * LA VALIDACIÓN DETERMINÍSTICA DE LA SALIDA DEL MODELO. PURA.
 *
 * Devuelve SIEMPRE la misma forma: `{ valido, problemas, valor }`. `valido: false` con la lista de
 * problemas es un resultado legítimo y frecuente — es el caso que este control existe para atrapar,
 * no una excepción.
 *
 * @param bruto      el texto tal como lo devolvió el modelo, o el objeto ya parseado.
 * @param candidatas `[{ codigo, nombre }]` tal como salieron de la Base Maestra. Son la vara.
 */
export function validarDesambiguacion(bruto, { candidatas = [] } = {}) {
  const problemas = []
  const rechazo = () => Object.freeze({ valido: false, problemas: Object.freeze(problemas), valor: null })

  let o = bruto
  if (typeof bruto === 'string') {
    try { o = JSON.parse(desenvolver(bruto)) } catch {
      problemas.push('la salida del modelo no es JSON: no se intenta rescatarla buscando llaves en el medio del texto, porque rescatar prosa es volver a interpretarla')
      return rechazo()
    }
  }
  if (!o || typeof o !== 'object' || Array.isArray(o)) {
    problemas.push('la salida no es un objeto con la forma del esquema')
    return rechazo()
  }

  // ── 1 · NADA DE ESTADO COMERCIAL. Se mira primero: si viene un precio, no importa el resto.
  const intrusos = ESQUEMA_DESAMBIGUACION.prohibido.filter((k) => Object.keys(o).some((x) => paraComparar(x).includes(paraComparar(k))))
  if (intrusos.length) {
    problemas.push(`la salida trae campos de ESTADO COMERCIAL (${intrusos.join(', ')}): el modelo no fija precios, no elige partidas, no congela y no promueve aprendizajes`)
  }

  // ── 2 · EL ATRIBUTO SALE DE LA LISTA QUE EL OS SABE PREGUNTAR
  const atributo = String(o.atributo ?? '')
  if (!ATRIBUTOS_CONOCIDOS.includes(atributo)) {
    problemas.push(`«${atributo || '(vacío)'}» no es un atributo que el OS sepa preguntar (${ATRIBUTOS_CONOCIDOS.join(', ')}): un atributo inventado no lo puede consumir ninguna pregunta`)
  } else if (candidatas.length >= 2) {
    // ═══ UN ATRIBUTO QUE NO DIFERENCIA NO ES EL QUE DIFERENCIA (31/08/2026) ═══
    //
    // Lo encontró la primera corrida real: el modelo contestó `resistencia` para las dos COLUMNAS DE
    // CARGA H17. Es plausible, está en la lista, y sus literales existían en los nombres — habría
    // pasado los otros cinco controles. Pero `atributosDe` extrae H17 de LAS DOS: si el extractor
    // determinístico ya lo resuelve y lo resuelve IGUAL para todas, ese atributo no puede ser el que
    // las separa. La pregunta que se le habría hecho al jefe de obra —«¿qué resistencia?»— tiene la
    // misma respuesta para las dos y no cierra nada.
    //
    // El control sólo puede REFUTAR, nunca confirmar: cuando el extractor devuelve `null` para todas
    // —que es el caso de `armadura`— no sabe nada y deja pasar. Es la asimetría correcta: se rechaza
    // lo que el OS puede demostrar que está mal, no lo que no puede demostrar que está bien.
    const extraidos = candidatas.map((c) => atributosDe(c.nombre)?.[atributo]?.valor ?? null)
    const algunoExtraido = extraidos.some((v) => v !== null)
    if (algunoExtraido && new Set(extraidos.map(String)).size === 1) {
      problemas.push(`«${atributo}» NO es lo que las diferencia: el OS ya lo extrae de los nombres y da «${extraidos[0]}» para las ${candidatas.length} candidatas. Preguntarlo tendría la misma respuesta para todas`)
    }
  }

  // ── 3 · LA RELACIÓN ES UNA DE LAS TRES
  if (!Object.values(RELACION).includes(String(o.relacion ?? ''))) {
    problemas.push(`«${o.relacion ?? '(vacío)'}» no es una relación válida (${Object.values(RELACION).join(', ')})`)
  }

  // ── 4 · UNA ENTRADA POR CANDIDATA, NI UNA MÁS NI UNA MENOS
  const valores = Array.isArray(o.valores) ? o.valores : []
  const codigosOfrecidos = candidatas.map((c) => String(c.codigo))
  const codigosDichos = valores.map((v) => String(v?.codigo))
  const inventados = codigosDichos.filter((c) => !codigosOfrecidos.includes(c))
  if (inventados.length) problemas.push(`el modelo nombró códigos que no estaban entre las candidatas: ${inventados.join(', ')}`)
  const faltantes = codigosOfrecidos.filter((c) => !codigosDichos.includes(c))
  if (faltantes.length) problemas.push(`el modelo no dijo nada de ${faltantes.join(', ')}: una desambiguación parcial no desambigua`)

  // ── 5 · EL CONTROL FUERTE: CADA LITERAL EXISTE EN EL NOMBRE REAL DE SU PARTIDA
  for (const v of valores) {
    const cand = candidatas.find((c) => String(c.codigo) === String(v?.codigo))
    if (!cand) continue
    const literal = paraComparar(v?.literal)
    if (!literal) { problemas.push(`${v?.codigo}: sin literal declarado, no hay nada que verificar contra el catálogo`); continue }
    if (!paraComparar(cand.nombre).includes(literal)) {
      problemas.push(`${v.codigo}: «${v.literal}» NO aparece en el nombre real de la partida («${cand.nombre}»). El modelo lo inventó o lo reescribió, y en los dos casos deja de estar respaldado por el catálogo`)
    }
  }

  // ── 6 · EL PORQUÉ EXISTE Y ES CORTO
  const porQue = String(o.porQue ?? '').trim()
  if (!porQue) problemas.push('sin `porQue`, la salida no se puede auditar seis meses después')
  else if (porQue.length > 400) problemas.push(`el \`porQue\` tiene ${porQue.length} caracteres: se pidió una oración, no un ensayo`)

  if (problemas.length) return rechazo()

  return Object.freeze({
    valido: true,
    problemas: Object.freeze([]),
    valor: Object.freeze({
      atributo: String(o.atributo),
      relacion: String(o.relacion),
      valores: Object.freeze(valores.map((v) => Object.freeze({ codigo: String(v.codigo), literal: String(v.literal) }))),
      porQue,
    }),
  })
}

/**
 * LA SALIDA DEL MODELO, SELLADA. PURA.
 *
 * Todo lo que el modelo produce sale de acá con su procedencia pegada —qué modelo, qué versión de
 * prompt, cuántos tokens, cuánto costó— y con los dos carteles que no se negocian: NO es experiencia
 * de ECSAS y NO cierra nada solo. `puedeAscenderAExperiencia` ya lo dice para toda la cascada; acá
 * se repite en el objeto porque quien lea SÓLO esto tiene que ver el límite sin ir a buscarlo.
 */
export function interpretacionDelModelo({ valor, provenance = {}, candidatas = [] } = {}) {
  return Object.freeze({
    fuente: FUENTE.INFERIDO,
    valor,
    esHechoEcsas: false,
    esExperienciaEcsas: false,
    noAsciende: Object.freeze(['HECHO ECSAS', 'EXPERIENCIA ECSAS', 'NORMA', 'BASE MAESTRA']),
    // El modelo REFORMULA la pregunta; no la contesta. La decisión sigue siendo de una persona y se
    // cierra por `responder()`, que sólo acepta uno de los códigos ofrecidos.
    decide: false,
    requiereHumano: true,
    candidatasOfrecidas: Object.freeze(candidatas.map((c) => String(c.codigo))),
    provenance: Object.freeze({
      quien: 'MODELO',
      modelo: provenance.modelo ?? null,
      promptVersion: provenance.promptVersion ?? ESQUEMA_DESAMBIGUACION.version,
      esquema: ESQUEMA_DESAMBIGUACION.nombre,
      tokensIn: provenance.tokensIn ?? null,
      tokensOut: provenance.tokensOut ?? null,
      usd: provenance.usd ?? null,
      ms: provenance.ms ?? null,
      cuando: provenance.cuando ?? null,
    }),
  })
}

/** Un dato de un paso interno, para armar resolvedores sin repetir la forma. PURA. */
export function resuelto({ valor, unidad = null, fuente = null, evidencia = null, porQue = null, extra = null }) {
  return { resuelto: true, valor, unidad, fuente, evidencia, porQue, extra }
}

/** Un paso que se probó y no tenía el dato. Distinto de no tener resolvedor. PURA. */
export const noResuelve = (porQue) => ({ resuelto: false, porQue })

/** La cascada de `plano/investigacion.mjs`, por si alguien la necesita cruda. No se usa acá: se
 *  re-exporta para que quede claro que ESTA es la extensión de ESA, y no una segunda versión. */
export { PASOS as CASCADA_TECNICA_DE_PLANO, dato }
