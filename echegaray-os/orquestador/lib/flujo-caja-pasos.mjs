// QUÉ REHACE EL AGENTE DEL FLUJO DE CAJA, Y QUÉ PESTAÑA DEJA CADA PASO.
//
// POR QUÉ ESTÁ ACÁ Y NO ADENTRO DEL AGENTE (21/07). La tercera columna —qué pestañas deja cada
// script— es lo que permite contestar "¿queda alguna pestaña derivada que no mantiene nadie?" sin
// que alguien se acuerde de mirar. Así apareció Recurrentes: el Cash Flow Mensual leía de ella su
// proyección y no la rehacía ningún script. Para que el auditor pueda leer esta lista sin ejecutar
// el agente entero, la lista vive en su propio archivo.
//
// EL ORDEN NO ES COSMÉTICO: cada paso lee lo que escribió el anterior.

export const PASOS = [
  ['rubro-caja-sheet.mjs', 'la columna "Rubro de caja" de Compras — de acá cuelga todo lo demás', []],
  // Recurrentes va ANTES del cash flow: el cuadro lee de ella su proyección y necesita que exista.
  ['recurrentes-pestana.mjs', 'Recurrentes — servicios fijos, sin proyectar meses ya cerrados', ['Recurrentes']],
  ['cash-flow-rehacer.mjs', 'Cash Flow Semanal y Mensual', ['Cash Flow Semanal', 'Cash Flow Mensual']],
  ['materiales-pestana.mjs', 'pestaña Materiales + columna de familia en Compras', ['Materiales']],
  ['estructura-pestana.mjs', 'pestaña Estructura con su proyección', ['Estructura']],
  ['impuestos-pestana.mjs', 'Impuestos y Financieros — IVA real de ARCA', ['Impuestos y Financieros']],
  ['cargas-planes.mjs', 'Cargas Sociales — planes de pago', ['Cargas Sociales']],
  ['cobranzas-control.mjs', 'Cobranzas — detector de duplicados', []],
  ['proveedores-pestana.mjs', 'Proveedores — cuánto se le debe a cada uno y desde cuándo', ['Proveedores']],
  ['cheques-cobertura-sheet.mjs', 'Cash Flow Mensual — qué cheques y tarjeta faltan cargar en Compras', []],
  // Va última: ubica las líneas del Cash Flow por rótulo, así que necesita el cuadro ya escrito.
  ['caja-pestana.mjs', 'CAJA — disponibilidades, cheques emitidos y margen de tarjeta', ['CAJA', 'Caja']],
  // El núcleo Postgres, para que la web y el chat vean lo mismo que la planilla y no un mes atrás.
  ['sync-compras.mjs', 'núcleo: Compras → costos_obra', []],
  ['sync-caja-nucleo.mjs', 'núcleo: quincenas de jornales e instrumentos de pago', []],
]
