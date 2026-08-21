// QUÉ PESTAÑA VE UNA PERSONA Y CUÁL NO.
//
// El dueño: *«depures la visual de pestañas del sheet flujo de fondos [...] ocultando aquellas que
// no son más que de captura de algún dato»*.
//
// ═══ EL CRITERIO, QUE NO ES «EMPIEZA CON GUIÓN BAJO» ═══
//
// Una pestaña se oculta cuando cumple LAS TRES cosas:
//   1. La escribe un script — nunca una persona. Se verifica por ausencia en `sheet_tab_firma`:
//      la firma anti-pisado sólo existe donde alguien puede tocar el contenido.
//   2. Alguien la lee por fórmula. Ocultar una pestaña muerta no es depurar, es esconder basura;
//      si nadie la lee, el hallazgo es que sobra, y eso lo decide una persona.
//   3. No es un CONTROL. `_CRUCE_ARCA` empieza con guión bajo y no es captura: son 319
//      discrepancias entre ARCA y Compras. Un control escondido es un control que no existe.
//
// Por eso la lista se escribe a mano y no se deduce del nombre. Tres contraejemplos vivos:
//   · `_UOCRA_RAW` es un espejo pero se carga A MANO (el boletín de paritaria) — quien la actualiza
//     cada mes tiene que poder encontrarla. Ya estaba oculta antes de esto; no la tocamos.
//   · `_PRESUPUESTO_MENSUAL` empieza con guión bajo y lo escribe el dueño. NO se oculta.
//   · `_CAJA_ANEXO` es el detalle que sostiene los controles de CAJA: se abre justo cuando algo no
//      cierra. NO se oculta.
//
// Ocultar cambia una PROPIEDAD de la pestaña (`hidden`), no una celda. No borra, no reescribe
// fórmulas —las referencias son por nombre, no por posición— y se revierte con un clic.

/** Espejos de una fuente externa: los escribe un script y nadie los abre. */
export const ESPEJOS_A_OCULTAR = [
  '_J_OBREROS',      // espejo de JORNALES (obreros) — lo lee Jornales por Quincena
  '_J_OFICINA',      // espejo de JORNALES (oficina) — lo lee Jornales por Quincena
  '_ARCA_RAW',       // comprobantes de ARCA — lo leen Impuestos y Financieros, Materiales
  '_F931_RAW',       // F931 — lo lee Cargas Sociales
  '_BANCO_RAW',      // extracto del Santander — lo leen 5 pestañas
  '_IIBB_RAW',       // Ingresos Brutos San Juan — lo lee Impuestos y Financieros
  '_CHEQUES_RAW',    // cheques y eCHEQ — lo leen Cheques Recibidos, CAJA, _CAJA_ANEXO
  '_UOCRA_DDJJ_RAW', // DDJJ nominativa de UOCRA — lo lee Cargas Sociales
]

/**
 * SEGUNDA VUELTA (21/08/2026) — LAS QUE NO SON DE SU USO.
 *
 * El dueño, después de la primera tanda: *«siguen habiendo pestañas q no son de mi uso, podés
 * ocultarlas, vos podés seguir usándolas pero yo no y me confunden»*.
 *
 * Acá el criterio ya no es «la escribe un script»: es **si él la abre**. Ocultar no impide que una
 * fórmula ni un generador la lean, así que el OS sigue usándolas igual.
 *
 * Se midió, no se supuso. `sheet_tab_firma` NO servía —se sella después de cualquier escritura
 * guardada, así que las 23 visibles tenían firma de hoy—; lo que sí sirvió fue el historial de
 * revisiones de Drive, que distingue al robot de una persona, cruzado con cuántas fórmulas
 * externas lee cada pestaña.
 */
export const NO_LAS_USA_A_OCULTAR = {
  '01_Valores Iniciales': 'parámetros de arranque que se cargan UNA vez (declarado así en el código). '
    + 'Sin tocar desde el 07/08. De sus cuatro filas sólo «Caja mínima deseada» tiene consumidor real '
    + '(el rango CAJA_MINIMA, 3 usos en _CAJA_ANEXO) — y un rango con nombre sigue funcionando oculto.',
  'Deuda viva (OS)': 'publica EXACTAMENTE el mismo total que Proveedores ($11.921.115 al 21/08). Cero '
    + 'fórmulas externas la leen. Dos pestañas con el mismo número es justo lo que confunde. Se oculta '
    + 'ahora y su detalle por comprobante se funde dentro de Proveedores cuando ese generador se repare.',
  // ═══ «Cheques Recibidos» VUELVE A LA VISTA (21/08/2026) ═══
  //
  // La oculté con un argumento medido —vista de 9 filas, $0 en cartera, cero fórmulas del libro la
  // leen— y el dueño la pidió de vuelta: *«qué pasó con la pestaña de cheques recibidos, devolvela a
  // donde y como estaba»*. No hay nada que discutir: él la abre, y eso es lo único que decide si una
  // pestaña se ve. Mi criterio medía lo que el OS necesita, no lo que él mira.
  //
  // NO se anota en LAS_OCULTO_EL_DUENO —esa lista es para lo que ocultó ÉL— pero tampoco vuelve a
  // esta: el test de abajo fija que no puede entrar a ninguna lista de ocultar.
}

/**
 * LAS QUE OCULTÓ ÉL, Y QUE NADIE VUELVE A MOSTRAR.
 *
 * Mientras yo analizaba cuáles convenía ocultar, el dueño entró y ocultó seis con la mano. Tres de
 * ellas —`Parámetros`, `_CAJA_ANEXO`, `_PRESUPUESTO_MENSUAL`— eran exactamente las que mi análisis
 * había DESCARTADO, con argumentos razonables: 237 fórmulas leen Parámetros, `_CAJA_ANEXO` tiene su
 * zona de conteo de efectivo, `_PRESUPUESTO_MENSUAL` dice en su celda A2 «Lo escribe el dueño».
 *
 * Los argumentos no importan: **la edición manual del dueño es la verdad definitiva.** Él dijo que
 * no las usa y que lo confunden; ninguno de esos tres motivos contradice eso —hablan de lo que el
 * OS necesita, no de lo que él abre—, y ocultar no le saca la lectura a ninguna fórmula.
 *
 * Esta lista existe para que `--mostrar` NO se las devuelva a la vista. Deshacer lo mío es correcto;
 * deshacer lo suyo, no.
 */
export const LAS_OCULTO_EL_DUENO = [
  '01_Valores Iniciales',
  'Parámetros',
  'Deuda viva (OS)',
  '_CAJA_ANEXO',
  '_PRESUPUESTO_MENSUAL',
  'Calendario de Cobros',
]

/** Empieza con guión bajo y AUN ASÍ se queda a la vista. El motivo va al lado, no se infiere. */
//
// `_CAJA_ANEXO` y `_PRESUPUESTO_MENSUAL` estaban acá hasta el 21/08 con buenos argumentos —una
// tiene el conteo de efectivo, la otra dice «Lo escribe el dueño» en su celda A2—. Él las ocultó
// igual. Salieron de esta lista y entraron a `LAS_OCULTO_EL_DUENO`: un motivo del OS no le gana a
// una decisión suya.
export const A_LA_VISTA_A_PROPOSITO = {
  _CRUCE_ARCA: 'es un CONTROL (319 discrepancias ARCA↔Compras), no una captura — pero hoy ya está oculta: revisarlo es otra decisión',
}

/** ¿Puede `--mostrar` devolver esta pestaña a la vista? Sólo si la ocultó el OS, no el dueño. */
export function sePuedeVolverAMostrar(nombre) {
  return !LAS_OCULTO_EL_DUENO.includes(nombre)
}

/** Los `updateSheetProperties` para ocultar, sólo de las que hoy están visibles. */
export function pedidosDeOcultar(hojas = []) {
  const porNombre = new Map(hojas.map((h) => [h.title, h]))
  const cambios = []
  const yaOcultas = []
  const noEstan = []
  for (const nombre of [...ESPEJOS_A_OCULTAR, ...Object.keys(NO_LAS_USA_A_OCULTAR)]) {
    const h = porNombre.get(nombre)
    if (!h) { noEstan.push(nombre); continue }
    if (h.hidden) { yaOcultas.push(nombre); continue }
    cambios.push({ updateSheetProperties: { properties: { sheetId: h.sheetId, hidden: true }, fields: 'hidden' } })
  }
  return { cambios, yaOcultas, noEstan }
}
