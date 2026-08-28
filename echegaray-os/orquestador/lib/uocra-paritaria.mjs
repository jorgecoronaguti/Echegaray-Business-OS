// LA PARITARIA UOCRA ES EL DRIVER DE TODA PROYECCIÓN SALARIAL — OBRA, OFICINA Y DIRECCIÓN.
//
// ═══ LA ORDEN QUE ESTE MÓDULO EJECUTA (07/08/2026) ═══
//
// El dueño, textual: *"en la pestaña 'jornales por quincena' necesito q las proyecciones en 'oficina'
// y 'direccion' sean tomando el porcentaje de incremento en uocra, por mas q no esten en ese gremio y
// convenio y no tengan categoria"*. Y antes: *"buscar en web la escala salarial de uocra y aplicarla
// al archivo considera cada categoria de empleado y hace la proyeccion"*.
//
// O sea: UN solo driver para los tres bloques, y ese driver es EL PORCENTAJE DE LA PARITARIA. No el
// IPC (son series distintas), y —esto es lo que cambia hoy— tampoco el promedio medido sobre los
// básicos publicados, que es lo que venía haciendo el motor y daba 5,21%/mes.
//
// ═══ POR QUÉ EL 5,21% SE VA, AUNQUE ERA UN NÚMERO MEDIDO ═══
//
// El parámetro `AUMENTO_SALARIAL_ESPERADO` valía 5,21%/mes y llevaba pegado un "⚠ A CONFIRMAR POR EL
// DUEÑO". Salía de una medición honesta —el promedio geométrico del básico de Ayudante sobre los
// últimos seis acuerdos— pero medía OTRA COSA que la que gobierna la proyección:
//
//   · el RÓTULO del acuerdo de agosto dice +1,9%;
//   · el BÁSICO publicado de Ayudante pasó de $4.948 (julio) a $5.399 (agosto): +9,11%.
//
// Los dos son ciertos. La diferencia son SUMAS NO REMUNERATIVAS que el básico publicado absorbe y que
// la tabla no trae por separado (su propio pie de página lo dice). Proyectar el semestre al 5,21%
// mensual era extrapolar una absorción que ya ocurrió, mes tras mes, hasta diciembre.
//
// El dueño resolvió el ⚠: el driver es el PORCENTAJE DE LA PARITARIA. Eso hace la proyección un PISO
// declarado —si vuelven a incorporarse sumas al básico, el costo real va a estar por encima— y esa
// limitación se declara donde se lee, no se compensa con un número inventado. Ver `GAP_SUMAS_NR`.
//
// ═══ EL DATO, VERIFICADO Y CON FECHA ═══
//
// Escala Zona A (San Juan es Zona A), CCT 76/75, acuerdo UOCRA–Camarco–FAEC, VERIFICADA el 07/08/2026
// contra dos fuentes coincidentes. Acá NO vive para que la pestaña la lea —la pestaña lee la réplica
// viva `_UOCRA_RAW`, que se actualiza sola— sino para CONTROLARLA: un IMPORTHTML que se cae devuelve
// una tabla vieja o vacía sin dar un solo error, y entonces el piso del convenio queda desactualizado
// en silencio. `contrastarEscala` es el único que puede notarlo, porque compara contra algo que la
// réplica no produjo.
//
// UN CONTROL NUNCA SE VALIDA CONTRA LA MISMA INFORMACIÓN QUE PRODUCE: por eso el número está acá y no
// se deriva de `_UOCRA_RAW`.

/** El convenio y la zona que aplican a Echegaray. San Juan es Zona A. */
export const CCT = '76/75'
export const ZONA = 'A'
/** Cuándo se verificó la escala de abajo, y contra qué. Sin esto el dato no se puede auditar. */
export const VERIFICADA_EL = '07/08/2026'
export const FUENTES = [
  'construar.com.ar — escala paritaria agosto 2026',
  'cobertura del acuerdo UOCRA–Camarco–FAEC (Perfil / El Cronista)',
]
/** El período de la escala verificada, en el mismo formato 'YYYY-MM' que usa el parser de acuerdos. */
export const PERIODO_VERIFICADO = '2026-08'
/** $/hora, Zona A, agosto 2026. */
export const ESCALA_VERIFICADA = {
  'Oficial Especializado': 7420,
  Oficial: 6348,
  'Medio Oficial': 5866,
  Ayudante: 5399,
}
/** El Sereno se paga por MES, no por hora: va aparte para que nadie lo compare contra un jornal. */
export const MENSUAL_VERIFICADO = { Sereno: 980858 }

/**
 * LOS TRAMOS FIRMADOS, acumulativos sobre el mes anterior. Vigencia del acuerdo: hasta el 31/08/2026.
 * Después de esa fecha NO hay paritaria firmada — lo que salga de acá es PROYECCIÓN, y se rotula así.
 */
export const TRAMOS_FIRMADOS = [
  { periodo: '2026-06', pct: 0.021 },
  { periodo: '2026-07', pct: 0.020 },
  { periodo: '2026-08', pct: 0.019 },
]
export const VIGENCIA_HASTA = '31/08/2026'
/** El último tramo conocido. Es lo que se repite cuando no hay acuerdo, y se declara como proyección. */
export const ULTIMO_TRAMO = TRAMOS_FIRMADOS[TRAMOS_FIRMADOS.length - 1].pct

export const ORIGEN_ACUERDO = 'acuerdo'
export const ORIGEN_PROYECCION = 'proyección'

/**
 * EL GAP QUE NO SE ESTIMA. El acuerdo prevé además sumas no remunerativas mensuales en dos cuotas
 * quincenales cuyo MONTO no tenemos. No se inventa un número: se declara que la proyección es un piso.
 */
export const GAP_SUMAS_NR = 'el acuerdo prevé sumas no remunerativas en cuotas quincenales cuyo monto '
  + 'no tenemos: la proyección por el % de paritaria es un PISO, no un techo'

/**
 * LA EQUIVALENCIA ENTRE LA CATEGORÍA DE LA PLANILLA Y LA DEL CONVENIO — DECLARADA POR EL DUEÑO.
 *
 * Hasta hoy esta tabla NO EXISTÍA y el motor se negaba a inventarla: dejaba una columna vacía para que
 * el dueño la cargara a mano, y mientras tanto el control contra el convenio no podía hablar. El
 * 07/08 el dueño mandó el plantel con su categoría al lado, y eso es la tabla.
 *
 * El sufijo "M" es obra metalúrgica (UOM Rama 17) — otro gremio y otro convenio. Se mapea igual, por
 * orden explícita: *"por mas q no esten en ese gremio y convenio"*. Lo que se toma prestado es el
 * ESCALÓN, no el piso legal: por eso el control de convenio muestra el margen y no dice "en falta".
 *
 * Un código que no esté acá NO se adivina: la fila queda sin equivalente y el bloque lo dice contado.
 */
export const CONVENIO_POR_CODIGO = {
  OF: 'Oficial',
  'OF M': 'Oficial',
  A: 'Ayudante',
  'A M': 'Ayudante',
  // ═══ LOS DOS CÓDIGOS QUE APARECIERON EN LA QUINCENA 17/08–31/08 (28/08/2026) ═══
  //
  // El dueño: *"revisa bien el sheet jornales porque algunos empleados tienen aumento de categoria"*.
  // Los tenía razón: en el bloque 526-543 de «Obreros 26» hay dos códigos que esta tabla no conocía,
  // y sin ellos `convenioDe` devuelve null, la persona se queda SIN PISO y el control de convenio no
  // la puede mirar. Tres personas quedaban afuera.
  //
  // · `OF E` — Pastran Marcelo y Quiroga Sebastián SUBIERON de Oficial a Oficial Especializado.
  //   La lectura es directa: E = Especializado, y la escala UOCRA tiene esa categoría.
  //
  // · `M OF` — Castillo Carlos, alta del 19/08. **ESTO ES UNA INFERENCIA, NO UN HECHO.** Se lee como
  //   Medio Oficial —la escala la tiene, y la M va ADELANTE, al revés de `OF M`/`A M` donde la M del
  //   final era el gremio metalúrgico— pero nadie lo declaró. Se aplicó bajo pedido explícito del
  //   dueño de aplicar el cuadro, con la lectura declarada en el mensaje del 28/08 y sin respuesta
  //   en contra. **Define el piso de una persona: si es otra cosa, se corrige acá y se rehace.**
  'OF E': 'Oficial Especializado',
  'M OF': 'Medio Oficial',
}

/**
 * ═══ CUÁNTO SE AUMENTA LA HORA — DECISIÓN DEL DUEÑO, 28/08/2026 ═══
 *
 * *"quiero aumentarles el 50% de lo q pide el piso de uocra"*, después de rechazar explícitamente la
 * primera lectura: *"te pedi el 50% del piso no el 1,5, hiciste todo lo contrario"*.
 *
 * EL AUMENTO ES UN MONTO, NO UN MULTIPLICADOR DEL PISO. A lo que cada uno cobra HOY se le suma el
 * 50% del básico de convenio de SU categoría. No es `piso × 1,5` —eso borraría lo que cada uno
 * negoció y le daría lo mismo al que cobra 4.500 que al que cobra 6.500— y tampoco es `piso × 0,5`,
 * que sería una rebaja del 42% y dejaría a los 17 por debajo del mínimo legal.
 *
 * Que el aumento se calcule sobre el PISO y no sobre el sueldo de cada uno es lo que lo hace parejo
 * dentro de una categoría: dos oficiales reciben el mismo monto aunque partan de jornales distintos.
 *
 * MAGNITUD, medida sobre la quincena 17/08–31/08 real (17 personas, 1.496 h): la masa pasa de
 * $8.049.700 a $12.719.379, **+$4.669.679 por quincena**. Anualizado sobre 24 quincenas y con las
 * cargas sociales del 38,62% que sale del F931 real: **+$155.379.240**.
 */
export const PORCENTAJE_DE_AUMENTO = 0.5

/**
 * NÚCLEO PURO: la hora que se paga después del aumento.
 *
 * `jornal` es lo que la persona cobra hoy; `basico` es el de su categoría en la escala vigente.
 * Devuelve `null` cuando no hay básico — y `null` NO es cero: "no sé cuánto le corresponde" y "le
 * corresponde nada" son afirmaciones distintas, y publicar la segunda sería falso.
 *
 * EL PISO SIGUE SIENDO UN PISO. El resultado nunca puede quedar por debajo del básico de convenio:
 * el aumento es una decisión de la empresa, el mínimo es una obligación legal. Hoy ninguno de los 17
 * queda cerca de esa frontera, pero un jornal bajo lo suficiente la cruzaría sin que nadie mire.
 */
export function jornalConAumento(jornal, basico, porcentaje = PORCENTAJE_DE_AUMENTO) {
  if (basico == null || !Number.isFinite(Number(basico))) return null
  // `Number(null)` es 0 y `Number('')` también: sin esta línea, un porcentaje NO DECLARADO entraba
  // como "cero por ciento" y la pestaña publicaba "aumento aplicado" con aumento de cero. Lo detectó
  // el test negativo, no yo. NULL NO ES CERO, tampoco cuando JavaScript insiste en que sí.
  if (porcentaje == null || porcentaje === '' || typeof porcentaje === 'boolean'
    || !Number.isFinite(Number(porcentaje)) || Number(porcentaje) < 0) {
    throw new TypeError(`un aumento de ${porcentaje} sobre el piso no describe ningún acuerdo salarial`)
  }
  const base = Number.isFinite(Number(jornal)) ? Number(jornal) : 0
  return Math.max(base + Number(basico) * Number(porcentaje), Number(basico))
}


/** NÚCLEO PURO: a qué categoría del convenio equivale un código de la planilla, o null. */
export function convenioDe(codigo, tabla = CONVENIO_POR_CODIGO) {
  const k = String(codigo ?? '').replace(/\s+/g, ' ').trim().toUpperCase()
  const hit = Object.entries(tabla).find(([c]) => c.toUpperCase() === k)
  return hit ? hit[1] : null
}

const ES_PERIODO = /^\d{4}-(0[1-9]|1[0-2])$/
const firmadoDe = (periodo) => TRAMOS_FIRMADOS.find((t) => t.periodo === periodo) ?? null

/**
 * NÚCLEO PURO: los períodos 'YYYY-MM' que van DESPUÉS de `desde` y hasta `hasta` inclusive.
 * El extremo abierto de la izquierda es lo que hace que el mes base entre con factor 1 exacto.
 */
export function periodosEntre(desde, hasta) {
  if (!ES_PERIODO.test(String(desde)) || !ES_PERIODO.test(String(hasta)) || hasta <= desde) return []
  const out = []
  let [y, m] = String(desde).split('-').map(Number)
  for (let i = 0; i < 240; i++) {
    m += 1
    if (m > 12) { m = 1; y += 1 }
    const p = `${y}-${String(m).padStart(2, '0')}`
    out.push(p)
    if (p >= hasta) break
  }
  return out
}

/**
 * NÚCLEO PURO: el tramo de paritaria de un mes, con su origen declarado.
 *
 * ORDEN DE PRECEDENCIA, Y NO ES CAPRICHOSO:
 *   1. la RÉPLICA VIVA (`_UOCRA_RAW`, ya parseada): si mañana se firma un acuerdo nuevo, entra solo y
 *      sin tocar código. Una constante en el repo no puede ganarle a un acuerdo posterior.
 *   2. los TRAMOS FIRMADOS verificados acá: cubren el caso de que la réplica se haya caído.
 *   3. PROYECCIÓN: se repite el último tramo conocido, y la fila lo dice.
 *
 * @param {string} periodo 'YYYY-MM'
 * @param {Array} escalones salida de parsearAcuerdos
 * @returns {{periodo:string, pct:number, origen:string, rotulo:string|null}}
 */
export function tramoDe(periodo, escalones = []) {
  const e = escalones.find((x) => x.periodo === periodo)
  if (e && typeof e.pctRotulo === 'number') {
    return { periodo, pct: e.pctRotulo, origen: ORIGEN_ACUERDO, rotulo: e.rotulo ?? null }
  }
  const f = firmadoDe(periodo)
  if (f) return { periodo, pct: f.pct, origen: ORIGEN_ACUERDO, rotulo: null }
  return { periodo, pct: ULTIMO_TRAMO, origen: ORIGEN_PROYECCION, rotulo: null }
}

/**
 * NÚCLEO PURO: EL FACTOR ACUMULADO DE PARITARIA ENTRE DOS MESES.
 *
 * Es el número que gobierna las tres proyecciones de la pestaña. Producto de (1 + tramo) sobre los
 * meses POSTERIORES a `desde` y hasta `hasta`: `factorUocraEntre('2026-05','2026-08')` da
 * 1,021 × 1,020 × 1,019.
 *
 * El mes base nunca se ajusta a sí mismo —factor 1 exacto— y ahí muere por construcción el doble
 * conteo que ya costó una reconstrucción del motor.
 *
 * Hacia atrás devuelve el recíproco: un mes anterior al base vale MENOS, que es lo correcto para un
 * retiro o un sueldo cuyo importe conocido es el de hoy.
 *
 * @returns {{factor:number, tramos:Array, mesesProyectados:number, firmado:boolean}|null}
 */
export function factorUocraEntre(desde, hasta, escalones = []) {
  if (!ES_PERIODO.test(String(desde)) || !ES_PERIODO.test(String(hasta))) return null
  if (desde === hasta) return { factor: 1, tramos: [], mesesProyectados: 0, firmado: true }
  const haciaAdelante = hasta > desde
  const tramos = (haciaAdelante ? periodosEntre(desde, hasta) : periodosEntre(hasta, desde))
    .map((p) => tramoDe(p, escalones))
  const bruto = tramos.reduce((f, t) => f * (1 + t.pct), 1)
  const proyectados = tramos.filter((t) => t.origen === ORIGEN_PROYECCION).length
  return {
    factor: haciaAdelante ? bruto : 1 / bruto,
    tramos,
    mesesProyectados: proyectados,
    firmado: proyectados === 0,
  }
}

/**
 * NÚCLEO PURO: EL CONTROL DE LA RÉPLICA CONTRA LA ESCALA VERIFICADA.
 *
 * Devuelve las diferencias en palabras. Vacío = la réplica coincide con lo que se verificó el
 * 07/08/2026 y el piso del convenio que muestra la pestaña es el bueno. Si el IMPORTHTML se cayó o el
 * sitio cambió de forma, esto lo dice — y es la única señal posible, porque una tabla vieja se ve
 * igual de sana que una al día.
 *
 * @param {Array} escalones salida de parsearAcuerdos
 * @returns {string[]}
 */
export function contrastarEscala(escalones = []) {
  const e = escalones.find((x) => x.periodo === PERIODO_VERIFICADO)
  // El desvío entra en un renglón de la pestaña (tope de 60 con su prefijo): el período dice todo, y
  // que ese es el escalón verificado lo declara `PERIODO_VERIFICADO`, acá al lado.
  if (!e) return [`la réplica no trae el escalón ${PERIODO_VERIFICADO}`]
  const dif = []
  for (const [cat, esperado] of Object.entries({ ...ESCALA_VERIFICADA, ...MENSUAL_VERIFICADO })) {
    const leido = e.categorias?.[cat]?.basico
    if (typeof leido !== 'number') { dif.push(`${cat}: la réplica no trae básico`); continue }
    if (Math.abs(leido - esperado) > 0.5) dif.push(`${cat}: réplica ${leido} ≠ verificado ${esperado}`)
  }
  return dif
}
