// Test hermético del parser de F931. Sin Drive, sin API: el texto es el de una DDJJ real.
import { numeroDDJJ, parseF931, formatCargas, CONCEPTOS_F931 } from './cargas-sociales.mjs'

let ok = 0, falla = 0
const check = (n, c) => { if (c) ok++; else { falla++; console.error(`  FALLA: ${n}`) } }

check('numeroDDJJ es-AR', numeroDDJJ('4.408.245,79') === 4408245.79)
check('numeroDDJJ sin miles', numeroDDJJ('9.341,64') === 9341.64)
check('numeroDDJJ cero', numeroDDJJ('0,00') === 0)
check('numeroDDJJ basura no rompe', numeroDDJJ('') === 0 && numeroDDJJ(null) === 0)

// Texto REAL de la DDJJ de junio 2026 (recortado a lo que el parser necesita).
const REAL = `931
Mes - Año 	Orig. (0) - Rect. (1/9): 0
06/2026 	Servicios Eventuales: No
Empleados en nómina: 	22
Suma de Rem. 1: 	18.280.839,75
VI - LEY DE RIESGOS DE TRABAJO
Cantidad de CUILES con ART 	22 40.194,00
L.R.T. total a pagar 	2.750.458,70
VIII - MONTOS QUE SE INGRESAN
301 - Aportes de Seguridad Social 	2.682.844,79 	302 - Aportes de Obra Social 	699.987,65
351 - Contribuciones de Seguridad Social 	4.408.245,79 	352 - Contribuciones de Obra Social 	1.399.975,29
360 - Contribuciones RENATRE 	0,00 	312 - L.R.T. 	2.750.458,70
028 - Seguro Colectivo de Vida Obligatorio 	9.341,64 	270 - Vales Alimentarios/Cajas de alimentos 	0,00
935 - Seg. Sepelio UATRE 	0,00`

const p = parseF931(REAL)
check('reconoce el período que DECLARA', p.periodo === '2026-06')
check('empleados en nómina', p.empleados === 22)
check('remuneración', p.remuneracion === 18280839.75)
check('CUILes con ART', p.cuiles_con_art === 22)
check('aportes SS', p.conceptos.aportes_ss === 2682844.79)
check('aportes OS', p.conceptos.aportes_os === 699987.65)
check('contribuciones SS', p.conceptos.contrib_ss === 4408245.79)
check('contribuciones OS', p.conceptos.contrib_os === 1399975.29)
// El hallazgo que corrige una alarma falsa: el ART va DENTRO del F931, código 312.
check('L.R.T. (ART) se extrae del código 312', p.conceptos.lrt === 2750458.70)
check('seguro de vida obligatorio', p.conceptos.scvo === 9341.64)
check('RENATRE en cero no rompe', p.conceptos.renatre === 0)
check('total suma los 8 conceptos', Math.round(p.total * 100) / 100 === 11950853.86)
check('están los 8 conceptos', Object.keys(p.conceptos).length === CONCEPTOS_F931.length)

// Lo que NO debe hacer: inventar una declaración a partir de cualquier PDF.
check('un PDF que no es F931 devuelve null', parseF931('Factura A 0001-00000123 Total $5.000') === null)
check('texto vacío devuelve null', parseF931('') === null && parseF931(null) === null)

const t = formatCargas({ meses: [p], faltantes: ['2026-07'] })
check('formato: muestra el período', t.includes('2026-06'))
check('formato: separa el ART', t.includes('ART (L.R.T.)'))
check('formato: avisa que el ART va dentro del F931', t.includes('DENTRO del F931'))
check('formato: declara los meses sin DDJJ', t.includes('2026-07'))
check('formato: sin datos no finge', formatCargas({ meses: [] }).includes('No encontré'))

console.log(`cargas-sociales.test: ${ok} OK, ${falla} FALLA`)
if (falla) process.exit(1)
