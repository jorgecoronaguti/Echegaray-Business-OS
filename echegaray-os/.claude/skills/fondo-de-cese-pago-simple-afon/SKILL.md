---
name: fondo-de-cese-pago-simple-afon
description: "Procedimiento mensual para generar el archivo que el dueño sube a Online Banking Empresas de Santander para depositar el Fondo de Cese Laboral (FCL) de cada trabajador: el Excel «PAGO SIMPLE AFON - MMAAAA.xlsx». Activar cuando el estudio contable manda la planilla del FCL del mes (mail «BOLETAS UOCRA Y IERIC» con «FCL 2026.xlsx»), cuando el dueño pida «el archivo del FCL / del fondo de cese / AFON para el banco», o cuando el Cash Flow proyecte el pago del FCL del mes. Encapsula lo aprendido el 10/09/2026: el banco NO usa el formato FUR (txt) con Echegaray sino Pago Simple; el archivo se genera SOBRE el último lote que Santander acreditó, nunca de cero; las cuentas salen del lote acreditado, no de un padrón; «Orden de pago» lleva el período MAAAA; y quién cobra por transferencia o en efectivo lo dice la planilla del estudio. Usa orquestador/scripts/santander-fur-fcl.mjs (no reescribe el motor). Cruzar con derecho-laboral-construccion sólo si la duda es de régimen, no de formato."
allowed-tools: Read, Bash, Write
metadata:
  author: echegaray-os
  type: procedimiento-ejecutable
  area: "Administración y Finanzas · Personal"
  aprendizaje: "D — conocimiento interno validado con el extracto del banco; pasa a E cuando el dueño confirme el primer lote generado por el OS acreditado sin rechazos"
---

# Fondo de Cese Laboral — el archivo de Pago Simple AFON para Santander

## Qué es y por qué existe

Cada mes el estudio contable liquida el FCL (Ley 22.250, aporte mensual del empleador a la cuenta de
fondo de cese de cada obrero UOCRA) y Echegaray lo deposita por Santander. El banco abre una cuenta
AFON por trabajador; el depósito se hace subiendo un Excel de **Pago Simple** en Online Banking
Empresas. El OS genera ese Excel; el dueño lo revisa y lo sube (subirlo es Nivel E: mueve plata).

**Lo que costó aprender (10/09/2026):**

| Creencia inicial | Lo que probó el banco |
|---|---|
| Se usa el formato FUR (txt de 650 posiciones) de la guía de Santander | Echegaray nunca lo usó: no hay un .txt en toda la carpeta Fondo de Cese. El convenio cargado el 10/04/2026 (mail de Juan Bazán, Santander suc. 179) es de **Pago Simple**. El FUR exige un número de acuerdo que el banco no asignó. |
| El producto sería «Haberes» (011) | El extracto rotula los débitos como «Pagos personalizados acred cuenta – Acreditación fondo desempleo» → producto 012. Irrelevante para Pago Simple, pero define el FUR si algún día se contrata. |
| Alcanza con construir un Excel con las mismas columnas | El primer archivo generado «parecido» perdió 16 partes internas del libro (imágenes, comentarios, validaciones), inventó 9, reescribió los estilos y guardó el CBU con tipo de celda de fórmula. **Indistinguible o nada.** |
| La CBU se puede tomar del resumen de cuentas y validar por dígito verificador | El DV prueba forma, no existencia (RETA, 14/04/2026: «CUENTA NO EXISTE» por una CBU parecida). La única prueba de que una cuenta existe es que el banco **ya le acreditó** en un lote anterior. |
| «Orden de pago» es opcional | Es el **período MAAAA** (`82026` = agosto 2026). El lote de junio/julio la dejó vacía y sus 35 débitos salieron en el extracto como «fondo desempleo 000000», imposibles de imputar. |

## Fuentes, y qué manda cada una

1. **Planilla del estudio contable** (`FCL 2026 - detalle por trabajador (estudio contable, DD-MM-AAAA).xlsx`, una hoja por mes: ENE…DIC). Manda el **importe** por trabajador y la **forma de pago** (transferencia / efectivo). No se recalcula nada: el FCL lo liquida el estudio. Llega por mail («BOLETAS UOCRA Y IERIC», remitente Estudio Contable fr.ec.asesores@gmail.com) y se archiva en Drive `FONDO DE CESE / FORMULARIOS ENVIADOS AAAA`.
2. **El último lote que el banco acreditó** (`PAGO AFON MMMM.xlsx` o `PAGO SIMPLE AFON - MMAAAA.xlsx` en la misma carpeta; hoy `PAGO AFON 0607`, acreditado el 18/08/2026). Es la **plantilla** del archivo y la **fuente de las cuentas y los nombres** tal cual el banco los recibió. Se verifica que fue aceptado con `public.banco_movimientos` (débitos «fondo desempleo» de esa fecha), no con un mail: el banco no manda acuse.
3. **`RESUMEN DE CUENTAS BANCARIAS.xlsx`** (misma carpeta): puente nombre del estudio ↔ CUIL ↔ cuenta. Control cruzado; si difiere del lote acreditado, el trabajador no entra.
4. **Padrón del OS** (`public.personas` / `persona_legajo`): el CUIL con el que se paga es el que el OS registra. La clave de cruce es el **CUIL**, nunca el nombre: el banco escribe 3 tokens («PETINA RODRIGUEZ JAIRO E.») donde el estudio escribe 4.

## Cómo se hace (el comando)

```bash
# desde app/echegaray-os, con .env.local y ~/.config/echegaray-orq/worker.env cargados
node orquestador/scripts/santander-fur-fcl.mjs --periodo 2026-09 [--fecha-pago AAAAMMDD] [--salida /tmp/claude-1001/fcl] [--mandar]
```

- Sin `--fecha-pago` toma el próximo día hábil (sólo esquiva sábado y domingo: **no hay calendario de feriados**; un feriado rebota con R93). La fecha viaja adentro del archivo: si el dueño lo sube otro día, **se regenera**.
- `--mandar` publica el .xlsx y el resumen en el privado de Mattermost del dueño por el bot @os y verifica md5 de los adjuntos releyendo el post.
- Salidas: `PAGO SIMPLE AFON - MMAAAA.xlsx` (el que se sube), `FCL_AAAAMM_resumen.md` (plantilla usada, tabla trabajador · CUIL · cuenta (últimos 4) · importe, total, quiénes quedaron afuera y por qué).
- **Antes de correr para un mes nuevo**: las tres fuentes están cableadas por id de Drive en la constante `DRIVE` del script (`planilla`, `cuentas`, `plantilla`). Hay que actualizar `planilla` al xlsx nuevo del estudio y, cuando un lote generado por el OS haya sido acreditado, `plantilla` a ese archivo (el lote acreditado más reciente es siempre la plantilla). Si el estudio cambia la forma de la planilla (nombres de hojas, columnas), el script falla: no se adapta a mano el archivo, se adapta el lector con test.

Lo que el script garantiza (y prueba en `orquestador/lib/pago-simple.test.mjs`, `xlsx-zip.test.mjs`, `santander-fur-fcl.test.mjs`, 59 tests):

- El .xlsx es el ZIP de la plantilla con **una sola entrada reemplazada** (`xl/worksheets/sheet2.xml`, hoja «Pagos»); las otras 41 partes conservan bytes, CRC y fecha. Filas sobrantes del lote anterior se **vacían, no se borran** (la hoja mantiene sus 391 filas y su `dimension`).
- Encabezados en la fila 7, datos desde la 8, sin fila de total. Tipos de celda exactos: texto `inlineStr`, CUIL numérico `s=111`, fecha serial `s=115` (`DD/MM/YYYY`), importe `s=37` (`0.00`), **CBU como texto** `s=36`. Forma de pago `T`. «Orden de pago» = `MAAAA`.
- Cada cuenta y nombre es **idéntico carácter por carácter** al del lote acreditado. Quien no está en un lote acreditado **no entra por transferencia** y se lista aparte con su importe.
- Importes con el centavo exacto (`toFixed` antes de multiplicar: `60940.799999999996 × 100` roba un centavo por persona si no).
- `validarPagoSimple(plantilla, generado)` se pone rojo ante: cuenta no acreditada, CUIL nunca acreditado, nombre distinto del banco, estilo cambiado, CBU como número, validaciones perdidas, cantidad de filas distinta, forma de pago ≠ T.

## Verificación que se muestra (no se afirma)

1. `node --test --test-reporter=dot orquestador/lib/pago-simple.test.mjs orquestador/lib/xlsx-zip.test.mjs orquestador/scripts/santander-fur-fcl.test.mjs` verde.
2. Salida del script: «ENTRADAS: plantilla 42 | nuevo 42 · mismos nombres y orden: true · sólo cambió el bloque de filas de datos: true» y la validación estructural sin diferencias.
3. Total por transferencia = «Total transferencia» de la planilla del estudio, sumado fila por fila (no leído de la celda de total). Efectivo = el resto, listado con nombres.
4. Un parser distinto del que escribió (SheetJS) lee el archivo: N filas, total, fecha, CBU como texto.
5. Post del bot releído del servidor y md5 de los adjuntos iguales a los locales.
6. **El cierre es del dueño**: abre el archivo en Excel y compara las últimas 4 cifras de cada cuenta contra la tabla del mensaje antes de subirlo. Después de subirlo, la evidencia del efecto es el extracto: débitos «fondo desempleo MMAAAA» por trabajador en `banco_movimientos`. Ahí ese lote pasa a ser la plantilla del mes siguiente.

## Lo que queda fuera del archivo y hay que decir siempre

- Trabajadores en **efectivo**: los que la planilla marca así (sin cuenta AFON, o dados de baja en el mes: SOSA y JOFRE en 08/2026, gestión WF000518140). Se listan con importe; su pago no pasa por este archivo.
- Trabajadores de la planilla que **no están en el padrón del OS** (08/2026: Castro Galván Gerson y Heber, Díaz Ramón, Ávila Alejandro, Flores Alejandro). No se dan de alta desde acá (regla del padrón: quien no está en la quincena en curso es inactivo); se reportan.
- Que una cuenta esté en el lote acreditado prueba que existía ese día, **no que siga abierta**: un rechazo R03 se lee en la rendición/extracto y se corrige quitando la fila, no inventando otra cuenta.
- El .txt FUR no se genera ni se manda mientras Santander no asigne un número de acuerdo para el producto 012. La lib `orquestador/lib/santander-fur.mjs` queda lista (dos layouts, DV de CBU con pesos 3-9-7-1 cíclicos para el bloque 2, 650 posiciones, ISO 8859-1, CRLF) por si se contrata.

## Trampas ya pagadas

- Construir el Excel «desde cero» con la misma pinta: el banco puede rechazarlo y no dice por qué. Se edita el ZIP de la plantilla.
- Emparejar banco ↔ estudio por nombre: falla por tokens y abreviaturas. Por CUIL.
- Dejar «Orden de pago» vacía: el extracto pierde el período.
- Tomar la CBU del resumen de cuentas o «corregirla» porque el DV no da: si no está en un lote acreditado, no se paga por transferencia.
- Fechar el pago «hoy» y subirlo otro día: la fecha va adentro del archivo.
- Confiar en una única planilla del estudio: el 09/09/2026 llegó una que reemplazaba a la del 11/08 (misma hoja JUL, agregaba AGO). Se usa la más reciente y se anota cuál se reemplazó.
- El lote 0607 tiene 17 filas pero el 18/08 hubo 35 débitos: falta en Drive el segundo archivo de ese día. No completa las cuentas: si un trabajador no está en ningún archivo acreditado disponible, va a la lista de afuera aunque el extracto muestre que cobró.

## Relación con el resto del OS

- La obligación del mes (importe total del FCL) entra al Cash Flow por `_UOCRA_DDJJ_RAW` → Cargas Sociales (criterio percibido, decisión 09/09/2026). Este archivo no escribe en el Sheet ni en Drive; el registro del **pago** fuera de Compras es una decisión pendiente del dueño (memoria `cargas-sociales-no-van-a-compras`).
- Las boletas y la planilla del mes se archivan en Drive `FONDO DE CESE / FORMULARIOS ENVIADOS AAAA` (planilla) y `archivo-fiscal/AAAA/IERIC` (IERIC/FODECO); la DDJJ de UOCRA en su carpeta y las boletas de depósito en `UOCRA/Boletas de depósito` (el lector `uocra-raw-pestana.mjs` no es recursivo: ahí no molestan).
