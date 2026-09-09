// LAS PESTAÑAS DE PANTALLA DEL FLUJO DE CAJA, EN UN LIB PURO.
//
// ═══ POR QUÉ NO ALCANZABA CON `PESTANAS` DE `formato-pestanas.mjs` (06/09/2026) ═══
//
// La lista vivía ahí y era la correcta, pero ese archivo es un SCRIPT: importa `google.mjs` y
// `config.mjs`. Cuando el podador la pidió desde `escribirPreservando` —que está en el camino de
// escritura de todo el archivo— esos imports empezaron a evaluarse antes que los dobles de los tests
// herméticos, y siete pruebas de `guarda-escritura` se pusieron rojas: el candado explícito del dueño
// sobre «Obreros 26» dejó de frenar la carga de asistencia. Ninguna regla se había roto; se había
// roto el ORDEN DE CARGA.
//
// Acá están los nombres y nada más: sin red, sin base, sin configuración. `formato-pestanas.mjs`
// sigue siendo el dueño de CÓMO se ve cada una; este módulo sólo dice CUÁLES son, y un canario prueba
// que las dos listas no se separen.

/**
 * Los títulos, en el orden en que están en el archivo. Incluye las cinco que el dueño excluyó del
 * rediseño: quién entra al contrato lo decide `enAlcance`, no esta lista.
 */
export const TITULOS_DE_PANTALLA = Object.freeze([
  'Compras', 'Cobranzas', 'Cheques Emitidos', 'Cheques Recibidos', 'Tarjeta de Credito',
  'Jornales por Quincena', 'Cargas Sociales', 'Impuestos y Financieros', 'Recurrentes',
  'Estructura', 'Proveedores', 'Materiales', 'CAJA', 'Cash Flow Semanal', 'Cash Flow Mensual',
  // «Plantel» salió el 09/09/2026: el dueño la mandó borrar y no la escribe ningún generador. Una
  // pestaña que no existe en el archivo no puede estar en el contrato de pantalla — el auditor la
  // buscaría en cada corrida y la declararía faltante.
  'OBRAS', 'Calendario de Cobros', 'Nómina', 'SUBCONTRATISTAS',
])

const SET = new Set(TITULOS_DE_PANTALLA)

/** ¿Es una pestaña de pantalla? Los espejos `_RAW` y las hojas auxiliares no lo son. */
export const esDePantalla = (pestana) => SET.has(String(pestana))
