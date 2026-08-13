// FOTO DE LA PESTAÑA `Cobranzas` DEL ARCHIVO REAL — 13/08/2026. SÓLO PARA TESTS.
//
// POR QUÉ EXISTE. Las fórmulas de OBRAS no las calcula este repo: las calcula Google con lo que el
// generador deja escrito. Un test de cadena prueba que la fórmula TIENE LA FORMA esperada y no puede
// ver que suma la columna equivocada ni que se come un importe en dólares — de hecho no lo vio: la
// pestaña sumó U$S 15.400 como $15.400 durante toda su vida. Con esta foto,
// `evaluar-formula-sheet.mjs` corre la fórmula EN FRÍO sobre los datos de verdad y el test compara
// NÚMEROS, que es lo único que desmiente al generador sin tocar el archivo del dueño.
//
// QUÉ ES Y QUÉ NO ES. Es una FOTO, no la fuente: si Cobranzas cambia, este archivo no cambia solo.
// Sirve para probar el MECANISMO —que los dólares se valúan, que el contrato sale de la Orden de
// Compra, que un contrato repetido en cinco filas no se suma cinco veces—, nunca para afirmar cuál
// es el saldo de hoy. Ningún generador ni ninguna pantalla la importa.
//
// Van las 12 columnas que la pestaña cita y las 91 filas de datos, con su número de fila REAL para
// que cualquier hallazgo se pueda ir a mirar al archivo.

/** Las columnas, en el orden en que vienen en cada tupla (después del número de fila). */
export const COLUMNAS = Object.freeze(["B","G","H","I","J","L","M","N","O","P","Q","AA"])

/** `[fila, B, G, H, I, J, L, M, N, O, P, Q, AA]` — el '' es la celda vacía del archivo, que NO es un cero. */
export const FILAS = Object.freeze([
  [5, "B", "ARCOR", "OC 53239034", "RECLAMAR OC!", 9520000, 2027760, 9491440, "Transferencia", "Cobrado", 46028, 46056, ""],
  [6, "B", "ARCOR", "OC 53241303 - 50%", "", 4450000, 947850, 4436650, "Transferencia", "Cobrado", 46031, 46066, ""],
  [7, "B", "IMOTOR/San Francisco/JAVI SANCHEZ", "Certificado 2", "", 15000000, "", 18150000, "Transferencia", "Cobrado", 46006, 46037, ""],
  [8, "B", "ARCOR", "OC 53239034 - FIN", "", 2380000, 530740, 2349060, "Transferencia", "Cobrado", 46078, 46073, ""],
  [9, "B", "ARCOR", "OC 53241303", "", 4450000, 947850, 4436650, "Transferencia", "Cobrado", 46064, 46083, ""],
  [10, "B", "ARCOR", "OC 53239036", "", 3286884.46, "", 3977130.2, "Transferencia", "Cobrado", 46064, 46087, ""],
  [11, "B", "ARCOR", "OC 53259436", "Compactacion de Terrenos", 3210000, 682386.6, 3201713.4, "Transferencia", "Cobrado", 46119, 46113, ""],
  [12, "B", "ARCOR", "OC 53270182", "Rep de pisos - \"canalizacion\"", 3550000, 754806.6, 3540693.4, "Transferencia", "Cobrado", 46118, 46113, ""],
  [13, "B", "ARCOR", "OC 53259436", "Compactacion de Terrenos", 3210000, 683730, 3200370, "Transferencia", "Cobrado", 46140, 46128, ""],
  [14, "B", "ARCOR", "OC 53259436", "Compactacion de Terrenos", 1070000, 227892, 1066808, "Transferencia", "Cobrado", 46133, 46129, ""],
  [15, "B", "ARCOR", "OC 53275590", "BACHEO", 2750000, 585768, 2741732, "Transferencia", "Cobrado", 46133, 46129, ""],
  [16, "B", "LA ESTRELLA /ALIMENTOS DEL SUR SAS", "", "Oficinas y Fabrica de Palitos", 12396694.21, "", 14999999.99, "Echeq", "Cobrado", 46133, 46132, ""],
  [17, "B", "ARCOR", "OC 53259436", "Compactacion de Terrenos", 3210000, "", 3884100, "Transferencia", "Cobrado", 46147, 46149, ""],
  [18, "B", "LA ESTRELLA /ALIMENTOS DEL SUR SAS", "", "Oficinas y Fabrica de Palitos", 12396694.21, "", 14999999.99, "Echeq", "Cobrado", 46092, 46157, ""],
  [19, "B", "LA ESTRELLA /ALIMENTOS DEL SUR SAS", "", "Oficinas y Fabrica de Palitos", 12396694.21, "", 14999999.99, "Echeq", "Cobrado", 46092, 46172, ""],
  [20, "N", "IMOTOR/San Francisco/JAVI SANCHEZ", "", "", 10000000, "", 10000000, "Efectivo", "Cobrado", 46185, 46185, ""],
  [21, "B", "LA ESTRELLA /ALIMENTOS DEL SUR SAS", "", "Oficinas y Fabrica de Palitos", 12396694.21, "", 14999999.99, "Echeq", "Cobrado", 46092, 46188, ""],
  [22, "B", "ADDATO", "", "", 2066115.7, "", 2500000, "Transferencia", "Cobrado", 46101, 46101, ""],
  [23, "B", "LIRIO DANIEL RAMIRO", "SERVICIO DE METALURGIA", "", 14300000, "", 17303000, "Transferencia", "Cobrado", 46102, 46102, ""],
  [24, "B", "IMOTOR/San Francisco/JAVI SANCHEZ", "Certificado 3", "", 20000000, "", 24200000, "Transferencia", "Cobrado", 46150, 46150, ""],
  [25, "N", "IMOTOR/San Francisco/JAVI SANCHEZ", "", "", 20000000, "", 20000000, "Efectivo", "Cobrado", 46150, 46150, ""],
  [26, "B", "LA ESTRELLA /ALIMENTOS DEL SUR SAS", "", "Oficinas y Fabrica de Palitos", 12396694.21, "", 14999999.99, "Echeq", "Cobrado", 46092, 46205, ""],
  [27, "N", "LA ESTRELLA /ALIMENTOS DEL SUR SAS", "", "", 10000000, "", 10000000, "Efectivo", "Cobrado", 46184, 46184, ""],
  [28, "N", "IMOTOR/San Francisco/JAVI SANCHEZ", "", "", 5000000, "", 5000000, "Efectivo", "Cobrado", 46199, 46199, ""],
  [29, "N", "IMOTOR/San Francisco/JAVI SANCHEZ", "", "", 5000000, "", 5000000, "Efectivo", "Cobrado", 46219, 46211, ""],
  [30, "N", "IMOTOR/San Francisco/JAVI SANCHEZ", "", "", 6215646, "", 6215646, "Efectivo", "Cobrado", 46219, 46219, ""],
  [31, "N", "MESSINA", "00002-00001864", "BASES TANQUE SO2 - Anticipo", 6700000, "", 6700000, "Efectivo", "Cobrado", 46149, 46149, ""],
  [32, "N", "MESSINA", "", "PILON - Anticipo", 2330000, "", 9030000, "Efectivo", "Cobrado", 46149, 46149, ""],
  [33, "B", "LA ESTRELLA /ALIMENTOS DEL SUR SAS", "", "Galpon 9", 8264462.809917356, "", 10000000, "Echeq", "Cobrado", 46219, 46219, ""],
  [34, "N", "MESSINA", "", "PILON", 3488735, "", 3488735, "Efectivo", "Pendiente", 46206, 46248, ""],
  [35, "N", "LA ESTRELLA /ALIMENTOS DEL SUR SAS", "", "Oficinas y Fabrica de Palitos", 2313579.74, "", 2313579.74, "Efectivo", "Cobrado", 46184, 46234, ""],
  [36, "N", "LA ESTRELLA /ALIMENTOS DEL SUR SAS", "", "Adicional - Oficinas y Fabrica de Palitos", 17476079.99, "", 17476079.99, "Efectivo", "Cobrado", 46206, 46234, ""],
  [37, "B", "LA ESTRELLA /ALIMENTOS DEL SUR SAS", "", "Galpon 9", 8264462.809917356, "", 10000000, "Echeq", "Cobrado", 46184, 46239, ""],
  [38, "B", "MESSINA", "00002-00001864", "BASES TANQUE SO2", 8375000, 167500, 9966250, "Transferencia", "Cobrado", 46205, 46232, ""],
  [39, "N", "LA ESTRELLA /ALIMENTOS DEL SUR SAS", "", "", 10000000, "", 10000000, "Efectivo", "Cobrado", 46184, 46186, 0],
  [40, "N", "LA ESTRELLA /ALIMENTOS DEL SUR SAS", "", "", 10000000, "", 10000000, "Efectivo", "Cobrado", 46184, 46186, 0],
  [41, "N", "LA ESTRELLA /ALIMENTOS DEL SUR SAS", "", "Oficinas y Fabrica de Palitos", 10000000, "", 10000000, "Efectivo", "Cobrado", 46184, 46203, ""],
  [42, "B", "MESSINA", "00002-00001923", "ADICIONAL - BASE DE TANQUE SO2", 5769880, 115397.6, 6866157.2, "Transferencia", "Cobrado", 46206, 46232, ""],
  [43, "B", "LA ESTRELLA /ALIMENTOS DEL SUR SAS", "", "Galpon 9", 8264462.809917356, "", 10000000, "Echeq", "Cobrado", 46184, 46249, ""],
  [44, "N", "LA ESTRELLA /ALIMENTOS DEL SUR SAS", "", "Faltante - GALPON 9", 8234758.245, "", 8234758.245, "Efectivo", "Pendiente", 46206, 46248, ""],
  [45, "B", "MESSINA", "00002-00000279", "PLANTA DE BSA - 26M3 A FAVOR H-17", 8146043.4, "", 9856712.514, "Transferencia", "Pendiente", 46241, 46271, ""],
  [46, "B", "MESSINA", "00002-00001984", "ACTUALIZACION DE PRECIOS OC 02-00000279", 3583956, "", 4336586.76, "Transferencia", "Pendiente", 46241, 46271, ""],
  [47, "B", "MESSINA", "00002-00001985", "PLANTA DE BSA - ADICIONAL", 5974200, "", 7228782, "Transferencia", "Pendiente", 46241, 46271, ""],
  [48, "B", "LA ESTRELLA /ALIMENTOS DEL SUR SAS", "", "Galpon 9", 8264462.809917356, "", 10000000, "Echeq", "Cobrado", 46184, 46265, ""],
  [49, "B", "ARCOR", "53312775 6A", "Cambio de pisos RRHH - se facturó el 80% $ 7.520.000 2/7", 7520000, "", 9099200, "Transferencia", "Pendiente", 46220, 46295, ""],
  [50, "N", "IMOTOR/San Francisco/JAVI SANCHEZ", "", "Pago efectivo — julio 2026", 16200000, "", 16200000, "Efectivo", "Cobrado", 46220, 46220, ""],
  [51, "B", "ARCOR", "RECLAMAR OC!", "Materiales varios ppto 3/02", 1735578, "", 2100049.38, "Transferencia", "Proyectado", 46056, 46295, ""],
  [52, "B", "ARCOR", "RECLAMAR OC!", "Reparación cielorraso de vestuario", 789673, "", 955504.33, "Transferencia", "Proyectado", 46060, 46295, ""],
  [53, "B", "ARCOR", "53312775 6A", "Cambio de pisos RRHH - 20% restante a facturar - FA 53", 1880000, "", 2274800, "Transferencia", "Pendiente", 46216, 46291, ""],
  [54, "N", "IMOTOR/San Francisco/JAVI SANCHEZ", "", "Cobro efectivo - pago total julio - NO CONSIDERAR", 0, "", 0, "Efectivo", "CANCELAR", 46220, 46220, ""],
  [55, "B", "MESSINA", "02-00002097", "Pisos 120m2 -  Anticipo 50%", 3554443.27, "", 4300876.3567, "Transferencia", "Cobrado", 46223, 46223, ""],
  [56, "B", "MESSINA", "02-00002097", "Pisos 120m2 - Restante 50%", 3554443.27, "", 4300876.3567, "Transferencia", "Pendiente", 46241, 46248, ""],
  [57, "B", "MACRO CONSTRUCCIONES SRL", "", "Alquiler de puntales - 25 unidades", 192000, "", 232320, "Transferencia", "Cobrado", 46219, 46241, ""],
  [58, "B", "MACRO CONSTRUCCIONES SRL", "", "Alquiler de puntales - 25 unidades", -80000, "", -96800, "Transferencia", "Cobrado", 46219, 46241, ""],
  [59, "B", "ARCOR", "RECLAMAR OC!", "Cambio de cortina", 2495660.83, "", 3019749.6043000002, "Transferencia", "Proyectado", 46052, 46295, ""],
  [60, "B", "ARCOR", 53357412, "Camión Regador", 1150000, "", 1391500, "Transferencia", "Facturado", 46237, 46307, ""],
  [61, "B", "Quattropani - Melisa García SAS", "Anticipo 50% inicio obra ", "(paga el 33% del 50%) + Materiales", 54279685.38, "", 65678419.3098, "Transferencia", "Cobrado", 46230, 46231, ""],
  [62, "B", "Quattropani - Melisa García SAS", "Anticipo 50% inicio obra ", "(paga el 66% del 50%)", 15400, "", 15400, "Efectivo", "Cobrado", 46230, 46234, "USD"],
  [63, "B", "Quattropani - Melisa García SAS", "Anticipo 50% inicio obra ", "(paga el 66% del 50%)", 7130000, "", 7130000, "Efectivo", "Cobrado", 46230, 46234, ""],
  [64, "B", "Quattropani - Melisa García SAS", "", "IVA de Factura 220", 0, 0, 6510000, "Transferencia", "Pendiente", 46230, 46256, ""],
  [65, "B", "MESSINA", "02-00002135", "Relevamiento topográfico", 900000, "", 1089000, "Transferencia", "Pendiente", 46241, 46271, ""],
  [66, "N", "San Francisco", "Anticipo inicio obra 50% $ 47.590.272 Cotización n°", "Pisos Industriales", 23795136, "", 23795136, "Efectivo", "Pendiente", 46234, 46256, ""],
  [67, "N", "San Francisco", "Anticipo inicio obra 50% $ 40.000.000 Cotización n°", "Instalaciones Eléctricas", 20000000, "", 20000000, "Efectivo", "Pendiente", 46234, 46249, ""],
  [68, "N", "San Francisco", "Anticipo inicio obra 50% $ 7.728.254 Cotización n°", "Entrepiso y Escaleras", 3864127, "", 3864127, "Efectivo", "Pendiente", 46234, 46249, ""],
  [69, "B", "MESSINA", "Anticipo inicio de obra 50% Blanco $65.000.000 Playon de Azufre. Cargar OC", "Playon Azufre", 32500000, "", 39325000, "Transferencia", "Pendiente", 46258, 46262, ""],
  [70, "N", "MESSINA", "Anticipo inicio de obra 50% Negro $37.500.000 Playon de Azufre. Cargar OC", "Playon Azufre", 18750000, "", 18750000, "Efectivo", "Pendiente", 46258, 46262, ""],
  [71, "N", "San Francisco", "Resto 50% s/ total 47.590.272 — certificación quincenal 1/4", "Pisos Industriales - Certificación 1/4", 5950000, "", 5950000, "Efectivo", "Pendiente", 46239, 46253, ""],
  [72, "N", "San Francisco", "Resto 50% s/ total 47.590.272 — certificación quincenal 2/4", "Pisos Industriales - Certificación 2/4", 5950000, "", 5950000, "Efectivo", "Pendiente", 46239, 46267, ""],
  [73, "N", "San Francisco", "Resto 50% s/ total 47.590.272 — certificación quincenal 3/4", "Pisos Industriales - Certificación 3/4", 5950000, "", 5950000, "Efectivo", "Pendiente", 46239, 46281, ""],
  [74, "N", "San Francisco", "Resto 50% s/ total 47.590.272 — certificación quincenal 4/4", "Pisos Industriales - Certificación 4/4", 5945136, "", 5945136, "Efectivo", "Pendiente", 46239, 46295, ""],
  [75, "N", "San Francisco", "Resto 50% s/ total 40.000.000 — certificación quincenal 1/4", "Instalaciones Eléctricas - Certificación 1/4", 5000000, "", 5000000, "Efectivo", "Pendiente", 46244, 46260, ""],
  [76, "N", "San Francisco", "Resto 50% s/ total 40.000.000 — certificación quincenal 2/4", "Instalaciones Eléctricas - Certificación 2/4", 5000000, "", 5000000, "Efectivo", "Pendiente", 46244, 46277, ""],
  [77, "N", "San Francisco", "Resto 50% s/ total 40.000.000 — certificación quincenal 3/4", "Instalaciones Eléctricas - Certificación 3/4", 5000000, "", 5000000, "Efectivo", "Pendiente", 46244, 46294, ""],
  [78, "N", "San Francisco", "Resto 50% s/ total 40.000.000 — certificación quincenal 4/4", "Instalaciones Eléctricas - Certificación 4/4", 5000000, "", 5000000, "Efectivo", "Pendiente", 46244, 46311, ""],
  [79, "N", "San Francisco", "Resto 50% s/ total 7.728.254 — certificación quincenal 1/1", "Entrepiso y Escaleras - Certificación 1/1", 3864127, "", 3864127, "Efectivo", "Pendiente", 46244, 46255, ""],
  [80, "B", "MESSINA", "Resto 50% s/ total 65.000.000 — certificación quincenal 1/2", "Playon Azufre - Blanco - Certificación 1/2", 16250000, "", 19662500, "Transferencia", "Pendiente", 46258, 46274, ""],
  [81, "B", "MESSINA", "Resto 50% s/ total 65.000.000 — certificación quincenal 2/2", "Playon Azufre - Blanco - Certificación 2/2", 16250000, "", 19662500, "Transferencia", "Pendiente", 46258, 46290, ""],
  [82, "N", "MESSINA", "Resto 50% s/ total 37.500.000 — certificación quincenal 1/2", "Playon Azufre - Negro - Certificación 1/2", 9400000, "", 9400000, "Efectivo", "Pendiente", 46258, 46274, ""],
  [83, "N", "MESSINA", "Resto 50% s/ total 37.500.000 — certificación quincenal 2/2", "Playon Azufre - Negro - Certificación 2/2", 9350000, "", 9350000, "Efectivo", "Pendiente", 46258, 46290, ""],
  [84, "B", "Quattropani - Melisa García SAS", "Resto 50% s/ contrato 97.650.000 — certificación quincenal 1/9", "Salón Comercial - Certificación 1/9", 5425000, "", 6564250, "Transferencia", "Pendiente", 46252, 46266, ""],
  [85, "B", "Quattropani - Melisa García SAS", "Resto 50% s/ contrato 97.650.000 — certificación quincenal 2/9", "Salón Comercial - Certificación 2/9", 5425000, "", 6564250, "Transferencia", "Pendiente", 46252, 46281, ""],
  [86, "B", "Quattropani - Melisa García SAS", "Resto 50% s/ contrato 97.650.000 — certificación quincenal 3/9", "Salón Comercial - Certificación 3/9", 5425000, "", 6564250, "Transferencia", "Pendiente", 46252, 46296, ""],
  [87, "B", "Quattropani - Melisa García SAS", "Resto 50% s/ contrato 97.650.000 — certificación quincenal 4/9", "Salón Comercial - Certificación 4/9", 5425000, "", 6564250, "Transferencia", "Pendiente", 46252, 46311, ""],
  [88, "B", "Quattropani - Melisa García SAS", "Resto 50% s/ contrato 97.650.000 — certificación quincenal 5/9", "Salón Comercial - Certificación 5/9", 5425000, "", 6564250, "Transferencia", "Pendiente", 46252, 46326, ""],
  [89, "B", "Quattropani - Melisa García SAS", "Resto 50% s/ contrato 97.650.000 — certificación quincenal 6/9", "Salón Comercial - Certificación 6/9", 5425000, "", 6564250, "Transferencia", "Pendiente", 46252, 46341, ""],
  [90, "B", "Quattropani - Melisa García SAS", "Resto 50% s/ contrato 97.650.000 — certificación quincenal 7/9", "Salón Comercial - Certificación 7/9", 5425000, "", 6564250, "Transferencia", "Pendiente", 46252, 46356, ""],
  [91, "B", "Quattropani - Melisa García SAS", "Resto 50% s/ contrato 97.650.000 — certificación quincenal 8/9", "Salón Comercial - Certificación 8/9", 5425000, "", 6564250, "Transferencia", "Pendiente", 46252, 46371, ""],
  [92, "B", "Quattropani - Melisa García SAS", "Resto 50% s/ contrato 97.650.000 — certificación quincenal 9/9", "Salón Comercial - Certificación 9/9", 5425000, "", 6564250, "Transferencia", "Pendiente", 46252, 46386, ""],
  [93, "B", "MESSINA", "02-00002162", "Limpieza de Escombros - Embolsado", 5008660.65, "", 6060479.386500001, "Transferencia", "Pendiente", 46248, 46280, ""],
  [94, "N", "LA ESTRELLA /ALIMENTOS DEL SUR SAS", "", "Faltante - GALPON 9", 8234758.245, "", 8234758.245, "Efectivo", "Pendiente", 46248, 46255, ""],
  [95, "N", "San Francisco", "Venta propia s/ total 8.758.810 — cobro íntegro al cierre de obra", "Mampostería", 8758810, "", 8758810, "Efectivo", "Pendiente", 46253, 46253, ""],
])

/** Dónde empiezan los datos. Las fórmulas de OBRAS citan rangos abiertos desde acá. */
export const DESDE = 5

/**
 * La foto como la quiere `evaluarFormula`: un mapa 'G5' → valor.
 *
 * Se construye acá y no se guarda expandido para que el archivo siga siendo legible: 91 líneas que se
 * pueden leer contra el Sheet, en vez de 879 celdas sueltas donde nadie ve una fila entera.
 */
export function comoHoja(filas = FILAS) {
  const hoja = {}
  for (const [n, ...celdas] of filas) {
    COLUMNAS.forEach((L, i) => { if (celdas[i] !== '') hoja[`${L}${n}`] = celdas[i] })
  }
  return hoja
}

/** La foto como la quiere `filasDeObra`: filas × columnas 0-based, desde la primera fila de datos. */
export function comoFilas(filas = FILAS) {
  const ancho = 27 // hasta la AA inclusive
  const idx = { B: 1, G: 6, H: 7, I: 8, J: 9, L: 11, M: 12, N: 13, O: 14, P: 15, Q: 16, AA: 26 }
  return filas.map(([, ...celdas]) => {
    const f = Array.from({ length: ancho }, () => '')
    COLUMNAS.forEach((L, i) => { f[idx[L]] = celdas[i] })
    return f
  })
}
