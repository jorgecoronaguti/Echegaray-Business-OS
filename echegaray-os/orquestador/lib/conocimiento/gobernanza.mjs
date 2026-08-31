// LA PUERTA ENTRE «LO OBSERVAMOS» Y «LO USAMOS PARA COTIZAR».
//
// `promocion.mjs` ya arma el candidato, calcula su madurez y corre la regresión. Lo que faltaba —y
// es lo que este archivo agrega— es el PREDICADO EXPLÍCITO que decide si ese candidato puede pasar a
// ser norma, con cada condición nombrada por separado y con su motivo. Un booleano que sale de una
// expresión larga no se puede discutir en una reunión; una lista de controles con nombre, sí.
//
// ═══ LAS CUATRO COSAS QUE ACÁ SE APRIETAN Y EN `promocion.mjs` NO ESTABAN ═══
//
// 1. **ANTIGÜEDAD.** Un rendimiento medido hace tres años no describe a la empresa de hoy: cambió la
//    cuadrilla, el equipo y el convenio. La muestra tiene una ventana (`date_range`) y la ventana
//    caduca. Sin esto, el aprendizaje envejece sin avisar — la capa fósil de siempre.
//
// 2. **DISPERSIÓN DESCONOCIDA NO ES DISPERSIÓN CERO.** Con una sola medición no hay desvío que
//    calcular y `estadistica()` devuelve `null`, que es lo honesto. Pero `null` no puede pasar el
//    control: «no se puede saber» no es «es consistente». Acá `null` BLOQUEA.
//
// 3. **LA REGRESIÓN TIENE QUE HABER SIDO CONTRA OTROS CASOS.** Medir el error de una regla contra
//    las mismas mediciones que la produjeron da siempre bien: es un control validado contra la
//    información que él mismo genera, que es exactamente lo que el CLAUDE.md prohíbe. Sólo cuenta
//    una regresión marcada `holdOut` (ver `regresion-aprendizaje.mjs`).
//
// 4. **LA CLASE E NO LA FIRMA UN PROGRAMA.** A observación · B recurrencia · C patrón probable ·
//    D conocimiento interno validado · E regla operativa aprobada. El bucle autónomo llega hasta D.
//    E lleva la firma del dueño, y sin ella el control da NO por diseño.
import { MADUREZ, DISPERSION_MAXIMA, decidirPromocion } from './promocion.mjs'

const ORDEN = Object.freeze({ A: 0, B: 1, C: 2, D: 3, E: 4 })

/**
 * LA POLÍTICA. Números, no criterio: para poder discutirlos hay que poder verlos juntos.
 *
 * `obrasMinimas` es 2 y no puede ser 1: dos frentes de la misma obra comparten cuadrilla, encargado,
 * terreno y clima. La regla ya la fijó `rendimiento_recomendado` («con UNA sola obra medida no hay
 * recomendación: hay un dato») y acá se respeta, no se reinventa.
 */
export const POLITICA = Object.freeze({
  muestraMinima: 3,
  obrasMinimas: 2,
  dispersionMaxima: DISPERSION_MAXIMA,
  antiguedadMaximaDias: 730,
  claseMinima: MADUREZ.D,
  exigeHoldOut: true,
})

/** Estados en los que puede estar un aprendizaje. `ACTIVO` es el único que cotiza. */
export const ESTADO = Object.freeze({
  CANDIDATO: 'CANDIDATO', APTO: 'APTO', ACTIVO: 'ACTIVO',
  RECHAZADO: 'RECHAZADO', REVERTIDO: 'REVERTIDO',
})

const fecha = (v) => {
  if (!v) return null
  const d = v instanceof Date ? v : new Date(v)
  return Number.isNaN(d.getTime()) ? null : d
}

const dia = (d) => (d ? d.toISOString().slice(0, 10) : null)

/**
 * LA VENTANA DE LA MUESTRA (`date_range`). PURA.
 *
 * Mira `desde`/`hasta` —o `fecha`— de cada pieza de evidencia. Devuelve `null` en los bordes cuando
 * no hay ninguna fecha: un candidato sin fechas no tiene ventana, y decir que su ventana es «hoy»
 * sería fabricar el dato que después decide si caducó.
 */
export function ventana(evidencia = []) {
  const ds = []
  for (const e of evidencia) {
    for (const v of [e?.desde, e?.hasta, e?.fecha]) {
      const f = fecha(v)
      if (f) ds.push(f)
    }
  }
  if (!ds.length) return { desde: null, hasta: null, dias: null }
  const min = new Date(Math.min(...ds)), max = new Date(Math.max(...ds))
  return { desde: dia(min), hasta: dia(max), dias: Math.round((max - min) / 86_400_000) + 1 }
}

/** Días desde la última medición de la muestra. `null` si la muestra no tiene fechas. */
export function antiguedadDias(v, hoy = new Date()) {
  const h = fecha(v?.hasta), ref = fecha(hoy)
  if (!h || !ref) return null
  return Math.round((ref - h) / 86_400_000)
}

/**
 * LAS MUESTRAS QUE PUEDEN SOSTENER UN APRENDIZAJE. PURA — el invariante HISTÓRICO ≠ VALIDADO.
 *
 * Estar en `rendimiento_historico` no convierte a una fila en experiencia:
 *  · `REFERENCIA` es la tabla del xlsm con la que se viene cotizando. Contarla como evidencia haría
 *    que el bucle aprenda de sí mismo y «confirme» la referencia con la referencia.
 *  · `DESCARTADO` es una fila que alguien ya retiró.
 * Las dos se cuentan aparte para que el descarte se vea, en vez de desaparecer del total.
 */
export function muestrasAdmisibles(filas = []) {
  const admisibles = [], referencia = [], descartadas = []
  for (const f of filas) {
    if (f?.estado === 'REFERENCIA') referencia.push(f)
    else if (f?.estado === 'DESCARTADO') descartadas.push(f)
    else admisibles.push(f)
  }
  return { admisibles, referencia, descartadas }
}

const control = (nombre, cumple, porQue) => ({ nombre, cumple: Boolean(cumple), porQue })

/**
 * ¿ESTE CANDIDATO PUEDE SER NORMA? PURA. Devuelve TODOS los controles, no sólo el que falló.
 *
 * `firmaDueno` es lo único que puede llevar un aprendizaje a clase E, y llega desde afuera: ninguna
 * rama de este archivo la puede producir sola.
 */
export function evaluarGobernanza({
  candidato: c, regresion: reg, politica = POLITICA, hoy = new Date(), firmaDueno = null,
} = {}) {
  const p = { ...POLITICA, ...politica }
  const est = c?.estadistica ?? {}
  const v = c?.ventana ?? ventana(c?.evidencia ?? [])
  const edad = antiguedadDias(v, hoy)
  const clase = c?.madurez ?? null

  const checks = [
    control('muestra', (est.n ?? 0) >= p.muestraMinima,
      `${est.n ?? 0} medición(es); hacen falta ${p.muestraMinima}`),
    // n = 1 NUNCA promueve, y dos mediciones de la MISMA obra no son dos obras: `obrasDistintas` ya
    // viene deduplicado por `candidato()`, y acá se exige el mínimo contra ese número y no contra n.
    control('obras-distintas', (c?.obrasDistintas ?? 0) >= p.obrasMinimas,
      `${c?.obrasDistintas ?? 0} obra(s) distinta(s); hacen falta ${p.obrasMinimas}`),
    control('dispersion', est.dispersion !== null && est.dispersion !== undefined && est.dispersion <= p.dispersionMaxima,
      est.dispersion === null || est.dispersion === undefined
        ? 'no se puede calcular la dispersión (una sola medición o media cero): desconocida no es cero'
        : `dispersión ${est.dispersion} contra un máximo de ${p.dispersionMaxima}`),
    control('antiguedad', edad !== null && edad <= p.antiguedadMaximaDias,
      edad === null
        ? 'la muestra no tiene fechas: no se puede saber si sigue vigente'
        : `la última medición es de hace ${edad} día(s); el máximo es ${p.antiguedadMaximaDias}`),
    control('clase', clase !== null && ORDEN[clase] >= ORDEN[p.claseMinima],
      `clase ${clase ?? '—'}; para ser norma hace falta ${p.claseMinima}`),
    control('regresion-hold-out', !p.exigeHoldOut || reg?.holdOut === true,
      reg?.holdOut === true
        ? 'la regla se probó contra casos que no la produjeron'
        : 'la regresión se corrió contra los mismos casos que produjeron la regla: no prueba nada'),
  ]

  // La parte que YA decidía `promocion.mjs` no se vuelve a escribir acá: se llama. Dos definiciones
  // del mismo control es cómo terminan conviviendo dos respuestas distintas a la misma pregunta.
  const previa = decidirPromocion({ candidato: c, regresion: reg, exigeMadurez: p.claseMinima })
  const soloRegresion = (previa.motivos ?? []).filter((m) => /regresi|empeoran|evidencia/.test(m))
  checks.push(control('regresion', soloRegresion.length === 0,
    soloRegresion.length ? soloRegresion.join(' · ') : `${reg?.casos ?? 0} caso(s) probados y ninguno empeora`))

  // La clase E no la alcanza el bucle: la firma el dueño. Un candidato que cumple todo llega a D.
  const claseAutorizada = firmaDueno ? MADUREZ.E : (clase && ORDEN[clase] > ORDEN[MADUREZ.D] ? MADUREZ.D : clase)
  checks.push(control('firma-del-dueno', p.claseMinima !== MADUREZ.E || Boolean(firmaDueno),
    p.claseMinima === MADUREZ.E && !firmaDueno
      ? 'la clase E es una regla operativa aprobada: la firma el dueño, no el bucle'
      : 'no se exige firma para esta clase'))

  const bloqueos = checks.filter((k) => !k.cumple)
  return {
    apto: bloqueos.length === 0,
    clase, claseAutorizada, ventana: v, antiguedadDias: edad,
    checks, bloqueos: bloqueos.map((k) => k.nombre),
    porQue: bloqueos.length
      ? bloqueos.map((k) => `${k.nombre}: ${k.porQue}`).join(' · ')
      : checks.map((k) => k.porQue).join(' · '),
    politica: p,
  }
}

/**
 * EL ESTADO QUE LE CORRESPONDE A UN CANDIDATO EVALUADO. PURA.
 *
 * `APTO` no es `ACTIVO`: pasar la puerta y estar cotizando son dos hechos distintos, y el segundo
 * exige un acto de escritura que quede registrado con su versión anterior entera.
 */
export function estadoDe(gob, { activo = false } = {}) {
  if (!gob?.apto) return ESTADO.CANDIDATO
  return activo ? ESTADO.ACTIVO : ESTADO.APTO
}
