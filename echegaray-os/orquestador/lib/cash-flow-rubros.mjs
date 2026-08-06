// LA TAXONOMÍA DE RUBROS DE LAS DOS VISTAS DE CASH FLOW — declarada UNA vez, importada por las dos.
//
//
// ═══ POR QUÉ SE DISCRIMINA (06/08/2026) ═══
//
// "Egresos reales · $118.000.000" contesta cuánto salió y ninguna de las preguntas que siguen: ¿de
// eso, cuánto es nómina y cuánto materiales? ¿el mes que se dispara es por jornales o por impuestos?
// Un subtotal sin apertura obliga a abrir el Libro para decidir cualquier cosa, y entonces el cuadro
// no decide nada.
//
// ═══ LOS NOMBRES SON LOS QUE EMITE EL LIBRO, NO UNA TAXONOMÍA NUEVA ═══
//
// Salen del inventario vivo de `_MOVIMIENTOS`: son exactamente las cadenas que escriben los
// extractores en la columna de rubro. Inventar acá un nombre "más lindo" haría que la sub-línea sume
// cero para siempre sin dar un solo error — el filtro es por igualdad exacta.
//
// ═══ Y POR QUÉ EXISTE "· Otros" ═══
//
// Un rubro que el Libro empiece a emitir mañana y que no esté en estas listas NO puede desaparecer del
// cuadro. "Otros" no se suma: se DESPEJA (subtotal − las sub-líneas listadas), así que cualquier rubro
// nuevo aparece ahí y se ve. Si en cambio el subtotal fuera la suma de las sub-líneas, el rubro nuevo
// se caería del cuadro y el total seguiría cerrando consigo mismo — un cuadro coherente y falso.

/** Los rubros de INGRESO del libro, en orden de peso. */
export const RUBROS_INGRESO = Object.freeze(['Cobranzas', 'Valores en cartera'])

/** Los rubros de EGRESO del libro, en orden de peso. */
export const RUBROS_EGRESO = Object.freeze([
  'Materiales Civil',
  'Nómina · Jornales de obra',
  'Nómina · Sueldos administración',
  'Nómina · Cargas sociales',
  'Impuestos',
  'Estructura',
  'Financiero',
  'Nómina · Gremiales',
  'Deuda previsional (planes de pago)',
  'Nómina · SAC',
  'Materiales Mantenimiento',
  'Servicios recurrentes',
  'Cheques emitidos',
  'Cheques y tarjeta sin factura cargada',
])

/** El rótulo del resto. No es un rubro del libro: es lo que queda cuando se restan los que sí lo son. */
export const OTROS = 'Otros'

/** Los rubros que abren una medida, según su signo. PURA. */
export const rubrosDeSigno = (signo) => (signo === 1 ? RUBROS_INGRESO : RUBROS_EGRESO)

/** La clave de una sub-línea. Lleva la medida adentro: el mismo rubro abre las cuatro. */
export const claveSub = (claveMedida, rubro) => `${claveMedida}::${rubro}`
/** El rótulo de una sub-línea. La sangría es la jerarquía: no hay negrita ni color que la marquen. */
export const rotuloSub = (rubro) => `    · ${rubro}`
