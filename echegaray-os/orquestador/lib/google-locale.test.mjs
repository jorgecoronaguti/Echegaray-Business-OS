#!/usr/bin/env node
// Test de localización de fórmulas es-AR (google.mjs _convertFormula). El modelo escribe fórmulas
// CANÓNICAS (coma=separador, punto=decimal); en un sheet es_AR hay que pasar a ';'=separador y
// ','=decimal. El bug real: antes solo se hacía coma→';' y el punto decimal quedaba → "=A1*1.02"
// se leía como A1*102 (número MAL). Hermético, 0 API.
import { makeGoogleClient } from './google.mjs'

let ok = 0, fail = 0
const check = (n, c) => { if (c) ok++; else { fail++; console.error(`FALLA: ${n} → ${c}`) } }
const f = makeGoogleClient()._convertFormula

// separador de argumentos: coma → ';'
check('SUM: coma→;', f('=SUM(A1,A2)') === '=SUM(A1;A2)')
check('VLOOKUP multi-arg', f('=VLOOKUP(A1,B:C,2,FALSE)') === '=VLOOKUP(A1;B:C;2;FALSE)')
// decimal: punto → ',' (el bug del +2%)
check('decimal *1.02 → *1,02 (2% bien, no 10200%)', f('=G62*1.02') === '=G62*1,02')
check('decimal 0.21 (IVA)', f('=A1*0.21') === '=A1*0,21')
check('mixto: separador y decimal', f('=ROUND(A1*1.05,2)') === '=ROUND(A1*1,05;2)')
// strings: NO tocar el contenido entre comillas dobles ni simples
check('SUBSTITUTE: el "." del string NO se toca, sí los separadores', f('=VALUE(SUBSTITUTE(G62,".",""))') === '=VALUE(SUBSTITUTE(G62;".";""))')
check('string con coma adentro no se toca', f('=CONCAT(A1,", pesos")') === '=CONCAT(A1;", pesos")')
check('pestaña con punto en comillas simples', f("='Hoja.2'!A1+1.5") === "='Hoja.2'!A1+1,5")
// BUG REAL (auditoría 18/07): el modelo a veces escribe la fórmula YA en es_AR (coma decimal).
// Antes la coma decimal se convertía en ';' → "=G62*1;02" = #ERROR!. Ahora se preserva la coma
// decimal inequívoca (número tras operador aritmético / '(' / '=') SIN romper separadores.
check('modelo es-AR: *1,02 se preserva (NO pasa a 1;02)', f('=G62*1,02') === '=G62*1,02')
check('modelo es-AR: dos decimales', f('=A1*1,5+B2*2,3') === '=A1*1,5+B2*2,3')
check('modelo es-AR: división decimal', f('=A1/2,5') === '=A1/2,5')
check('modelo es-AR: arg negativo decimal, sep intacto', f('=MIN(A1,-2,5)') === '=MIN(A1;-2,5)')
check('args enteros NO se confunden con decimal', f('=VLOOKUP(A1,Data!A:B,2,0)') === '=VLOOKUP(A1;Data!A:B;2;0)')
// no-fórmulas y sin cambios
check('no-fórmula (texto) intacto', f('hola, mundo') === 'hola, mundo')
check('número plano (no string =) intacto', f(1234) === 1234)
check('fórmula sin comas/puntos intacta', f('=A1*102/100') === '=A1*102/100')

// ── El punto de los nombres de función españoles NO es un decimal (bug real 20/07) ──
// SUMAR.SI, SUMAR.SI.CONJUNTO, SI.ERROR, FIN.MES: la conversión ciega punto→coma los rompía
// ("SUMAR,SI" → #ERROR!) y toda fórmula escrita en español moría al pasar por drive_update.
check('SUMAR.SI no se rompe', f('=SUMAR.SI(A:A,"x",B:B)') === '=SUMAR.SI(A:A;"x";B:B)')
check('SUMAR.SI.CONJUNTO tampoco', f('=SUMAR.SI.CONJUNTO(O:O,J:J,"x")') === '=SUMAR.SI.CONJUNTO(O:O;J:J;"x")')
check('SI.ERROR y FIN.MES', f('=SI.ERROR(FIN.MES(A1,0),0)') === '=SI.ERROR(FIN.MES(A1;0);0)')
check('el decimal SÍ se sigue convirtiendo', f('=A1*1.02') === '=A1*1,02')
// Dentro de un literal de string NO se toca nada, a propósito: ahí puede haber un nombre de
// archivo, una fecha o un texto del negocio. El criterio numérico se escribe ya localizado.
check('el string literal se respeta', f('=SUMAR.SI(A:A,">1.5")') === '=SUMAR.SI(A:A;">1.5")')
check('nombre de pestaña con punto', f("='Hoja.2'!A1*2.5") === "='Hoja.2'!A1*2,5")

console.log(`\ngoogle-locale.test: ${ok} OK, ${fail} FALLA`)
process.exit(fail ? 1 : 0)
