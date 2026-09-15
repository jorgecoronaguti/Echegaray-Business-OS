// UN CATÁLOGO DE OBRAS CHICO CON LA FORMA REAL de `catalogosDeAsignacion` — para los tests de la
// columna «Obra» del cargador y del relleno. Los casos son los que el dueño nombró el 14/09/2026:
// Messina con dos obras (Planta de BSA, Bases de Tanque), San Francisco con varias, La Estrella
// (Galpón 9), Quattropani con UNA sola obra. Los códigos son de prueba: no son los de la base.

import { normAlias } from '../jornales-a-registros-hh.mjs'

export const OBRAS = Object.freeze([
  { id: 'me-bsa', codigo: 'OB-0007', nombre: 'ME - PLANTA DE BSA', cliente_texto: 'MESSINA', fusionada_en: null },
  { id: 'me-tanque', codigo: 'OB-0008', nombre: 'ME - BASES DE TANQUE', cliente_texto: 'MESSINA', fusionada_en: null },
  { id: 'sf-pisos', codigo: 'OB-0011', nombre: 'SF - PISOS INDUSTRIALES', cliente_texto: 'SAN FRANCISCO', fusionada_en: null },
  { id: 'sf-galpones', codigo: 'OB-0012', nombre: 'SF - GALPONES', cliente_texto: 'SAN FRANCISCO', fusionada_en: null },
  { id: 'le-g9', codigo: 'OB-0020', nombre: 'LE - GALPÓN 9', cliente_texto: 'LA ESTRELLA', fusionada_en: null },
  { id: 'le-oficina', codigo: 'OB-0021', nombre: 'LE - OFICINA', cliente_texto: 'LA ESTRELLA', fusionada_en: null },
  { id: 'qp-salones', codigo: 'OB-0030', nombre: 'QP - SALONES COMERCIALES', cliente_texto: 'QUATTROPANI', fusionada_en: null },
  // Una obra sin código (la migración del código no la alcanzó): no es opción del desplegable.
  { id: 'ar-sin-codigo', codigo: null, nombre: 'ARCOR - PLAYÓN', cliente_texto: 'ARCOR', fusionada_en: null },
])

const par = (rotulo, cliente) => [normAlias(rotulo), cliente]

export const CLIENTE_ALIAS = new Map([
  par('MESSINA', 'MESSINA'), par('Messinas', 'MESSINA'),
  par('San Francisco', 'SAN FRANCISCO'), par('LA ESTRELLA', 'LA ESTRELLA'),
  par('QUATTROPANI', 'QUATTROPANI'), par('Quattropani - Melisa García SAS', 'QUATTROPANI'),
  par('ARCOR', 'ARCOR'),
])

export const ALIAS = new Map([
  [normAlias('Planta de BSA'), 'me-bsa'], [normAlias('Bases de Tanque'), 'me-tanque'],
  [normAlias('Galpon 9'), 'le-g9'], [normAlias('Salones Comerciales'), 'qp-salones'],
  [normAlias('Playon'), 'ar-sin-codigo'],
])

export const CATALOGOS = Object.freeze({ alias: ALIAS, canonicas: OBRAS, clienteAlias: CLIENTE_ALIAS })
