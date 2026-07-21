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
  // PRIMERO DE TODOS: los jornales entran al archivo desde OTRO Sheet (JORNALES). Si el espejo no
  // se refresca, todo lo que sigue calcula sobre una foto vieja y ningún control lo ve — pasó el
  // 21/07: la quincena en curso quedó $1.231.963 por debajo de la real.
  ['espejar-jornales.mjs', 'espejo del archivo JORNALES (_J_OBREROS y _J_OFICINA)', ['_J_OBREROS', '_J_OFICINA']],
  // SEGUNDO: devolver la fórmula a las celdas calculadas que alguien pisó pegando un valor. Va
  // antes de todo cálculo porque una celda pisada no grita: muestra un número creíble que dejó de
  // actualizarse. El 21/07 había cuatro, y dos de ellas hacían que dos cobros de $16.200.000
  // quedaran fuera de cualquier filtro por mes.
  ['columnas-calculadas.mjs', 'devolver la fórmula a las celdas calculadas pisadas a mano', []],
  ['rubro-caja-sheet.mjs', 'la columna "Rubro de caja" de Compras — de acá cuelga todo lo demás', []],
  // Recurrentes va ANTES del cash flow: el cuadro lee de ella su proyección y necesita que exista.
  ['recurrentes-pestana.mjs', 'Recurrentes — servicios fijos, sin proyectar meses ya cerrados', ['Recurrentes']],
  ['cash-flow-rehacer.mjs', 'Cash Flow Semanal y Mensual', ['Cash Flow Semanal', 'Cash Flow Mensual']],
  ['proveedores-materiales-pestana.mjs', 'Proveedores y Materiales — cuenta corriente por proveedor + familias de material', ['Proveedores y Materiales']],
  ['estructura-pestana.mjs', 'pestaña Estructura con su proyección', ['Estructura']],
  ['impuestos-pestana.mjs', 'Impuestos y Financieros — IVA real de ARCA', ['Impuestos y Financieros']],
  ['cargas-planes.mjs', 'Cargas Sociales — planes de pago', ['Cargas Sociales']],
  // Va DESPUÉS de los planes: la proyección ubica su bloque por rótulo y necesita la pestaña
  // ya escrita para no calcular sobre una geometría que está por cambiar.
  ['cargas-proyeccion.mjs', 'Cargas Sociales — la proyección concepto por concepto', ['Cargas Sociales']],
  ['cobranzas-control.mjs', 'Cobranzas — detector de duplicados', []],
  ['cheques-cobertura-sheet.mjs', 'Cash Flow Mensual — qué cheques y tarjeta faltan cargar en Compras', []],
  ['tarjeta-control.mjs', 'Tarjeta de Credito — el cruce contra el resumen del banco y la disponibilidad que ve CAJA', []],
  // Va última: ubica las líneas del Cash Flow por rótulo, así que necesita el cuadro ya escrito.
  ['caja-pestana.mjs', 'CAJA — disponibilidades, cheques emitidos y margen de tarjeta', ['CAJA', 'Caja']],
  // El núcleo Postgres, para que la web y el chat vean lo mismo que la planilla y no un mes atrás.
  ['sync-compras.mjs', 'núcleo: Compras → costos_obra', []],
  ['sync-caja-nucleo.mjs', 'núcleo: quincenas de jornales e instrumentos de pago', []],
]
