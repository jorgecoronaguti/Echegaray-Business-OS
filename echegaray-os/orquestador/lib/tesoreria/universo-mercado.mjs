// QUÉ PANTALLAS DEL BRÓKER FORMAN EL UNIVERSO DE TESORERÍA — y cuáles se dejan afuera A PROPÓSITO.
//
// ═══ EL DEFECTO QUE ESTE ARCHIVO EXISTE PARA CERRAR ═══
//
// El ciclo barría las ocho pantallas de cotizaciones de Balanz y después declaraba
// `cobertura_mercado: parcial` porque dos de ellas —cedears y corporativos— quedaban truncadas. Esa
// marca bloquea la accionabilidad: el agente no recomienda sobre un mercado que no terminó de ver.
//
// ═══ LO QUE MIDIÓ LA SESIÓN VIVA, Y NO ERA LO QUE SE SUPONÍA ═══
//
// Con el tope viejo de 15 vueltas las dos cortaban en 320 filas. Subirlo a 120 (af10f6a) SÍ las
// completa — la hipótesis de "la grilla no termina nunca" es falsa y quedó descartada midiendo,
// pantalla por pantalla, el 03/08/2026:
//
//   corporativos?all=1   793 filas · 41 vueltas ·  33 s · completo
//   cedears            1.078 filas · 113 vueltas · 687 s · completo
//
// O sea: el arreglo anterior funciona, pero cedears necesita 113 de las 120 vueltas disponibles y
// tarda ONCE MINUTOS Y MEDIO en una sola pantalla. El margen es de siete vueltas: el próximo lote de
// CEDEARs que liste Balanz vuelve a dejar el relevamiento truncado y al agente sin recomendar. Un
// arreglo que depende de que el bróker no agregue papeles no es un arreglo, es una prórroga.
//
// ═══ LA PREGUNTA CORRECTA NO ERA CUÁNTAS VUELTAS ═══
//
// Era si esas pantallas tienen algo que la tesorería pueda usar, y la respuesta estaba medida en el
// propio ledger, sobre 4.394 observaciones reales:
//
//   pantalla                          instrumentos   APTOS para tesorería
//   corporativos?all=1                       787              0
//   cedears                                  320              0
//   bonos                                    190              0
//   acciones                                  20              0
//   cauciones                                164            164
//   letras                                    67             (67 filas → 154 obs aptas)
//   fondos                                    23              mayoría
//   fondosext?all=1                            6              mayoría
//
// Las CUATRO pantallas que no producen un solo instrumento apto son exactamente las cuatro que
// reventaban los topes. Un CEDEAR es riesgo de mercado en dólares y una ON es riesgo de crédito a
// varios años: la caja que paga sueldos el día 5 no se coloca ahí. Eso ya estaba decidido y escrito
// —`CATEGORIAS[...].apta_tesoreria` en `instrumentos.mjs`—; lo que faltaba era que el relevamiento
// lo supiera, en vez de gastar doce minutos de scroll y 3.524 observaciones por corrida en un
// universo del que no puede salir una sola propuesta, y encima declararse ciego cuando no termina.
//
// Y el costo no era sólo tiempo: la corrida del 03/08/2026 murió con `numeric field overflow`
// guardando la observación de una ON —una TIR de 95.739.511.996% que publica la pantalla de
// corporativos—. Una fila de una pantalla que no aporta nada se llevó puesto el análisis de caja
// entero, que sí sirve.
//
// ═══ UNA SOLA FUENTE, NO DOS LISTAS QUE SE DESINCRONIZAN ═══
//
// Acá NO se declara qué es apto: eso lo sigue diciendo `esAptoTesoreria`. Acá se declara lo único
// que Balanz no dice solo — QUÉ CATEGORÍA PUBLICA CADA PANTALLA— y el universo se DERIVA. Si mañana
// el dueño decide que una ON corta sí es tesorería, alcanza con cambiar `apta_tesoreria` en
// `instrumentos.mjs` y corporativos vuelve a relevarse sola. No hay una segunda lista que actualizar
// ni un desfasaje posible entre las dos.

import { esAptoTesoreria, CATEGORIAS } from './instrumentos.mjs'

/**
 * Las pantallas informativas reales de Balanz, verificadas contra la sesión del 02/08/2026. La app
 * vive bajo `/app/cotizaciones/`; `?all=1` es lo que muestra el listado completo en corporativos y
 * fondos externos, que sin él traen sólo una vista previa.
 *
 * `publica` es la categoría del contrato de `instrumentos.mjs` que esa pantalla lista. Es un HECHO
 * del bróker, no un criterio: por eso vive acá y el criterio vive allá.
 */
export const PANTALLAS_MERCADO = [
  { ruta: '/app/cotizaciones/fondos', publica: 'money_market', nota: 'FCI en pesos: money market y renta fija' },
  { ruta: '/app/cotizaciones/fondosext?all=1', publica: 'money_market', nota: 'FCI en dólares' },
  { ruta: '/app/cotizaciones/letras', publica: 'lecap', nota: 'Lecaps y letras del Tesoro (columna TNA)' },
  { ruta: '/app/cotizaciones/cauciones', publica: 'caucion', nota: 'SÓLO LECTURA: caucionar sigue bloqueado por la barrera' },
  { ruta: '/app/cotizaciones/bonos', publica: 'bono', nota: 'soberanos: riesgo de mercado y plazo largo' },
  { ruta: '/app/cotizaciones/corporativos?all=1', publica: 'on', nota: 'obligaciones negociables: riesgo de crédito a varios años' },
  { ruta: '/app/cotizaciones/acciones', publica: 'accion', nota: 'renta variable' },
  { ruta: '/app/cotizaciones/cedears', publica: 'cedear', nota: 'renta variable en dólares' },
]

/** La ruta sin query: es lo que identifica la pantalla (`corporativos?all=1` y `corporativos` son la misma). */
export function pantallaDe(url) {
  const sinQuery = String(url ?? '').split('?')[0]
  const path = sinQuery.replace(/^https?:\/\/[^/]+/, '').replace(/\/+$/, '').toLowerCase()
  return PANTALLAS_MERCADO.find((p) => p.ruta.split('?')[0].toLowerCase() === path) ?? null
}

/**
 * ¿Esta pantalla pertenece al universo de tesorería? Lo decide `esAptoTesoreria` sobre la categoría
 * que publica — no una lista aparte.
 *
 * Una pantalla DESCONOCIDA cuenta como parte del universo, y eso es a propósito: si alguien agrega
 * una ruta y se olvida de declararla, el relevamiento tiene que seguir exigiéndose completo. El
 * default cae del lado de exigir, nunca del lado de perdonar.
 */
export const esDeTesoreria = (url) => {
  const p = pantallaDe(url)
  return p ? esAptoTesoreria(p.publica) : true
}

/** Lo que efectivamente se releva. */
export const RUTAS_INFORMATIVAS = PANTALLAS_MERCADO.filter((p) => esAptoTesoreria(p.publica)).map((p) => p.ruta)

/** Lo que se deja afuera, CON EL MOTIVO: una exclusión sin motivo escrito es un olvido disfrazado. */
export const PANTALLAS_ACOTADAS = PANTALLAS_MERCADO
  .filter((p) => !esAptoTesoreria(p.publica))
  .map((p) => ({
    ruta: p.ruta,
    motivo: `${CATEGORIAS[p.publica]?.titulo ?? p.publica} no es instrumento de tesorería de corto plazo (${p.nota})`,
  }))
