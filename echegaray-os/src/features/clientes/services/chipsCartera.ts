// LOS CHIPS DE LA FILA DE CLIENTES — cada uno con SU fuente, escrita al lado.
//
// ═══ EL DEFECTO QUE ESTE ARCHIVO CIERRA (09/09/2026) ═══
//
// Hasta hoy la sección Clientes se dibujaba en DOS pantallas y las dos decían cosas distintas del
// MISMO cliente: `/administracion` mostraba «$156.174.253 contratado» y `/clientes`, al lado del
// mismo nombre, «sin contrato». No era un error de redondeo: eran dos fuentes.
//
//   · `/administracion` le pasaba `economia` a `armarCartera` → `obra_economia_cartera`, que es lo
//     que la pestaña OBRAS del Sheet publica (`orquestador/scripts/obras-economia-sync.mjs`).
//   · `/clientes` NO se la pasaba → caía a `obra_panel.monto_contratado`, el campo del formulario
//     de la obra que nadie carga → `null` → la pantalla escribía «sin contrato».
//
// Y encima le decía «sin contrato» a un hueco de PRECIO. Son dos conceptos distintos y por eso acá
// están separados con nombre propio:
//
//   SIN PRECIO EN OBRAS → la obra no tiene monto en `obra_economia_cartera`. Es un hueco del Sheet.
//   SIN CONTRATO        → el CLIENTE no tiene ningún documento con rol `contrato` cargado
//                         (`cliente_documento.rol`). Es un papel que falta, no un número.
//
// Un cliente puede tener las dos, una, o ninguna: que OBRAS publique $156M no prueba que el
// contrato esté archivado, y tener el contrato archivado no pone el precio en OBRAS.
//
// Vive suelto —sin React y sin Supabase— porque es lo que hay que poder probar sin base: es la
// regla que decide qué reclama la pantalla.

/** Los tonos del handoff que esta sección usa. `Estado` los pinta; acá sólo se eligen. */
export type TonoChip = 'pos' | 'warn' | 'pendiente'

export interface Chip {
  /** Clave estable para los tests: el texto puede cambiar de redacción, la clave no. */
  clave: string
  texto: string
  tono: TonoChip
  /** La frase larga del `title`: qué frena, y de qué fuente sale el hecho. */
  porque: string
}

export const SIN_PRECIO = 'sin precio en OBRAS'

// ─────────────────────────────────────────────────────────────────────────────────────────────
// EL CLIENTE
// ─────────────────────────────────────────────────────────────────────────────────────────────

export interface DatosDelCliente {
  cuit: string | null
  telefono: string | null
  /**
   * ¿Tiene un documento con rol `contrato`? `null` = NO SE PUDO LEER la tabla de documentos, y
   * entonces la pantalla NO dice «sin contrato»: un control que no pudo mirar no puede afirmar que
   * no hay nada. Es el mismo criterio que `obrasNoLeidas` en la cartera.
   */
  tieneContrato: boolean | null
}

export function chipsDeCliente(c: DatosDelCliente): Chip[] {
  const chips: Chip[] = []
  if (!c.cuit?.trim()) {
    chips.push({
      clave: 'sin-cuit', texto: 'sin CUIT', tono: 'warn',
      porque: 'Sin CUIT no se le puede facturar (fuente: cliente_panel.cuit)',
    })
  }
  if (!c.telefono?.trim()) {
    chips.push({
      clave: 'sin-telefono', texto: 'sin teléfono', tono: 'warn',
      porque: 'Sin teléfono no se reclama lo facturado (fuente: cliente_panel.telefono)',
    })
  }
  if (c.tieneContrato === false) {
    chips.push({
      clave: 'sin-contrato', texto: 'sin contrato', tono: 'warn',
      porque: 'Ningún documento con rol «contrato» cargado en la ficha (fuente: cliente_documento.rol). '
        + 'NO es lo mismo que «sin precio en OBRAS»: es el papel, no el monto',
    })
  }
  return chips
}

/**
 * ¿ENTRA EN EL RECORTE «DATOS FALTANTES»? Es exactamente «tiene al menos un chip», y por eso se
 * deriva de la misma función que los dibuja: el día que el recorte y la fila salgan de dos cuentas
 * distintas, el contador va a decir 4 y la tabla va a mostrar 3.
 *
 * El precio faltante NO entra: es un hueco de OBRAS, se resuelve en el Sheet y no en la ficha del
 * cliente. Mezclarlo era lo que ponía a Messina —con $156M publicados— dentro de «datos faltantes».
 */
export function leFaltaUnDato(c: DatosDelCliente): boolean {
  return chipsDeCliente(c).length > 0
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// LA OBRA
// ─────────────────────────────────────────────────────────────────────────────────────────────

export interface DatosDeLaObra {
  /** Lo que OBRAS publica. `null` = el Sheet no lo tiene. NUNCA se lee como cero. */
  contratado: number | null
  /** `null` = sin avance sincronizado. NO es 0 %. */
  avance: number | null
  jefe: string | null
  certificacion: { texto: string; reclama: boolean }
}

export function chipsDeObra(o: DatosDeLaObra): Chip[] {
  const chips: Chip[] = []
  if (o.contratado === null) {
    chips.push({
      clave: 'sin-precio', texto: SIN_PRECIO, tono: 'warn',
      porque: 'La pestaña OBRAS del Flujo de Caja no publica monto para esta obra '
        + '(fuente: obra_economia_cartera, que sincroniza obras-economia-sync.mjs)',
    })
  }
  if (o.avance === null) {
    chips.push({
      clave: 'sin-medir', texto: 'sin medir', tono: 'pendiente',
      porque: 'Ninguna actividad con avance sincronizado. Sin avance no hay 0 %: no se sabe',
    })
  }
  if (!o.jefe?.trim()) {
    chips.push({
      clave: 'sin-jefe', texto: 'sin jefe', tono: 'pendiente',
      porque: 'Nadie figura como jefe de obra (fuente: obra_panel.jefe_obra)',
    })
  }
  chips.push({
    clave: 'certificacion', texto: o.certificacion.texto,
    // «sin certificar» es un estado normal de una obra que arranca; «sin fechas» o «sin leer»
    // reclaman trabajo. Un certificado ya cobrado es lo único que se pinta en verde.
    tono: o.certificacion.reclama ? 'warn' : o.certificacion.texto === 'sin certificar' ? 'pendiente' : 'pos',
    porque: 'El punto más avanzado del circuito certificar → facturar → cobrar (fuente: certificados)',
  })
  return chips
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// EL MARGEN
// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * EL MARGEN DE LA FILA. UNA definición, y `null` cuando no se puede afirmar.
 *
 * Manda lo que OBRAS publica (`obra_economia_cartera.margen`): es el número que el dueño mira en el
 * Sheet, y recalcularlo acá sería una segunda versión del mismo concepto. Sólo si la vista NO lo
 * trae se deriva, y con la MISMA fórmula que el rótulo de la columna declara —contratado − MO −
 * materiales—, que es lo que hace que las dos no puedan divergir.
 *
 * SI FALTA CUALQUIERA DE LOS TRES, EL RESULTADO ES `null`. Tratar un hueco como cero publicaría el
 * margen entero como ganancia el día que el costo de materiales no esté cargado.
 */
export function margenDeLaFila(e: {
  margenPublicado: number | null
  contratado: number | null
  costoMo: number | null
  costoMateriales: number | null
}): number | null {
  if (e.margenPublicado !== null) return e.margenPublicado
  if (e.contratado === null || e.costoMo === null || e.costoMateriales === null) return null
  return e.contratado - e.costoMo - e.costoMateriales
}
