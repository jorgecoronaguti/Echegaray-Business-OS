# OBRAS ADICIONALES — inventario con evidencia (11/09/2026)

Pedido del dueño: *«Hay obras cuyo nombre indica que es "adicional" y quiero que estén a un subnivel
que se vea debajo de la obra mayor, por más que tengan OC distinta en individual. Identificalas en
base a lectura completa de cada obra según las cotizaciones en Drive y lo que se entiende por todo lo
que se ve en el Sheet Flujo de Fondos.»*

Este documento es la **evidencia** de cada relación padre→hijo que la migración
`20260911T2000_obra_adicional_cuelga_de_su_obra_mayor.sql` escribe. Ninguna relación se inventa: cada
una cita un archivo de Drive, una celda del Sheet o una decisión textual del dueño.

## Qué se consultó (todo SÓLO LECTURA)

| Fuente | Cómo se leyó |
|---|---|
| `public.obra_canonica` + `obra_alias` | fuente única de obras (26 filas, 41 alias) |
| `public.obra_economia_sheet` → `obra_economia_cartera` | lo que la pestaña OBRAS publica por obra |
| `public.cobranzas` (espejo de la pestaña **Cobranzas** del «Flujo de Caja - Cash Flow») | 98 filas, columnas `obra_cliente`, `orden_compra`, `concepto` |
| `public.cliente_orden` | las OC que mandó el cliente (56 OC cargadas) |
| `public.obra_contrato` | el papel que fija el precio, con su cita textual (8 obras) |
| `public.drive_index` | 40 archivos cuyo nombre dice adicional/ampliación/etapa |
| `readPdfText` sobre Drive | texto de 6 cotizaciones (extracción local, 0 API de modelo) |

## 1 · Inventario completo de obras por cliente

`fus.` = `fusionada_en` (la obra quedó como alias histórico y no se muestra).
`contratado` sale de `obra_economia_sheet`; vacío = la obra no tiene precio publicado en OBRAS.

| Cliente | id | Obra | Estado | fus. | OC | Contratado | Origen | Papel del precio | ¿Adicional? · evidencia |
|---|---|---|---|---|---|---|---|---|---|
| — | `prueba-e2e` | [PRUEBA E2E] Obra de pruebas | cerrada | | | | | | no (obra de prueba) |
| — | `galpones` | Galpones | cerrada | | | | | | no · sin cliente, sin papeles |
| — | `zz-e2e-celda…` | ZZ-E2E obra de la celda | cerrada | | | | | | no (obra de prueba) |
| ARCOR | `arcor` | ARCOR | cerrada | | | | | | no · es la obra bolsa de mantenimiento (alias `arcor`, clasificación `mantenimiento`) |
| Franco Quattropani | `quattropani` | Quattropani - SALÓN COMERCIAL | activa | | | 95.020.574,67 | oc-usd-x-tc | CONTRATO DE OBRA Y MEMORIA DESCRIPTIVA.docx | no · el contrato **excluye** entrepiso y escalera (`obra_contrato.nota`); lo excluido no se cotizó todavía |
| Javier Sánchez · San Francisco | `san-francisco` | Galpones, Mampostería, Cancha de Padel | cerrada | | | | | | no · es la obra madre original (`PRESUPUESTO - JS.pdf`) |
| Javier Sánchez · San Francisco | `sf-mamposteria` | MAMPOSTERÍA | cerrada | | | 14.273.576,40 | oc-pesos | | **DESCONOCIDO** · mismo alcance que `san-francisco` («Mampostería y cancha de padel», Cobranzas 85). Duplicado candidato a FUSIÓN, no adicional |
| Javier Sánchez · San Francisco | `entrepiso-y-escalera` | SF - ENTREPISO Y ESCALERA | activa | | | 7.728.254,00 | oc-pesos | Presupuesto - Entrepiso y escalera.pdf | no · carpeta propia `JAVIER SANCHEZ/Entrepiso/`, fuera de `ADICIONALES/` |
| Javier Sánchez · San Francisco | `instalacion-electrica` | SF - INSTALACIÓN ELÉCTRICA | activa | | | 40.000.000,00 | oc-pesos | Presupuesto - Instalacion Electrica.pdf | no · carpeta propia `JAVIER SANCHEZ/Instalacion Electrica/` |
| Javier Sánchez · San Francisco | `pisos-industriales` | SF - PISOS INDUSTRIALES | activa | | | 47.590.272,00 | oc-pesos | PRESUPUESTO - PISOS TOTALES 9:6:26.pdf | no · carpeta propia `JAVIER SANCHEZ/Pisos Industriales/` |
| La Estrella | `le-galpon-9` | Galpón 9 | cerrada | | | | | | no · obra propia (Cobranzas 29/33/39/44 «Galpon 9») |
| La Estrella | `la-estrella` | La Estrella | cerrada | | | | | | no · obra bolsa del cliente |
| La Estrella | `le-comedor` | Oficina y Fábrica de Palitos | cerrada | | | | | | **madre** · su adicional se cobró DENTRO de ella (Cobranzas 32) y no tiene obra propia |
| Messina | `bsa-adicional` | **BSA - Adicional** | cerrada | | | | | | **SÍ → `messina-bsa`** (ver §2.1) |
| Messina | `bsa-planta` | BSA - Planta | cerrada | `messina-bsa` | | | | | no · fusionada el 10/09 por decisión del dueño |
| Messina | `limpieza-de-escombros` | Limpieza de Escombros | cerrada | | 2162 | | | | no · decisión del dueño 10/09: «las otras no» (no se fusiona, no cuelga) |
| Messina | `messina-adicional-tercer-muro` | **ME - ADICIONAL TERCER MURO** | activa | | 2256 | 10.000.000,00 | oc-cliente | OC_32_0000200002256.pdf | **SÍ → `messina-playon-azufre`** (ver §2.2) |
| Messina | `messina-bases-tanque-so2` | ME - BASES TANQUE SO2 | cerrada | | 1864 · **1923** | | | | **madre** · su adicional entró como 2ª OC de la MISMA obra (ver §3.1) |
| Messina | `messina-bsa` | ME - BSA | activa | | 0279 0495 0496 1984 1985 | 17.704.199,40 | suma-viva | | **madre de `bsa-adicional`**; además sus adicionales 2024 y 2026 entraron como OC propias (§3.2) |
| Messina | `messina-pisos-120-rampa` | ME - PISOS 120 M² Y RAMPA | activa | | 2097 · **2226** | 9.463.141,93 | oc-cliente | COTIZACION PISOS 120m2 - 11:6.pdf + Rampa 19:2.pdf | **madre** · la Rampa es un adicional YA FUSIONADO dentro del nombre de la obra (§3.3) |
| Messina | `messina-playon-azufre` | ME - PLAYÓN DE AZUFRE | activa | | 2173 | 102.500.000,00 | oc-pesos | PLATEA DE HORMIGON - AGOSTO 2026.pdf | **madre de `messina-adicional-tercer-muro`** |
| Messina | `messina-playon-dilucion-acido` | ME - PLAYÓN DILUCIÓN DE ÁCIDO | activa | | 2266 | 20.090.867,83 | oc-cliente | Cotizacion - Playon para dilución de ácido.pdf | **madre** · tiene un adicional COTIZADO el 11/09/2026 sin obra ni OC (§4.2) |
| Messina | `messina` | Messina | cerrada | | | | | | no · obra bolsa del cliente |
| Messina | `pilon` | Pilón | cerrada | | | | | | no · obra propia (Cobranzas 28/30) |
| Messina | `pisos-120m2` | Pisos 120m2 | cerrada | `messina-pisos-120-rampa` | | | | | no · fusionada el 10/09 |
| Messina | `relevamiento-topografico` | Relevamiento Topográfico | cerrada | | 2135 | | | | no · decisión del dueño 10/09: «las otras no» |

## 2 · Las dos relaciones padre→hijo que se escriben

### 2.1 · `bsa-adicional` → `messina-bsa`

| # | Evidencia | Dónde |
|---|---|---|
| 1 | El nombre lo dice: «BSA - Adicional» contra «ME - BSA» | `obra_canonica.nombre` |
| 2 | **Las dos obras apuntan a la MISMA carpeta de Drive**: `1Xj0FBTek5Zy5IlpbLupFqamTzh_zlUD1` = `administracion/PRESUPUESTOS - CLIENTES/MESSINA/BSA - DEMOLICION Y PILETA DE CONTENCION` | `obra_canonica.drive_carpeta_id` (las dos filas) + `drive_index.path` |
| 3 | Dentro de esa carpeta hay una subcarpeta `ADICIONAL/` con `ADICIONAL.pdf` (`1eGE-yf32BQOO5wdsNLOwPjzj47vdytai`) — «ADICIONAL - BASES DE HORMIGON», SUB TOTAL $1.287.841,48, 20/11/2024 — y al lado `ADICIONAL SUELO CEMENTO.pdf` (`1qpLvO6PibwEOfT7vh14xbwpAr3LlXgps`) — SUB TOTAL $4.148.750,00, TOTAL $5.019.987,50 | Drive, texto leído |
| 4 | El Sheet lo nombra como adicional DE la planta: Cobranzas fila **43** «PLANTA DE BSA - ADICIONAL», OC `00002-00001985`, $7.228.782 (Facturado) | `cobranzas` (espejo de la pestaña) |
| 5 | El TOTAL de `ADICIONAL SUELO CEMENTO.pdf` ($5.019.987,50) coincide con la **OC 00002-00000496** ($5.019.988,49, dif. $0,99 de redondeo), que está cargada contra `messina-bsa` | `cliente_orden` |

**Lo que esta obra NO tiene** (medido): 0 OC, 0 filas de `obra_contrato`, 0 `obra_egreso_proyectado`,
0 `registros_hh`, sin precio en OBRAS. Es una **fila cáscara**: la plata de los adicionales de BSA
entró por OC contra `messina-bsa`. Colgarla de su madre la hace visible sin moverle un peso a nadie.

### 2.2 · `messina-adicional-tercer-muro` → `messina-playon-azufre`

| # | Evidencia | Dónde |
|---|---|---|
| 1 | **El dueño lo dijo textual (10/09/2026)**: *«OC 2256: es adicional de azufre»* | decisión registrada, memoria `decisiones-1009-obras-cheques-compras` |
| 2 | El Sheet lo escribe completo: Cobranzas fila **94** «Adicional tercer muro (armado 20 m) **Playon de Azufre** — …», OC `00002-00002256 · cta. cte. 30 días`, $12.100.000 (Pendiente) | `cobranzas` |
| 3 | La cotización vive DENTRO de la carpeta de la madre: `ADICIONAL MURO.pdf` (`1muaFF3Po-POSiVmofxOqVNxGKvl6pLJ0`) en `MESSINA/PLATEA DE HORMIGON - Playon de azufre/Cotizaciones/`, junto a `PLATEA DE HORMIGON - AGOSTO 2026.pdf`, que es el papel del precio de la madre | `drive_index.path` |
| 4 | El **título** de esa cotización es el de la obra madre: «PLATEA DE HORMIGON CON MURO DE CONTENCION - ACOPIO DE AZUFRE», MURO DE CONTENCION en L · 20 ML · SUB TOTAL $10.940.587,00, 27/08/2026 | texto del PDF |
| 5 | `obra_contrato.cita` de la hija ya citaba la cotización de la madre: «OC 2256: Subtotal $10.000.000,00 … Cotización "ADICIONAL MURO.pdf"» | `obra_contrato` |

## 3 · Adicionales que NO son una obra aparte (no se toca nada)

Se listan porque entender «cómo se conforman las obras» incluye saber dónde está cada adicional que
ya está adentro de su madre. **Partirlos sería inventar obras que nadie abrió.**

- **3.1 · ME - BASES TANQUE SO2.** El adicional entró como **2ª OC de la misma obra**: OC 1864
  ($10.133.750) + OC **1923** ($6.981.554,80). El Sheet lo nombra en Cobranzas 38 «ADICIONAL - BASE
  DE TANQUE SO2». En Drive: `MESSINA/BASES DE TANQUE /PRESUPUESTO - OC/ADICIONAL - OC_32_0000200001923.pdf`
  y `ADICIONAL - TERRAPLEN Y PLATEA DE FUNDACION.pdf`. **Una OC distinta no abre una obra.**
- **3.2 · ME - BSA.** Además de `bsa-adicional`, tiene OC 0495/0496 (los adicionales de 2024) y
  OC 1984 («ACTUALIZACION DE PRECIOS OC 02-00000279», que **no** es un adicional: es reajuste) +
  OC 1985 (el adicional de 2026, Cobranzas 43).
- **3.3 · ME - PISOS 120 M² Y RAMPA.** La Rampa ES un adicional —carpeta
  `MESSINA/PISOS INDUSTRIALES 120m2/Adicional - Rampa/` con `Rampa 19:2.pdf` y `OC_32_0000200002226.pdf`,
  Cobranzas 92 «Rampa para Piso 120 m2»— pero el dueño lo fusionó en UNA obra el 10/09 y el nombre
  de la obra ya lo declara. `obra_contrato.fuente_nombre` cita las dos cotizaciones.
- **3.4 · Oficina y Fábrica de Palitos (La Estrella).** `Adicional - Oficinas y Fabrica de Palitos.pdf`
  ($17,4 M, cobrado en Cobranzas 32) se cobró dentro de la obra. No hay obra propia.

## 4 · Adicionales SIN obra madre identificada / sin obra propia — para el dueño

Ninguno de estos se escribe en la base: son cotizaciones de adicional que **no llegaron a ser obra**
y por lo tanto no hay fila que colgar. Se listan para que el dueño decida.

| Adicional (Drive) | Importe | Obra madre probable | Por qué no se escribe |
|---|---|---|---|
| **4.1** `JAVIER SANCHEZ/ADICIONALES/ADICIONALES.pdf` (`17B_sgjKit07…`) — MURO DE CONTENCION 30,46 m³ + CAJONES 160/200, 12/02/2026 | SUB TOTAL $18.145.458,30 | `san-francisco` (la carpeta raíz del cliente es la de esa obra) | no tiene obra propia ni OC ni fila en Cobranzas: **no se puede afirmar que se ejecutó** |
| **4.2** `MESSINA/Playon para Dilucion de Acido/Adicional - Excavaciones y ampliaciond de platea.pdf` (`1iFqSI9beFR…`), 11/09/2026. Encabezado textual: «Obra: Playon para dilución de ácido. Adicional: Excavación de terreno y ampliacion de platea de hormigon» | SUB TOTAL $5.025.105,97 | `messina-playon-dilucion-acido` (lo dice el papel) | cotizado HOY, sin OC ni fila en Cobranzas. Además la obra madre está marcada «recotizar» (decisión 10/09) |
| **4.3** `JAVIER SANCHEZ/ADICIONALES/COTIZACION REVOQUES.pdf` y `COTIZACION REVOQUES INTERNOS.pdf`, `POSIBLES ADICIONALES.xlsm` | sin leer | `san-francisco` | el nombre del archivo dice «POSIBLES»: es trabajo cotizado, no vendido |
| **4.4** `MESSINA/BSA…/ARCHIVOS VIEJOS/ADICIONAL SUELO CEMENTO.xlsm` | — | `messina-bsa` | es la hoja interna del PDF ya citado en §2.1 |

Las 40 coincidencias de Drive incluyen además adicionales de **clientes sin obra en el OS** (ARCOR
COCHERAS/CISTERNA/MACROPACK, FERRER HNOS, FIMA SA, GALPON ROSAS, GAMA SRL ETAPA 2, YPF - RUIZ HNOS).
No se tocan: esos clientes no tienen obra canónica a la que colgarlos.

## 5 · Límites conocidos de este inventario

1. **`obra_cuenta` / `obra_cobranza` / `cobranza_imputacion` devolvieron 0 filas** en esta lectura:
   son vistas con `ve_economia()` y la conexión del worktree no tiene perfil (`ve_economia() = false`).
   Lo cobrado POR OBRA no se pudo medir desde acá; el contratado sí (`obra_economia_sheet` no está
   recortada). Eso no afecta las relaciones padre→hijo, que no se deducen de plata.
2. **No se leyó el Sheet vivo**: se leyó su espejo en Postgres (`cobranzas`, `obra_economia_sheet`),
   como manda el MAPA. Si el espejo está atrasado, este inventario lo está.
3. **`sf-mamposteria` queda sin resolver** (§1): parece el mismo alcance que `san-francisco`, pero
   eso es una FUSIÓN —mueve plata— y la decide el dueño, no esta tarea.
4. Los `.xlsm` de cotización interna **no se leyeron**: los precios que mandan son los del PDF
   enviado al cliente, y abrir la hoja interna no agrega evidencia de la relación.
