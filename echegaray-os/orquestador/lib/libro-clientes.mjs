// EL CATÁLOGO DE CLIENTES DEL LIBRO — una sola forma de nombrar al cliente, en los dos signos.
//
// ═══ POR QUÉ EXISTE (06/08/2026) ═══
//
// El dueño: *"en los cash flows semanal y mensual, discriminame como subconcepto a cada uno de los
// clientes con su monto de ingresos y de egresos reales y proyectados"*.
//
// Para poner el ingreso y el egreso de un cliente en la misma fila hace falta que las dos puntas lo
// llamen igual, y **hoy no lo hacen**. Medido sobre el archivo vivo el 06/08/2026:
//
//   · el INGRESO trae el nombre de `Cobranzas!G` ("Obra / Cliente"): "LA ESTRELLA /ALIMENTOS DEL SUR SAS"
//   · el EGRESO trae el de `Compras!J` ("Cliente / Asignación"):     "LA ESTRELLA"
//
// Comparadas como cadenas exactas son dos clientes distintos, y el cuadro mostraría los $164,8M
// cobrados en una fila y los $37,3M pagados en otra. Acá se declara UNA vez qué alias corresponde a
// qué cliente, el Libro guarda el nombre canónico en su columna `Cliente`, y las dos vistas filtran
// por igualdad exacta sobre esa columna.
//
// ═══ QUÉ ES DATO Y QUÉ ES INFERENCIA — SIN MEZCLAR ═══
//
// **DATO REAL.** Las cadenas de `alias` son las que están escritas hoy en el archivo, copiadas tal
// cual del inventario vivo de `_MOVIMIENTOS` y de `Compras!J`. No se inventó ninguna: un alias que no
// exista sólo hace que una lista sea más larga, pero un alias mal transcripto hace que una sub-línea
// sume cero para siempre sin dar un solo error — el filtro es por igualdad.
//
// **INFERENCIA (ver `ALIAS_INFERIDOS`).** Que dos cadenas distintas sean el MISMO cliente es una
// lectura mía, no un dato del archivo. Son dos y están declaradas una por una con su evidencia. Es
// una inferencia de nivel C (patrón probable) y **necesita el visto del dueño para pasar a regla**:
// hasta entonces, lo que hace es agrupar filas en un cuadro, no cambiar ningún saldo.
//
// ═══ Y POR QUÉ NO SE ADIVINA POR PARECIDO ═══
//
// El match es por igualdad sobre el texto normalizado (mayúsculas, espacios colapsados). Nada de
// `includes` ni de distancia de edición: "San Francisco" está adentro de "IMOTOR/San Francisco/JAVI
// SANCHEZ" y también estaría adentro de cualquier proveedor que se llamara "Corralón San Francisco".
// Una regla que acierta dos veces y falla la tercera en silencio es peor que una lista larga.
//
// Lo que no está en el catálogo NO desaparece: cae en el residuo `SIN_CLIENTE`, que la vista publica
// como una línea visible ("Otros y sin asignar") calculada POR DIFERENCIA contra el subtotal. Un
// cliente nuevo aparece ahí y se ve.

/** El valor del campo cuando el movimiento no tiene cliente reconocido. Vacío, nunca un rótulo. */
export const SIN_CLIENTE = ''

/** Cómo se llama el residuo en el cuadro. Dice las DOS cosas que contiene, porque contiene las dos. */
export const ROTULO_SIN_CLIENTE = 'Otros y sin asignar'

/**
 * LOS CLIENTES, con las cadenas exactas con que cada fuente los nombra.
 *
 * El `nombre` canónico es el de `Compras!J` cuando existe de los dos lados: es el más corto y es el
 * que el dueño tipea. El orden es por peso de caja movida (ingresos reales + proyectados, 06/08/2026).
 *
 * Los montos de los comentarios son la EVIDENCIA de por qué cada uno está en la lista — no se usan
 * para calcular nada, y por eso pueden envejecer sin romper: lo que decide es el filtro por nombre.
 */
export const CLIENTES = Object.freeze([
  Object.freeze({
    nombre: 'LA ESTRELLA',
    // Ingresos $164,8M reales + $26,5M proyectados (16 cobranzas) · 295 filas de Compras asignadas.
    alias: Object.freeze(['LA ESTRELLA', 'LA ESTRELLA /ALIMENTOS DEL SUR SAS', 'ALIMENTOS DEL SUR SA']),
  }),
  Object.freeze({
    nombre: 'San Francisco',
    // Ingresos $104,8M reales (8 cobranzas, bajo el rótulo con IMOTOR) + $95,3M proyectados (12) ·
    // 140 filas de Compras asignadas.
    alias: Object.freeze(['San Francisco', 'IMOTOR/San Francisco/JAVI SANCHEZ']),
  }),
  Object.freeze({
    nombre: 'MESSINA',
    // Ingresos $36,9M reales + $152,5M proyectados (18 cobranzas) · 38 filas de Compras.
    // `_CHEQUES_RAW!K` ("Obra") también escribe "MESSINA": la cartera cae en el mismo cliente sola.
    alias: Object.freeze(['MESSINA', 'Manufacturas Quimicas Juan Messina SA']),
  }),
  Object.freeze({
    nombre: 'Quattropani - Melisa García SAS',
    // Ingresos $72,8M reales + $65,6M proyectados (13 cobranzas) · 3 filas de Compras.
    alias: Object.freeze(['Quattropani - Melisa García SAS']),
  }),
  Object.freeze({
    nombre: 'ARCOR',
    // Ingresos $42,3M reales + $18,8M proyectados (17 cobranzas) · 42 filas de Compras.
    alias: Object.freeze(['ARCOR']),
  }),
  Object.freeze({
    nombre: 'LIRIO DANIEL RAMIRO',
    // Ingresos $17,3M reales en una sola cobranza. Sin egresos asignados: está por el monto, no por
    // la recurrencia, y si el año que viene no vuelve a aparecer se saca de la lista.
    alias: Object.freeze(['LIRIO DANIEL RAMIRO']),
  }),
])

/**
 * LAS DOS ÚNICAS INFERENCIAS DE ESTE ARCHIVO, con su evidencia y su límite.
 *
 * Todo lo demás es igualdad de cadenas idénticas. Esto es lo que un tercero tiene que revisar, y por
 * eso está exportado y no escondido en un comentario: un test lo recorre y verifica que cada alias
 * inferido esté efectivamente en el catálogo del cliente que dice.
 */
export const ALIAS_INFERIDOS = Object.freeze([
  Object.freeze({
    alias: 'IMOTOR/San Francisco/JAVI SANCHEZ',
    cliente: 'San Francisco',
    evidencia: 'el rótulo contiene "San Francisco" y sus 8 cobranzas ($104,8M reales) son las del mismo '
      + 'período en que Compras asigna 140 filas a "San Francisco"; no hay ninguna cobranza a "San '
      + 'Francisco" solo con estado Cobrado.',
    confianza: 'alta, pendiente del visto del dueño',
  }),
  Object.freeze({
    alias: 'ALIMENTOS DEL SUR SA',
    cliente: 'LA ESTRELLA',
    evidencia: 'Cobranzas nombra al cliente "LA ESTRELLA /ALIMENTOS DEL SUR SAS"; el librador del '
      + 'cheque en cartera por $10.000.000 es "Alimentos Del Sur SA". Es la misma razón social del '
      + 'rótulo compuesto, con la abreviatura societaria distinta.',
    confianza: 'alta, pendiente del visto del dueño',
  }),
  Object.freeze({
    alias: 'Manufacturas Quimicas Juan Messina SA',
    cliente: 'MESSINA',
    evidencia: '_CHEQUES_RAW trae ese librador con su columna "Obra" en "MESSINA": la asignación la '
      + 'hizo el propio archivo, acá sólo se acepta el librador además del rótulo de obra.',
    confianza: 'alta, pendiente del visto del dueño',
  }),
])

/** Los nombres canónicos, en el orden en que se leen. PURA. */
export const nombresDeClientes = () => CLIENTES.map((c) => c.nombre)

/** Mayúsculas y espacios colapsados. Lo único que se tolera: el archivo escribe " LA ESTRELLA ". */
const norm = (s) => String(s ?? '').trim().replace(/\s+/g, ' ').toUpperCase()

/** alias normalizado → nombre canónico. Se arma una vez: el catálogo no cambia en runtime. */
const POR_ALIAS = new Map(CLIENTES.flatMap((c) => c.alias.map((a) => [norm(a), c.nombre])))

/**
 * NÚCLEO PURO: el nombre canónico de un cliente a partir de cualquiera de sus alias.
 *
 * Devuelve `SIN_CLIENTE` para todo lo que no esté en el catálogo — incluidas las asignaciones de
 * `Compras!J` que NO son clientes ("Administracion", "Taller", "Almacen", "Plan de pago", "F931",
 * "UOCRA", "IERIC", "FCL", "FODECO", "Credito Prendario", "Sueldos", "Vehiculos / Maquinas"). Esas
 * son centros de costo internos: contarlas como clientes inventaría seis clientes que no existen.
 *
 * @param {string} texto lo que dice la fuente
 * @returns {string} el nombre canónico, o `SIN_CLIENTE`
 */
export function clienteCanonico(texto) {
  return POR_ALIAS.get(norm(texto)) ?? SIN_CLIENTE
}

/** ¿Este nombre es uno de los canónicos? Para que nadie tipee un cliente que el Libro no emite. PURA. */
export const esClienteCanonico = (nombre) => CLIENTES.some((c) => c.nombre === nombre)
