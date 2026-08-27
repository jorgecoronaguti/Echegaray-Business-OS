// VIGAS DE HORMIGÓN ARMADO — el volumen se calcula, el detallado se declara.
//
// ═══ QUÉ CONTESTA Y QUÉ NO ═══
//
// CONTESTA: cuántos m³ de hormigón tiene una viga de b × h × L, cuántos kg pesa una barra de un
// diámetro y un largo dados, cuántos estribos entran en una zona con una separación declarada, y
// cuánto suma todo eso en kg de acero.
//
// NO CONTESTA —y no lo va a contestar nunca por su cuenta—: cuánto recubrimiento lleva, cuánto mide
// el gancho de un estribo, cada cuánto van los estribos, dónde empieza y termina la zona crítica, y
// cuántas barras de qué diámetro lleva arriba y abajo. **Eso es proyecto estructural.** El módulo
// devuelve `requiereDefinicion` con nombre y dueño, y ahí se queda.
//
// ═══ POR QUÉ ESA LÍNEA ESTÁ DONDE ESTÁ (y no un poco más allá) ═══
//
// San Juan es zona de peligrosidad sísmica elevada, y en zona sísmica el detallado —confinamiento
// en extremos, longitudes de anclaje y empalme, ganchos— es exactamente donde una estructura bien
// calculada falla igual si la obra la ejecuta mal. Un módulo que «propusiera» una separación de
// estribos «típica» estaría escribiendo proyecto estructural sin firma, y el número saldría después
// en un presupuesto como si alguien lo hubiera decidido. La regla del repo es la de la skill
// `ingenieria-civil-construccion`: **no se cita ni se supone una norma sin verificar su edición
// vigente**, y acá no hay ninguna verificada. Por eso no hay ninguna citada.
//
// ═══ LO QUE SÍ TIENE RESPALDO Y NO ES UNA NORMA ═══
//
// · **Volumen** = b × h × L. Geometría. No hay norma que la haga distinta.
// · **Peso del acero** = longitud × densidad × sección. Es física: `π·d²/4 · ρ`. La densidad del
//   acero (7.850 kg/m³) entra como PARÁMETRO con su valor por defecto declarado y se puede
//   sobreescribir — no está escondida adentro de una constante mágica. Con ella salen los valores
//   de tabla que usa cualquier planilla de obra (Ø8 → 0,395 kg/m; Ø12 → 0,888; Ø20 → 2,466).
// · **Perímetro del estribo** = 2·(ancho + alto) del rectángulo que se dobla. Geometría otra vez —
//   pero ese rectángulo depende del recubrimiento, y el recubrimiento NO lo pone este módulo.
// · **Cantidad de estribos en una zona** = ⌊longitud / separación⌋ + 1. Es aritmética con una
//   convención declarada (el «+1» es la barra del extremo inicial), y la convención está escrita
//   al lado del número, no supuesta.

import { num } from './obra-plan-real.mjs'
import { CLASE, DEFINE, RESPALDO, magnitud, requiereDefinicion, volumenPrisma, rubroDe, esHueco } from './computo-constructivo.mjs'

/**
 * LOS SUBTIPOS DE VIGA, que son cuatro y no son intercambiables.
 *
 * Se separan porque el rubro, el momento de la obra y la experiencia de rendimiento son distintos:
 * una viga de fundación se hormigona contra el terreno y en el arranque de la obra; un encadenado
 * corona la mampostería y va casi al final. Meterlos en un solo «vigas» hace que el histórico
 * promedie cosas que no se parecen, y el rendimiento aprendido deja de servir para cotizar.
 */
export const SUBTIPO_VIGA = Object.freeze({
  FUNDACION: 'fundacion',
  ARRIOSTRAMIENTO: 'arriostramiento',
  ENCADENADO: 'encadenado',
  CARGA: 'carga',
})

export const RUBRO_VIGAS = 'ESTRUCTURA DE HORMIGÓN ARMADO'

/** Densidad del acero, en kg/m³. Es una propiedad del material, no una norma: por eso viaja como
 *  parámetro con valor por defecto declarado y no como una constante escondida en una cuenta. */
export const DENSIDAD_ACERO_KG_M3 = 7850

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// EL HORMIGÓN

/**
 * VOLUMEN DE HORMIGÓN DE UNA VIGA: ancho × alto × longitud. Determinístico, sin red y sin modelo.
 *
 * `cantidad` permite computar N vigas iguales de una: el volumen unitario y el total salen los dos,
 * porque el unitario es el que se compara contra el histórico y el total es el que se compra.
 */
export function volumenViga({ ancho, alto, longitud, cantidad = 1, unidad = 'm' } = {}) {
  const geo = volumenPrisma(ancho, alto, longitud, { nombres: ['ancho', 'alto', 'longitud'], unidad })
  if (!geo.volumen) return { unitario: null, total: null, ...geo }
  const n = num(cantidad) ?? 1
  return {
    ...geo,
    unitario: geo.volumen,
    total: magnitud({
      valor: geo.volumen.valor * n,
      unidad: geo.volumen.unidad,
      clase: CLASE.CALCULADO,
      respaldo: RESPALDO.NORMA,
      formula: 'volumen unitario × cantidad de vigas',
      entradas: { volumenUnitario: geo.volumen.valor, cantidad: n },
    }),
  }
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// EL ACERO

/**
 * MASA LINEAL DE UNA BARRA, en kg/m, a partir del diámetro nominal en MILÍMETROS.
 *
 * `ρ · π · d² / 4`. No hay tabla hardcodeada a propósito: una tabla es una lista de números sin
 * explicación que hay que creer, y ésta es la fórmula que la genera. Se puede verificar contra
 * cualquier planilla de obra en dos segundos, que es exactamente lo que la hace confiable.
 */
export function masaLinealBarra(diametroMm, { densidad = DENSIDAD_ACERO_KG_M3 } = {}) {
  const d = num(diametroMm)
  if (d === null || d <= 0) return null
  const area = Math.PI * (d / 1000) ** 2 / 4
  return magnitud({
    valor: area * densidad,
    unidad: 'kg/m',
    clase: CLASE.CALCULADO,
    respaldo: RESPALDO.NORMA,
    formula: 'π × diámetro² / 4 × densidad del acero',
    entradas: { diametroMm: d, densidadKgM3: densidad },
    fuente: 'propiedad física del acero — densidad declarada como parámetro, no como norma citada',
  })
}

/**
 * UN GRUPO DE BARRAS LONGITUDINALES (la armadura superior o la inferior).
 *
 * Se pide `cantidad`, `diametroMm` y `longitud`, y los tres los define el proyecto estructural. Si
 * falta alguno, sale el hueco correspondiente: el módulo NO deduce «dos barras del 12» porque la
 * viga mide 20 × 40.
 *
 * La `longitud` que entra es la longitud TOTAL de cada barra ya desarrollada. El módulo no le suma
 * anclajes ni empalmes: cuánto anclar y cuánto solapar es regla de norma y de proyecto.
 */
export function grupoLongitudinal({ posicion, cantidad, diametroMm, longitud, densidad = DENSIDAD_ACERO_KG_M3 } = {}) {
  const faltan = []
  if (num(cantidad) === null) faltan.push('cantidad de barras')
  if (num(diametroMm) === null) faltan.push('diámetro')
  if (num(longitud) === null) faltan.push('longitud desarrollada de cada barra')
  if (faltan.length > 0) {
    return {
      posicion,
      peso: requiereDefinicion({
        que: `armadura ${posicion}: ${faltan.join(', ')}`,
        unidad: 'kg',
        porque: 'la armadura longitudinal es resultado del cálculo estructural. No se deduce de la sección de la viga ni de su luz, y proponer un valor «habitual» sería escribir proyecto sin firma.',
        quienDefine: DEFINE.NORMA,
      }),
    }
  }
  const n = num(cantidad); const l = num(longitud)
  const kgM = masaLinealBarra(diametroMm, { densidad })
  return {
    posicion,
    cantidad: n,
    diametroMm: num(diametroMm),
    longitudUnitaria: magnitud({ valor: l, unidad: 'm', clase: CLASE.EXTRAIDO, respaldo: RESPALDO.NORMA, formula: 'declarada por el proyecto estructural' }),
    longitudTotal: magnitud({
      valor: n * l, unidad: 'm', clase: CLASE.CALCULADO, respaldo: RESPALDO.NORMA,
      formula: 'cantidad de barras × longitud de cada barra', entradas: { cantidad: n, longitud: l },
    }),
    masaLineal: kgM,
    peso: magnitud({
      valor: n * l * kgM.valor, unidad: 'kg', clase: CLASE.CALCULADO, respaldo: RESPALDO.NORMA,
      formula: 'longitud total × masa lineal de la barra', entradas: { longitudTotal: n * l, masaLinealKgM: kgM.valor },
    }),
  }
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// LOS ESTRIBOS
//
// Acá está la mayor concentración de reglas que este módulo NO tiene, y por eso es la parte donde
// más explícito se pone: cada hueco sale con nombre.

/**
 * LONGITUD DESARROLLADA DE UN ESTRIBO.
 *
 * = perímetro del rectángulo que se dobla + los dos ganchos.
 *
 * El rectángulo se obtiene de la sección de la viga descontando el recubrimiento por los cuatro
 * lados (`b − 2c`, `h − 2c`). **El recubrimiento no lo pone el módulo**: depende de la clase de
 * exposición del elemento y sale de norma y de proyecto — una viga de fundación contra el terreno y
 * un encadenado interior no llevan el mismo.
 *
 * **El gancho tampoco.** Su longitud y su ángulo son detallado sismorresistente, que es justo donde
 * se juega la ductilidad de la estructura. Sin `longitudGanchoTotal` declarada, sale el hueco — y
 * el perímetro se devuelve igual, porque ése sí se calculó.
 */
export function estriboDesarrollado({ anchoViga, altoViga, recubrimiento = null, diametroMm = null, longitudGanchoTotal = null, densidad = DENSIDAD_ACERO_KG_M3 } = {}) {
  const b = num(anchoViga); const h = num(altoViga); const c = num(recubrimiento)
  if (b === null || h === null) return { perimetro: null, faltantes: ['ancho o alto de la viga'] }
  if (c === null) {
    return {
      perimetro: requiereDefinicion({
        que: 'recubrimiento de hormigón',
        unidad: 'm',
        porque: 'el rectángulo que se dobla es la sección menos dos recubrimientos por lado, y el recubrimiento depende de la clase de exposición del elemento (contra terreno, a la intemperie, interior). Es dato de norma y de proyecto, no de geometría.',
        quienDefine: DEFINE.NORMA,
      }),
      faltantes: [],
    }
  }
  const be = b - 2 * c; const he = h - 2 * c
  if (be <= 0 || he <= 0) {
    return { perimetro: null, faltantes: [], imposibles: [`el recubrimiento ${c} no entra en una sección de ${b} × ${h}`] }
  }
  const perimetro = magnitud({
    valor: 2 * (be + he), unidad: 'm', clase: CLASE.CALCULADO, respaldo: RESPALDO.NORMA,
    formula: '2 × ((ancho − 2·recubrimiento) + (alto − 2·recubrimiento))',
    entradas: { anchoViga: b, altoViga: h, recubrimiento: c },
  })
  const g = num(longitudGanchoTotal)
  const desarrollo = g === null
    ? requiereDefinicion({
      que: 'longitud total de los ganchos del estribo',
      unidad: 'm',
      porque: 'el largo y el ángulo del gancho son detallado sismorresistente: en zona sísmica es donde se define si el estribo confina de verdad. Es dato de norma vigente y de proyecto, y esta sesión no verificó ninguna.',
      quienDefine: DEFINE.NORMA,
    })
    : magnitud({
      valor: perimetro.valor + g, unidad: 'm', clase: CLASE.CALCULADO, respaldo: RESPALDO.NORMA,
      formula: 'perímetro del estribo + longitud de los ganchos',
      entradas: { perimetro: perimetro.valor, ganchos: g },
    })
  const kgM = diametroMm === null ? null : masaLinealBarra(diametroMm, { densidad })
  const peso = kgM && !esHueco(desarrollo)
    ? magnitud({
      valor: desarrollo.valor * kgM.valor, unidad: 'kg', clase: CLASE.CALCULADO, respaldo: RESPALDO.NORMA,
      formula: 'longitud desarrollada × masa lineal', entradas: { desarrollo: desarrollo.valor, masaLinealKgM: kgM.valor },
    })
    : null
  return { anchoEstribo: be, altoEstribo: he, perimetro, desarrollo, masaLineal: kgM, pesoUnitario: peso, faltantes: [] }
}

/**
 * CUÁNTOS ESTRIBOS ENTRAN EN UNA ZONA: ⌊longitud / separación⌋ + 1.
 *
 * El «+1» es una convención —cuenta el estribo del extremo inicial— y por eso viaja escrita en la
 * fórmula. La **separación** y la **longitud de la zona crítica** NO las pone el módulo: la primera
 * es resultado del cálculo de corte y del detallado de confinamiento; la segunda es la extensión
 * donde el reglamento sismorresistente exige separación más estricta, medida desde la cara del
 * apoyo. Sin las dos declaradas, la zona sale como hueco.
 */
export function estribosEnZona({ nombre, longitudZona, separacion } = {}) {
  const L = num(longitudZona); const s = num(separacion)
  if (L === null || s === null || s <= 0) {
    const que = [L === null ? 'longitud de la zona' : null, s === null || s <= 0 ? 'separación de estribos' : null].filter(Boolean).join(' y ')
    return {
      nombre,
      cantidad: requiereDefinicion({
        que: `zona «${nombre}»: ${que}`,
        unidad: 'u',
        porque: 'la separación sale del cálculo de corte y del detallado de confinamiento, y la extensión de la zona crítica la fija el reglamento sismorresistente desde la cara del apoyo. Ninguna de las dos se deduce de las medidas de la viga.',
        quienDefine: DEFINE.NORMA,
      }),
    }
  }
  return {
    nombre,
    longitudZona: L,
    separacion: s,
    cantidad: magnitud({
      valor: Math.floor(L / s) + 1, unidad: 'u', clase: CLASE.CALCULADO, respaldo: RESPALDO.NORMA,
      formula: '⌊longitud de la zona / separación⌋ + 1 (el +1 cuenta el estribo del extremo inicial)',
      entradas: { longitudZona: L, separacion: s },
    }),
  }
}

/**
 * LA ARMADURA COMPLETA DE UNA VIGA: los dos grupos longitudinales y los estribos por zona.
 *
 * Devuelve el peso total de acero SÓLO si no quedó ningún hueco. Con un hueco abierto el total sale
 * `null` — un peso de acero al que le falta la zona crítica es un peso que alguien va a cotizar
 * creyendo que está completo, y eso es peor que no tenerlo.
 */
export function armaduraViga({ anchoViga, altoViga, superior = null, inferior = null, estribo = null, zonas = [], densidad = DENSIDAD_ACERO_KG_M3 } = {}) {
  const grupos = [
    grupoLongitudinal({ posicion: 'superior', ...(superior ?? {}), densidad }),
    grupoLongitudinal({ posicion: 'inferior', ...(inferior ?? {}), densidad }),
  ]
  const est = estriboDesarrollado({ anchoViga, altoViga, ...(estribo ?? {}), densidad })
  const porZona = (zonas.length > 0 ? zonas : [{ nombre: 'no crítica' }, { nombre: 'crítica' }]).map(estribosEnZona)

  const nEstribos = porZona.reduce((a, z) => (esHueco(z.cantidad) || a === null ? null : a + z.cantidad.valor), 0)
  const pesoEstribos = nEstribos !== null && est.pesoUnitario
    ? magnitud({
      valor: nEstribos * est.pesoUnitario.valor, unidad: 'kg', clase: CLASE.CALCULADO, respaldo: RESPALDO.NORMA,
      formula: 'cantidad total de estribos × peso de cada estribo',
      entradas: { cantidadEstribos: nEstribos, pesoUnitarioKg: est.pesoUnitario.valor },
    })
    : requiereDefinicion({
      que: 'peso de los estribos',
      unidad: 'kg',
      porque: 'falta al menos una de las definiciones que lo componen — ver los huecos de estribo y zonas.',
      quienDefine: DEFINE.NORMA,
    })

  const parciales = [grupos[0].peso, grupos[1].peso, pesoEstribos]
  const pesoTotal = parciales.some(esHueco) || parciales.some((p) => !p)
    ? requiereDefinicion({
      que: 'peso total de acero de la viga',
      unidad: 'kg',
      porque: 'no se totaliza una armadura incompleta: un total al que le falta un renglón se cotiza como si estuviera completo.',
      quienDefine: DEFINE.NORMA,
    })
    : magnitud({
      valor: parciales.reduce((a, p) => a + p.valor, 0), unidad: 'kg', clase: CLASE.CALCULADO, respaldo: RESPALDO.NORMA,
      formula: 'armadura superior + armadura inferior + estribos',
      entradas: { superior: grupos[0].peso.valor, inferior: grupos[1].peso.valor, estribos: pesoEstribos.valor },
    })

  return { superior: grupos[0], inferior: grupos[1], estribo: est, zonas: porZona, cantidadEstribos: nEstribos, pesoEstribos, pesoTotal }
}

/**
 * EL CÓMPUTO DE UNA VIGA, ENTERO: rubro, subtipo, volumen y armadura.
 *
 * El volumen sale siempre que estén las tres medidas; la armadura sale con los huecos que tenga. Se
 * devuelven juntos a propósito: una viga computada en hormigón y sin acero definido es un estado
 * legítimo del trabajo —y muy común a la hora de cotizar—, siempre que se vea que le falta.
 */
export function computarVigaHA(entrada = {}, opciones = {}) {
  const { subtipo = null, ancho, alto, longitud, cantidad = 1, unidad = 'm' } = entrada
  const subtipoOk = Object.values(SUBTIPO_VIGA).includes(subtipo)
  const hormigon = volumenViga({ ancho, alto, longitud, cantidad, unidad })
  const acero = armaduraViga({
    anchoViga: ancho, altoViga: alto,
    superior: entrada.superior, inferior: entrada.inferior, estribo: entrada.estribo, zonas: entrada.zonas ?? [],
    densidad: entrada.densidadAcero ?? DENSIDAD_ACERO_KG_M3,
  })
  return {
    tarea: 'VIGA_HORMIGON_ARMADO',
    subtipo: subtipoOk ? subtipo : null,
    subtipoNota: subtipoOk ? null : `Subtipo no declarado o desconocido. Los que el OS distingue son: ${Object.values(SUBTIPO_VIGA).join(', ')}. Sin subtipo la viga no se puede comparar contra el histórico correcto.`,
    rubro: rubroDe({
      tareaTipoId: entrada.tareaTipoId, tareaTipoCodigo: entrada.tareaTipoCodigo,
      rubroDeclarado: entrada.rubro ?? RUBRO_VIGAS,
    }, opciones.baseMaestra),
    hormigon,
    acero,
    faltantes: hormigon.faltantes ?? [],
    imposibles: hormigon.imposibles ?? [],
  }
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// LA CUANTÍA — el único camino de volumen a kilos que ECSAS tiene DOCUMENTADO, y no es una norma.
//
// ═══ DE DÓNDE SALE ═══
//
// De los propios análisis de la empresa, congelados en `cotizacion_partida_composicion`. Las
// partidas se llaman literalmente «VIGA DE ENCADENADO H17 - FE 100 KG/M3» y «COLUMNA DE CARGA H17 -
// FE 190 KG/M3», y su composición lleva HIERRO TORSIONADO en kg por m³ de hormigón. Es decir: la
// empresa ya cotiza el acero por cuantía, y lo hace hace años.
//
// ═══ POR QUÉ NO ES UN ATAJO PARA SALTEARSE EL DETALLADO ═══
//
// Una cuantía es un promedio de otro proyecto. Sirve para PRESUPUESTAR —y ahí es legítima y es lo
// que se usa—, no para saber cuántas barras van ni cómo se doblan. Por eso este camino sale marcado
// `EXPERIENCIA ECSAS` + `REQUIERE_VALIDACION`, nunca `NORMA/FORMULA`, y por eso NO reemplaza a
// `armaduraViga`: los dos conviven y dicen cosas distintas. Confundirlos es cómo un presupuesto
// termina siendo tratado como un plano.
//
// Y la cuantía **no se inventa**: o la declara quien computa, o se lee de un análisis que ya la
// tiene. Sin ninguna de las dos, hueco.

/**
 * KILOS DE ACERO POR CUANTÍA: volumen de hormigón × kg/m³.
 *
 * `cuantiaKgM3` tiene que venir declarada con su origen. `origen` es obligatorio en los hechos: sin
 * él no se puede distinguir «la cuantía de esta obra» de «la cuantía de otra parecida», y ésa es
 * justo la diferencia que decide si el número sirve.
 */
export function aceroPorCuantia({ volumenHormigon, cuantiaKgM3, origen = null } = {}) {
  const v = num(volumenHormigon?.valor ?? volumenHormigon)
  const q = num(cuantiaKgM3)
  if (q === null) {
    return requiereDefinicion({
      que: 'cuantía de acero, en kg por m³ de hormigón',
      unidad: 'kg/m3',
      porque: 'la cuantía es un promedio de proyecto: sale del análisis de la partida o del cálculo estructural, y no se deduce de las medidas de la viga. ECSAS la declara en el nombre de sus propias partidas — de ahí se lee, no de una tabla general.',
      quienDefine: DEFINE.DUENO,
    })
  }
  if (v === null) return requiereDefinicion({ que: 'volumen de hormigón', unidad: 'm3', porque: 'sin volumen no hay a qué aplicarle la cuantía.', quienDefine: DEFINE.CARGA })
  return magnitud({
    valor: v * q,
    unidad: 'kg',
    // REQUIERE_VALIDACION Y NO CALCULADO: la multiplicación es exacta, pero el número que entra es
    // un promedio prestado. Lo que hay que validar no es la cuenta, es que la cuantía aplique acá.
    clase: CLASE.REQUIERE_VALIDACION,
    respaldo: RESPALDO.EXPERIENCIA,
    formula: 'volumen de hormigón × cuantía de acero',
    entradas: { volumenM3: v, cuantiaKgM3: q },
    fuente: origen ?? 'cuantía declarada sin origen — decir de qué obra o análisis salió',
  })
}

/**
 * LA CUANTÍA QUE YA ESTÁ EN UN ANÁLISIS DE LA EMPRESA: kg de acero por unidad, cuando la unidad de
 * la partida es m³. Se lee de la composición congelada, no se propone.
 *
 * Devuelve `null` —y no un hueco— cuando el análisis no tiene hierro: eso no es una definición que
 * falte, es una partida que no lleva acero.
 */
export function cuantiaDeLaComposicion(composicion = [], { unidadPartida = 'm3', patronAcero = /hierro|acero|malla/i } = {}) {
  if (unidadPartida !== 'm3') return null
  const kg = composicion
    .filter((l) => l.tipo === 'material' && (l.unidad ?? '').toLowerCase() === 'kg' && patronAcero.test(l.recurso_nombre ?? l.nombre ?? ''))
    .reduce((a, l) => a + (num(l.cantidad) ?? 0) * (1 + (num(l.desperdicio) ?? 0)), 0)
  if (kg <= 0) return null
  return magnitud({
    valor: kg,
    unidad: 'kg/m3',
    clase: CLASE.EXTRAIDO,
    respaldo: RESPALDO.EXPERIENCIA,
    formula: 'suma de los materiales de acero del análisis, en kg por unidad de partida',
    entradas: { unidadPartida },
    fuente: 'composición congelada del presupuesto — análisis propio de ECSAS',
  })
}
