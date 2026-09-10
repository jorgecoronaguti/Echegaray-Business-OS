// LOS 44 PAPELES DE MESSINA, TAL COMO ESTÁN EN `public.cliente_orden` el 10/09/2026.
//
// Exportados de la base con `select … where cliente_id = <messina> and eliminado_en is null` y
// SIN el `emisor` —que es el mail de una persona—: acá no entra ningún dato personal. Lo demás es
// literal, incluidos los defectos: 12 OC, 12 OP, 12 certificados de retención guardados como
// `otro`, 8 facturas nuestras, cuatro OC y cuatro OP sin obra atribuida, y las 12 OP con `cita`
// en null.
//
// ES UN FIXTURE DE FORMA, NO UNA FOTO QUE HAYA QUE MANTENER AL DÍA. Prueba que la agrupación
// aguanta la forma REAL de los datos —números con ceros, la misma OC en dos mails, el certificado
// que lleva el número de su OP—, que es lo que un objeto inventado a mano nunca contiene.
// Si mañana el extractor atribuye mejor, este archivo NO se toca: los tests que dependen de la
// atribución dicen qué esperan y por qué.

import type { PapelCrudo } from './papelesCliente'

export const PAPELES_MESSINA: PapelCrudo[] = [
  { id: 'm01', tipo: 'factura', numero: 'A-1-214', fecha: '2026-07-02', importe: 10133750, moneda: 'ARS', obra_id: 'messina-bases-tanque-so2', cita: '2-1864', nombre_archivo: '30716304643_001_00001_00000214.pdf' },
  { id: 'm02', tipo: 'factura', numero: 'A-1-215', fecha: '2026-07-02', importe: 6981554.8, moneda: 'ARS', obra_id: 'messina-bases-tanque-so2', cita: '2-1923', nombre_archivo: '30716304643_001_00001_00000215.pdf' },
  { id: 'm03', tipo: 'factura', numero: 'A-1-222', fecha: '2026-08-21', importe: 7228782, moneda: 'ARS', obra_id: 'messina-bsa', cita: '2-1985', nombre_archivo: 'OC 00002-00001985.pdf' },
  { id: 'm04', tipo: 'factura', numero: 'A-1-223', fecha: '2026-08-21', importe: 4300876.36, moneda: 'ARS', obra_id: 'messina-pisos-120-rampa', cita: '2-2097', nombre_archivo: 'OC 02-00002097.pdf' },
  { id: 'm05', tipo: 'factura', numero: 'A-1-224', fecha: '2026-08-21', importe: 1089000, moneda: 'ARS', obra_id: 'relevamiento-topografico', cita: '2-2135', nombre_archivo: 'OC 02-00002135.pdf' },
  { id: 'm06', tipo: 'factura', numero: 'A-1-225', fecha: '2026-08-21', importe: 6060479.39, moneda: 'ARS', obra_id: 'limpieza-de-escombros', cita: '2-2162', nombre_archivo: 'OC 02-00002162.pdf' },
  { id: 'm07', tipo: 'factura', numero: 'A-1-226', fecha: '2026-08-21', importe: 4336586.76, moneda: 'ARS', obra_id: 'messina-bsa', cita: '2-279', nombre_archivo: 'ACTUALIZACION OC 02-00000279.pdf' },
  { id: 'm08', tipo: 'factura', numero: 'A-1-227', fecha: '2026-08-21', importe: 4928356.26, moneda: 'ARS', obra_id: 'messina-bsa', cita: '2-279', nombre_archivo: '50% OC 02-00000279.pdf' },
  { id: 'm09', tipo: 'orden_compra', numero: '00002-00000279', fecha: '2024-09-20', importe: 32855708.38, moneda: 'ARS', obra_id: 'messina-bsa', cita: null, nombre_archivo: 'OC_32_0000200000279 Echegaray.pdf' },
  { id: 'm10', tipo: 'orden_compra', numero: '00002-00000495', fecha: '2024-12-16', importe: 445517.49, moneda: 'ARS', obra_id: 'messina-bsa', cita: null, nombre_archivo: 'oc-495.pdf' },
  { id: 'm11', tipo: 'orden_compra', numero: '00002-00000496', fecha: '2024-12-16', importe: 5019988.49, moneda: 'ARS', obra_id: 'messina-bsa', cita: null, nombre_archivo: 'oc-496.pdf' },
  { id: 'm12', tipo: 'orden_compra', numero: '00002-00000865', fecha: '2025-05-20', importe: 21768977.12, moneda: 'ARS', obra_id: null, cita: null, nombre_archivo: 'OC_32_0000200000865.pdf' },
  { id: 'm13', tipo: 'orden_compra', numero: '00002-00001122', fecha: '2025-09-09', importe: 8097756.92, moneda: 'ARS', obra_id: null, cita: null, nombre_archivo: 'OC_32_0000200001122.pdf' },
  { id: 'm14', tipo: 'orden_compra', numero: '00002-00001864', fecha: '2026-05-12', importe: 10133750, moneda: 'ARS', obra_id: 'messina-bases-tanque-so2', cita: null, nombre_archivo: 'OC_32_0000200001864.pdf' },
  { id: 'm15', tipo: 'orden_compra', numero: '00002-00002097', fecha: '2026-07-15', importe: 8601752.71, moneda: 'ARS', obra_id: 'messina-pisos-120-rampa', cita: null, nombre_archivo: 'OC_32_0000200002097.pdf' },
  { id: 'm16', tipo: 'orden_compra', numero: '00002-00002162', fecha: '2026-08-05', importe: 6060479.39, moneda: 'ARS', obra_id: 'limpieza-de-escombros', cita: null, nombre_archivo: 'OC_32_0000200002162.pdf' },
  { id: 'm17', tipo: 'orden_compra', numero: '00002-00002173', fecha: '2026-08-11', importe: 78650000, moneda: 'ARS', obra_id: 'messina-playon-azufre', cita: null, nombre_archivo: 'OC_32_0000200002173.pdf' },
  { id: 'm18', tipo: 'orden_compra', numero: '00002-00002226', fecha: '2026-08-24', importe: 2848649.02, moneda: 'ARS', obra_id: 'messina-pisos-120-rampa', cita: null, nombre_archivo: 'OC_32_0000200002226.pdf' },
  { id: 'm19', tipo: 'orden_compra', numero: '00002-00002256', fecha: '2026-09-02', importe: 12100000, moneda: 'ARS', obra_id: 'messina-adicional-tercer-muro', cita: null, nombre_archivo: 'OC_32_0000200002256.pdf' },
  { id: 'm20', tipo: 'orden_compra', numero: '00002-00002266', fecha: '2026-09-03', importe: 24309950.07, moneda: 'ARS', obra_id: 'messina-playon-dilucion-acido', cita: null, nombre_archivo: 'OC_32_0000200002266.pdf' },
  { id: 'm21', tipo: 'orden_pago', numero: '0000000000730', fecha: '2024-09-25', importe: 13142283.35, moneda: 'ARS', obra_id: 'messina-bsa', cita: null, nombre_archivo: 'O_P_0000000000730.pdf' },
  { id: 'm22', tipo: 'orden_pago', numero: '0000000001237', fecha: '2024-12-20', importe: 5100000, moneda: 'ARS', obra_id: 'messina-bsa', cita: null, nombre_archivo: 'O_P_0000000001237.pdf' },
  { id: 'm23', tipo: 'orden_pago', numero: '0000000001292', fecha: '2025-01-02', importe: 4756712.51, moneda: 'ARS', obra_id: 'messina-bsa', cita: null, nombre_archivo: 'O_P_0000000001292.pdf' },
  { id: 'm24', tipo: 'orden_pago', numero: '0000000001476', fecha: '2025-02-11', importe: 3926838.57, moneda: 'ARS', obra_id: null, cita: null, nombre_archivo: 'O_P_0000000001476.pdf' },
  { id: 'm25', tipo: 'orden_pago', numero: '0000000001558', fecha: '2025-02-21', importe: 5465505.98, moneda: 'ARS', obra_id: 'messina-bsa', cita: null, nombre_archivo: 'O_P_0000000001558.pdf' },
  { id: 'm26', tipo: 'orden_pago', numero: '0000000002151', fecha: '2025-05-23', importe: 8731000, moneda: 'ARS', obra_id: null, cita: null, nombre_archivo: 'O_P_0000000002151.pdf' },
  { id: 'm27', tipo: 'orden_pago', numero: '0000000002336', fecha: '2025-07-02', importe: 13037977.12, moneda: 'ARS', obra_id: null, cita: null, nombre_archivo: 'O_P_0000000002336.pdf' },
  { id: 'm28', tipo: 'orden_pago', numero: '0000000002983', fecha: '2025-10-16', importe: 8097756.92, moneda: 'ARS', obra_id: null, cita: null, nombre_archivo: 'O_P_0000000002983.pdf' },
  { id: 'm29', tipo: 'orden_pago', numero: '0000000004807', fecha: '2026-07-22', importe: 4300876.36, moneda: 'ARS', obra_id: 'messina-pisos-120-rampa', cita: null, nombre_archivo: '0000000004807.pdf' },
  { id: 'm30', tipo: 'orden_pago', numero: '0000000004865', fecha: '2026-07-28', importe: 17115304.8, moneda: 'ARS', obra_id: 'messina-bases-tanque-so2', cita: null, nombre_archivo: '0000000004865.pdf' },
  { id: 'm31', tipo: 'orden_pago', numero: '0000000005146', fecha: '2026-09-03', importe: 15328174.46, moneda: 'ARS', obra_id: null, cita: null, nombre_archivo: '0000000005146.pdf' },
  { id: 'm32', tipo: 'orden_pago', numero: '0000000005156', fecha: '2026-09-08', importe: 39325000, moneda: 'ARS', obra_id: 'messina-playon-azufre', cita: null, nombre_archivo: '0000000005156.pdf' },
  { id: 'm33', tipo: 'otro', numero: '0000000000730', fecha: '2024-09-25', importe: null, moneda: null, obra_id: 'messina-bsa', cita: null, nombre_archivo: 'O_P_0000000000730_G00000347.pdf' },
  { id: 'm34', tipo: 'otro', numero: '0000000001237', fecha: '2024-12-20', importe: null, moneda: null, obra_id: 'messina-bsa', cita: null, nombre_archivo: 'O_P_0000000001237_G00000556.pdf' },
  { id: 'm35', tipo: 'otro', numero: '0000000001292', fecha: '2025-01-02', importe: null, moneda: null, obra_id: 'messina-bsa', cita: null, nombre_archivo: 'O_P_0000000001292_G00000586.pdf' },
  { id: 'm36', tipo: 'otro', numero: '0000000001476', fecha: '2025-02-11', importe: null, moneda: null, obra_id: null, cita: null, nombre_archivo: 'O_P_0000000001476_G00000664.pdf' },
  { id: 'm37', tipo: 'otro', numero: '0000000001558', fecha: '2025-02-21', importe: null, moneda: null, obra_id: 'messina-bsa', cita: null, nombre_archivo: 'O_P_0000000001558_G00000696.pdf' },
  { id: 'm38', tipo: 'otro', numero: '0000000002151', fecha: '2025-05-23', importe: null, moneda: null, obra_id: null, cita: null, nombre_archivo: 'O_P_0000000002151_G00000947.pdf' },
  { id: 'm39', tipo: 'otro', numero: '0000000002336', fecha: '2025-07-02', importe: null, moneda: null, obra_id: null, cita: null, nombre_archivo: 'O_P_0000000002336_G00001009.pdf' },
  { id: 'm40', tipo: 'otro', numero: '0000000002983', fecha: '2025-10-16', importe: null, moneda: null, obra_id: null, cita: null, nombre_archivo: 'O_P_0000000002983_G00001292.pdf' },
  { id: 'm41', tipo: 'otro', numero: '0000000004807', fecha: '2026-07-22', importe: null, moneda: null, obra_id: 'messina-pisos-120-rampa', cita: null, nombre_archivo: 'O_P_0000000004807_G00002174.pdf' },
  { id: 'm42', tipo: 'otro', numero: '0000000004865', fecha: '2026-07-28', importe: null, moneda: null, obra_id: 'messina-bases-tanque-so2', cita: null, nombre_archivo: 'O_P_0000000004865_G00002208.pdf' },
  { id: 'm43', tipo: 'otro', numero: '0000000005146', fecha: '2026-09-03', importe: null, moneda: null, obra_id: null, cita: null, nombre_archivo: 'O_P_0000000005146_G00002346.pdf' },
  { id: 'm44', tipo: 'otro', numero: '0000000005156', fecha: '2026-09-08', importe: null, moneda: null, obra_id: 'messina-playon-azufre', cita: null, nombre_archivo: 'O_P_0000000005156_G00002353.pdf' },
]
