# Leasing de un utilitario 0km — la ficha que faltaba

**Fecha de la lectura: 13/08/2026.** Todo lo que sigue es la foto de ese día, con URL y fecha en cada
dato. Nada está cotizado ni confirmado por un oficial de cuentas.

Origen del pedido, textual del dueño el 07/08:

> *"el valor de los utilitarios q no tienen precio es aprox final de 25000 dolares **que pueden ser con
> leasing**"*

El leasing no se evaluó y se descartó: **no se miró**. Esto lo corrige. Toda la lógica vive en
`orquestador/lib/linea-leasing.mjs` con 47 tests.

---

## 1. LA RESPUESTA CORTA

**El leasing para utilitarios no publica tasa. No tiene tarifario: tiene campañas con fecha de
vencimiento.** Se barrieron Santander, BNA, Macro, Galicia, BBVA, Comafi, Provincia Leasing, Banco San
Juan, Supervielle, Toyota CFA, Volkswagen FS, Mercedes-Benz CF, Renault e Inverlease. **Ninguno publica
TNA ni CFT de leasing.** Todos cotizan contra calificación crediticia.

**Excepto una, y está abierta ocho días.**

| | |
|---|---|
| **BICE — Leasing Expo Transporte 2026** | **TNA fija DESDE 19,45%** |
| Vigencia | **11 al 21 de agosto de 2026** — publicada el 10/08 |
| Plazo | hasta 3 años (36 meses) |
| Financiable | **100% del monto total** |
| Anticipo | **$0** |
| Garantía | **ninguna adicional — el bien es la garantía** |
| Bienes | camiones, semirremolques, **utilitarios**, buses, minibuses y **pickups**, grúas, autoelevadores |
| Aprobación | **15 días** |
| Cupo | $20.000M · tope $6.500M por cliente |

Fuente: [BICE, 10/08/2026](https://www.bice.com.ar/bice-lanza-una-linea-de-leasing-por-20000-millones-para-impulsar-la-competitividad-del-transporte-de-carga-y-la-logistica/)
· [producto permanente](https://www.bice.com.ar/leasing-productivo-bienes-nuevos/)

---

## 2. EL RANKING — tasa real por Fisher, `(1+nominal)/(1+inflación)−1`

Inflación de descuento: **29,83% anual** (derivada del IPC publicado, `inflacionDeTrabajo()`).

| Fuente | Tasa real | Condiciones |
|---|---|---|
| **FONDEFIN** | **−10,49%** | 48m + 6 gracia · **prenda 200%** · **sólo cabina simple** · ~120 días |
| **→ Leasing BICE (campaña)** | **−6,59%** | **36m · sin prenda · sin anticipo · 100% · 15 días · vence 21/08** |
| Santander UVA | 0,00% | 24m · anticipo 33,7% |
| BNA utilitarios | sin publicar | 60m · 100% financiado · prendario |
| **Leasing de mercado (Ford/Comafi)** | **+11,17%** | CFT 44,33% · **vigencia vencida el 30/06/2026** |
| Prendario mercado | +27,16% | 48m |

**El leasing entra segundo.** No gana por precio: gana por lo que no pide.

### El detalle de la cuenta

TNA 19,45% → TEA 21,28% (capitalización mensual, supuesto) → Fisher contra 29,83% = **−6,59%**.

**La resta ingenua daría −8,55%.** Son casi dos puntos de exageración sobre una tasa que ya es
negativa. Por eso Fisher, no resta.

### La comparación honesta contra FONDEFIN

El ranking vigente carga a FONDEFIN un IVA sobre intereses del 10,5% y al leasing no. **Ese IVA
también es recuperable**, así que la comparación estaba sesgada a favor del leasing. Medidos con el
mismo criterio (ambos sin IVA):

| | Tasa real homogénea |
|---|---|
| FONDEFIN | **−11,75%** |
| Leasing BICE | −6,59% |

**FONDEFIN sigue ganando por 5,2 puntos.** Verificado antes de recomendar nada.

---

## 3. LA CUENTA EN PESOS DE HOY

36 cánones, sistema francés, 100% financiado, sin anticipo. **Sin valor residual — no está publicado.**

| | DFSK C31 cabina simple | Utilitario USD 25.000 |
|---|---|---|
| Precio contado | $29.400.000 | $37.875.000 *(TC oficial $1.515)* |
| **Canon mensual** | **$1.084.388** | **$1.396.979** |
| Total nominal (36 cuotas) | $39.037.959 | $50.291.248 |
| **Total en pesos de hoy** | **$26.774.155** | **$34.492.215** |
| **vs. pagar al contado** | **−$2.625.845** | **−$3.382.785** |

**En pesos de hoy el leasing sale MENOS que pagar al contado.** Eso es lo que significa una tasa real
negativa: la inflación paga parte de la cuota.

Los cánones llevan IVA además (ver §5), que es crédito fiscal recuperable, no costo.

⚠️ **Los tres totales son PISO.** Falta el CFT, faltan gastos, sellado y seguro, y falta el valor
residual de la opción de compra.

---

## 4. EN QUÉ SE DIFERENCIA DE UN PRÉSTAMO

### 4.1 GARANTÍA — la ventaja decisiva para este caso

**FONDEFIN exige prenda en 1er grado por el 200% del financiamiento.** Por dos unidades pide
**$120.000.000** de cobertura. Las unidades aportan **$58.800.000**. **Faltan $61.200.000** que hoy no
existen y habría que cubrir con otros rodados, hipoteca o aval de SGR.

**Eso —no la tasa— es lo que traba el plan.**

El leasing lo borra por construcción, no por generosidad: **el bien nunca sale del patrimonio del
dador**, así que no hay nada que prendar. BICE, textual:

> *"no requiere de garantías adicionales (ya que el bien adquirido actúa como tal)"*
> *"La garantía es el propio bien"*

#### ⚠️ EL ASTERISCO QUE EL FOLLETO NO DICE: LA FIANZA DE SOCIOS

**Dos fuentes oficiales se contradicen y no se resuelve leyendo:**

| Fuente | Qué dice |
|---|---|
| BICE (bice.com.ar) | no requiere garantías adicionales |
| **Estado (argentina.gob.ar / FONDAGRO)** | **las garantías incluyen fianza de socios o accionistas en personas jurídicas** |

No hay prenda sobre el bien. **Puede haber garantía personal de los socios.** Es la diferencia entre
arriesgar la unidad y arriesgar el patrimonio de los dueños. **Se pregunta por escrito antes de
firmar.** Si aparece el aval personal, el leasing pierde buena parte de lo que lo hacía superior.

### 4.2 FISCAL — verificado contra la norma, con lo que quedó sin verificar declarado

Verificado el 13/08/2026 contra el
[texto actualizado del Decreto Reglamentario 1038/2000](https://www.argentina.gob.ar/normativa/nacional/decreto-1038-2000-64908/actualizacion):

| Tema | Norma | Qué dice | Consecuencia |
|---|---|---|---|
| **Deducción del canon** | Dto. 1038/2000 **art. 6** | el tomador *"computará como deducción el importe de los cánones imputables a cada ejercicio fiscal"* | **el canon ENTERO (capital + interés) es gasto deducible**, contra una compra financiada donde sólo se deducen amortización e intereses |
| **Plazo mínimo** | **art. 2** (mod. Dto. 152/2022) | el contrato debe durar al menos el **50% de la vida útil**; automotores: 5 años | **piso de 30 meses**. Los 36 de BICE cumplen; **un contrato a 24 meses NO** y perdería el encuadre |
| **La trampa del residual barato** | **art. 7** | si la opción de compra es **inferior al costo computable**, *"la operación se tratará como una venta financiada"* | **una opción simbólica convierte el leasing en compra financiada y borra la deducción del canon entero** |
| **IVA del canon** | **art. 9** | los cánones son locación de cosa mueble (art. 3 inc. e pto. 7 Ley IVA); hecho imponible *"al devengarse el pago o en el de su percepción, el que fuera anterior"* | **el IVA se factura mes a mes**, no todo al inicio |
| **IVA de la opción** | **art. 9** | el ejercicio de la opción es venta de cosa mueble (art. 2 inc. a) | segunda operación gravada sobre el residual |

#### ⚠️ EL RIESGO FISCAL QUE PUEDE BORRAR TODA LA VENTAJA: el tope de automóviles

El **art. 88 inc. l) de la Ley de Ganancias** niega la deducción de alquileres *"incluidos los
derivados de contratos de leasing"* de **automóviles** en lo que exceda a un automóvil de **$20.000
netos de IVA**. Es un tope nominal de 1998 que **nunca se actualizó**: sobre un bien de $29.400.000
deja deducible **menos del 0,1% del canon**. El mismo corte se replica en el crédito fiscal de IVA
(art. 12 inc. a).

**La salida es por definición, no por interpretación.** "Automóvil" es, según la **Ley de Tránsito
24.449 art. 5**, el automotor *"para el transporte de personas de hasta ocho plazas"*. **Una pick-up de
carga cabina simple o un furgón no transportan personas: quedan fuera del tope.**

**PERO el segundo rodado del pedido no tiene modelo ni carrocería definidos.** Si terminara siendo una
doble cabina de cinco plazas, la discusión se abre. **Quien clasifica el vehículo a efectos fiscales es
el estudio contable, no el OS.**

Fuente: [econlink — gastos del automotor en Ganancias e IVA](https://www.econlink.com.ar/gastos-automotor-impuesto-ganancias-iva)

### 4.3 CONTABLE / PATRIMONIAL

Mientras no se ejerce la opción de compra **el bien no es de la empresa**: no entra al activo, no se
amortiza, y el compromiso no figura como deuda financiera del mismo modo que un prendario.

- **A favor:** libera capacidad de endeudamiento declarado frente a otros bancos — relevante ahora, con
  el descubierto del Santander como único colchón.
- **En contra:** la empresa **no capitaliza el bien**, y si el contrato se corta antes no queda nada.

**Cómo impacta exactamente en el balance y en la calificación crediticia lo define el criterio contable
aplicado. Lo firma el estudio, no el OS.**

### 4.4 AL FINAL DEL CONTRATO — el valor residual

**No existe dato sectorial publicado de valor residual en Argentina.** Lo que hay son evidencias de
oferentes concretos, y todas apuntan bajo:

| Quién | Opción de compra publicada |
|---|---|
| **Ford Go / Comafi** | **UN (1) canon mensual** → ≈4,2% a 36m, ≈3,6% a 48m |
| **BBVA** | *"cercana al 5% o 30%"* — el único rango publicado por un banco |
| **BICE** | *"un valor determinado"*, ejercible transcurrido el 75% del plazo — **sin porcentaje** |

**Inferencia (confianza media-alta):** la práctica argentina es canon que amortiza casi todo el bien +
opción simbólica de ~1 canon. **El residual NO es una palanca para bajar la cuota** como en el renting.
El 93% del mercado es leasing *financiero*: el bien se compra al final, no se devuelve.

**Y eso no es una ganga: es el riesgo del art. 7.** Con un residual de un solo canon, la operación
puede quedar por debajo del costo computable y tratarse como venta financiada — perdiendo la deducción
del canon entero. **Preguntar al estudio contable ANTES de firmar.**

*Se descartó la cifra de "el residual supera el 40%" que aparece alto en buscadores: es de una nota de
La Nación de 2009.*

---

## 5. EL IVA — donde el folleto dice al revés

**Verificado:** el canon está gravado y el hecho imponible se perfecciona **mes a mes** (art. 9 Dto.
1038/2000). Ésa es la diferencia real contra la compra, donde el IVA se paga entero al inicio.

**NO verificado contra la norma: la alícuota.** Los dos candidatos:

| Alícuota | Quién lo sostiene |
|---|---|
| **21%** *(el más probable)* | [iProfesional](https://www.iprofesional.com/finanzas/102304-conozca-las-diez-claves-sobre-el-leasing-y-cuales-son-las-ventajas-impositivas-que-ofrece): *"la alícuota será del 21% aunque el bien de capital, de adquirirse al inicio y no vía leasing, tributaría el 10,5%"* · [AutoCorp](https://autocorp.com.ar/blog/gestion-de-flotas/iva-en-camionetas-y-utilitarios-que-deben-saber-las-empresas/) |
| 10,5% | Dictamen DAT 100/02 trata *"leasing, bienes de capital, alícuota reducida"* — **no se leyó el texto del dictamen** |

**Si el 21% es correcto, el leasing DUPLICA la alícuota sobre el mismo fierro:** una pick-up comprada
directo tributaría 10,5% como bien de capital; por leasing el canon va al 21%. **Es lo contrario del
"beneficio impositivo" que publicita el folleto.**

No es un costo — es crédito fiscal recuperable para un responsable inscripto — pero es **más IVA y más
tarde**. La alícuota la confirma el estudio contable.

### El "diferimiento del IVA" puede ser una desventaja para esta empresa

BICE publicita *"diferir el IVA durante todo el período"*. **Diferir un CRÉDITO fiscal beneficia a quien
está en posición de saldo a favor permanente.** Echegaray está en posición de **DÉBITO** (Cuadro 4 del
Flujo: IVA a pagar), así que el crédito que hoy le bajaría el IVA del mes llega repartido en 36 cuotas.

**Es una INFERENCIA sobre la posición fiscal, no un hecho verificado. La resuelve el estudio contable.**

---

## 6. LO QUE PUEDE MATAR LA OPERACIÓN ANTES QUE LA TASA

### El monto mínimo

**La campaña de agosto NO publica mínimo.** Las dos campañas anteriores de la misma línea sí:

| Campaña | Mínimo publicado |
|---|---|
| Agroactiva, 03/06/2026 | **$80.000.000** por solicitante |
| Flota y logística, 16/03/2026 | **$80.000.000** neto de IVA |

| Operación | Monto | ¿Llega a $80M? |
|---|---|---|
| Dos DFSK | $58.800.000 | **No — faltan $21.200.000** |
| Dos utilitarios USD 25k | $75.750.000 | **No — faltan $4.250.000** |

**Las dos referencias quedan por debajo.** No se afirma que el mínimo siga vigente —sería mezclar
ventanas de tiempo— pero **es la primera pregunta al banco, antes que la tasa**.

### El "desde"

El banco escribe **"tasa fija desde 19,45%"** e *"incluye bonificación de los proveedores adheridos al
convenio"*. **Si el proveedor del rodado elegido no está adherido, esa tasa no existe.** La nota habla
de "más de 100 empresas proveedoras" sin publicar el listado.

### Cuánto puede faltar por no tener el CFT

En el único leasing con CFT publicado del barrido (Ford/Comafi, junio 2026): **TNA 29,00% → CFT
44,33%**. Quince puntos. Más un fee de otorgamiento del 1,8% de la suma de cánones. **Ése es el orden
de magnitud de lo que BICE no publica.**

---

## 7. LO QUE ADEMÁS LEVANTA EL LEASING

| Restricción de FONDEFIN | Qué hace el leasing |
|---|---|
| **Sólo cabina simple 0km** | BICE enumera *"utilitarios, buses, minibuses y pickups"* **sin distinguir carrocería** — doble cabina y furgón entran por el texto. *Que no lo prohíba no es que lo autorice: confirmar.* |
| **~120 días de trámite** | **15 días de aprobación** publicados. Para la unidad de septiembre, es la diferencia entre llegar y no llegar. |
| **Prenda al 200%** | ninguna garantía adicional *(con el asterisco de §4.1)* |
| *(el UVA exige 33,7% de anticipo)* | **$0 de anticipo, 100% financiado** |

---

## 8. EL PLAZO, MEDIDO SOBRE EL MERCADO REAL

Informe trimestral de **Leasing Argentina** (la asociación del sector), Q2 2026, **publicado el
12/08/2026 — un día antes de esta lectura**:

| Métrica | Valor |
|---|---|
| **Plazo promedio de contrato** | **31 meses** *(era 39 en dic-2025)* |
| Cartera total | USD 802M |
| Transporte y logística | 65,5% de la cartera |
| Participación PyME | 50,3% *(era 42,3% un año antes)* |
| Financiero vs. operativo | 93% / 7% |
| Mora leasing vs. prendaria | 3,5% vs. 5,1% |

Fuentes: [InfoBAE Bancos, 12/08/2026](https://www.infoban.com.ar/12/08/2026/el-leasing-marco-nuevo-record-tras-10-trimestres-consecutivos-de-crecimiento/)
· [Ámbito, 13/08/2026](https://www.ambito.com/economia/el-leasing-acelera-y-alcanza-su-mejor-nivel-casi-ocho-anos-n6310382)

**Los 36 meses de la campaña están en el borde alto de la práctica, no son un plazo corto.** Y el piso
fiscal son 30 meses: la ventana entre lo que el mercado hace y lo que la ley exige es de seis meses.

---

## 9. EL BARRIDO COMPLETO — quién ofrece y qué publica

| Oferente | Leasing utilitarios | TNA | Plazo | Anticipo | Opción compra | % financ. | Prenda |
|---|---|---|---|---|---|---|---|
| **BICE (campaña)** | Sí | **desde 19,45%** | 36m | **$0** | n/p | 100% + IVA | **No** |
| BICE (permanente) | Sí | **no publica** | 60m | n/p | ≥75% del plazo | 100% | No |
| Ford/Comafi *(vencida 30/06)* | Sí | **29,00% · CFT 44,33%** | 36/48m | **$0** | **1 canon (~4%)** | 100% | No |
| Macro | Sí ("rodados") | no publica | **61m** | n/p | n/p | 100% + 100% IVA | n/p |
| Galicia | Sí | no publica | 36m | 0% | pactado, % n/p | 100% | n/p |
| BBVA | Sí | no publica | 36m vehículos | n/p | **"5% o 30%"** | n/p | n/p |
| Comafi | Sí | no publica | n/p | n/p | sí, % n/p | 100% | n/p |
| **Banco San Juan** | Sí (bs. de capital) | no publica | **48m** | n/p | n/p | 100% | n/p |
| Provincia Leasing | Sí | no publica | 36/48/61m | n/p | pactado | 100% | No |
| Toyota CFA | Sí (≤1.500 kg) | no publica | 16–36m | 0% para PJ | n/p | **100% PJ** | No |
| Volkswagen FS | Sí | no publica | n/p | n/p | compra o **devolución** | 100% | n/p |
| Santander | Sí | **no publica** | n/p | n/p | n/p | n/p | n/p |
| Supervielle | Sí | **nada publicado** | — | — | — | — | — |
| BNA | **no publicado** | — | *(prendario 60m)* | — | — | 100% | **Sí** |
| Renault | **no ofrece leasing** | *(prendario 0%/9,9%)* | 12–24m | — | — | topes bajos | Sí |
| Mercedes-Benz CF | indicio | no accesible | — | — | — | — | — |

**Notas:** Santander, Toyota CFA, Ford, BBVA, Mercedes-Benz y sisanjuan.gob.ar no fueron accesibles
desde el entorno (timeout / 403 / conexión rechazada). **Eso no es "no publicado": es "no legible por
esta vía"**, y está distinguido caso por caso. Comafi es el dador real detrás del leasing de Ford.

### Comafi publica el único dato de velocidad del barrido

*"Respuesta crediticia en 48 hs."* Si la urgencia manda sobre el precio, ahí hay que mirar.

---

## 10. DOS PUERTAS QUE NO SON LEASING Y PUEDEN GANARLE A TODO

### Programa provincial San Juan — línea bienes de capital en general

Anuncio del Gobernador Orrego, **27/05/2026**: hasta **$150.000.000**, **48 meses**, **6 meses de
gracia de capital**, tasa **60% de la Badlar ≈ 13,2% TNA** — *la misma fórmula de tasa que FONDEFIN*.

**A esa tasa aplasta a cualquier leasing bancario del país, incluida esta campaña.**

**Lo que falta saber, y es exactamente lo que decide:** no está publicado si *"bienes de capital en
general"* incluye rodados o utilitarios. Es un crédito, no un leasing: probablemente vuelva la prenda.

Fuentes: sisanjuan.gob.ar (403) · [Diario La Provincia SJ](https://diariolaprovinciasj.com/politica/orrego-anuncio-15-000-millones-en-creditos-para-pymes-y-emprendedores-342958/)

### Stellantis + BBVA — leasing en dólares al 10,75% TNA

**No califica.** Exige cumplir la **Comunicación A 4015 del BCRA**: financiación en dólares reservada a
quien genera ingresos en dólares. **Una constructora que factura 100% en pesos casi con seguridad queda
afuera** — y tomar deuda en dólares sin ingresos en dólares sería asumir riesgo de tipo de cambio sobre
el resultado de la obra. Se documenta para que nadie la traiga como opción sin el asterisco.

---

## 11. LO QUE NO SE SABE

**Del banco:**
- **CFT** — no publicado. Sin CFT no hay costo total afirmable.
- **Monto mínimo de la campaña de agosto** — no publicado, y las dos referencias quedan por debajo del histórico.
- **Valor residual / precio de la opción de compra** — sin porcentaje.
- **Si exige fianza de socios** — dos fuentes oficiales contradictorias, sin resolver.
- **Sistema de amortización del canon** — el cuadro del OS usa francés como convención declarada.
- **Gastos de otorgamiento, sellos de San Juan, seguros** — no publicados.
- **Si una constructora califica** en una línea presentada para transporte y logística.
- **Qué proveedores están adheridos** — de eso depende que exista la bonificación que hace al 19,45%.
- **Si admite un rodado de origen chino** ya nacionalizado.
- **Período de capitalización de la TNA** — la TEA del OS supone mensual.

**Del estudio contable:**
- Alícuota de IVA del canon (21% vs 10,5%).
- Clasificación fiscal del utilitario de USD 25.000 — decide si el tope del art. 88 inc. l) muerde.
- Si el residual proyectado dispara el art. 7 (venta financiada).
- Impacto real en balance y calificación crediticia.
- Si el diferimiento del IVA perjudica dada la posición de débito.

**Del dueño:**
- ¿De dónde salió la idea del leasing? ¿Hay una cotización que el OS no tenga?
- ¿Qué es exactamente el utilitario de USD 25.000? Marca, modelo, carrocería.
- ¿Las dos unidades van por la misma vía o se pueden separar?
- ¿Certificado MiPyME vigente y dos años de actividad acreditables?

---

## 12. SIGUIENTE PASO

**Hoy es 13/08. La campaña vence el 21/08. Quedan ocho días.**

Tres llamados, en este orden, con el mismo pedido por escrito (marca, modelo, versión, precio de lista
con IVA, plazo 36 meses, canon mensual, opción de compra en $ y en %, TNA, CFT, gastos de otorgamiento,
seguro incluido o no, y **garantías exigidas además del bien**):

1. **BICE — hoy.** ¿Hay mínimo? ¿Califica una constructora? ¿Está adherido el proveedor? ¿Exigen fianza
   de socios? Es lo único con fecha de vencimiento.
2. **Banco San Juan.** ¿El leasing admite rodados? ¿Y la línea provincial al 60% de Badlar (~13,2%)
   financia utilitarios? Es la tasa más baja identificada en todo el barrido, en pesos, sin exposición
   al dólar.
3. **Santander.** Es donde ya existe la calificación crediticia. Pedir leasing y prendario en paralelo
   para tener el spread real.

**Y en paralelo, al estudio contable:** clasificación fiscal del utilitario, alícuota del canon, y si
el residual proyectado dispara el art. 7.

---

## LO QUE ESTE INFORME NO HACE

**No recomienda tomar el leasing.** Con criterio homogéneo FONDEFIN sigue siendo 5,2 puntos más barato.
Lo que el leasing resuelve es **la restricción que hoy traba el plan** —los $61.200.000 de prenda que
faltan— y **la restricción de carrocería**, y lo hace en 15 días en vez de 120.

**Esa es la decisión: no es tasa contra tasa, es tasa contra factibilidad.**

Y no se decide sin las tres respuestas del §12 — empezando por el monto mínimo, que puede dejar la
operación afuera antes de que la tasa importe.
