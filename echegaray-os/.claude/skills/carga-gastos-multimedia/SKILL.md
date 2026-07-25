---
name: carga-gastos-multimedia
description: "Procedimiento ejecutable y confiable para cargar un GASTO que llega como multimedia (foto/PDF/imagen de factura, ticket o comprobante) a la pestaña 'Compras' del Sheet 'Flujo de Caja - Cash Flow' de Echegaray. Activar SIEMPRE que el dueño mande una o varias fotos/PDF de comprobantes para registrar. Encapsula: cómo leer la multimedia, cómo tratar IVA y percepciones (M = Total − IVA), cómo armar el fajo.json, cómo asignar obra sin inventar, proveedor nuevo vs existente, la corrida del loader existente con --dry primero, y la verificación post-carga. NO reescribe el motor: orquesta el uso correcto de orquestador/scripts/cargar-comprobantes-compras.mjs. Cruzar con lectura-drive-documentos-multiformato (OCR), impuestos-construccion y contabilidad-constructoras (IVA/percepciones), google-sheets-business-systems y admin-finanzas-sheets-clase-mundial (el Sheet)."
allowed-tools: Read, Bash, Write
metadata:
  author: echegaray-os
  type: expert-domain
  area: "Administración y Finanzas"
  jurisdiccion-principal: "San Juan, Argentina (dato fiscal real vía ARCA; alícuotas se verifican, no se citan de memoria)"
---

# Carga de gastos multimedia → Compras (Flujo de Caja - Cash Flow)

## Contribución a la misión

Protege **margen y caja** y reduce **carga manual** en el punto exacto donde el dueño ya sufrió cargas MAL hechas: un gasto fotografiado que queda mal registrado ensucia el Total de Compras y, como los cruces del Sheet son fórmulas abiertas, contamina en cascada Cash Flow, Proveedores, CAJA y Cheques. Esta skill convierte "sacar una foto y que quede bien" en un procedimiento **repetible y verificable**, no en algo que dependa de recordar el contrato de columnas cada vez. Aumenta la **trazabilidad** (cada peso cargado nace de un comprobante real) y la **autonomía Nivel C/D** (el OS prepara y valida la carga; escribir el Sheet es la acción que corre bajo la guarda central).

## Cuándo activar

- El dueño manda una o más fotos/PDF/imágenes de facturas, tickets o comprobantes para registrar como gasto.
- Un fajo de varios comprobantes en una sola foto, o varias fotos juntas.
- Cualquier pedido de "cargá esto a Compras / al Cash Flow / a gastos".

No activar para leer un comprobante sin cargarlo (eso es `lectura-drive-documentos-multiformato` solo) ni para editar otras pestañas del Sheet.

## Regla de oro inviolable del proyecto

**NUNCA correr el loader real contra el Sheet para "probar".** Eso borró trabajo del dueño varias veces. Validar SIEMPRE en frío: `--dry`, tests unitarios y lecturas read-only. Sólo la corrida final (sin `--dry`), con el fajo ya revisado, escribe — y aun así la **guarda central (candado+firma)** protege Compras: si el dueño la editó o candó, el loader se auto-bloquea. No evadir esa guarda nunca.

## No duplicar: el motor YA existe

Esta skill **usa**, no reescribe:

- `orquestador/scripts/cargar-comprobantes-compras.mjs` — carga un fajo.json a Compras. Uso: `node orquestador/scripts/cargar-comprobantes-compras.mjs --file fajo.json [--dry] [--add-proveedores]`.
- `orquestador/lib/carga-comprobantes.mjs` — helpers puros: `matchProveedor`, `valoresInput`, `validar`, `discrepanciaNeto`, `redondear2`, `GRUPOS_FORMULA`, `COL`.

Antes de tocar código preguntar: *¿el loader ya hace esto?* Casi siempre sí. El trabajo de la skill es armar bien el fajo.json y verificar.

## El contrato de columnas de "Compras" (verificado del Sheet vivo — respetar EXACTO)

| Col | Rol | Quién la escribe |
|---|---|---|
| B | Categoría | foto |
| C | Fecha (DD/MM/YYYY) | foto |
| E | **Proveedor** (desplegable ESTRICTO) | foto, matcheado contra la lista |
| G | Tipo de comprobante (F A / F B / F C / N C) | foto |
| H | N° de comprobante | foto |
| J | **Cliente / Asignación** = obra (desplegable estricto) | foto SÓLO si el comprobante la dice; si no, la completa el dueño |
| K | Detalles / Obra | foto si viene explícito |
| L | Concepto | foto |
| M | **Importe = Total − IVA** | derivado (ver abajo) |
| N | **IVA** discriminado | foto |
| O | **Total = M+N** | **FÓRMULA — NUNCA escribir** |
| T | Monto Pagado | derivado del estado |
| X | Estado (Pagado / Pendiente) | derivado de la condición de venta |
| Y | Tipo de Costo | la completa el dueño |
| I | Unidad de Negocio | la completa el dueño |

**PROHIBIDO escribir en AC / AD / AE / AF / AJ** — son ARRAYFORMULA que derraman desde la fila 4. Escribir ahí, aunque sea `""`, **rompe el derrame** de todas las filas. El loader ya las excluye; no forzarlas nunca en el fajo.

## Procedimiento paso a paso

### 1. Leer la multimedia (activar `lectura-drive-documentos-multiformato`)

Extraer de cada comprobante, sin inventar lo que no se ve: **proveedor, tipo y N° de comprobante, fecha, neto gravado, IVA discriminado, TOTAL, condición de venta (contado/cuenta corriente), forma de pago, y obra/unidad si el comprobante o la anotación del dueño la dice.**

Trampas reales de OCR:
- **Locale es-AR**: `$28.479,30` = punto miles, coma decimal. Un número mal leído mete un gasto 100× o 1/100.
- Fecha DD/MM/YYYY. Si es ilegible, el loader la RECHAZA (no se inventa) — pedirla.
- Fajo de varios en una foto → un objeto por comprobante en el mismo array.

### 2. IVA y percepciones — el corazón de la fiabilidad (cruzar `impuestos-construccion` · `contabilidad-constructoras`)

**M (Importe) = Total − IVA. Siempre.** No es el "Neto Gravado" impreso.

Por qué: una factura A trae Neto Gravado + IVA + **percepción IIBB/SUSS** (o **impuesto interno** en combustible) → Total. La percepción y el impuesto interno son **costo real, parte del Total, pero NO son IVA**. Si M se cargara con el neto gravado crudo, `O = M+N` quedaría **corto** por la percepción y el Total del Sheet no cerraría con la plata que salió. Esa era la carga MAL hecha.

**Cómo se resuelve (ya endurecido en el lib):** si el fajo trae `total`, `valoresInput` **deriva** `M = total − iva` automáticamente y absorbe la percepción; `discrepanciaNeto` avisa cuánto se absorbió. **Por eso el fajo debe incluir SIEMPRE el `total` del comprobante** — es el número más grande y confiable del ticket y la ancla de todo el cálculo. `N` = IVA discriminado, intacto. Alícuotas: no se citan de memoria; el dato fiscal real vive en `comprobantes_arca`.

### 3. Asignar la obra (col J, desplegable estricto)

Escribir la obra SÓLO si el comprobante o la anotación del dueño la nombra. **Si no la dice, dejar J vacía** — el dueño la completa y recién ahí las ARRAYFORMULA (AC/AE) clasifican el rubro de caja. Nunca inferir una obra. Usar el nombre EXACTO del desplegable (obras activas: Estrella, San Francisco, Messina, LE-*).

### 4. Proveedor nuevo vs existente

`matchProveedor` compara contra el desplegable estricto (col E) sin cruzar por tilde. Si no hay match razonable → `esNuevo`, con el nombre tal cual (no inventa una grafía). Un proveedor nuevo **sólo** se fija al desplegable si se corre con `--add-proveedores`, y conviene confirmarlo con el dueño antes.

### 5. Armar el fajo.json

Array de objetos. Campos por comprobante (usar los que la foto realmente da):

```json
[
  {
    "categoria": "B",
    "fecha": "05/01/2026",
    "proveedor": "Combustibles Barcelo",
    "tipo": "A",
    "numero": "0113-00010489",
    "concepto": "Gasoil autoelevador",
    "iva": "$5.981,00",
    "total": "$36.460,30",
    "condicion": "Contado",
    "obra": "Estrella"
  }
]
```

Guardar el fajo en el scratchpad, NO en el repo ni en Drive.

### 6. Correr con `--dry` PRIMERO (obligatorio)

```bash
node orquestador/scripts/cargar-comprobantes-compras.mjs --file /ruta/scratchpad/fajo.json --dry
```

`--dry` lee el Sheet read-only, matchea proveedores, cruza ARCA (duplicados), muestra la primera fila a escribir y las fórmulas a estampar — **sin escribir nada**. Revisar: proveedores nuevos, duplicados en ARCA, percepciones absorbidas, rechazos. Si algo no cierra, corregir el fajo y repetir `--dry`. No pasar a la corrida real hasta que el `--dry` esté limpio.

### 7. Corrida real (sólo con fajo revisado)

```bash
node orquestador/scripts/cargar-comprobantes-compras.mjs --file /ruta/scratchpad/fajo.json [--add-proveedores]
```

El loader: agrega filas DESPUÉS de la última con datos en col E, escribe sólo las columnas de input, estampa las fórmulas por fila copiándolas de la última fila (Google reajusta refs), respeta la guarda central y el filtro activo del dueño en Compras (si copyPaste falla por filtro, verifica que la fórmula O se auto-extendió; si no, falla fuerte). Si Compras está candada, se auto-bloquea — no forzar.

### 8. Verificar post-carga (el loader ya lo hace; confirmar la salida)

- **Sin #ERROR** en id (A), Total (O) ni rubro de caja (AC) de las filas nuevas.
- Filas escritas = comprobantes cargables.
- Filas sin Rubro de caja (AC) = las que esperan que el dueño complete la Unidad de Negocio (I) — normal, no es un error.
- **SIGUIENTE**: `node orquestador/scripts/sync-compras.mjs` (espeja a Supabase, regla de oro #6).

## Pestañas afectadas (por qué una carga bien hecha se propaga sola)

Los cruces del Sheet son **fórmulas ABIERTAS sobre Compras**. Un comprobante bien cargado se propaga solo a: **Cash Flow** (el egreso por rubro/fecha de caja), **Proveedores** (cuenta corriente del proveedor), **CAJA** (si quedó pagado) y **Cheques/Tarjeta** (según forma de pago). Por eso M/N/O y el estado tienen que estar exactos: un error acá se multiplica en cuatro pestañas. No hay que escribir en esas pestañas — se actualizan solas.

## Validación en frío (sin tocar el Sheet real)

- `node --test orquestador/lib/carga-comprobantes.test.mjs` — cubre M=Total−IVA, discrepanciaNeto, matcheo de proveedor, es-AR, validar.
- Réplica offline del bucle de planificación del loader (importar los helpers puros del lib y correr `matchProveedor`/`valoresInput`/`validar`/`discrepanciaNeto` sobre un fajo de ejemplo) para ver las filas que se armarían — sin Google/DB.
- `--dry` sobre el Sheet: lecturas read-only, cero escritura.

## Fuentes

1. **Contrato de columnas de Compras** — leído del Sheet vivo (no supuesto); documentado arriba y en `lib/carga-comprobantes.mjs`.
2. **Dato fiscal real** — `comprobantes_arca` (IVA/total por comprobante; detección de duplicados). Las **alícuotas vigentes** se verifican, nunca se citan de memoria (`impuestos-construccion`).
3. **La foto/PDF** — única fuente de proveedor, número, fecha, importes y condición. No se fabrica lo que no muestra.
4. **El dueño** — completa Unidad de Negocio (I), Tipo de Costo (Y) y la obra (J) cuando el comprobante no la dice. Su edición manual manda.

## Prohibido

- Escribir en O (fórmula) o en AC/AD/AE/AF/AJ (ARRAYFORMULA).
- Inventar obra, proveedor, fecha o importe que la foto no muestra.
- Cargar M con el neto gravado crudo cuando hay percepción/impuesto interno (usar Total − IVA).
- Correr el loader real contra el Sheet sin `--dry` previo y sin revisar el fajo.
- Evadir la guarda central / el candado de pestaña / el filtro del dueño.

## Aprendizaje continuo

`FOTO → CARGA → VERIFICACIÓN → DESVÍO (O no cierra, duplicado, obra ausente) → CAUSA → PATRÓN → PROPUESTA`. Si aparece un patrón nuevo de comprobante (una percepción no contemplada, un tipo de comprobante que el desplegable no tiene, un proveedor recurrente marcado nuevo), registrarlo — clasificación A→E — y, si es recurrente y validado, endurecer el lib con un test, nunca improvisar sobre el Sheet.
