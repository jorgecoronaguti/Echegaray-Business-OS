// LA ESCALA UOCRA QUE VE EL CHAT — armada desde la fuente, no escrita a mano en un prompt.
//
// ═══ EL DRIFT QUE ESTO TERMINA (26/08/2026) ═══
//
// `interactive-server.mjs` llevaba la escala pegada dentro del texto del prompt:
//
//   «JORNALES UOCRA ZONA A VIGENTES (jul-2026, CCT 76/75, VERIFICADO — usá ESTOS, NO los de un
//    archivo viejo): Oficial Especializado $6.800/h · Oficial $5.817/h … Ayudante $4.948/h»
//
// Hoy es agosto. La escala canónica —`uocra-paritaria.mjs`, verificada el 07/08 contra dos fuentes—
// dice Ayudante $5.399: un **9,1 % más**. El prompt afirmaba «VIGENTES» y «VERIFICADO» con los
// números del mes anterior, así que cada presupuesto que el chat ayudó a armar en agosto subestimó
// la mano de obra en casi diez por ciento, con un sello de verificado al lado.
//
// Ese es el modo de fallar de un dato escrito dentro de un prompt: no da error, no rompe un test, y
// nadie lo mira hasta que un número sale mal en una oferta. La regla del repo lo dice en una línea
// —«una fuente por concepto»— y una escala salarial es un concepto.
//
// ═══ Y LO QUE NO SE PUEDE SABER, SE DICE ═══
//
// El acuerdo vence el 31/08/2026. A partir de septiembre lo que salga de acá es PROYECCIÓN y el
// bloque lo rotula así, con todas las letras. Un presupuesto armado sobre una paritaria que todavía
// no se firmó es una apuesta, y quien lo firma tiene derecho a saberlo.

import {
  CCT, ZONA, PERIODO_VERIFICADO, ESCALA_VERIFICADA, MENSUAL_VERIFICADO,
  VERIFICADA_EL, VIGENCIA_HASTA, ORIGEN_ACUERDO, ORIGEN_PROYECCION,
} from './uocra-paritaria.mjs'

/** `'2026-08'` a partir de una fecha. Sin `Date` de por medio en el formato: el mes es el mes. */
export function periodoDe(hoyISO) {
  return String(hoyISO ?? '').slice(0, 7)
}

/**
 * NÚCLEO PURO: ¿lo que se publica es el acuerdo firmado o una proyección?
 *
 * Se compara contra la VIGENCIA del acuerdo (31/08/2026), no contra el período de la escala: la
 * escala de agosto sigue siendo el acuerdo durante todo agosto. Desde septiembre, proyección.
 */
export function origenDeLaEscala(hoyISO, vigenciaHasta = VIGENCIA_HASTA) {
  const [d, m, a] = String(vigenciaHasta).split('/')
  const limite = `${a}-${m}-${d}`
  return String(hoyISO ?? '').slice(0, 10) <= limite ? ORIGEN_ACUERDO : ORIGEN_PROYECCION
}

/** `$ 5.399` — el formato que el chat ya usaba, para no cambiar cómo se lee. */
const pesos = (n) => `$${Math.round(n).toLocaleString('es-AR')}`

/**
 * EL BLOQUE DE TEXTO PARA EL PROMPT, construido desde la escala canónica.
 *
 * Devuelve `''` cuando el pedido no habla de jornales: el bloque se paga en tokens en cada consulta
 * y no tiene por qué viajar si nadie preguntó por mano de obra.
 */
export function bloqueUocra({ hoyISO = new Date().toISOString(), escala = ESCALA_VERIFICADA, mensual = MENSUAL_VERIFICADO } = {}) {
  const origen = origenDeLaEscala(hoyISO)
  const esAcuerdo = origen === ORIGEN_ACUERDO
  const jornales = Object.entries(escala).map(([cat, v]) => `${cat} ${pesos(v)}/h`).join(' · ')
  const mensuales = Object.entries(mensual ?? {}).map(([cat, v]) => `${cat} ${pesos(v)}/mes`).join(' · ')

  return [
    `\n\nJORNALES UOCRA ZONA ${ZONA} (CCT ${CCT}) — escala ${PERIODO_VERIFICADO}, ${esAcuerdo ? `ACUERDO FIRMADO vigente hasta el ${VIGENCIA_HASTA}` : `PROYECCIÓN: el acuerdo venció el ${VIGENCIA_HASTA} y no hay paritaria nueva firmada`}.`,
    `Verificada el ${VERIFICADA_EL} contra las fuentes del acuerdo. Usá ESTOS valores y NO los de ningún archivo: ${jornales}.`,
    mensuales ? `Se paga por MES, no por hora (no lo compares contra un jornal): ${mensuales}.` : '',
    'Sobre el jornal van cargas sociales + adicionales de convenio (asistencia, Art.56 hormigonado 15%, EPP, ropa).',
    esAcuerdo ? '' : 'DECILE AL USUARIO que esta escala es una proyección y que el número final depende de la paritaria que se firme.',
  ].filter(Boolean).join(' ')
}
