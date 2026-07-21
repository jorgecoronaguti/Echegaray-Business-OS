// QUÉ COLUMNA DEL ARCHIVO MIRA EL OS Y CUÁL NO MIRA NADIE.
//
// POR QUÉ EXISTE (20/07). El dueño: "hay mala lectura de todas las pestañas, en Cobranzas hay
// cheques que no se encuentran considerados, ¿dónde los vamos a ubicar? NO TIENE QUE HABER DATO SIN
// CONTEMPLAR EN TODO EL ARCHIVO".
//
// Tenía razón y el problema era mío: yo venía leyendo las pestañas hasta donde me hacía falta para
// lo que estaba construyendo. Cobranzas tiene 61 columnas y yo leía hasta la R. Compras tiene 32 y
// yo usaba nueve. Así, cada dato que alguien carga en una columna que el OS no mira es trabajo
// humano que se tira, y —peor— es plata que no aparece en ningún cuadro sin que nada lo avise.
//
// LO QUE ESTE ARCHIVO CAMBIA. En vez de arreglar los huecos de a uno cada vez que aparecen, se
// declara acá QUÉ columna usa el OS y para qué, y un script compara esa declaración contra lo que
// realmente hay cargado en el Sheet. Lo que no está declarado sale listado con su cantidad de filas
// y su monto. El hueco deja de depender de que alguien lo note.
//
// LA DECLARACIÓN ES A MANO Y TIENE QUE SERLO: sólo yo sé para qué leo cada columna. Si una columna
// se empieza a usar y no se declara acá, va a figurar como no contemplada — que es el error seguro.
// Al revés no puede pasar: declarar algo que no se usa se nota porque el dato no aparece en ningún
// cuadro.

/**
 * Qué usa el OS de cada pestaña. Clave = letra de columna; valor = para qué se usa.
 * Las que no están acá se reportan como NO CONTEMPLADAS.
 */
export const USA = {
  Compras: {
    A: 'ID — clave de la réplica en Supabase',
    B: 'Categoría → costos_obra.categoria',
    C: 'Fecha de factura → costos_obra.fecha (devengado, NO caja)',
    E: 'Proveedor → regla de rubro de caja y familia de material',
    F: 'Modalidad → costos_obra.modalidad',
    G: 'Tipo → costos_obra.tipo',
    H: 'N° de comprobante → cruce con cheques, tarjeta y ARCA',
    I: 'Unidad de negocio → regla de rubro de caja',
    J: 'Cliente / Asignación → obra a la que se imputa el costo',
    K: 'Detalles / Obra → frente de obra, 2ª pasada de familia de material',
    L: 'Concepto → QUÉ se compró, 1ª pasada de familia de material',
    M: 'Importe neto → costos_obra.importe',
    N: 'IVA → costos_obra.iva',
    O: 'Total con IVA → el importe que usa el cash flow',
    Q: 'Fecha prevista de pago → fecha de caja cuando no hay fecha contable',
    X: 'Estado → define la DEUDA: "Pendiente" es lo que se le debe al proveedor (lib/cuentas-por-pagar)',
    Y: 'Fecha contable del pago → fecha de caja (la que manda)',
    AC: 'Rubro de caja (la escribe el OS)',
    AD: 'Fecha de caja (la escribe el OS)',
    AE: 'Familia de material (la escribe el OS)',
    AF: 'Sub-rubro de estructura (la escribe el OS)',
  },
  Cobranzas: {
    A: 'ID — detector de duplicados',
    C: 'Fecha de emisión',
    E: 'N° de comprobante → distingue cobros del mismo cliente y monto',
    F: 'Unidad → separa Civil / Mantenimiento / otras en el cash flow',
    G: 'Obra / Cliente → línea del cash flow y detector de duplicados',
    H: 'Orden de compra → distingue cobros',
    I: 'Concepto → distingue cobros',
    J: 'Monto neto → réplica en Supabase',
    K: 'IVA → réplica en Supabase',
    L: 'Retenciones y descuentos → réplica en Supabase',
    M: 'TOTAL a cobrar (neto de retenciones) → el importe que usa el cash flow',
    N: 'Forma de cobro → los echeq no acreditados son valores en cartera, no saldo de banco',
    O: 'Estado → separa facturado de proyectado',
    P: 'Fecha de vencimiento → fecha de cobro estimada',
    Q: 'Fecha de cobro real → la que manda para la caja',
    X: 'Retención 16,8% del neto',
    Y: 'Retención de Ganancias',
    Z: 'Retención 2,5%/3,5% del neto',
  },
  'Cheques Emitidos': {
    A: 'Tipo (físico / echeq)',
    B: 'N° de cheque',
    E: 'Proveedor',
    F: 'Monto',
    H: 'N° de comprobante → cruce contra Compras',
    I: 'Fecha de pago → cuándo hay que cubrirlo',
    K: 'Debitado → si ya salió de la cuenta',
    L: 'Unidad de negocio',
    M: 'Estado en el OS (lo escribe el OS)',
  },
  'Tarjeta de Credito': {
    C: 'Proveedor',
    E: 'Monto',
    G: 'N° de comprobante → cruce contra Compras',
    H: 'Fecha de pago',
    J: 'Debitado',
    K: 'Unidad de negocio',
  },
  'Jornales por Quincena': {
    A: 'Desde',
    B: 'Hasta → la fecha de caja de la quincena',
    C: 'Días hábiles',
    D: 'Personas',
    F: 'Horas reales',
    G: 'Banco / TOTAL PROYECTADO según el bloque',
    H: 'Adelanto',
    I: 'Total recibo',
    J: 'TOTAL QUINCENA → el importe que usa el cash flow',
  },
}

/** En qué fila está el encabezado de cada pestaña. No es la 1 en ninguna de las grandes: arriba
 *  tienen títulos y bandas de agrupación, y leer la fila 1 como encabezado daría columnas sin
 *  rótulo y, por lo tanto, huecos falsos. */
export const CABECERA = {
  Compras: 3,
  Cobranzas: 4,
  'Cheques Emitidos': 1,
  'Tarjeta de Credito': 2,
  'Jornales por Quincena': 2,
}

/** Columnas que el OS ESCRIBE y por lo tanto no son un hueco aunque nadie las lea.
 *
 *  SE DESACTUALIZÓ (21/07) y el control se llenó de ruido: el auditor reportaba como "dato que el
 *  OS no mira" las marcas que el propio OS había escrito el minuto anterior —"⚠ Control
 *  automático", "Qué dice el banco de este valor", "Estado en el OS"—. Un control que grita por
 *  algo correcto se deja de mirar, y entonces tapa el hallazgo real que aparece al lado. Cada vez
 *  que un script empiece a escribir una columna nueva, va acá. */
export const ESCRIBE_EL_OS = new Set([
  'Compras!AC', 'Compras!AD', 'Compras!AE', 'Compras!AF',
  'Cheques Emitidos!M',            // marca de cobertura (cash-flow-lineas: colMarca 12)
  'Tarjeta de Credito!L',          // marca de cobertura (colMarca 11)
  'Cobranzas!BA',                  // ⚠ Control automático (cobranzas-control: C_FLAG)
  'Cobranzas!BB',                  // qué dice el banco de ese valor (C_VALOR = 53)
  'Cobranzas!BC', 'Cobranzas!BD', 'Cobranzas!BE', // el bloque de control del pie
])

/** Columnas que son una FÓRMULA sobre otra columna que el OS sí lee.
 *
 *  No son un hueco: su contenido ya está contemplado por la columna de origen, y leerlas sería
 *  leer dos veces el mismo dato. "Fecha factura (mes)" es =TEXT(C;"mmm-yy") y el OS lee C. */
export const DERIVADA_DE = {
  'Compras!D': 'C — es =TEXT(C;"mmm-yy"), el mes de la fecha de factura',
  'Compras!R': 'Q — es =Q, la fecha prevista de pago',
  'Compras!U': 'T y O — es =T-O, el saldo del pago parcial',
}

/**
 * NÚCLEO PURO: compara lo declarado contra lo que hay cargado.
 * @param {string} pestaña
 * @param {Array<{col:string, rotulo:string, filas:number, monto:number}>} columnas lo que existe
 * @returns {{usadas:Array, huecos:Array, declaradas_vacias:Array}}
 */
export function comparar(pestaña, columnas = []) {
  const decl = USA[pestaña] ?? {}
  const usadas = []
  const huecos = []
  for (const c of columnas) {
    if (decl[c.col]) { usadas.push({ ...c, para: decl[c.col] }); continue }
    if (ESCRIBE_EL_OS.has(`${pestaña}!${c.col}`)) { usadas.push({ ...c, para: 'la escribe el OS' }); continue }
    const deriva = DERIVADA_DE[`${pestaña}!${c.col}`]
    if (deriva) { usadas.push({ ...c, para: `deriva de ${deriva}` }); continue }
    // Una columna sin rótulo Y sin filas no es un hueco: es una columna que no existe.
    if (!c.filas && !c.rotulo) continue
    huecos.push(c)
  }
  const presentes = new Set(columnas.map((c) => c.col))
  const declaradas_vacias = Object.keys(decl).filter((k) => !presentes.has(k))
  return { usadas, huecos, declaradas_vacias }
}
