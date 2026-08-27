// EL CÓMPUTO CONSTRUCTIVO — geometría que se multiplica sola, y todo lo demás declarado.
//
// ═══ QUÉ CONTESTA ═══
//
// «Una zanja de 12 m × 0,60 m × 1,20 m, ¿cuántos m³ son, y cómo llegué a ese número?» — con la
// cuenta a la vista, la unidad puesta y el rubro de la Base Maestra pegado, para que la cantidad
// que entra al presupuesto sea la misma que después se ejecuta y se aprende.
//
// ═══ POR QUÉ ES UNA FUNCIÓN PURA Y NUNCA UN MODELO ═══
//
// Un producto de tres números lo hace bien una computadora SIEMPRE. Un modelo lo hace bien casi
// siempre, y ese «casi» sobre un cómputo se transforma en una obra cotizada de menos que se
// descubre cuando ya está firmada. Acá no hay red, no hay base y no hay prompt: entran números,
// salen números y sale la traza de cómo se obtuvieron. El modelo, si entra, entra ANTES —leyendo un
// plano y proponiendo las medidas— y esas medidas entran acá como `EXTRAIDO` a confirmar.
//
// ═══ LAS TRES REGLAS QUE GOBIERNAN CADA NÚMERO DE ACÁ ═══
//
// 1. **CADA NÚMERO DICE DE QUÉ CLASE ES.** `EXTRAIDO` (lo leí de un plano o de un pliego),
//    `CALCULADO` (lo produje con una fórmula sobre entradas declaradas), `INFERIDO` (lo deduje de
//    otra cosa), `SUPUESTO` (lo tomé por defecto porque nadie lo dijo) o `REQUIERE_VALIDACION` (no
//    lo firmo sin que lo mire una persona). Y por separado dice su RESPALDO: una fórmula geométrica
//    no vale lo mismo que un rendimiento de nuestras obras, y ninguno de los dos vale lo mismo que
//    una inferencia. Mezclar los tres es cómo un supuesto termina presentado como un hecho.
//
// 2. **UNA REGLA QUE NO TENGO NO ME LA INVENTO.** Cuando falta una definición técnica —el
//    recubrimiento, el largo del gancho, la separación de estribos— el motor NO elige un valor
//    «típico»: devuelve `requiereDefinicion` diciendo qué falta, por qué no se puede deducir y
//    quién lo tiene que definir. Un número plausible es infinitamente peor que un hueco visible,
//    porque el hueco se llena y el número plausible se cotiza.
//
// 3. **FALTA DE DATO NO ES CERO NI ES REGLA AUSENTE.** Son dos cosas distintas y salen por canales
//    distintos: `faltantes` es «no me pasaste la profundidad»; `requiereDefinicion` es «nadie
//    definió todavía cuánto recubrimiento lleva esto». La primera la arregla quien carga; la
//    segunda la arregla el dueño o una norma.

import { num } from './obra-plan-real.mjs'

/** De qué clase es un número. Lo pide el CLAUDE.md raíz y no es decorativo: gobierna qué se puede
 *  afirmar con él. Un `SUPUESTO` no se presenta nunca como un `CALCULADO`. */
export const CLASE = Object.freeze({
  EXTRAIDO: 'EXTRAIDO',
  CALCULADO: 'CALCULADO',
  INFERIDO: 'INFERIDO',
  SUPUESTO: 'SUPUESTO',
  REQUIERE_VALIDACION: 'REQUIERE_VALIDACION',
})

/** En qué se apoya. Distinto de la clase: `CALCULADO` dice CÓMO se obtuvo, el respaldo dice POR QUÉ
 *  la fórmula es esa. Un volumen y un rendimiento pueden ser los dos `CALCULADO` y no valer lo
 *  mismo — uno sale de la geometría y el otro de doce obras nuestras. */
export const RESPALDO = Object.freeze({
  NORMA: 'NORMA/FORMULA',
  EXPERIENCIA: 'EXPERIENCIA ECSAS',
  INFERENCIA: 'INFERENCIA',
})

/** Quién puede cerrar un hueco de definición. No es un adorno: un hueco sin dueño no se cierra. */
export const DEFINE = Object.freeze({
  NORMA: 'NORMA O PROYECTO ESTRUCTURAL',
  DUENO: 'DUEÑO / DIRECCIÓN TÉCNICA',
  CARGA: 'QUIEN CARGA EL CÓMPUTO',
})

// El ruido de coma flotante: 2,5 × 0,4 × 0,3 da 0,30000000000000004 y ese número impreso en una
// planilla parece un error de alguien. Se corta en la sexta decimal —1 cm³ en un volumen en m³—,
// que está muy por debajo de cualquier precisión de obra y muy por encima del ruido binario.
const DECIMALES = 6

function limpiar(v) {
  const n = num(v)
  if (n === null) return null
  return Math.round(n * 10 ** DECIMALES) / 10 ** DECIMALES
}

/**
 * UN NÚMERO CON TODO LO QUE HACE FALTA PARA CREERLE: valor, unidad, clase, respaldo, la fórmula
 * escrita en castellano y las entradas con las que se evaluó. Nadie que lea esto tiene que
 * preguntar de dónde salió.
 */
export function magnitud({ valor, unidad, clase, respaldo, formula = null, entradas = null, fuente = null }) {
  return {
    valor: limpiar(valor),
    unidad: unidad ?? null,
    clase,
    respaldo,
    formula,
    entradas: entradas ?? null,
    fuente,
    requiereDefinicion: null,
  }
}

/**
 * EL HUECO, CON NOMBRE Y DUEÑO. Ocupa el mismo lugar que tendría el número —así nadie lo confunde
 * con un cero— y dice las tres cosas que hacen falta para cerrarlo: qué falta, por qué no se puede
 * deducir de lo que hay, y quién lo define.
 */
export function requiereDefinicion({ que, unidad = null, porque, quienDefine = DEFINE.NORMA }) {
  return {
    valor: null,
    unidad,
    clase: null,
    respaldo: null,
    formula: null,
    entradas: null,
    fuente: null,
    requiereDefinicion: { que, porque, quienDefine },
  }
}

/** ¿Este resultado es un hueco de definición? Lo usan los consumidores para no sumar `null` como 0. */
export function esHueco(m) {
  return Boolean(m && m.requiereDefinicion)
}

/** Recorre un resultado y junta todos los huecos, con la ruta donde apareció cada uno. Sirve para
 *  que una pantalla pueda listar «esto falta definir» sin conocer la forma del cómputo. */
export function huecosDe(nodo, ruta = '') {
  if (!nodo || typeof nodo !== 'object') return []
  if (esHueco(nodo)) return [{ ruta, ...nodo.requiereDefinicion, unidad: nodo.unidad }]
  const salida = []
  for (const [k, v] of Object.entries(nodo)) {
    if (k === 'requiereDefinicion' || k === 'entradas') continue
    salida.push(...huecosDe(v, ruta ? `${ruta}.${k}` : k))
  }
  return salida
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// LAS ENTRADAS GEOMÉTRICAS
//
// Una medida que llega de un plano leído por un modelo NO es lo mismo que una medida que alguien
// midió y tipeó, y las dos entran por acá con su clase puesta. Lo que no entra nunca es una medida
// sin declarar de dónde vino.

/**
 * Normaliza una entrada geométrica. Acepta un número pelado —y entonces es `EXTRAIDO`, porque
 * alguien lo puso— o un objeto `{ valor, clase, fuente }`.
 *
 * Devuelve `null` si no hay número: una dimensión ausente no vale cero. Una zanja sin profundidad
 * declarada no tiene volumen cero, no tiene volumen.
 */
export function dimension(entrada, { unidad = 'm' } = {}) {
  if (entrada === null || entrada === undefined) return null
  const crudo = typeof entrada === 'object' ? entrada.valor : entrada
  const n = num(crudo)
  if (n === null) return null
  return {
    valor: limpiar(n),
    unidad: (typeof entrada === 'object' && entrada.unidad) || unidad,
    clase: (typeof entrada === 'object' && entrada.clase) || CLASE.EXTRAIDO,
    fuente: (typeof entrada === 'object' && entrada.fuente) || null,
  }
}

/** Las dimensiones que faltan, por nombre. Es lo que se le muestra a quien carga. */
function faltantesDe(dims) {
  return Object.entries(dims).filter(([, d]) => d === null).map(([k]) => k)
}

/** Una dimensión negativa o cero no es un dato raro: es un dato imposible, y sumarla al cómputo
 *  produce un volumen que parece correcto. Sale por su propio canal. */
function imposiblesDe(dims) {
  return Object.entries(dims)
    .filter(([, d]) => d !== null && d.valor <= 0)
    .map(([k, d]) => `${k} = ${d.valor}: una dimensión de obra es mayor que cero`)
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// EL PRISMA — la primitiva de la que salen la excavación, la viga, el tabique y la platea.

/**
 * VOLUMEN DE UN PRISMA RECTO: X × Y × Z. Es la única multiplicación del módulo y está acá una sola
 * vez a propósito — el día que haya que agregarle un coeficiente, se agrega en un solo lugar.
 */
export function volumenPrisma(x, y, z, { nombres = ['x', 'y', 'z'], unidad = 'm' } = {}) {
  const dims = { [nombres[0]]: dimension(x, { unidad }), [nombres[1]]: dimension(y, { unidad }), [nombres[2]]: dimension(z, { unidad }) }
  const faltantes = faltantesDe(dims)
  const imposibles = imposiblesDe(dims)
  if (faltantes.length > 0 || imposibles.length > 0) {
    return { volumen: null, dimensiones: dims, faltantes, imposibles }
  }
  const vals = nombres.map((n) => dims[n].valor)
  return {
    volumen: magnitud({
      valor: vals[0] * vals[1] * vals[2],
      unidad: `${unidad}3`,
      clase: CLASE.CALCULADO,
      respaldo: RESPALDO.NORMA,
      formula: `${nombres.join(' × ')}`,
      entradas: Object.fromEntries(nombres.map((n) => [n, dims[n].valor])),
    }),
    dimensiones: dims,
    faltantes: [],
    imposibles: [],
  }
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// EL RUBRO — se trae de la Base Maestra, no se escribe a mano.
//
// El rubro es lo que después agrupa el presupuesto, el plan de obra y el aprendizaje. Si cada
// cómputo lo escribe con sus palabras, «Excavaciones», «Excavación» y «MOV. DE SUELOS» quedan como
// tres rubros distintos y el histórico deja de poder compararse consigo mismo.

/**
 * El rubro de una tarea, con orden de preferencia explícito:
 *   1. el que trae la Base Maestra para ese `tarea_tipo` (`division`) — es la fuente;
 *   2. el que declaró quien computa, y entonces queda `REQUIERE_VALIDACION` porque no está en la
 *      Base Maestra y va a nacer como rubro nuevo;
 *   3. nada, y se dice que falta.
 *
 * `baseMaestra` es una lista ya leída de `tarea_tipo` —el módulo no consulta la base—.
 */
export function rubroDe({ tareaTipoId = null, tareaTipoCodigo = null, rubroDeclarado = null }, baseMaestra = []) {
  const t = (baseMaestra ?? []).find((x) => (tareaTipoId && x.id === tareaTipoId) || (tareaTipoCodigo && x.codigo === tareaTipoCodigo))
  if (t && t.division) {
    return {
      texto: t.division,
      clase: CLASE.EXTRAIDO,
      respaldo: RESPALDO.NORMA,
      fuente: `tarea_tipo:${t.codigo ?? t.id}`,
      tareaTipoId: t.id ?? tareaTipoId,
    }
  }
  if (rubroDeclarado) {
    return {
      texto: String(rubroDeclarado),
      clase: CLASE.REQUIERE_VALIDACION,
      respaldo: RESPALDO.INFERENCIA,
      fuente: 'declarado en el cómputo',
      tareaTipoId: t?.id ?? tareaTipoId,
      nota: 'No está en la Base Maestra: va a nacer como rubro nuevo. Confirmarlo evita tener el mismo rubro escrito de tres formas.',
    }
  }
  return {
    texto: null, clase: null, respaldo: null, fuente: null, tareaTipoId: t?.id ?? tareaTipoId,
    nota: 'Sin rubro: la tarea no se va a poder agrupar ni comparar contra el histórico.',
  }
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// EXCAVACIÓN

/**
 * EXCAVACIÓN DE ZANJA O POZO: ancho × largo × profundidad.
 *
 * El **esponjamiento** —cuánto crece el suelo al removerlo, que es lo que decide cuántos viajes de
 * camión hacen falta— NO se supone: sin coeficiente declarado el módulo devuelve el hueco. El valor
 * depende del suelo real del sitio y en Cuyo los limos loéssicos no se comportan como un tosca.
 */
export function computarExcavacion(entrada = {}, opciones = {}) {
  const { ancho, largo, profundidad, unidad = 'm', coeficienteEsponjamiento = null } = entrada
  const geo = volumenPrisma(ancho, largo, profundidad, { nombres: ['ancho', 'largo', 'profundidad'], unidad })

  const base = {
    tarea: 'EXCAVACION',
    rubro: rubroDe({ tareaTipoCodigo: entrada.tareaTipoCodigo, tareaTipoId: entrada.tareaTipoId, rubroDeclarado: entrada.rubro }, opciones.baseMaestra),
    dimensiones: geo.dimensiones,
    faltantes: geo.faltantes,
    imposibles: geo.imposibles,
    volumenBanco: geo.volumen,
  }
  if (!geo.volumen) return { ...base, volumenSuelto: null }

  const c = num(coeficienteEsponjamiento)
  if (c === null) {
    return {
      ...base,
      volumenSuelto: requiereDefinicion({
        que: 'coeficiente de esponjamiento del suelo',
        unidad: 'adimensional',
        porque: 'el volumen a retirar depende de cuánto crece ESE suelo al removerlo, y eso no se deduce de la geometría. Sin estudio de suelos o dato de obra comparable no hay número que poner.',
        quienDefine: DEFINE.DUENO,
      }),
    }
  }
  return {
    ...base,
    volumenSuelto: magnitud({
      valor: geo.volumen.valor * c,
      unidad: geo.volumen.unidad,
      clase: CLASE.CALCULADO,
      respaldo: RESPALDO.EXPERIENCIA,
      formula: 'volumen en banco × coeficiente de esponjamiento',
      entradas: { volumenBanco: geo.volumen.valor, coeficienteEsponjamiento: c },
      fuente: entrada.fuenteEsponjamiento ?? 'declarado en el cómputo',
    }),
  }
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// LA CADENA — geometría → cantidad → insumo → HH → precio → costo.
//
// Cada eslabón se apoya en el anterior Y DICE EN QUÉ SE APOYA. Es lo que permite contestar «¿por
// qué esta partida cuesta esto?» sin abrir una planilla: se lee la cadena de arriba a abajo.

/**
 * Toma una cantidad ya computada y una composición unitaria de la Base Maestra —cuánto de cada
 * recurso lleva UNA unidad— y devuelve los insumos totales, las HH y el costo, cada uno con su
 * clase y su respaldo.
 *
 * `composicionUnitaria`: `[{ codigo, nombre, unidad, tipo, cantidad, costoUnitario, desperdicio, fechaPrecio }]`
 * tal cual sale de `analisis_linea` × `recurso_costo`. El módulo NO la va a buscar: se la pasan.
 */
export function cadenaDeCosto({ cantidad, unidad, composicionUnitaria = [], origenComposicion = 'base_maestra' }) {
  const q = num(cantidad?.valor ?? cantidad)
  if (q === null) {
    return { cantidad: null, insumos: [], hh: null, costo: null, faltantes: ['cantidad'], sinPrecio: [] }
  }
  const respaldo = origenComposicion === 'base_maestra' ? RESPALDO.NORMA : RESPALDO.EXPERIENCIA
  const sinPrecio = []
  const insumos = composicionUnitaria.map((l) => {
    const porUnidad = num(l.cantidad) ?? 0
    const desp = num(l.desperdicio) ?? 0
    const total = q * porUnidad * (1 + desp)
    const cu = num(l.costoUnitario)
    if (cu === null) sinPrecio.push(l.codigo ?? l.nombre)
    return {
      codigo: l.codigo ?? null, nombre: l.nombre, tipo: l.tipo ?? null, unidad: l.unidad ?? null,
      cantidad: magnitud({
        valor: total, unidad: l.unidad ?? null, clase: CLASE.CALCULADO, respaldo,
        formula: 'cantidad de la tarea × consumo unitario × (1 + desperdicio)',
        entradas: { cantidad: q, consumoUnitario: porUnidad, desperdicio: desp },
        fuente: origenComposicion,
      }),
      costo: cu === null ? null : magnitud({
        valor: total * cu, unidad: 'ARS', clase: CLASE.CALCULADO, respaldo,
        formula: 'cantidad total del recurso × costo unitario',
        entradas: { cantidadTotal: limpiar(total), costoUnitario: cu },
        fuente: l.fechaPrecio ? `precio al ${l.fechaPrecio}` : origenComposicion,
      }),
    }
  })

  const hhUnit = composicionUnitaria.filter((l) => l.tipo === 'mano_obra').reduce((a, l) => a + (num(l.cantidad) ?? 0), 0)
  const hh = composicionUnitaria.some((l) => l.tipo === 'mano_obra')
    ? magnitud({
      valor: q * hhUnit, unidad: 'HH', clase: CLASE.CALCULADO, respaldo,
      formula: 'cantidad de la tarea × horas hombre unitarias',
      entradas: { cantidad: q, hsUnitarias: limpiar(hhUnit) }, fuente: origenComposicion,
    })
    : null

  // SIN PRECIO NO ES PRECIO CERO. Si falta un solo precio, el costo total sale `null` y se dice
  // cuáles faltan: un total al que le falta un renglón engaña más que un total ausente.
  const costo = sinPrecio.length > 0 || insumos.length === 0 ? null : magnitud({
    valor: insumos.reduce((a, i) => a + (i.costo?.valor ?? 0), 0),
    unidad: 'ARS', clase: CLASE.CALCULADO, respaldo,
    formula: 'suma de los costos de cada recurso', entradas: { renglones: insumos.length }, fuente: origenComposicion,
  })

  return {
    cantidad: magnitud({ valor: q, unidad: unidad ?? cantidad?.unidad ?? null, clase: CLASE.CALCULADO, respaldo: RESPALDO.NORMA, formula: 'cómputo geométrico' }),
    insumos, hh, costo, faltantes: [], sinPrecio,
  }
}
