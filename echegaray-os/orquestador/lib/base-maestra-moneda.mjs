// LA MONEDA DEL RECURSO, QUE EL LIBRO NO TIENE COLUMNA PARA DECLARAR. NÚCLEO PURO: SIN FS NI BASE.
//
// ═══ EL DEFECTO QUE ESTE MÓDULO EXISTE PARA TAPAR (28/08/2026) ═══
//
// `Planilla para Cotizar (2).xlsm` no tiene columna MONEDA. Tiene nueve recursos cuyo precio está
// en DÓLARES y lo declaran en el NOMBRE:
//
//   0.1   OFICIAL ESPECIALIZADO - EN DOLARES        4,50   (hs)
//   255.1 CARGA SOCIAL OF E - DOLAR                 4,00   (hr)
//   278.1 GAS OIL - DOLAR                           1,50   (Lt)
//   334   COSTO HORA BOBCAT S650 - DOLAR           16,58   (DOLAR)
//   335   COSTO PUNTA MARTILLO - DOLAR            478,00   (DOLAR)
//   336   COSTO HORA MARTILLO BOBCAT - DOLAR        5,00   (DOLAR)
//
// `base-maestra-xlsm.mjs` los importa como PESOS, porque no tiene con qué saber otra cosa. La
// tarea T1126.1 —ALQUILER BOBCAT con MARTILLO— está compuesta ENTERAMENTE por esos seis recursos
// y su costo unitario da 38,27. Treinta y ocho pesos la hora de bobcat con martillo.
//
// El libro lo arreglaba afuera: `Presupuesto!G37`, la columna COEF. AJUSTE, vale **1450**, y
// 38,27 × 1450 = 55.492 $/hora, que sí es un precio de bobcat. Ese 1450 NO es un markup, NO es un
// coeficiente de productividad y NO es una decisión comercial: **es el tipo de cambio**, escrito
// donde va un multiplicador cualquiera. Migrar `coef_ajuste = 1450` sin decir qué es deja el
// número mágico adentro del sistema nuevo, que es exactamente el problema que se venía a resolver.
//
// ═══ EL TIPO DE CAMBIO YA ESTÁ EN EL LIBRO, DISFRAZADO DE RECURSO ═══
//
// La fila 341 de `Recursos` dice: código 330 · «DOLAR BCO NACION - VENTA» · unidad `$` · costo
// 1500 · fecha 45931 (01/10/2025) · fuente «BCO NACION». Eso no es un insumo de obra: es una
// COTIZACIÓN, con su valor, su fecha y su fuente. Se extrae como lo que es.
//
// Y deja a la vista un conflicto que ningún control veía: el libro cotiza el dólar a **1500** y
// aplica **1450** en la partida. Cincuenta pesos de diferencia sobre 32 horas de bobcat.
//
// ═══ POR QUÉ NO SE INFIERE MÁS DE LO QUE SE PUEDE PROBAR ═══
//
// Hay tres recursos que MENCIONAN dólares y cuyo precio está en pesos:
//
//   ALQUILER MINI EXCAVADORA - 275 DOLARES EL DIAL      308.270
//   MINI EXCAVADORA - 367 DOLAR EL DIA                  532.150
//   VIBRO COMPACTADOR NIWA 643 - EN DOLARES 10 MIL DOLARES  7.350
//
// El nombre documenta una referencia («cuesta 275 dólares el día») y el costo está en pesos —o no,
// porque 7.350 no es ni una cosa ni la otra. La regla que los separa es mecánica y no adivina: un
// marcador de moneda cuenta cuando es un SUFIJO CALIFICADOR —lo último que dice el nombre, sin
// cifras después—; cuando viene pegado a un número es una NOTA, y la moneda queda `AMBIGUA`. No
// `ARS`: ambigua. Poner ARS ahí sería subir la cobertura inventando.
//
// LO QUE ESTE MÓDULO NO HACE: no convierte. Dice en qué moneda está cada precio y cuál es el tipo
// de cambio que el libro declara. La conversión la decide `base-maestra-ajuste.mjs`, que además
// tiene que dejar escrito con qué cotización la hizo.

/** Las monedas que el libro puede declarar. `AMBIGUA` es un estado, no un default. */
export const MONEDA = Object.freeze({ ARS: 'ARS', USD: 'USD', AMBIGUA: 'AMBIGUA' })

/** Cuánto se le cree a la lectura. Gobierna si un ajuste puede clasificarse como FX. */
export const CONFIANZA = Object.freeze({ ALTA: 'ALTA', MEDIA: 'MEDIA', BAJA: 'BAJA' })

/** Texto comparable: sin acentos, en mayúscula, con los espacios colapsados. PURA. */
export const normalizar = (s) => String(s ?? '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/\s+/g, ' ').trim().toUpperCase()

/** Las unidades que sólo pueden medir dinero extranjero. `$` NO está: en el libro es peso. */
const UNIDADES_USD = new Set(['DOLAR', 'DOLARES', 'USD', 'U$S', 'US$', 'DOLAR US'])

/**
 * El sufijo calificador: el nombre se corta por su último separador y lo que queda tiene que ser
 * EXACTAMENTE la moneda. «… - DOLAR» califica; «… - EN DOLARES 10 MIL DOLARES» no, porque el
 * tramo final trae una cifra y eso es una nota de referencia, no una declaración de moneda.
 */
const SOLO_MONEDA = /^(?:EN\s+)?(?:DOLAR|DOLARES|USD|U\$S|US\$)$/
const colaDe = (n) => {
  const corte = Math.max(...['-', '–', '—', '·', '|', ',', '('].map((sep) => n.lastIndexOf(sep)))
  return (corte >= 0 ? n.slice(corte + 1) : n).trim()
}

/** Una mención con cifra: «275 DOLARES EL DIA», «10 MIL DOLARES». Documenta, no declara. */
const MENCION_USD = /(?:DOLAR|DOLARES|USD|U\$S|US\$)/

/**
 * ¿EN QUÉ MONEDA ESTÁ ESTE PRECIO? PURA.
 *
 * El orden es de evidencia más fuerte a más débil: la unidad manda, después el sufijo del nombre,
 * y por último la mención suelta, que no alcanza para decidir nada.
 *
 * @param {{nombre?:string|null, unidad?:string|null, fuente?:string|null}} r
 * @returns {{moneda:string, confianza:string, porque:string}}
 */
export function monedaDe({ nombre = null, unidad = null } = {}) {
  const u = normalizar(unidad)
  const n = normalizar(nombre)
  if (UNIDADES_USD.has(u)) {
    return { moneda: MONEDA.USD, confianza: CONFIANZA.ALTA, porque: `la unidad es «${u}»` }
  }
  if (SOLO_MONEDA.test(colaDe(n))) {
    return { moneda: MONEDA.USD, confianza: CONFIANZA.ALTA, porque: `el nombre termina declarando la moneda («${colaDe(n)}»)` }
  }
  if (MENCION_USD.test(n)) {
    return {
      moneda: MONEDA.AMBIGUA,
      confianza: CONFIANZA.BAJA,
      porque: 'el nombre menciona dólares pegados a una cifra: documenta una referencia, no declara la moneda del precio',
    }
  }
  return { moneda: MONEDA.ARS, confianza: CONFIANZA.MEDIA, porque: 'el libro no declara moneda y ninguna señal dice otra cosa' }
}

/**
 * ¿ESTA FILA DE `Recursos` ES UNA COTIZACIÓN DE MONEDA Y NO UN INSUMO? PURA.
 *
 * Se exige que el nombre ABRA con la moneda («DOLAR BCO NACION - VENTA») y no que la mencione: un
 * «GAS OIL - DOLAR» también tiene la palabra y es combustible. Con eso, el libro entero produce
 * exactamente una: la fila 341.
 */
export function esCotizacionDeMoneda({ nombre = null } = {}) {
  return /^(?:DOLAR|DOLARES|USD|U\$S|US\$|TIPO DE CAMBIO)\b/.test(normalizar(nombre))
}

/**
 * EL TIPO DE CAMBIO COMO ENTIDAD FECHADA, no como número suelto. PURA.
 *
 * Devuelve `null` cuando el libro no declara ninguno: sin cotización no se convierte nada, y una
 * conversión con un tipo de cambio inventado es peor que no convertir.
 *
 * @param {Array<{codigo?:string, nombre?:string, unidad?:string, costo?:number|null, fecha?:string|null, fuente?:string|null, fila?:number}>} recursos
 * @returns {{valor:number, fecha:string|null, fuente:string|null, moneda:string, origen:string, codigo:string|null}|null}
 */
export function tipoDeCambioDeLibro(recursos = []) {
  const candidatos = recursos
    .filter((r) => esCotizacionDeMoneda(r) && typeof r.costo === 'number' && Number.isFinite(r.costo) && r.costo > 0)
    // El más reciente gana: una cotización vieja al lado de una nueva no es un conflicto, es historia.
    .sort((a, b) => String(b.fecha ?? '').localeCompare(String(a.fecha ?? '')))
  const c = candidatos[0]
  if (!c) return null
  return {
    valor: c.costo,
    fecha: c.fecha ?? null,
    fuente: c.fuente ? String(c.fuente).trim() : null,
    moneda: MONEDA.USD,
    codigo: c.codigo ?? null,
    origen: `Recursos!${c.fila ?? '?'} · ${c.nombre ?? ''}`.trim(),
  }
}

/**
 * PRECIO OBSERVADO ≠ COSTO PRESUPUESTARIO — y se guardan los dos. PURA.
 *
 * El libro ya hace esta cuenta en `Análisis!F` (`costo × (1 + desperdicio)`) y guarda sólo el
 * resultado. Guardar sólo el resultado impide después contestar «¿el cemento subió, o subió el
 * desperdicio que le cargamos?», que son dos decisiones distintas con dos dueños distintos.
 *
 * @returns {{observado:number, desperdicio:number, presupuestario:number, moneda:string}}
 */
export function costoPresupuestario({ observado, desperdicio = 0, moneda = MONEDA.ARS } = {}) {
  if (typeof observado !== 'number' || !Number.isFinite(observado)) {
    throw new TypeError('costoPresupuestario: el precio observado tiene que ser un número')
  }
  const d = typeof desperdicio === 'number' && Number.isFinite(desperdicio) ? desperdicio : 0
  if (d < 0 || d >= 1) throw new RangeError(`costoPresupuestario: desperdicio ${d} no es una fracción (0 ≤ d < 1)`)
  return { observado, desperdicio: d, presupuestario: observado * (1 + d), moneda }
}

/**
 * LA MONEDA DE UNA COMPOSICIÓN ENTERA. PURA.
 *
 * Es lo que habilita a decir que un coeficiente es tipo de cambio: si TODAS las líneas de la
 * partida están en dólares, multiplicar la partida por ~1450 sólo puede ser convertir. Si una sola
 * línea está en pesos, ya no se puede afirmar y el resultado es `MIXTA`.
 *
 * @param {Array<{moneda:string}>} lineas
 * @returns {{moneda:string, homogenea:boolean, porque:string, conteo:Record<string,number>}}
 */
export function monedaDeComposicion(lineas = []) {
  const conteo = {}
  for (const l of lineas) conteo[l.moneda] = (conteo[l.moneda] ?? 0) + 1
  const presentes = Object.keys(conteo)
  if (presentes.length === 0) {
    return { moneda: MONEDA.AMBIGUA, homogenea: false, porque: 'la composición no tiene líneas', conteo }
  }
  if (presentes.length === 1) {
    return { moneda: presentes[0], homogenea: true, porque: `las ${lineas.length} líneas están en ${presentes[0]}`, conteo }
  }
  return {
    moneda: 'MIXTA',
    homogenea: false,
    porque: `la composición mezcla ${presentes.join(' y ')}: ${JSON.stringify(conteo)}`,
    conteo,
  }
}
