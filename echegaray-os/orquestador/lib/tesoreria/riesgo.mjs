// SKILL 7 · EVALUAR RIESGO DE TESORERÍA — la caja de una constructora no es una cartera personal.
//
// ═══ LA DISTINCIÓN QUE CAMBIA TODAS LAS RESPUESTAS ═══
//
// La tolerancia al riesgo de una persona se mide en cuánto puede perder sin cambiar de vida. La de la
// caja operativa de una constructora se mide en otra cosa: **qué pasa el día 5 si el fondo no liquida.**
//
// La respuesta es que no se pagan sueldos, y en una empresa con obras en curso eso no es una pérdida
// financiera: es una obra parada, una cuadrilla que se va y un cliente que reclama. El riesgo real de
// invertir mal la caja operativa no es el rendimiento negativo — es el descalce.
//
// Por eso este evaluador castiga muchísimo más la ILIQUIDEZ que la VOLATILIDAD, al revés de como se
// evalúa una cartera de inversión.

import { CONFIANZA, EVIDENCIA } from './contratos.mjs'
import { esNumero } from './instrumentos.mjs'

/** Perfiles. `excedente_estrategico` es plata que la empresa no necesita en el horizonte visible. */
export const PERFILES = {
  caja_operativa: {
    id: 'caja_operativa',
    titulo: 'Caja operativa',
    max_riesgo: 'bajo',
    exige_capital_garantizado: true,
    max_dias_vuelta: 2,
    nota: 'paga sueldos, cargas, impuestos y proveedores: no admite pérdida de capital ni demora',
  },
  excedente_estrategico: {
    id: 'excedente_estrategico',
    titulo: 'Excedente estratégico',
    max_riesgo: 'medio',
    exige_capital_garantizado: false,
    max_dias_vuelta: 30,
    nota: 'plata sin destino asignado en el horizonte proyectado',
  },
}

/**
 * Riesgos que se evalúan. Cada uno con su regla, para que el resultado sea auditable y no una
 * impresión: un puntaje de riesgo que nadie puede reconstruir es un número decorativo.
 */
export const RIESGOS = [
  'perdida_capital', 'credito', 'mercado', 'tasa', 'duration', 'moneda', 'liquidez',
  'rescate', 'liquidacion', 'volatilidad', 'concentracion', 'soberano', 'contraparte',
  'operacional', 'informacion_desactualizada', 'error_extraccion',
]

const GRAVEDAD = { bajo: 0, medio: 1, alto: 2 }
const peor = (a, b) => (GRAVEDAD[a] >= GRAVEDAD[b] ? a : b)

/** Antigüedad del dato de mercado, en horas. Una tasa de hace tres días no es la tasa de hoy. */
export function horasDesde(iso, ahora = new Date()) {
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return null
  return (ahora.getTime() - t) / 3600000
}

/**
 * SKILL 7. Evalúa un instrumento para un perfil. Devuelve `apto`, el nivel y los hallazgos con su
 * motivo. Un solo hallazgo bloqueante alcanza para que no sea apto: los riesgos de tesorería no se
 * promedian, porque el que te deja sin pagar sueldos no se compensa con otro que está bien.
 */
export function evaluarRiesgo(inst = {}, perfil = PERFILES.caja_operativa, ctx = {}) {
  const hallazgos = []
  let nivel = 'bajo' // el riesgo REPORTADO: el peor de todo, financiero o de información
  let nivelInstrumento = 'bajo' // el que decide la APTITUD: sólo lo que es riesgo del instrumento

  // DOS FAMILIAS DE RIESGO, Y NO SE MEZCLAN PARA DECIDIR APTITUD.
  //
  // Un fondo money market no se vuelve inapto porque el dato se extrajo de una pantalla sin validar:
  // el instrumento es el mismo. La calidad de la extracción es un riesgo del AGENTE, y su lugar
  // correcto es bajar la CONFIANZA de la propuesta (lo hace `recomendacion.mjs`), no vetar el
  // instrumento. Mezclarlas hacía que ninguna alternativa fuera nunca apta —el evaluador quedaba
  // trabado en "no" y dejaba de aportar información—, que es la forma sutil de un control inútil.
  //
  // Lo que sí veta es un BLOQUEANTE, y un dato vencido lo es: decidir con una tasa de ayer no es un
  // problema de confianza, es decidir con un número que ya no existe.
  const marcar = (tipo, n, detalle, bloqueante = false, familia = 'instrumento') => {
    hallazgos.push({ tipo, nivel: n, detalle, bloqueante, familia })
    nivel = peor(nivel, n)
    if (familia === 'instrumento') nivelInstrumento = peor(nivelInstrumento, n)
  }

  // LIQUIDEZ Y RESCATE — el riesgo dominante de la caja operativa.
  const vuelta = (esNumero(inst.plazo_rescate_dias) ? Number(inst.plazo_rescate_dias) : 0)
    + (esNumero(inst.liquidacion_dias) ? Number(inst.liquidacion_dias) : 0)
  if (!esNumero(inst.plazo_rescate_dias)) {
    marcar('rescate', 'alto', 'no se conoce el plazo de rescate: no se puede saber cuándo vuelve la plata', true)
  } else if (vuelta > perfil.max_dias_vuelta) {
    marcar('liquidez', 'alto', `la plata vuelve en ${vuelta} días y el perfil ${perfil.id} admite ${perfil.max_dias_vuelta}`, true)
  }

  // PÉRDIDA DE CAPITAL — para la caja operativa, cualquier instrumento a precio de mercado la tiene.
  const aPrecio = ['bono', 'on', 'cedear', 'accion', 'fci_renta_variable', 'fci_renta_mixta', 'dolar_linked', 'hard_dollar']
  if (aPrecio.includes(inst.categoria)) {
    marcar('perdida_capital', 'alto', `${inst.categoria} cotiza a precio de mercado: puede valer menos el día que se necesite`, perfil.exige_capital_garantizado)
    marcar('volatilidad', 'medio', 'el valor entre la entrada y la salida no está garantizado')
  }

  // DURATION Y TASA — un instrumento largo se mueve mucho ante un cambio de tasa.
  if (esNumero(inst.duration) && Number(inst.duration) > 1) marcar('duration', 'medio', `duration ${inst.duration}: sensible a movimientos de tasa`)

  // MONEDA — el descalce es el riesgo silencioso: las obligaciones de esta empresa son en pesos.
  if (inst.moneda === 'USD' && (ctx.moneda_obligaciones ?? 'ARS') === 'ARS') {
    marcar('moneda', 'medio', 'las obligaciones son en pesos y el instrumento en dólares: descalce de moneda')
  }

  // CRÉDITO Y CONTRAPARTE.
  if (['on', 'bono'].includes(inst.categoria)) marcar('credito', 'medio', 'el repago depende del emisor')
  if (inst.categoria === 'bono') marcar('soberano', 'medio', 'riesgo soberano')
  if (!inst.emisor) marcar('contraparte', 'medio', 'no se identificó el emisor/administradora')

  // CALIDAD DE LA INFORMACIÓN — un riesgo del agente, no del instrumento, y hay que decirlo igual.
  const h = horasDesde(inst.observado_en, ctx.ahora)
  if (h == null) marcar('informacion_desactualizada', 'alto', 'el dato no tiene fecha de observación', true, 'informacion')
  else if (h > 24) marcar('informacion_desactualizada', 'alto', `el dato tiene ${Math.round(h)} horas: una tasa de ayer no es la de hoy`, true, 'informacion')
  else if (h > 6) marcar('informacion_desactualizada', 'medio', `el dato tiene ${Math.round(h)} horas`, false, 'informacion')

  if (inst.evidencia === EVIDENCIA.ESTIMACION) {
    marcar('error_extraccion', 'medio', 'el dato viene de una extracción no validada contra la pantalla real', false, 'informacion')
  }
  if ((inst.campos_faltantes || []).length >= 3) {
    marcar('operacional', 'medio', `faltan ${inst.campos_faltantes.length} campos: ${inst.campos_faltantes.slice(0, 3).join(', ')}`, false, 'informacion')
  }

  const bloqueantes = hallazgos.filter((x) => x.bloqueante)
  return {
    instrumento_id: inst.id,
    perfil: perfil.id,
    nivel,
    nivel_instrumento: nivelInstrumento,
    apto: bloqueantes.length === 0 && GRAVEDAD[nivelInstrumento] <= GRAVEDAD[perfil.max_riesgo],
    bloqueantes: bloqueantes.map((x) => x.detalle),
    hallazgos,
    confianza: bloqueantes.length ? CONFIANZA.ALTA : CONFIANZA.MEDIA, // rechazar es más seguro que aprobar
  }
}

/**
 * CONCENTRACIÓN — un riesgo que no vive en ningún instrumento sino en el conjunto. Se evalúa sobre la
 * propuesta completa: poner todo el excedente en un solo fondo es una decisión distinta a poner un
 * tercio en tres.
 */
export function evaluarConcentracion(propuestas = [], maxPorInstrumento = 0.5) {
  const total = propuestas.reduce((s, p) => s + (Number(p.monto_maximo) || 0), 0)
  if (!(total > 0)) return { nivel: 'bajo', hallazgos: [] }
  const hallazgos = []
  for (const p of propuestas) {
    const share = (Number(p.monto_maximo) || 0) / total
    if (share > maxPorInstrumento) {
      hallazgos.push({ tipo: 'concentracion', nivel: 'medio', detalle: `${p.instrumento} concentra el ${(share * 100).toFixed(0)}% del excedente` })
    }
  }
  return { nivel: hallazgos.length ? 'medio' : 'bajo', hallazgos, total }
}

export const VERSION_SKILL = '1.0.0'
