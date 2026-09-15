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

import { normalizarRotulo } from './compras-columnas.mjs'

/**
 * LAS PESTAÑAS QUE SE DECLARAN POR RÓTULO (14/09/2026). Compras y Cobranzas reciben la columna «Obra»
 * (L y H): una declaración por letra pasaba a describir la columna de al lado y el auditor callaba el
 * hueco real. Un rótulo repetido lleva su ocurrencia: «Rubro de caja #2». Las demás, por letra.
 */
export const POR_ROTULO = new Set(['Compras', 'Cobranzas'])

/**
 * Qué usa el OS de cada pestaña. Clave = rótulo (Compras, Cobranzas) o letra (las demás); valor = para qué.
 * Las que no están acá se reportan como NO CONTEMPLADAS.
 */
export const USA = {
  Compras: {
    ID: 'ID — clave de la réplica en Supabase',
    'Categoría': 'Categoría → costos_obra.categoria',
    'Fecha factura': 'Fecha de factura → costos_obra.fecha (devengado, NO caja)',
    Proveedor: 'Proveedor → regla de rubro de caja y familia de material',
    Modalidad: 'Modalidad → costos_obra.modalidad',
    Tipo: 'Tipo → costos_obra.tipo',
    'N° Comprobante': 'N° de comprobante → cruce con cheques, tarjeta y ARCA',
    'Unidad de Negocio': 'Unidad de negocio → regla de rubro de caja',
    'Cliente / Asignación': 'Cliente / Asignación → obra a la que se imputa el costo',
    'Detalles / Obra': 'Detalles / Obra → frente de obra, 2ª pasada de familia de material',
    Concepto: 'Concepto → QUÉ se compró, 1ª pasada de familia de material',
    Importe: 'Importe neto → costos_obra.importe',
    IVA: 'IVA → costos_obra.iva',
    Total: 'Total con IVA → el importe que usa el cash flow',
    'Fecha prevista de pago (día)': 'Fecha prevista de pago → fecha de caja cuando no hay fecha contable',
    Estado: 'Estado → define la DEUDA: "Pendiente" es lo que se le debe al proveedor (lib/cuentas-por-pagar)',
    // ⚠ Se declaraba por letra (Y) como «Fecha contable del pago». El rótulo vivo de esa columna es
    // «Tipo de Costo» (medido el 14/09/2026). Se traduce a su rótulo para no cambiar lo que el auditor
    // informa en esta migración; si el OS de verdad no la lee, es un hueco que hay que declarar.
    'Tipo de Costo': 'Fecha contable del pago → fecha de caja (la que manda)',
    'Rubro de caja #2': 'Rubro de caja (la escribe el OS)',
    'Fecha de caja': 'Fecha de caja (la escribe el OS)',
    'Familia de material': 'Familia de material (la escribe el OS)',
    'Sub-rubro de estructura': 'Sub-rubro de estructura (la escribe el OS)',
  },
  Cobranzas: {
    ID: 'ID — detector de duplicados',
    'Fecha de Venta': 'Fecha de emisión',
    'N° Comprobante': 'N° de comprobante → distingue cobros del mismo cliente y monto',
    Unidad: 'Unidad → separa Civil / Mantenimiento / otras en el cash flow',
    'Obra / Cliente': 'Obra / Cliente → línea del cash flow y detector de duplicados',
    'ORDEN DE COMPRA': 'Orden de compra → distingue cobros',
    Concepto: 'Concepto → distingue cobros',
    'Monto neto': 'Monto neto → réplica en Supabase',
    IVA: 'IVA → réplica en Supabase',
    'Retenciones / descuentos': 'Retenciones y descuentos → réplica en Supabase',
    'TOTAL a cobrar (neto de retenciones)': 'TOTAL a cobrar (neto de retenciones) → el importe que usa el cash flow',
    'Forma de Cobro': 'Forma de cobro → los echeq no acreditados son valores en cartera, no saldo de banco',
    Estado: 'Estado → separa facturado de proyectado',
    'Fecha de Factura': 'Fecha de vencimiento → fecha de cobro estimada',
    'Fecha cobro': 'Fecha de cobro real → la que manda para la caja',
    'Retención 16,8% del neto ▲ rótulo original perdido': 'Retención 16,8% del neto',
    'Ret Ganancias': 'Retención de Ganancias',
    'Retención 2,5%/3,5% del neto ▲ rótulo original perdido': 'Retención 2,5%/3,5% del neto',
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
export const ESCRIBE_EL_OS = {
  Compras: ['Rubro de caja #2', 'Fecha de caja', 'Familia de material', 'Sub-rubro de estructura'],
  'Cheques Emitidos': ['M'],       // marca de cobertura (cash-flow-lineas: colMarca 12)
  'Tarjeta de Credito': ['L'],     // marca de cobertura (colMarca 11)
}

/**
 * EL BLOQUE QUE EL OS ESCRIBE A LA DERECHA DE COBRANZAS, POR SU RÓTULO ANCLA.
 *
 * Desde «⚠ Control automático» (cobranzas-control: C_FLAG, hoy con la marca ▲) hacia la derecha: la
 * columna de qué dice el banco del valor y el bloque de control del pie. Sus rótulos llevan la fecha
 * y montos del día, así que no se pueden declarar uno por uno; se declara dónde empieza el bloque.
 */
export const BLOQUE_DEL_OS = { Cobranzas: /control automático/i }

/** Columnas que son una FÓRMULA sobre otra columna que el OS sí lee.
 *
 *  No son un hueco: su contenido ya está contemplado por la columna de origen, y leerlas sería
 *  leer dos veces el mismo dato. "Fecha factura (mes)" es =TEXT(C;"mmm-yy") y el OS lee C. */
export const DERIVADA_DE = {
  Compras: {
    'Fecha factura (mes)': 'Fecha factura — es =TEXT(fecha;"mmm-yy"), el mes de la fecha de factura',
    'Fecha prevista de pago (mes)': 'Fecha prevista de pago (día) — es una copia de la fecha prevista',
    'Monto Parcial 1': 'Monto Pagado y Total — es Monto Pagado − Total, el saldo del pago parcial',
    // 21/07: verificadas leyendo la fórmula real de cada una, no supuestas por el rótulo.
    // ⚠ Se declaraba por letra (AA) como «semáforo del estado de pago». El rótulo vivo de esa columna es
    // «Estado Carga» (14/09/2026); el semáforo es «Estado pago», la de su izquierda. Se traduce a su
    // rótulo para no cambiar lo que el auditor informa en esta migración, y queda para revisar.
    'Estado Carga': 'Total y Estado — semáforo del estado de pago',
  },
  Cobranzas: {
    'Mes cobro (auto)': 'Fecha cobro — es =TEXT(fecha;"mmm-yy"), el mes de la fecha de cobro',
    'Monto ponderado': 'TOTAL a cobrar y Probabilidad — el monto ponderado por probabilidad',
    'Días hasta vto.': 'Monto neto y Estado — los días hasta el vencimiento',
    'Estado cobro': 'Monto neto y Estado — el semáforo del estado de cobro',
  },
  'Cheques Emitidos': {
    D: 'C — es =C, una copia de la fecha de emisión',
    J: 'I — es =I, una copia de la fecha de pago',
  },
  'Tarjeta de Credito': {
    B: 'A — es =A, una copia de la fecha de compra',
    I: 'H — es =H, una copia de la fecha de pago',
  },
  'Jornales por Quincena': {
    E: 'C, D y Parámetros!B43 — horas × dotación × jornal',
    K: '_J_OBREROS — suma del espejo que el OS refresca',
    // La columna Estado del registro: =IF(B<=TODAY();"cerrada";"en curso"). Deriva de B (Hasta) y se
    // recalcula sola; es la que distingue la quincena en curso de las cerradas. No es un hueco.
    L: 'B — "cerrada"/"en curso" según si el último día de la quincena ya pasó (=B<=TODAY())',
  },
}

/**
 * Columnas que el OS LEE PARA CONTROLARLAS, y deliberadamente NO consume.
 *
 * POR QUÉ EXISTE ESTA TERCERA CATEGORÍA (21/07). "Leída" y "no leída" no alcanzaban. Las columnas
 * de pago de Compras están a medio llenar y se contradicen entre sí: hay filas marcadas "Pagado"
 * con el monto pagado en blanco. Consumirlas haría desaparecer plata del cuadro; ignorarlas dejaría
 * la contradicción sin dueño. La decisión fue leerlas para MOSTRAR el conflicto —eso hace
 * consistencia-compras.mjs— sin usarlas como fuente de ningún número.
 *
 * No son un hueco: son una decisión declarada. Y no son "usadas": el cuadro no depende de ellas.
 */
export const CONTROLA_EL_OS = {
  Compras: {
    'Total o Parcial': 'Total o Parcial — se contrasta contra Monto Pagado y Estado, no se consume (consistencia-compras)',
    'Monto Pagado': 'Monto Pagado — a medio llenar: hay "Pagado" con el monto vacío. Se controla, no se consume',
  },
}

/**
 * NÚCLEO PURO: la clave de cada columna — su rótulo normalizado (con « #n» si se repite) en las pestañas
 * por rótulo, su letra en las demás.
 * @param {string} pestaña
 * @param {Array<{col:string, rotulo:string}>} columnas
 */
export function clavesDeColumnas(pestaña, columnas = []) {
  if (!POR_ROTULO.has(pestaña)) return columnas.map((c) => c.col)
  const vistos = new Map()
  return columnas.map((c) => {
    const k = normalizarRotulo(c.rotulo)
    const n = (vistos.get(k) ?? 0) + 1
    vistos.set(k, n)
    return n === 1 ? k : `${k} #${n}`
  })
}

/** Una declaración con sus claves comparables contra `clavesDeColumnas`. */
const declarada = (pestaña, obj = {}) => (POR_ROTULO.has(pestaña)
  ? Object.fromEntries(Object.entries(obj).map(([k, v]) => [normalizarRotulo(k), v]))
  : { ...obj })

/**
 * NÚCLEO PURO: compara lo declarado contra lo que hay cargado.
 * @param {string} pestaña
 * @param {Array<{col:string, rotulo:string, filas:number, monto:number}>} columnas lo que existe
 * @returns {{usadas:Array, huecos:Array, declaradas_vacias:Array}}
 */
export function comparar(pestaña, columnas = []) {
  const decl = declarada(pestaña, USA[pestaña])
  const escribe = declarada(pestaña, Object.fromEntries((ESCRIBE_EL_OS[pestaña] ?? []).map((k) => [k, true])))
  const controla = declarada(pestaña, CONTROLA_EL_OS[pestaña])
  const deriva = declarada(pestaña, DERIVADA_DE[pestaña])
  const claves = clavesDeColumnas(pestaña, columnas)
  const ancla = BLOQUE_DEL_OS[pestaña]
  const desdeBloque = ancla ? columnas.findIndex((c) => ancla.test(String(c.rotulo ?? ''))) : -1
  const usadas = []
  const huecos = []
  columnas.forEach((c, i) => {
    const k = claves[i]
    if (decl[k]) { usadas.push({ ...c, para: decl[k] }); return }
    if (escribe[k] || (desdeBloque >= 0 && i >= desdeBloque)) { usadas.push({ ...c, para: 'la escribe el OS' }); return }
    if (controla[k]) { usadas.push({ ...c, para: `la CONTROLA el OS: ${controla[k]}` }); return }
    if (deriva[k]) { usadas.push({ ...c, para: `deriva de ${deriva[k]}` }); return }
    // Una columna sin rótulo Y sin filas no es un hueco: es una columna que no existe.
    if (!c.filas && !c.rotulo) return
    huecos.push(c)
  })
  const presentes = new Set(claves)
  const declaradas_vacias = Object.keys(decl).filter((k) => !presentes.has(k))
  return { usadas, huecos, declaradas_vacias }
}
