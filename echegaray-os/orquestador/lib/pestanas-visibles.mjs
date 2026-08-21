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

/** Empieza con guión bajo y AUN ASÍ se queda a la vista. El motivo va al lado, no se infiere. */
export const A_LA_VISTA_A_PROPOSITO = {
  _CAJA_ANEXO: 'es el detalle que sostiene los controles de CAJA: se abre cuando algo no cierra',
  _PRESUPUESTO_MENSUAL: 'lo escribe el dueño a mano',
  _CRUCE_ARCA: 'es un CONTROL (319 discrepancias ARCA↔Compras), no una captura — pero hoy ya está oculta: revisarlo es otra decisión',
}

/** Los `updateSheetProperties` para ocultar, sólo de las que hoy están visibles. */
export function pedidosDeOcultar(hojas = []) {
  const porNombre = new Map(hojas.map((h) => [h.title, h]))
  const cambios = []
  const yaOcultas = []
  const noEstan = []
  for (const nombre of ESPEJOS_A_OCULTAR) {
    const h = porNombre.get(nombre)
    if (!h) { noEstan.push(nombre); continue }
    if (h.hidden) { yaOcultas.push(nombre); continue }
    cambios.push({ updateSheetProperties: { properties: { sheetId: h.sheetId, hidden: true }, fields: 'hidden' } })
  }
  return { cambios, yaOcultas, noEstan }
}
