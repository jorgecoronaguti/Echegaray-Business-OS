// Test hermético de la clasificación de egresos. Sin Sheet, sin DB, sin API.
import { montoAR, areaDeEgreso, componerEgresos, formatEgresos } from './egresos-por-area.mjs'

let ok = 0, falla = 0
const check = (n, c) => { if (c) ok++; else { falla++; console.error(`  FALLA: ${n}`) } }

// montoAR — es-AR: coma decimal, punto de miles. Un error acá corrompe TODO el análisis.
check('formato es-AR completo', montoAR('$ 54.043,44') === 54043.44)
check('sin decimales', montoAR('$1.234.567') === 1234567)
check('número pasa derecho', montoAR(1500) === 1500)
check('guión es 0, no NaN', montoAR('-') === 0)
check('vacío es 0', montoAR('') === 0 && montoAR(null) === 0)
check('texto sin dígitos es 0', montoAR('Pendiente') === 0)
check('no confunde miles con decimales', montoAR('1.234') === 1234)

// El mismo mapa que devuelve public.obra_alias: las claves YA vienen normalizadas con normObra
// (sin artículos). Por eso "LA ESTRELLA" tiene que resolver contra el alias "estrella".
const OBRAS = new Map([
  ['estrella', { obra_id: 'la-estrella', clasificacion: 'obra' }],
  ['san francisco', { obra_id: 'san-francisco', clasificacion: 'obra' }],
  ['messinas', { obra_id: 'messina', clasificacion: 'obra' }],
  ['arcor', { obra_id: 'arcor', clasificacion: 'mantenimiento' }],
  ['administracion', { obra_id: null, clasificacion: 'indirecto' }],
])
const a = (f) => areaDeEgreso(f, OBRAS)

// NÓMINA — el caso que se me escapó el 20/07: los sueldos van SIN concepto, el dato está en Proveedor.
check('proveedor "Sueldos" es nómina aunque no haya concepto', a({ proveedor: 'Sueldos', total: '$1' }).area === 'personas')
check('sueldo neto se distingue del resto', a({ proveedor: 'Sueldos' }).grupo === 'Sueldo neto')
check('F931 es cargas sociales, NO impuestos', a({ cliente: 'F931', proveedor: 'ARCA' }).area === 'personas')
check('SAC', a({ proveedor: 'SAC' }).grupo === 'SAC / aguinaldo')
check('fondo de cese', a({ proveedor: 'FCL' }).grupo === 'Fondo de cese')
check('sindicatos', a({ proveedor: 'SINDICATOS' }).grupo === 'Sindicatos')
check('concepto de liquidación también entra', a({ concepto: 'Liquidacion Guada, Ignacio' }).area === 'personas')
// Un ADICIONAL DE OBRA es material, no sueldo. Lo tenía mal y lo delató la pestaña con fórmulas.
check('"Barniz - Adicional de obra" NO es nómina', a({ concepto: 'Barniz para Entre piso - Adicional de obra', cliente: 'LA ESTRELLA' }).area === 'obras')

// El resto de las áreas
check('unidad Impuestos → contabilidad', a({ unidad: 'Impuestos', proveedor: 'X' }).area === 'contabilidad_legales')
check('unidad Financiero → adm y finanzas', a({ unidad: 'Financiero', proveedor: 'X' }).area === 'administracion_finanzas')
check('vehículo → flota', a({ concepto: 'TOYOTA AD119YO', cliente: 'Taller' }).grupo === 'Flota y equipos')
check('obra canónica → obras', a({ cliente: 'LA ESTRELLA', concepto: 'Hierro' }).area === 'obras')
check('obra con otra grafía se resuelve por el eje', a({ cliente: 'MESSINAS' }).area === 'obras')
// El error real del 20/07: "LA ESTRELLA" contra el alias "estrella".
check('el artículo NO rompe el match (normObra saca "la")', a({ cliente: 'LA ESTRELLA' }).grupo === 'Compra imputada a obra')
check('minúsculas y espacios tampoco', a({ cliente: '  la estrella ' }).area === 'obras')
check('indirecto → compras/estructura', a({ cliente: 'Administracion', concepto: 'notebook' }).grupo === 'Estructura / indirecto')

// Lo que NO debe hacer
check('fila de plantilla no es un egreso', a({ total: '-' }).grupo === 'Fila de plantilla')
check('desconocido con monto se declara, no se adivina', a({ cliente: 'Zaraza', total: '$500' }).area === null)

// componerEgresos
const r = componerEgresos([
  { proveedor: 'Sueldos', total: '$1.000,00' },
  { cliente: 'F931', proveedor: 'ARCA', total: '$500,00' },
  { cliente: 'LA ESTRELLA', concepto: 'Hierro', total: '$300,00' },
  { cliente: 'LA ESTRELLA', total: '$200,00' },
  { total: '-' },
  { total: '-' },
], OBRAS)
check('no cuenta las plantilla en el total', r.total === 2000)
check('cuenta las plantilla aparte', r.filas_plantilla === 2)
check('filas de egreso excluye plantilla', r.filas_egreso === 4)
check('personas es el área más grande', r.areas[0].area === 'personas' && r.areas[0].monto === 1500)
check('porcentaje sobre el total de egresos', Math.round(r.areas[0].pct) === 75)
check('detecta las filas sin concepto', r.sin_concepto === 3 && r.sin_concepto_monto === 1700)
check('los grupos separan sueldo de cargas', r.grupos.some((g) => g.grupo === 'Sueldo neto') && r.grupos.some((g) => g.grupo === 'F931 — cargas sociales'))

const t = formatEgresos(r)
check('formato: encabezado con total', t.includes('EGRESOS POR ÁREA'))
check('formato: avisa de las plantilla', t.includes('PLANTILLA'))
check('formato: avisa de las sin concepto', t.includes('SIN concepto'))
check('formato: error se declara', formatEgresos({ error: 'x' }).includes('No pude'))

console.log(`egresos-por-area.test: ${ok} OK, ${falla} FALLA`)
if (falla) process.exit(1)
