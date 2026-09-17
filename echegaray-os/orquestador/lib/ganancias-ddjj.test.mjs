import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parsearDDJJGanancias } from './ganancias-ddjj.mjs'
import { obligacionesGananciasDDJJ } from './impuestos-registro.mjs'

// TEXTO REAL de `ddjj ganancias 2025.pdf` (Drive 1ccne303eneBBVzeS0H3v0D2tzSlZ4BBD): encabezado y página 2 (R1–R6).
const F713_2025 = `PAGINA 1
Declaraciones Juradas
Ganancias Sociedades
Formulario 713 Versión 2500
jueves, 25 junio 2026 18:26:45
Transacción: 4233520187
CUIT: 30716304643 	Denominación: ECHEGARAY CONSTRUCCIONES S.A.S.
Dependencia: 771 	Domicilio: CALVENTO ESTE 217 SAN JUAN (5400)
Fecha Presentación: 11/03/2026 20:04:00 	Período Fiscal: 202500
Visualizar formulario de declaración jurada
Datos Descriptivos de la Declaración Jurada
PAGINA 2
Firma
Mes de Cierre 	Período 	C.U.I.T.
10 	2025 	30-71630464-3
0 Original 1-9 Rect. 	Cod. Activ. 	Nro. Verificador
IMPUESTO A LAS
GANANCIAS 	Carácter
0-ORIGINAL 	No Disponible 	403148
Ejercicio Fiscal 	0-REGULAR
F. 713 	Apellido y Nombre o Razón Social: ECHEGARAY CONSTRUCCIONES S.A.S.
Declaración Jurada 	Cantidad proyectos promovidos: 0 C.U.I.T./C.U.I.L. contador: 20-
37924019-5 	Entidad Exenta:0-NO
Versión 	Establecimiento
2500 	0
R1 - Quebrantos trasladables
a Quebrantos trasladables por venta de acciones (F.A.) 	0,00 e Quebrantos trasladables por venta de acciones (F.E.) 	0,00
b Quebrantos trasladables por instrumentos financieros derivados (F.A.) 	0,00 f Quebrantos trasladables resto (F.E.) 	0,00
c Quebrantos trasladables resto (F.A.) 	0,00 g Quebrantos trasladables Juegos de Azar (F.E.) 	0,00
d Quebrantos trasladables Juegos de Azar (F.A.) 	0,00
R2 - Det. Resultado
F. Argentina 	F. Extranjera 	F. Argentina 	F. Extranjera
a Result. del Ejercicio (contable) 	15.908.844,45 	0,00 g Quebrantos computables 	0,00 	0,00
b Ajustes 	13.331.802,45 	0,00 h Régimen de Promoción 	0,00
c Donaciones 	0,00 	i Resultado Neto 	29.240.646,90 	0,00
d Resultado impositivo 	29.240.646,90 	0,00 j Resultado atrib. a los socios 	0,00 	0,00
e Queb. por Vta. de Acc. (Ejerc.) 	0,00 	0,00 k Quebrantos de Fuente Argentina 	0,00
f Queb. por Contr. Deriv. (Ejerc.) 	0,00 	l Resultado Neto Final 	29.240.646,90 	0,00
R3 - Det. Resultado (Juegos de Azar)
F. Argentina 	F. Extranjera 	F. Argentina 	F. Extranjera
a Result. del Ejercicio (contable) 	0,00 	0,00 c Quebrantos computables 	0,00 	0,00
b Ajustes 	0,00 	0,00 d Resultado impositivo 	0,00 	0,00
R4 - Determinación del Impuesto
a Alícuota % 	25,00 e Alícuota para Juegos de Azar 	41,500
b Imp.Determinado (Excepto Juegos de Azar) 	7.310.161,73 f Impuesto determinado para Juegos de Azar 	0,00
c Total Imp.Liberado (F.A y F.E.) 	0,00 g Total Impuesto Determinado 	7.310.161,73
d Total Imp.no Liberado (F.A y F.E.) 	0,00
R5 - Determinacion del Saldo del Impuesto
A Favor Contrib. A Favor AFIP 	A Favor Contrib. A Favor AFIP
a Imp. determinado F. Extranjera 	0,00 r Anticipos Cancelados Credeb 	862.379,56
b Imp. Análogos Pagados en el Ext. 	0,00 	s Sdo.x Ant.cancelados Credeb 	0,00
c Subtotal Fuente Extranjera 	0,00 t Saldo a Cancelar 	6.447.782,17
d Imp. determinado F. Argentina 	7.310.161,73 u Cómputo Credeb para cancelación DJ 	6.447.782,16
e Pago a cuenta realizado en el exterior Art. 11.3.b)
Acuerdo con Uruguay 	0,00 	v Saldo a Ingresar 	0,01
f Saldo a Favor per. ant. en Bonos 	0,00 	w Ant.canc.c/Cómp.de Bonos y Cr.Fisc. 	0,00
g Anticipos canc. mediante F.515 	0,00 	x Cómputo de Bonos y Créditos Fiscales para
cancelación de DDJJ 	0,00
h Total Bonos F.515 	0,00 	y Sdo.a Fav.Contrib.x Ant.canc.c/Bonos o Cert.Fisc. 	0,00
i Saldo a favor del resp. en Bonos 	0,00 	z Retenciones y/o Percepciones 	5.726.886,85
j Saldo a Favor per. ant. en Bonos CF Dto 135/06 	0,00 	aa Total antic.ingresados en efectivo o mediante débitos
bancarios -excepto F. 515 y bonos CF Dto. 135/06- 	0,00
k Anticipos canc. mediante BCF DTO. 135/06 	0,00 	ab Percepciones aduaneras RG 3577 	0,00
l Total Bonos CF Dto. 135/06 	0,00 	ac Pago a cuenta "Régimen excepcional de ingreso -
Art. 4 RG 3818" 	0,00
m Saldo a favor del resp. Por anticipos en bonos CF
Dto. 135/06 	0,00 	ad Total Anticipos RG 4278 	0,00
n Subtotal Fuente Argentina 	7.310.161,73 ae Total Anticipos RG 4498 Â– Art.3° Inc. a) 	0,00
ñ Diferimiento F.518 	0,00 	af Total Pago a Cuenta RG 5248 Ingresos
Extraordinarios 	0,00
o Subtotal General 	7.310.161,73 ag Saldo a Favor Periodo Anterior 	0,00
p Pagos a Cuenta que no generan saldo a favor 	0,00 	ae Saldo a favor por fusión o absorción 	0,00
q Saldo previo al Cómputo Credeb 	7.310.161,73 af Saldo a favor 	5.726.886,84 	0,00

-- 2 of 92 --

R6 - Forma de ingreso
a Saldo a ingresar 	0,01 c Suma in. en forma no bancaria 	0,00
b Imp. Ing. En DDJJ orig. O ult. 	0,00 d Total a pagar 	0,00
VersiÃ³n 2026.08

-- 3 of 92 --`

test('F.713 2025: los importes del formulario, por rótulo', () => {
  const d = parsearDDJJGanancias(F713_2025)
  assert.equal(d.periodo, '2025-10', 'el ejercicio cierra en octubre: el período es el mes de cierre, no diciembre')
  assert.equal(d.fecha_presentacion, '11/03/2026')
  assert.equal(d.transaccion, '4233520187')
  assert.equal(d.determinado, 7310161.73)
  assert.equal(d.anticipos_credeb, 862379.56)
  assert.equal(d.computo_credeb, 6447782.16)
  assert.equal(d.retenciones, 5726886.85)
  assert.equal(d.total_a_pagar, 0)
  assert.equal(d.saldo_a_favor, 5726886.84)
})

test('un PDF que no es F.713, o sin determinado, no devuelve una DDJJ a medias', () => {
  assert.equal(parsearDDJJGanancias('Declaración Jurada IVA F.2051'), null)
  assert.equal(parsearDDJJGanancias(F713_2025.replace(/g Total Impuesto Determinado[^\n]*/, '')), null)
})

test('la obligación: presentada, nada a pagar, el saldo a favor impreso y concepto anual (no entra al hero mensual)', () => {
  const [o] = obligacionesGananciasDDJJ([{ ...parsearDDJJGanancias(F713_2025), fuente: 'ddjj ganancias 2025.pdf' }])
  assert.equal(o.impuesto, 'ganancias')
  assert.equal(o.concepto, 'ddjj anual')
  assert.equal(o.estado, 'presentado')
  assert.equal(o.a_pagar, 0)
  assert.equal(o.saldo_a_favor, 5726886.84)
  assert.equal(o.creditos, 13037048.57)
  assert.equal(o.presentada_el, '2026-03-11')
  assert.equal(o.vencimiento, null)
})
