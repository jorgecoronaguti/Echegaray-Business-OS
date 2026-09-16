// EL CATÁLOGO DE OBRAS REAL, CONGELADO — para probar lo escrito a mano contra lo que existe.
//
// Copiado de `public.obra_canonica`, `public.cliente_alias` y `public.obra_alias` el 15/09/2026 con
// la MISMA forma que devuelve `catalogosDeAsignacion`. Es real a propósito: el defecto del fajo
// dc2d0273 fue que ocho anotaciones no llegaron a ocho obras que existen, con estos nombres y estos
// alias. Un fixture inventado habría pasado en verde el mismo día que la producción estaba en rojo.
//
// Se congela, no se lee de la base: un test que consulta Postgres deja de probar la lógica el día que
// alguien cierra una obra. Cuando el catálogo cambie de FORMA (una columna nueva), este archivo se
// regenera; que una obra nueva no esté acá no rompe nada.

import { normAlias } from '../jornales-a-registros-hh.mjs'

const par = (rotulo, cliente) => [normAlias(rotulo), cliente]

export const OBRAS = Object.freeze([
  { id: 'arcor', codigo: 'OB-0001', nombre: "AR - MANTENIMIENTO", cliente_texto: "ARCOR", tipo: 'mantenimiento', estado: 'cerrada', fusionada_en: null },
  { id: 'galpones', codigo: 'OB-0002', nombre: "Galpones", cliente_texto: "Galpones", tipo: 'obra', estado: 'cerrada', fusionada_en: null },
  { id: 'la-estrella', codigo: 'OB-0003', nombre: "LE - OBRA GENERAL", cliente_texto: "La Estrella", tipo: 'obra', estado: 'cerrada', fusionada_en: null },
  { id: 'messina', codigo: 'OB-0004', nombre: "ME - OBRA GENERAL", cliente_texto: "Messina", tipo: 'obra', estado: 'cerrada', fusionada_en: null },
  { id: 'san-francisco', codigo: 'OB-0005', nombre: "SF - GALPONES, MAMPOSTERÍA Y CANCHA DE PÁDEL", cliente_texto: "San Francisco", tipo: 'obra', estado: 'cerrada', fusionada_en: null },
  { id: 'le-comedor', codigo: 'OB-0006', nombre: "LE - OFICINA Y FÁBRICA DE PALITOS", cliente_texto: "La Estrella", tipo: 'obra', estado: 'activa', fusionada_en: null },
  { id: 'le-galpon-9', codigo: 'OB-0007', nombre: "LE - GALPÓN 9", cliente_texto: "La Estrella", tipo: 'obra', estado: 'cerrada', fusionada_en: null },
  { id: 'quattropani', codigo: 'OB-0008', nombre: "QP - SALÓN COMERCIAL", cliente_texto: "Quattropani - Melisa García SAS", tipo: 'obra', estado: 'activa', fusionada_en: null },
  { id: 'limpieza-de-escombros', codigo: 'OB-0009', nombre: "ME - LIMPIEZA DE ESCOMBROS", cliente_texto: "Messinas", tipo: 'obra', estado: 'cerrada', fusionada_en: null },
  { id: 'entrepiso-y-escalera', codigo: 'OB-0010', nombre: "SF - ENTREPISO Y ESCALERA", cliente_texto: "San Francisco", tipo: 'obra', estado: 'activa', fusionada_en: null },
  { id: 'pisos-industriales', codigo: 'OB-0011', nombre: "SF - PISOS INDUSTRIALES", cliente_texto: "San Francisco", tipo: 'obra', estado: 'activa', fusionada_en: null },
  { id: 'instalacion-electrica', codigo: 'OB-0012', nombre: "SF - INSTALACIÓN ELÉCTRICA", cliente_texto: "San Francisco", tipo: 'obra', estado: 'activa', fusionada_en: null },
  { id: 'bsa-planta', codigo: 'OB-0013', nombre: "ME - BSA PLANTA", cliente_texto: "Messina", tipo: 'obra', estado: 'cerrada', fusionada_en: 'messina-bsa' },
  { id: 'bsa-adicional', codigo: 'OB-0014', nombre: "ME - BSA ADICIONAL", cliente_texto: "Messina", tipo: 'obra', estado: 'cerrada', fusionada_en: null },
  { id: 'pisos-120m2', codigo: 'OB-0015', nombre: "ME - PISOS 120 M²", cliente_texto: "Messina", tipo: 'obra', estado: 'cerrada', fusionada_en: 'messina-pisos-120-rampa' },
  { id: 'relevamiento-topografico', codigo: 'OB-0016', nombre: "ME - RELEVAMIENTO TOPOGRÁFICO", cliente_texto: "Messina", tipo: 'obra', estado: 'cerrada', fusionada_en: null },
  { id: 'pilon', codigo: 'OB-0017', nombre: "ME - PILÓN", cliente_texto: "Messina", tipo: 'obra', estado: 'cerrada', fusionada_en: null },
  { id: 'messina-adicional-tercer-muro', codigo: 'OB-0018', nombre: "ME - ADICIONAL TERCER MURO", cliente_texto: "MESSINA", tipo: 'obra', estado: 'activa', fusionada_en: null },
  { id: 'messina-bsa', codigo: 'OB-0019', nombre: "ME - BSA", cliente_texto: "MESSINA", tipo: 'obra', estado: 'activa', fusionada_en: null },
  { id: 'messina-pisos-120-rampa', codigo: 'OB-0020', nombre: "ME - PISOS 120 M² Y RAMPA", cliente_texto: "MESSINA", tipo: 'obra', estado: 'activa', fusionada_en: null },
  { id: 'messina-playon-azufre', codigo: 'OB-0021', nombre: "ME - PLAYÓN DE AZUFRE", cliente_texto: "MESSINA", tipo: 'obra', estado: 'activa', fusionada_en: null },
  { id: 'messina-playon-dilucion-acido', codigo: 'OB-0022', nombre: "ME - PLAYÓN DILUCIÓN DE ÁCIDO", cliente_texto: "MESSINA", tipo: 'obra', estado: 'activa', fusionada_en: null },
  { id: 'sf-mamposteria', codigo: 'OB-0023', nombre: "SF - MAMPOSTERÍA", cliente_texto: "San Francisco", tipo: 'obra', estado: 'cerrada', fusionada_en: null },
  { id: 'messina-bases-tanque-so2', codigo: 'OB-0024', nombre: "ME - BASES TANQUE SO2", cliente_texto: "MESSINA", tipo: 'obra', estado: 'cerrada', fusionada_en: null },
  { id: 'le-galpon-7', codigo: 'OB-0068', nombre: "LE - GALPÓN 7", cliente_texto: "La Estrella", tipo: 'obra', estado: 'cerrada', fusionada_en: null },
  { id: 'le-galpon-8', codigo: 'OB-0069', nombre: "LE - GALPÓN 8", cliente_texto: "La Estrella", tipo: 'obra', estado: 'cerrada', fusionada_en: null },
  { id: 'le-cierre-perimetral', codigo: 'OB-0070', nombre: "LE - CIERRE PERIMETRAL", cliente_texto: "La Estrella", tipo: 'obra', estado: 'cerrada', fusionada_en: null },
  { id: 'le-mamposteria', codigo: 'OB-0071', nombre: "LE - MAMPOSTERÍA", cliente_texto: "La Estrella", tipo: 'obra', estado: 'cerrada', fusionada_en: null },
])

export const CLIENTE_ALIAS = new Map([
  par("ARCOR", "ARCOR"),
  par("LA ESTRELLA", "LA ESTRELLA"),
  par("LA-ESTRELLA", "LA ESTRELLA"),
  par("MESSINA", "MESSINA"),
  par("MESSINAS", "MESSINA"),
  par("QUATTROPANI", "QUATTROPANI"),
  par("QUATTROPANI - MELISA GARCIA SAS", "QUATTROPANI"),
  par("JAVIER SANCHEZ", "SAN FRANCISCO"),
  par("SAN FRANCISCO", "SAN FRANCISCO"),
  par("SAN-FRANCISCO", "SAN FRANCISCO"),
])

export const ALIAS = new Map([
  [normAlias("arcor"), 'arcor'],
  [normAlias("bsa adicional"), 'bsa-adicional'],
  [normAlias("entrepiso"), 'entrepiso-y-escalera'],
  [normAlias("javier sanchez entre"), 'entrepiso-y-escalera'],
  [normAlias("js imotor entrepiso"), 'entrepiso-y-escalera'],
  [normAlias("san francisco js imotor entrepiso"), 'entrepiso-y-escalera'],
  [normAlias("instalacion electrica"), 'instalacion-electrica'],
  [normAlias("instalaciones electricas"), 'instalacion-electrica'],
  [normAlias("alimentos sur"), 'la-estrella'],
  [normAlias("alimentos sur sas"), 'la-estrella'],
  [normAlias("estrella"), 'la-estrella'],
  [normAlias("cierre perimetral"), 'le-cierre-perimetral'],
  [normAlias("estrella cierre perimetral"), 'le-cierre-perimetral'],
  [normAlias("estrella fabrica palitos y oficinas"), 'le-comedor'],
  [normAlias("estrella oficinas y fabrica"), 'le-comedor'],
  [normAlias("le comedor"), 'le-comedor'],
  [normAlias("oficina y fabrica palitos"), 'le-comedor'],
  [normAlias("oficinas y fabrica palitos"), 'le-comedor'],
  [normAlias("estrella galpon 7"), 'le-galpon-7'],
  [normAlias("galpon 7"), 'le-galpon-7'],
  [normAlias("estrella galpon 8"), 'le-galpon-8'],
  [normAlias("galpon 8"), 'le-galpon-8'],
  [normAlias("estrella galpon 9"), 'le-galpon-9'],
  [normAlias("galpon 9"), 'le-galpon-9'],
  [normAlias("le galpon 9"), 'le-galpon-9'],
  [normAlias("estrella mamposteria"), 'le-mamposteria'],
  [normAlias("limpieza escombros"), 'limpieza-de-escombros'],
  [normAlias("messina"), 'messina'],
  [normAlias("messinas"), 'messina'],
  [normAlias("bases tanque so2"), 'messina-bases-tanque-so2'],
  [normAlias("bsa planta"), 'messina-bsa'],
  [normAlias("manofacturas quimicas juan messinas bsa"), 'messina-bsa'],
  [normAlias("messinas piso 120m"), 'messina-pisos-120-rampa'],
  [normAlias("pisos 120m2"), 'messina-pisos-120-rampa'],
  [normAlias("playon azufre"), 'messina-playon-azufre'],
  [normAlias("pilon"), 'pilon'],
  [normAlias("js imotor pisos industriales"), 'pisos-industriales'],
  [normAlias("pisos industriales"), 'pisos-industriales'],
  [normAlias("san francisco js imotor pisos industriales"), 'pisos-industriales'],
  [normAlias("franco quattropani salon comercial"), 'quattropani'],
  [normAlias("quattropani"), 'quattropani'],
  [normAlias("quattropani melisa garcia sas"), 'quattropani'],
  [normAlias("quattropani salon comercial"), 'quattropani'],
  [normAlias("salones comerciales"), 'quattropani'],
  [normAlias("relevamiento topografico"), 'relevamiento-topografico'],
  [normAlias("galpones mamposteria cancha padel"), 'san-francisco'],
  [normAlias("imotor"), 'san-francisco'],
  [normAlias("javi sanchez"), 'san-francisco'],
  [normAlias("javier sanchez"), 'san-francisco'],
  [normAlias("san francisco"), 'san-francisco'],
  [normAlias("js imotor mamposteria"), 'sf-mamposteria'],
  [normAlias("mamposteria"), 'sf-mamposteria'],
  [normAlias("san francisco js imotor mamposteria"), 'sf-mamposteria'],
])

export const CATALOGOS = Object.freeze({ alias: ALIAS, canonicas: OBRAS, clienteAlias: CLIENTE_ALIAS })

/** Lo que el índice del resolutor necesita, con los nombres que usa `indiceDeAnotacion`. */
export const CATALOGO = Object.freeze({ obras: OBRAS, clienteAlias: CLIENTE_ALIAS, alias: ALIAS })

/**
 * LAS OCHO ANOTACIONES DEL FAJO dc2d0273 (15/09/2026) y la obra que le corresponde a cada una,
 * dictada por el dueño. Son el contrato de este módulo: si una sola deja de dar su código, el
 * defecto volvió.
 */
export const CASOS_15_09 = Object.freeze([
  { anotacion: 'Estrella Filtraciones OFICINA Y FÁB. · c/c', codigo: 'OB-0006', unidad: 'Civil' },
  { anotacion: 'Ford XLS', codigo: 'ES-TAL', unidad: 'Estructura', detalle: 'Vehiculos' },
  { anotacion: 'Ford F 100', codigo: 'ES-TAL', unidad: 'Estructura', detalle: 'Vehiculos' },
  { anotacion: 'QUATTROPANI', codigo: 'OB-0008', unidad: 'Civil' },
  { anotacion: 'Messino Dilucion', codigo: 'OB-0022', unidad: 'Civil' },
  { anotacion: 'ESTRUCTURA TABLER', codigo: 'ES-TAL', unidad: 'Estructura', detalle: 'Taller' },
  { anotacion: 'SF Pisos Industriales', codigo: 'OB-0011', unidad: 'Civil' },
  { anotacion: 'Messino Dilucion', codigo: 'OB-0022', unidad: 'Civil' },
])
