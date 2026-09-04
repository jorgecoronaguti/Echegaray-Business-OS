// DE UN COSENO A UNA CONFIANZA QUE SE PUEDE COMPARAR CON UN UMBRAL. CALIBRADO CONTRA DATOS ECSAS.
//
// ═══ POR QUÉ NO SE PUEDE USAR EL COSENO CRUDO ═══
//
// Un coseno de la familia e5 NO vive entre 0 y 1: vive comprimido arriba. Medido el 04/09/2026
// sobre los 36 proveedores reales de `public.proveedores` —630 pares de proveedores DISTINTOS—:
//
//   mediana 0,8784 · p90 0,8977 · p99 0,9126 · MAXIMO 0,9446
//
// Es decir: dos proveedores que no tienen NADA que ver dan 0,88 de coseno. Un umbral de 0,90 —el
// que parece razonable y el que este repo tuvo escrito— habría fusionado estos pares reales:
//
//   0,9446  «Lliteras» ~ «Maderas Literas SRL»
//   0,9433  «Pintureria Cordoba» ~ «Robles Pintureria»
//   0,9415  «Acerolatina SA» ~ «Friolatina SA»
//   0,9328  «Robles Jose Maria» ~ «Robles Pintureria»
//
// Y del otro lado, las variantes del MISMO proveedor —las que sí hay que unir— dieron:
//
//   1,0000  «CORRALON PROGRESO» ~ «Corralon Progreso S.R.L.»
//   1,0000  «MADERAS LITERAS SRL» ~ «Maderas Literas»
//   0,9922  «ROBLES PINTURERIA» ~ «Pintureria Robles»
//   0,9666  «DUBOS UGARTE PEDRO LUIS RAUL» ~ «Dubos Ugarte Pedro»
//
// Queda una banda limpia entre 0,9446 y 0,9666. Ahí se calibra: por debajo del piso, ruido; por
// encima del techo, la misma entidad. Y el mapeo es lineal en el medio, que es donde una persona
// tiene que mirar.
//
// ═══ LO QUE ESTA CALIBRACIÓN NO PRUEBA, DECLARADO ═══
//
// Son 36 proveedores y 4 pares verdaderos: alcanza para descartar 0,90 como umbral —eso está
// probado— pero NO para afirmar que 0,9666 sea el techo definitivo. Cada corrección del dueño
// (Fase de feedback) agranda el dataset, y esta calibración se vuelve a medir con él. Hasta
// entonces, la resolución automática se limita a lo que además tiene identificador fuerte.

/** El ruido: por debajo de acá, dos textos no se parecen más de lo que se parece cualquier par. */
export const PISO = Number(process.env.ORQ_ML_PISO_COSENO || 0.9126)   // p99 del ruido medido

/** Por encima de acá, la evidencia es tan fuerte como el par verdadero más débil que se midió. */
export const TECHO = Number(process.env.ORQ_ML_TECHO_COSENO || 0.9666)

/** La procedencia de los números, para que nadie los cambie sin volver a medir. */
export const CALIBRACION = Object.freeze({
  fecha: '2026-09-04',
  modelo: 'Xenova/multilingual-e5-small',
  corpus: 'public.proveedores · 36 nombres reales · 630 pares distintos',
  ruido: { mediana: 0.8784, p90: 0.8977, p99: 0.9126, max: 0.9446 },
  verdaderos: { min: 0.9666, n: 4 },
  limitacion: 'muestra chica: 4 pares verdaderos. Sirve para descartar 0,90; no para fijar el techo definitivo.',
})

/**
 * Coseno → confianza entre 0 y 1, comparable con los umbrales de `resultado.mjs`.
 *
 * Es una recta entre PISO y TECHO, recortada en los dos extremos. No se usa una sigmoide ni nada
 * más sofisticado a propósito: con 4 pares verdaderos medidos, cualquier curva más elaborada
 * estaría ajustando ruido y aparentando una precisión que no existe.
 */
export function confianzaDeCoseno(cos) {
  const c = Number(cos)
  if (!Number.isFinite(c)) return 0
  if (c <= PISO) return 0
  if (c >= TECHO) return 1
  return (c - PISO) / (TECHO - PISO)
}

/**
 * EL MARGEN CONTRA EL SEGUNDO CANDIDATO, QUE ES LA SEÑAL QUE DE VERDAD IMPORTA.
 *
 * Que el mejor candidato dé 0,97 no dice nada si el segundo da 0,96: significa que el texto se
 * parece a los dos y el modelo no está distinguiendo. Un match sin margen se propone, nunca se
 * aplica. Es la misma disciplina que el resto del OS: la evidencia es la diferencia, no el número
 * suelto.
 */
export function confianzaConMargen(mejor, segundo = null) {
  const base = confianzaDeCoseno(mejor)
  if (segundo == null) return base
  const margen = Number(mejor) - Number(segundo)
  // 0,02 es el ancho de la banda limpia medida (0,9446 → 0,9666) dividido por dos: por debajo de
  // eso, los dos candidatos están dentro del mismo ruido.
  if (margen < 0.02) return Math.min(base, 0.69) // por debajo de UMBRAL.MEDIA: se descarta
  if (margen < 0.05) return Math.min(base, 0.89) // por debajo de UMBRAL.ALTA: se sugiere
  return base
}
