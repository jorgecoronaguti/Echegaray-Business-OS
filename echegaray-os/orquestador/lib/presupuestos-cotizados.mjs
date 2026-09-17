// EL COSTO COTIZADO DE CADA OBRA ACTIVA — transcripción de las cotizaciones internas (.xlsm) de Drive.
//
// QUÉ ES (17/09/2026). Módulo de DATOS puro: sin red, sin base. Cada presupuesto cita la celda de la
// que sale cada número (hoja!celda) y el drive id del archivo. Lo carga
// `orquestador/scripts/cargar-presupuestos-cotizados.mjs` en `public.presupuestos` y
// `public.partidas_presupuesto`, y de ahí lo lee `obra_economia.costo_objetivo`.
//
// ═══ CÓMO SE LEE LA PLANTILLA (verificado en las fórmulas de las 24 .xlsm) ═══
//
//   Presupuesto!H  costo directo del ítem (cantidad × costo unitario de Análisis × coeficiente)
//   Presupuesto!O  MO: recursos en «hs» (oficial, ayudante, oficial especializado)
//   Presupuesto!Q  CS: CARGAS SOCIALES (recursos en «hr» paralelos a las horas) — NO son equipos
//   Presupuesto!P  MA: materiales, y también alquiler de equipos, fletes y plataformas
//   SC (sin clasificar) = H − O − P − Q en ítems sin análisis o con O/P/Q en cero.
//   La fila «COSTO DIRECTO TOTAL» suma O/P/Q desde la SEGUNDA fila de ítems: por eso MO/CS/MA se
//   suman ítem por ítem, nunca de esa fila.
//
// ═══ ESTO NO ES EL COSTO RESTANTE PROYECTADO ═══
//
// `obras-datos.mjs` guarda la explosión de gastos del dueño escalada por lo NO ejecutado (pestaña
// OBRAS «Costo proyectado»). Esto es el costo cotizado TOTAL, la línea de base del margen.
//
// CONVENCIONES
// · montos en ARS sin IVA, con centavos tal como salen de la celda.
// · `inferencia: true` marca un número que no está escrito en una celda (recálculo o % aplicado a
//   otra base). Su `fuente` lo dice con la palabra INFERENCIA.
// · un rubro en cero no se carga como partida (partidas_presupuesto exige monto > 0).

export const MOTIVO_BSA = 'recotización 2026 sin costo cotizado; pedido al dueño'

/** Las 10 obras activas al 17/09/2026. Cada una tiene exactamente un presupuesto 'aprobado'. */
export const OBRAS_ACTIVAS = [
  'quattropani', 'le-comedor', 'messina-bsa', 'messina-playon-azufre', 'messina-playon-dilucion-acido',
  'messina-pisos-120-rampa', 'messina-adicional-tercer-muro', 'instalacion-electrica',
  'pisos-industriales', 'entrepiso-y-escalera',
]

const p = (codigo, descripcion, monto) => ({ codigo, descripcion, monto })

export const PRESUPUESTOS = [
  {
    obra: 'quattropani', version: 1, estado: 'aprobado', fecha: '2026-07-27',
    venta: 92452500.00, moneda: { original: 'USD', monto: 63000, tipoCambio: 1467.5, origen: 'tipo de cambio del archivo: Cotizacion Final.xlsm OFERTA!G42 = 1.467,5 (no es el vigente)' },
    // COSTO DIRECTO = MO + CS de la cotización + el FONDO DE MATERIALES del contrato (decisión 17/09/2026):
    // la oferta es sólo MO; los materiales se presupuestaron en el contrato como fondo administrado.
    // GG y beneficio siguen calculados sobre MO+CS, como en el archivo: no se recalculan sobre el fondo.
    costoDirecto: 83703081.56, costoIndirecto: 9898228.06, margen: 10888050.87, hh: null, inferencia: true,
    fuente: 'Cotizacion Final.xlsm drive 19rYSz2s1oFs0DIHyEFh9qV_bY0ZwTNKC · venta OFERTA!F43 = USD 63.000 (= Cotizacion APROBADA.pdf drive 1FYfhFF3sHTSA2TcFq5GNFOhnmIY2Tw-F, 27/07/2026) · oferta sólo MO: costo = MO Presupuesto!O10:O43 + CS Presupuesto!Q10:Q43 · INFERENCIA: GG = 25% (Presupuesto!E56) × (MO+CS); beneficio = 22% (Presupuesto!E60) × (costo+GG); venta ARS = USD × OFERTA!G42',
    notas: 'Materiales por fondo administrado ($ 44.110.169,31, contrato) fuera de la oferta de MO. HH no confiables en el archivo: no se cargan. El .xlsm fue modificado el 05/09/2026, después de la aprobación; los USD de OFERTA!F14:F41 están tipeados.',
    partidas: [
      p('MO', 'Mano de obra · Presupuesto!O (Σ ítems)', 20115544.67), p('CS', 'Cargas sociales · Presupuesto!Q (Σ ítems)', 19477367.58),
      p('MA', 'obra_contrato: fondo de materiales del contrato · CONTRATO DE OBRA Y MEMORIA DESCRIPTIVA.docx drive 1glixkTWr5HDDKdzsniqoBJLZias5DLn9 cláusula 4', 44110169.31),
    ],
  },
  {
    obra: 'le-comedor', version: 1, estado: 'aprobado', fecha: '2025-12-15',
    venta: 137914961.79, costoDirecto: 81963999.15, costoIndirecto: 16948053.27, margen: 25311029.30, hh: null, inferencia: false,
    fuente: 'OBRA: COTIZACION INTERNA CON PANELES version 2.xlsm drive 11vyK-T_DdoxYPwsYI4SLIIO3zX-1VGWs · venta OFERTA!E37 = 120.438.881,80 (= COTIZACION FINAL.pdf drive 1XC9B9LB_qIaA2EIu219lTJTB2OkpA7Uo, 15/12/2025) · costo Presupuesto!H62 · GG Presupuesto!H64 · beneficio Presupuesto!H68 | ADICIONAL: ADICIONALES.xlsm drive 1M_p-AQaFXRY0UF8ccH_NKHV4SM5DlMht · venta Sheet Flujo de Fondos Cobranzas fila 36 = 17.476.079,99 · costo Presupuesto!H62 · GG Presupuesto!H64 · beneficio Presupuesto!H68',
    notas: 'Sin contrato firmado (dueño, 17/09/2026: «no hay contrato, están ok repartidos»): la venta de referencia es la cotizada, obra + adicional de Cobranzas. PENDIENTE DE EXPLICACIÓN: el adicional vendido en Cobranzas (17.476.079,99) supera en 900.000 al PDF del adicional (16.576.079,99, drive 1hotfx1FVJxMJBO52lzgX5PBkLG7yf4kJ). DATO SIN RESPALDO, no corregido acá: obra_canonica.monto_contratado = 246.149.261. HH no cargadas: el adicional tiene ítems sin código de análisis.',
    partidas: [
      p('MO', 'Obra · Mano de obra · Presupuesto!O (Σ ítems)', 17419996.57),
      p('CS', 'Obra · Cargas sociales · Presupuesto!Q (Σ ítems)', 15556213.90),
      p('MA', 'Obra · Materiales, equipos y subcontratos · Presupuesto!P (Σ ítems)', 37875536.19),
      p('SC', 'Obra · Sin clasificar · Presupuesto!H − O − P − Q', 1858028.49),
      p('ADIC-MO', 'Adicional · Mano de obra · Presupuesto!O (Σ ítems)', 1665210.00),
      p('ADIC-CS', 'Adicional · Cargas sociales · Presupuesto!Q (Σ ítems)', 1708560.00),
      p('ADIC-MA', 'Adicional · Materiales · Presupuesto!P (Σ ítems)', 210.00),
      p('ADIC-SC', 'Adicional · Sin clasificar (ítems sin código) · Presupuesto!H − O − P − Q', 5880244.00),
    ],
  },
  {
    obra: 'messina-bsa', version: 1, estado: 'reemplazado', fecha: '2024-09-11',
    venta: 27153478.82, costoDirecto: 16389001.90, costoIndirecto: 3277800.38, margen: 4326696.60, hh: null, inferencia: false,
    fuente: 'PRESUPUESTO FINAL - DEMOLICION Y PILETA DE CONTENCION - FI 12.xlsm drive 1rKUCSYZHeUsFWOjbOySCOoueqqz7kWRi · venta OFERTA!E22 (= PDF FI 12 drive 1LH8OMI9P9Alq9UiVVLX4fumTXnNumgfY, 11/09/2024) · costo Presupuesto!H69 (= «Gastos - BSA Messinas (1).pdf» drive 109lY96XQKcBuKqHUxW0mh7kX9qAefw7X) · GG Presupuesto!H71 · beneficio Presupuesto!H75',
    notas: 'Versión anterior, NO vigente: precios 2024. Reemplazada por la recotización 2026 (v2).',
    partidas: [
      p('MO', 'Mano de obra · Presupuesto!O (Σ ítems)', 2082964.80),
      p('CS', 'Cargas sociales · Presupuesto!Q (Σ ítems)', 1432825.50),
      p('MA', 'Materiales, equipos y subcontratos · Presupuesto!P (Σ ítems)', 12873211.60),
    ],
  },
  {
    obra: 'messina-bsa', version: 2, estado: 'aprobado', fecha: '2026-06-18',
    venta: 17704199.40, costoDirecto: null, costoIndirecto: null, margen: null, hh: null, inferencia: false,
    costoPendienteMotivo: MOTIVO_BSA,
    fuente: 'Sheet Flujo de Fondos Cobranzas filas 45 y 46 (OC 00002-00000279, saldo 50%+50% = 8.146.043,40) + OC 00002-00001984 «ACTUALIZACION oc 279» 3.583.956,00 (drive 1XBHeCpC9pH4oxcqC6BPjrR5J83iY8kYo, 18/06/2026; Cobranzas fila 46) + OC 00002-00001985 «ADICIONAL POR AUMENTO SUPERFICIE EN PLATAFORMA» 5.974.200,00 (drive 16jl2ZbV8ZtMSeyxauVukDp62nbsvJXlb; Cobranzas fila 47) · resumen del saldo: «Documento de 26m3.pdf» drive 1IQ8BcS5_2z1CVo9J_4uFNJ2FCskKcfTh',
    notas: 'Venta vigente 17.704.199,40 = 2 × 4.073.021,70 + 3.583.956,00 + 5.974.200,00. Sin cotización de costo para la recotización («Presupuestar Piso para Planta BSA … Falta», nota manuscrita del documento de 26m3). No se escala el costo 2024. Cobranzas fila 93 repite el 50% de OC 279: posible duplicado.',
    partidas: [],
  },
  {
    obra: 'messina-playon-azufre', version: 1, estado: 'aprobado', fecha: '2026-07-30',
    venta: 105354758.10, costoDirecto: 49916328.35, costoIndirecto: 15973225.07, margen: 32944776.80, hh: 3441.80, inferencia: false,
    fuente: 'PLATEA DE HORMIGON - AGOSTO 2026.xlsm drive 1HiGyOFW85G45G2NFM_rHGit9AzqhdS_D · venta = PDF drive 1jV2w0MnqX_YC4N51Idgk2q2rB6cekTZD (30/07/2026) = OFERTA!E25 · costo Presupuesto!H67 · GG Presupuesto!H69 · beneficio Presupuesto!H73 · HH Análisis (recursos hs) × Presupuesto!E×G',
    notas: 'Vendido 102.500.000 (Cobranzas filas 68-69 y 74-77: OC 2173 blanco 65 M + 37,5 M). El tercer muro es obra aparte.',
    partidas: [
      p('MO', 'Mano de obra · Presupuesto!O (Σ ítems)', 20254211.60),
      p('CS', 'Cargas sociales · Presupuesto!Q (Σ ítems)', 17202029.20),
      p('MA', 'Materiales, equipos y subcontratos · Presupuesto!P (Σ ítems)', 12006829.55),
      p('SC', 'Sin clasificar · flete Presupuesto!H19 (O/P/Q en cero)', 453258.00),
    ],
  },
  {
    obra: 'messina-playon-dilucion-acido', version: 1, estado: 'aprobado', fecha: '2026-08-28',
    venta: 20090867.83, costoDirecto: 8926448.57, costoIndirecto: 4016901.86, margen: 5177340.20, hh: 210.55, inferencia: false,
    fuente: 'Cotizacion Interna/Cotizacion.xlsm drive 1_1Si2IKXMBTgFdXYo1eXdz8ACbIOwRz- · venta = Cotizacion - Playon para dilución de ácido.pdf drive 16y2ktLDluPOmx3SVJT-hZ2r0fSi6BShz (28/08/2026, OC 2266) · costo Presupuesto!H60 (= «Costo - Playon para dilucion de acidos.pdf» drive 11dcUkA2diKcRPtyHGz86sy5F8y1aWW3m) · GG Presupuesto!H62 · beneficio Presupuesto!H66',
    notas: 'Recotización en curso: Cobranzas filas 99-100 «alcance cambiado 03–08/09: recotizar antes de facturar (dueño 10/09)». El .xlsm (15/09) da Presupuesto!H79 = 20.098.600,50.',
    partidas: [
      p('MO', 'Mano de obra · Presupuesto!O (Σ ítems)', 1151363.57),
      p('CS', 'Cargas sociales · Presupuesto!Q (Σ ítems)', 1088753.40),
      p('MA', 'Materiales, equipos y subcontratos · Presupuesto!P (Σ ítems)', 6686331.60),
    ],
  },
  {
    obra: 'messina-playon-dilucion-acido', version: 2, estado: 'cotizado', fecha: '2026-09-11',
    venta: 5025105.97, costoDirecto: 2227391.30, costoIndirecto: 1002326.09, margen: 1291887.00, hh: 61.03, inferencia: false,
    fuente: 'ADICIONAL · Cotizacion Interna/Adicional.xlsm drive 1VfYsn3fWgp7F-G_OwqaqqYqIsdkxJvoJ · venta = «Adicional - Excavaciones y ampliaciond de platea.pdf» drive 1iFqSI9beFR_9-zAr0J5XofaJ_uZSgRME (11/09/2026) · costo Presupuesto!H60 (= «Costo - ADICIONAL Playon para dilucion de acidos.pdf» drive 168y1ULRYcx1052wkwMmiYpc2EEgJQVAh) · GG Presupuesto!H62 · beneficio Presupuesto!H66',
    notas: 'Adicional cotizado y NO aprobado: no entra en costo_objetivo. El .xlsm da OFERTA 5.015.146,70 (editado después del PDF).',
    partidas: [
      p('MO', 'Mano de obra · Presupuesto!O (Σ ítems)', 380395.00),
      p('CS', 'Cargas sociales · Presupuesto!Q (Σ ítems)', 443148.30),
      p('MA', 'Materiales, equipos y subcontratos · Presupuesto!P (Σ ítems)', 1403848.00),
    ],
  },
  {
    obra: 'messina-pisos-120-rampa', version: 1, estado: 'aprobado', fecha: '2026-06-11',
    venta: 9463141.93, costoDirecto: 4649300.16, costoIndirecto: 2185171.08, margen: 2733788.50, hh: null, inferencia: true,
    fuente: 'INFERENCIA · PISO: Cotizacion piso 120m2.xlsm drive 1cBQuKoPSYEtrnRDI8q72qy38PVQkdAV6 reescrito después (piso 41,8 m2); costo = Presupuesto!H10:H15 con las cantidades de COTIZACION PISOS 120m2 - 11:6.pdf drive 1d-u515rso_v01m8csfy8-Df2g1-fR5Pz (precios unitarios J idénticos al PDF) = 3.223.144,16 · RAMPA: 1.426.156 de orquestador/lib/obras-datos.mjs (Análisis × cantidades de Rampa 19:2.pdf drive 1QioaEfc-FDbareikGjc2W0TzJ8wPclWr) · GG = 47% (Presupuesto!E65) × costo; beneficio = 40% (Presupuesto!E69) × (costo+GG) · venta: 7.108.886,54 (PDF piso) + 2.354.255,39 (PDF rampa, OC 2226)',
    notas: 'Cobranzas filas 55-56 (piso) y 96 (rampa). HH no cargadas (el .xlsm tiene el piso con 41,8 m2).',
    partidas: [
      p('MO', 'Piso · Mano de obra · Presupuesto!O × (cantidades PDF / cantidades .xlsm) · INFERENCIA', 1114965.72),
      p('CS', 'Piso · Cargas sociales · Presupuesto!Q × (cantidades PDF / cantidades .xlsm) · INFERENCIA', 1156412.04),
      p('MA', 'Piso · Materiales, equipos y fletes · Presupuesto!P × (cantidades PDF / cantidades .xlsm) · INFERENCIA', 951766.40),
      p('RAMPA-MOCS', 'Rampa · MO + cargas · obras-datos.mjs · INFERENCIA', 851907.00),
      p('RAMPA-MA', 'Rampa · Materiales · obras-datos.mjs · INFERENCIA', 452239.00),
      p('RAMPA-EQ', 'Rampa · Máquina · obras-datos.mjs · INFERENCIA', 122010.00),
    ],
  },
  {
    obra: 'messina-adicional-tercer-muro', version: 1, estado: 'aprobado', fecha: '2026-08-27',
    venta: 10940587.00, costoDirecto: 5183571.40, costoIndirecto: 1658742.85, margen: 3421157.20, hh: 480.00, inferencia: false,
    fuente: 'ADICIONAL MURO.xlsm drive 1MFtUGWLGVk_qnAeeapwdiz99xZ9AA8yV (carpeta del Playón de azufre) · venta Presupuesto!H86 = ADICIONAL MURO.pdf drive 1muaFF3Po-POSiVmofxOqVNxGKvl6pLJ0 (27/08/2026) · costo Presupuesto!H67 · GG Presupuesto!H69 · beneficio Presupuesto!H73',
    notas: 'Vendido 10.000.000 (OC 2256 drive 15QUCmWc1KGfcQqiX-UPo3VDklfNEjqjz; Cobranzas fila 98).',
    partidas: [
      p('MO', 'Mano de obra · Presupuesto!O10', 2819280.00),
      p('CS', 'Cargas sociales · Presupuesto!Q10', 1723680.00),
      p('MA', 'Materiales · Presupuesto!P10', 640611.40),
    ],
  },
  {
    obra: 'instalacion-electrica', version: 1, estado: 'aprobado', fecha: '2026-07-21',
    venta: 42876310.34, costoDirecto: 24573563.58, costoIndirecto: 6143390.90, margen: 9215086.40, hh: 2084.16, inferencia: false,
    fuente: 'Cotizacion Interna - Instalacion Electrica.xlsm drive 1uXVe7ffIgYS5srgTwFtUGlRjYV9pR7Eu · venta = Presupuesto - Instalacion Electrica.pdf drive 1xpd76tH7zdXc7Rz4D8PpsMcZM932E9LE (21/07/2026) = Presupuesto!H80 · costo Presupuesto!H61 · GG Presupuesto!H63 · beneficio Presupuesto!H67',
    notas: 'Vendido 40.000.000 (Cobranzas filas 67 y 90). MA = plataforma de trabajo alquilada.',
    partidas: [
      p('MO', 'Mano de obra · Presupuesto!O (Σ ítems)', 11176863.84),
      p('CS', 'Cargas sociales · Presupuesto!Q (Σ ítems)', 10235629.74),
      p('MA', 'Plataforma de trabajo (equipo) · Presupuesto!P (Σ ítems)', 3161070.00),
    ],
  },
  {
    obra: 'pisos-industriales', version: 1, estado: 'aprobado', fecha: '2026-06-09',
    venta: 47590271.50, costoDirecto: 32406752.00, costoIndirecto: 4861012.80, margen: 8198908.30, hh: 4047.40, inferencia: false,
    fuente: 'Cotizacion interna - Pisos Industriales.xlsm drive 1iKAAbLs6vdk9jnzgRYS4Bo16g-1wrgdF · venta = PRESUPUESTO - PISOS TOTALES 9:6:26.pdf drive 1zrfIORKMItqqyHp2GjIVp8ZsYIkJ9DIW (09/06/2026) · costo Presupuesto!H63 · GG Presupuesto!H65 · beneficio Presupuesto!H69',
    notas: 'Cobranzas filas 66 y 94-95 (47.590.272). El ítem de piso no lleva cargas sociales en su análisis (CS 1,77 M contra MO 20,95 M): costo probablemente subestimado.',
    partidas: [
      p('MO', 'Mano de obra · Presupuesto!O (Σ ítems)', 20952477.00),
      p('CS', 'Cargas sociales · Presupuesto!Q (Σ ítems)', 1771350.00),
      p('MA', 'Materiales, equipos y fletes · Presupuesto!P (Σ ítems)', 9682925.00),
    ],
  },
  {
    obra: 'entrepiso-y-escalera', version: 1, estado: 'aprobado', fecha: '2026-07-22',
    venta: 7728254.47, costoDirecto: 3829741.63, costoIndirecto: 1055493.46, margen: 1447533.90, hh: null, inferencia: false,
    fuente: 'Cotizacion interna/Entrepiso y escalera.xlsm drive 1nvMcrRwjfCBsedDI5IANuS18TsmKwnqB · venta OFERTA!F19 (= Presupuesto!R10:R13, entrepiso ×1,12) = Presupuesto - Entrepiso y escalera.pdf drive 1UMA2kA4xDIxNs4DlDkUQ_zSLqk8G4Xik (22/07/2026) · oferta sólo MO: costo = Presupuesto!O10:O13 + Q10:Q13 · GG Presupuesto!H52 · beneficio Presupuesto!H56',
    notas: 'Presupuesto!H50 (O40+Q40) da 3.769.619,50 porque su SUM omite la fila 10 (replanteo). Materiales Presupuesto!P = 5.660.890,19 fuera de la oferta. HH no confiables: no se cargan. Cobranzas filas 91-92.',
    partidas: [p('MO', 'Mano de obra · Presupuesto!O10:O13', 2241534.91), p('CS', 'Cargas sociales · Presupuesto!Q10:Q13', 1588206.72)],
  },
]

const DRIVE_ID = /\b1[A-Za-z0-9_-]{24,}\b/
const CELDA = /\b[A-Za-zÁÉÍÓÚáéíóú]+![A-Z]{1,2}\d+/
const r2 = (v) => Math.round(v * 100) / 100

/** Devuelve la lista de problemas de un presupuesto. Vacía = cargable. */
export function problemasDe(x) {
  const out = []
  if (!OBRAS_ACTIVAS.includes(x.obra)) out.push(`${x.obra}: no es una obra activa`)
  if (!['cotizado', 'aprobado', 'reemplazado'].includes(x.estado)) out.push(`${x.obra} v${x.version}: estado ${x.estado}`)
  if (!(x.venta > 0)) out.push(`${x.obra} v${x.version}: venta no positiva`)
  if (!DRIVE_ID.test(x.fuente ?? '')) out.push(`${x.obra} v${x.version}: la fuente no cita un drive id`)
  if (x.costoDirecto == null) {
    if (!String(x.costoPendienteMotivo ?? '').trim()) out.push(`${x.obra} v${x.version}: costo NULL sin motivo`)
    if (x.costoIndirecto != null || x.margen != null) out.push(`${x.obra} v${x.version}: sin costo no puede tener GG ni margen`)
    if (x.partidas.length) out.push(`${x.obra} v${x.version}: sin costo no puede tener partidas`)
  } else {
    if (x.costoPendienteMotivo) out.push(`${x.obra} v${x.version}: tiene costo y motivo de costo pendiente`)
    if (!CELDA.test(x.fuente)) out.push(`${x.obra} v${x.version}: la fuente no cita hoja!celda`)
    if (!(x.costoIndirecto >= 0) || x.margen == null) out.push(`${x.obra} v${x.version}: falta GG o margen`)
    const suma = r2(x.partidas.reduce((s, q) => s + q.monto, 0))
    if (Math.abs(suma - x.costoDirecto) > 0.01) out.push(`${x.obra} v${x.version}: partidas ${suma} ≠ costo directo ${x.costoDirecto}`)
  }
  for (const q of x.partidas) if (!(q.monto > 0)) out.push(`${x.obra} v${x.version}: partida ${q.codigo} no positiva`)
  const codigos = x.partidas.map((q) => q.codigo)
  if (new Set(codigos).size !== codigos.length) out.push(`${x.obra} v${x.version}: códigos de partida repetidos`)
  if (x.inferencia && !/INFERENCIA/.test(x.fuente)) out.push(`${x.obra} v${x.version}: inferencia sin marcar en la fuente`)
  if (x.moneda && !(x.moneda.monto > 0 && x.moneda.tipoCambio > 0 && Math.abs(r2(x.moneda.monto * x.moneda.tipoCambio) - x.venta) <= 0.01)) {
    out.push(`${x.obra} v${x.version}: venta ARS ≠ monto original × tipo de cambio`)
  }
  return out
}

/** Problemas del conjunto: un aprobado por obra activa, versiones únicas. */
export function problemasDelConjunto(lista = PRESUPUESTOS) {
  const out = lista.flatMap(problemasDe)
  for (const obra of OBRAS_ACTIVAS) {
    const aprobados = lista.filter((x) => x.obra === obra && x.estado === 'aprobado').length
    if (aprobados !== 1) out.push(`${obra}: ${aprobados} presupuestos aprobados (tiene que haber 1)`)
  }
  const claves = lista.map((x) => `${x.obra}#${x.version}`)
  if (new Set(claves).size !== claves.length) out.push('versiones repetidas')
  return out
}

/** Fila de `presupuestos` (columnas de la base) de un presupuesto del módulo. */
export function filaDe(x) {
  return {
    obra_canonica_id: x.obra,
    version: x.version,
    estado: x.estado,
    monto_presupuestado: x.venta,
    costo_directo_presupuestado: x.costoDirecto,
    costo_indirecto_presupuestado: x.costoIndirecto,
    margen_esperado: x.margen,
    hh_estimada: x.hh,
    fecha_presupuesto: x.fecha,
    fuente_legacy: x.fuente,
    notas: x.notas ?? null,
    costo_pendiente_motivo: x.costoPendienteMotivo ?? null,
    moneda_original: x.moneda?.original ?? null,
    monto_moneda_original: x.moneda?.monto ?? null,
    tipo_cambio: x.moneda?.tipoCambio ?? null,
    tipo_cambio_origen: x.moneda?.origen ?? null,
  }
}

// ═══ DOCUMENTOS DE COTIZACIÓN POR OBRA → `public.obra_documento` ═══
//
// NO van a `documento_cliente`: ésa es el espejo del PORTAL DEL CLIENTE, falla cerrado para lo
// interno (src/app/portal/papeles.ts: «publicarle a un cliente el cómputo con el que se le cotizó es
// un daño económico que no se deshace») y recalcula la categoría en cada corrida.
// `obra_documento` es el catálogo interno por obra; `vincular-documentos-obra.mjs` no pisa el rol ni
// el origen que escribió una persona.
const d = (obra, drive, nombre, rol, mime) => ({ obra, drive, nombre, rol, mime })
const XLSM = 'application/vnd.ms-excel.sheet.macroEnabled.12'
const PDF = 'application/pdf'
export const DOCUMENTOS = [
  d('quattropani', '19rYSz2s1oFs0DIHyEFh9qV_bY0ZwTNKC', 'Cotizacion Final.xlsm', 'cotizacion_interna', XLSM),
  d('le-comedor', '11vyK-T_DdoxYPwsYI4SLIIO3zX-1VGWs', 'COTIZACION INTERNA CON PANELES version 2.xlsm', 'cotizacion_interna', XLSM),
  d('le-comedor', '1XC9B9LB_qIaA2EIu219lTJTB2OkpA7Uo', 'COTIZACION FINAL.pdf', 'cotizacion', PDF),
  d('le-comedor', '1M_p-AQaFXRY0UF8ccH_NKHV4SM5DlMht', 'ADICIONALES.xlsm', 'cotizacion_interna', XLSM),
  d('le-comedor', '1hotfx1FVJxMJBO52lzgX5PBkLG7yf4kJ', 'Adicional - Oficinas y Fabrica de Palitos.pdf', 'cotizacion', PDF),
  d('messina-bsa', '1rKUCSYZHeUsFWOjbOySCOoueqqz7kWRi', 'PRESUPUESTO FINAL - DEMOLICION Y PILETA DE CONTENCION - FI 12.xlsm', 'cotizacion_interna', XLSM),
  d('messina-bsa', '1LH8OMI9P9Alq9UiVVLX4fumTXnNumgfY', 'DEMOLICION Y PILETA DE CONTENCION - FI 12.pdf', 'cotizacion', PDF),
  d('messina-bsa', '1XBHeCpC9pH4oxcqC6BPjrR5J83iY8kYo', 'OC_32_0000200001984.pdf', 'orden_compra', PDF),
  d('messina-bsa', '16jl2ZbV8ZtMSeyxauVukDp62nbsvJXlb', 'OC_32_0000200001985.pdf', 'orden_compra', PDF),
  d('messina-bsa', '1IQ8BcS5_2z1CVo9J_4uFNJ2FCskKcfTh', 'Documento de 26m3.pdf', 'resumen_recotizacion', PDF),
  d('messina-playon-azufre', '1HiGyOFW85G45G2NFM_rHGit9AzqhdS_D', 'PLATEA DE HORMIGON - AGOSTO 2026.xlsm', 'cotizacion_interna', XLSM),
  d('messina-playon-azufre', '1jV2w0MnqX_YC4N51Idgk2q2rB6cekTZD', 'PLATEA DE HORMIGON - AGOSTO 2026.pdf', 'cotizacion', PDF),
  d('messina-adicional-tercer-muro', '1MFtUGWLGVk_qnAeeapwdiz99xZ9AA8yV', 'ADICIONAL MURO.xlsm', 'cotizacion_interna', XLSM),
  d('messina-adicional-tercer-muro', '1muaFF3Po-POSiVmofxOqVNxGKvl6pLJ0', 'ADICIONAL MURO.pdf', 'cotizacion', PDF),
  d('messina-playon-dilucion-acido', '1_1Si2IKXMBTgFdXYo1eXdz8ACbIOwRz-', 'Cotizacion.xlsm', 'cotizacion_interna', XLSM),
  d('messina-playon-dilucion-acido', '16y2ktLDluPOmx3SVJT-hZ2r0fSi6BShz', 'Cotizacion - Playon para dilución de ácido.pdf', 'cotizacion', PDF),
  d('messina-playon-dilucion-acido', '1VfYsn3fWgp7F-G_OwqaqqYqIsdkxJvoJ', 'Adicional.xlsm', 'cotizacion_interna', XLSM),
  d('messina-playon-dilucion-acido', '1iFqSI9beFR_9-zAr0J5XofaJ_uZSgRME', 'Adicional - Excavaciones y ampliaciond de platea.pdf', 'cotizacion', PDF),
  d('messina-pisos-120-rampa', '1cBQuKoPSYEtrnRDI8q72qy38PVQkdAV6', 'Cotizacion piso 120m2.xlsm', 'cotizacion_interna', XLSM),
  d('messina-pisos-120-rampa', '1QioaEfc-FDbareikGjc2W0TzJ8wPclWr', 'Rampa 19:2.pdf', 'cotizacion', PDF),
  d('instalacion-electrica', '1uXVe7ffIgYS5srgTwFtUGlRjYV9pR7Eu', 'Cotizacion Interna - Instalacion Electrica.xlsm', 'cotizacion_interna', XLSM),
  d('pisos-industriales', '1iKAAbLs6vdk9jnzgRYS4Bo16g-1wrgdF', 'Cotizacion interna - Pisos Industriales.xlsm', 'cotizacion_interna', XLSM),
  d('pisos-industriales', '1zrfIORKMItqqyHp2GjIVp8ZsYIkJ9DIW', 'PRESUPUESTO - PISOS TOTALES 9:6:26.pdf', 'cotizacion', PDF),
  d('entrepiso-y-escalera', '1nvMcrRwjfCBsedDI5IANuS18TsmKwnqB', 'Entrepiso y escalera.xlsm', 'cotizacion_interna', XLSM),
]

/** La corrección del fuente_drive_id de entrepiso en `obra_contrato`: sólo si sigue el id roto. */
export const CORRECCION_CONTRATO = {
  obra: 'entrepiso-y-escalera',
  idRoto: '1UMA2kA4xDIxNs4DlDkUQ_zSLqk8G4Xio',
  idReal: '1UMA2kA4xDIxNs4DlDkUQ_zSLqk8G4Xik',
}

/** Todo drive id citado en las fuentes de los presupuestos tiene que estar catalogado (o ser una OC ya en obra_contrato). */
export function driveIdsCitados(lista = PRESUPUESTOS) {
  const ids = new Set()
  for (const x of lista) for (const m of (x.fuente + ' ' + (x.notas ?? '')).matchAll(/\b1[A-Za-z0-9_-]{24,}\b/g)) ids.add(m[0])
  return ids
}
