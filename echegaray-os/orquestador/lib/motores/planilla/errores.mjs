// EL VOCABULARIO DE LAS FALLAS DEL MOTOR DE PLANILLAS.
//
// POR QUÉ EXISTE. Hasta hoy, cuando una operación sobre una planilla salía mal, el que se enteraba
// era un modelo de lenguaje leyendo un `Error: google api 400: Unable to parse range`. Un modelo
// puede interpretar eso; un `if` no. Y mientras la única forma de reaccionar a una falla sea
// interpretarla, toda operación determinística necesita un modelo al lado — que es exactamente la
// dependencia que este motor viene a cortar.
//
// Un código estable es lo que permite que el llamador decida solo: `HOJA_INEXISTENTE` se resuelve
// creando la hoja, `REVISION_VIEJA` releyendo y reintentando, `FORMATO_NO_SOPORTADO` no se resuelve
// y hay que decirlo. Ninguna de esas tres decisiones necesita leer prosa.

/** Los códigos que el motor puede devolver. Cerrado a propósito: un código nuevo es una decisión
 *  nueva del llamador, y aparecer sin estar acá significa que nadie la tomó. */
export const CODIGOS = Object.freeze({
  RANGO_INVALIDO: 'RANGO_INVALIDO',
  RANGO_ABIERTO: 'RANGO_ABIERTO',
  HOJA_INEXISTENTE: 'HOJA_INEXISTENTE',
  FORMULA_ROTA: 'FORMULA_ROTA',
  TIPO_INVALIDO: 'TIPO_INVALIDO',
  FORMATO_NO_SOPORTADO: 'FORMATO_NO_SOPORTADO',
  OPERACION_NO_SOPORTADA: 'OPERACION_NO_SOPORTADA',
  ESCRITURA_NO_PERSISTIO: 'ESCRITURA_NO_PERSISTIO',
  CONTENIDO_CONSERVADO: 'CONTENIDO_CONSERVADO',
  UBICACION_INESPERADA: 'UBICACION_INESPERADA',
  REVISION_VIEJA: 'REVISION_VIEJA',
  ESCRITURA_CONGELADA: 'ESCRITURA_CONGELADA',
  PESTANA_PROTEGIDA: 'PESTANA_PROTEGIDA',
  DESTINO_PROHIBIDO: 'DESTINO_PROHIBIDO',
  ESCRITURA_NO_DECLARADA: 'ESCRITURA_NO_DECLARADA',
})

/**
 * Una falla del motor, con código estable y el detalle que hace falta para actuar.
 *
 * `detalle` NUNCA es prosa para leer: es el objeto con las piezas (el rango que no parseó, las
 * celdas que no persistieron, las hojas que sí existen). La prosa se arma arriba, si hace falta.
 */
export class ErrorPlanilla extends Error {
  /** @param {string} codigo @param {string} mensaje @param {Record<string, unknown>} [detalle] */
  constructor(codigo, mensaje, detalle = {}) {
    super(mensaje)
    this.name = 'ErrorPlanilla'
    this.codigo = codigo
    this.detalle = detalle
  }

  /** Forma serializable — es lo que cruza a un log, a una cola o a una respuesta HTTP. */
  aObjeto() {
    return { ok: false, codigo: this.codigo, mensaje: this.message, detalle: this.detalle }
  }
}

/** Azúcar para no repetir `throw new ErrorPlanilla(CODIGOS.X, ...)` en cada guarda. */
export function fallar(codigo, mensaje, detalle) {
  throw new ErrorPlanilla(codigo, mensaje, detalle)
}

/** ¿Este objeto es una falla del motor con ESTE código? Para que un test o un `catch` no tenga que
 *  mirar el mensaje — un mensaje se reescribe, un código es contrato. */
export function esError(e, codigo) {
  return e instanceof ErrorPlanilla && (codigo === undefined || e.codigo === codigo)
}
