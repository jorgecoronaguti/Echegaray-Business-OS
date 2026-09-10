# PRP · Puente Drive ↔ app.ecsas.com.ar

**Fecha:** 10/09/2026 · **Estado:** H1 en curso · **Rama del H1:** `feat/drive-indice-sin-borrado`

Este documento es el plan completo del puente. Los hitos siguientes (H2…H6) lo leen: lo que no
esté acá no está decidido.

---

# Puente Drive ↔ app.ecsas.com.ar — plan (10/09/2026)

## Principio
Drive = almacén y navegación humana. Postgres = índice + vínculo con la entidad. La app lee del índice y SUBE A DRIVE. Ningún bucket nuevo; los existentes se drenan.

## Inventario real (verificado)
- Personal: `documentacion_legajo` (975), `personas.drive_folder_id` (74/80), `documento_presentacion` (0, bucket `documentos-legajo`). Ida: `legajos-sincronizar.mjs` timer 6 h. Vuelta: scripts VM (`recibos-a-legajos`, `bajas-a-legajos`, `constancias-afip-a-legajos`, `firmar-recibos-legajo`) suben a Drive con OAuth de rodrigo@ y registran; la web sube al bucket y no hay camino al legajo.
- Clientes: `cliente_documento` (448, vínculo), `documento_cliente` (118, copia en bucket para el portal), `recibo_cliente` (25), `clientes.drive_carpeta_id` (4/5). Drive `PRESUPUESTOS - CLIENTES/<CLIENTE>`. La app sólo vincula un id.
- Obras: `obra_documento` (32) + vista `obra_documento_candidato` + RPC `vincular_documentos_por_carpeta`; `obras.drive_carpeta_id` (3/10); `cliente_orden` (16, bucket `obras-documentos`). La app sólo vincula.
- Proveedores: `proveedor_papel` (vista), `proveedor_documento` (7, bucket), `compra_adjunto` (194, bucket `comprobantes`). NADA en Drive; el Drive tiene `Archivos GESTIÓN ECSAS/FACTURAS A/{B,C,Emitidas}` a mano.
- Fiscal: `documento_leido` (1.246, hash de contenido), `archivo-fiscal/AAAA/{931,IIBB,IVA,UOCRA,IERIC}`, `libro-sueldos/`.
- Vehículos: `equipos_vehiculos`; Drive `Archivos GESTIÓN ECSAS/VEHICULOS`; sin tabla de documentos ni pantalla.
- Catálogo: `drive_index` (4.232), timer 6 h, BORRA lo que no ve (piso 70 %), hash de metadatos.
- Contradicciones: C1 cliente_documento vs documento_cliente · C2 comprobante en Drive FACTURAS vs bucket · C3 proveedor_papel vs proveedor_documento (ninguno en Drive) · C4 OC del cliente en Drive vs bucket · C5 papel del empleado en bucket sin camino al legajo · C6 drive_index borra vs documentacion_legajo marca ausente.

## Diseño
- Extender `drive_index` (md5, web_view_link, trashed, ausente_en_drive, ausente_desde, origen, subido_por, subido_en). No crear tabla `documento` paralela.
- `documento_entidad` (drive_file_id, entidad_tipo ∈ persona/proveedor/obra/cliente/organismo/vehiculo, entidad_id, origen ∈ carpeta/confirmado/app/gmail/inferido, evidencia, tipo_documento, categoria; única por archivo+entidad). Las tablas de vínculo actuales se alimentan desde el mismo motor y a mediano plazo pasan a vistas.
- `carpeta_entidad` (drive_folder_id, entidad_tipo, entidad_id, regla ∈ raiz_declarada/patron_nombre/manual, subruta_default, confianza), sembrada desde lo existente; lo que no matchea → vista `carpeta_sin_entidad`, visible en /documentos como «sin dueño».
- Ida: `indexar-drive` con la disciplina de legajos (nunca borra; marca ausente sólo en carpetas listadas enteras; papelera visible; md5). Luego `documento_entidad` por `carpeta_entidad`.
- Vuelta: web → bucket de TRÁNSITO + `documento_subida` (pendiente) → worker VM (patrón `cola-web.mjs`, 1 min) resuelve carpeta, `uploadFile` con el OAuth del dueño de la carpeta, lee md5 en destino, compara, y sólo entonces indexa (`origen='app'`) + vincula. md5 distinto → error, no se indexa.
- Migración única bucket→Drive (`buckets-a-drive.mjs --dry/--aplicar`), idempotente por md5, agrega `drive_file_id` a la fila original, no borra `storage_path`; vaciar buckets después, con orden del dueño.
- Permisos: RLS existente por tipo (ve_economia, ve_obra, es_administracion, mi_persona_id). El token nunca viaja a la web.

## Qué no hacer
Sync bidireccional de contenido · Drive como base de datos leída en vivo desde Vercel · bucket «documentos» unificado · reescribir legajos-sincronizar · tabla `documento` paralela · bot subiendo directo (el bucket pasa a tránsito) · renombrar carpetas por script.

## Hitos
H1 (S) índice sin borrado + md5/papelera/web_view_link; /documentos muestra «ausente». H2 (M) carpeta_entidad + documento_entidad sembradas + carpeta_sin_entidad. H3 (M) papeles de proveedor suben a Drive por cola documento_subida + consumidor en worker; gmail-transferencias por el mismo camino. H4 (M) migración única bucket→Drive (7+16+194) y el bot encola hacia Drive. H5 (M) obras/clientes suben desde TabDocumentos/ficha; documento_presentacion aprobado → Drive + legajo. H6 (L) espejo unificado con timer único; cliente_documento/obra_documento como vistas; portal decide.

## Decisiones del dueño
Carpeta de proveedores (no existe: `Archivos GESTIÓN ECSAS/PROVEEDORES/<RAZÓN SOCIAL (CUIT)>` o `08_COMPRAS_Y_PROVEEDORES`) · dónde van los 194 comprobantes de Compras (FACTURAS A/AAAA/MM, por proveedor o por obra) · nomenclatura de archivos nuevos (`AAAA-MM-DD_TIPO_ENTIDAD_desc.ext`) sin renombrar lo existente · con qué token se escribe en PRESUPUESTOS - CLIENTES y Archivos GESTIÓN ECSAS (403 es el riesgo más probable) · portal: servir Drive por el OS y retirar la copia, o conservar el bucket sólo para el portal · vaciar buckets 30 días después de H4 · carpetas ambiguas (BSA planta/adicional comparten; Quattropani cliente = obra; 24 carpetas de PRESUPUESTOS - CLIENTES que no son clientes).

---

## Estado del H1 (10/09/2026)

Lo construido, en `feat/drive-indice-sin-borrado`:

- `supabase/migrations/20260910T1930_drive_index_ausente_md5.sql` — **ESCRITA, NO APLICADA**. Agrega
  `md5`, `web_view_link`, `trashed`, `ausente_en_drive`, `ausente_desde`, `origen` + índice parcial
  sobre `md5`. No toca la RLS existente.
- `orquestador/lib/drive-indice.mjs` — `planDeBorrado` **ya no existe**; lo reemplaza
  `planDeAusencia({ indiceActual, vistos, carpetasListadasEnteras })`, que devuelve `marcar`,
  `revivir` e `intactas` y NUNCA un borrado. `CAMPOS_DRIVE` pide `md5Checksum, trashed,
  webViewLink`. `porQueLaRaizNoSirve(meta)` corta la corrida si una raíz está en la papelera.
- `scripts/indexar-drive.mjs` — usa el plan nuevo; lista SIN `trashed=false` (la papelera se indexa
  con su marca) y no entra a carpetas en la papelera; **aborta si la migración no está aplicada**,
  salvo en `--dry`, donde avisa y sigue en modo compatibilidad.
- `/documentos` — `marcaDeArchivo` escribe «ausente en Drive» / «en la papelera» en tenue; la fila
  no se esconde. `enlaceDrive` usa el `web_view_link` guardado cuando existe.

Corrida en seco contra el Drive real (10/09/2026, 215 s, 0 errores):
`4.119 vistos · 19 nuevos · 3.513 actualizados (el backfill de md5, una sola vez) · 587 sin cambios
· 0 a marcar ausentes · 0 a revivir · 132 sin novedad · 0 en papelera · 29 archivos sin md5, los 29
formatos nativos de Google`.

### Lo que el H1 dejó abierto

1. **`libro-sueldos` no se indexa.** Las 132 filas «sin novedad» del dry son TODAS suyas: la raíz
   no está en `RAICES_POR_DEFECTO` y su contenido está congelado desde que alguien corrió una vez
   con `ORQ_DRIVE_INDEX_ROOTS` a mano — el mismo modo de falla que dejó `archivo-fiscal` 19 días
   sin actualizar en agosto. Agregarla es una decisión de qué se indexa, no del H1.
2. **Un sub-árbol que desaparece entero sólo se marca en su cima.** Si se borra una carpeta con 40
   archivos adentro, se marca la carpeta (su padre se listó) y los 40 quedan intactos: nadie listó
   su carpeta. Es conservador a propósito. Un barrido transitivo («si el padre está ausente, el
   hijo también») es trabajo del H2, cuando exista el árbol en `carpeta_entidad`.
3. **`indexed_at` no dice «lo vi en esta corrida».** Sólo se toca cuando la fila se reescribe: hay
   filas con `indexed_at` de julio que el indexador ve cada 6 h. Ningún control puede usarla como
   señal de frescura; para eso está `ausente_en_drive`.
4. **La papelera entra a las búsquedas del chat.** `drive-busqueda` lee `drive_index` y todavía no
   filtra `trashed`. Hoy no cambia nada (0 archivos en papelera bajo las raíces), pero el día que
   haya uno va a aparecer en un resultado sin decir que está en la papelera.

---

## Estado del H2 (10/09/2026)

**El H2 del plan decía: `carpeta_entidad` + `documento_entidad` sembradas + `carpeta_sin_entidad`.
Se hizo la mitad que resuelve el problema, y NO se crearon esas dos tablas. El porqué está abajo.**

Lo construido, en `feat/puente-drive-h2`:

- `src/features/documentos/services/carpetaDeEntidad.ts` — la ÚNICA definición de cuál es la carpeta
  de una entidad (`FUENTE_DE_CARPETA`) y de su estado: `sin_declarar` · `no_indexada` ·
  `en_papelera` · `ausente` · `no_se_pudo_leer` · `ok`. Puro, con 15 tests.
- `src/features/documentos/services/carpetaDeEntidadService.ts` — la lectura: resuelve la carpeta y
  lista sus descendientes desde `drive_index` (nunca Drive en vivo). `alcanceDeLectura(rol)` dice si
  la lista puede estar recortada por la RLS.
- `src/features/documentos/components/ArchivosDeDrive.tsx` — el bloque, montado en las cuatro fichas
  (obra, persona, cliente, proveedor), con nombre, subcarpeta, fecha, tamaño y enlace.
- `orquestador/scripts/censo-carpetas-drive.mjs` + `orquestador/lib/censo-carpetas.mjs` — el censo,
  que importa la regla de la app en vez de copiarla.
- `orquestador/datos/definiciones.json` + `DEFINICIONES.md` — `carpeta_de_drive` como concepto
  registrado, con `obras.drive_carpeta_id` y `personas.drive_folder_id` prohibidas.
- `supabase/migrations/20260910T2210_drive_index_carpeta_de_obra.sql` — **ESCRITA, NO APLICADA.**

### Por qué NO se crearon `carpeta_entidad` ni `documento_entidad`

`carpeta_entidad` sería, hoy, una copia de tres columnas que YA declaran la carpeta
(`obra_canonica.drive_carpeta_id`, `clientes.drive_carpeta_id`, `personas.drive_folder_id`) más una
cuarta fila vacía para proveedores. Una tabla espejo de una columna existente es la segunda
definición del mismo concepto — exactamente lo que el `CLAUDE.md` raíz prohíbe— y no se puede
sembrar sin decidir antes dónde vive la carpeta de un proveedor, que es una decisión abierta del
dueño en este mismo documento. Se registró el concepto en su lugar: la fuente es única, está
declarada y hay un test que pone rojo si alguien lee otra.

`documento_entidad` materializaría un vínculo que hoy se deriva de la jerarquía de carpetas sin
ambigüedad, y su valor real aparece cuando haya vínculos que NO salgan de la carpeta (un archivo
suelto atado a mano, un papel que llega por Gmail). Materializarlo antes obliga a un timer que lo
mantenga sincronizado con `drive_index` y a resolver los seis casos ambiguos ya conocidos (dos obras
que comparten carpeta, cliente y obra que comparten carpeta) sin nadie que los decida.

**Consecuencia declarada:** el H3 (subir a Drive) necesita `carpeta_entidad` para los proveedores.
No se puede empezar sin la decisión de dónde va esa carpeta.

### El censo, medido contra la base (10/09/2026)

| | con carpeta | sin carpeta |
|---|---|---|
| Obras (`obra_canonica`) | 11 | 15, de las cuales **13 reales** (2 son de prueba E2E) |
| Clientes | 4 | 1 — Javier Sánchez / San Francisco / IMOTOR |
| Personas | 74 | 6, **todas cuentas de prueba**: el legajo real está cubierto entero |
| Proveedores | — | 41; **la columna no existe** |

`bsa-planta` y `bsa-adicional` apuntan a la MISMA carpeta. Y la obra `quattropani` comparte carpeta
con su cliente: para esa obra, «la carpeta de la obra» y «la del cliente» son el mismo lugar.

**La fusión de obras del 10/09 no arrastró la carpeta.** `bsa-planta` (fusionada en `messina-bsa`)
tiene carpeta con 49 archivos; `messina-bsa`, la que queda viva, no tiene ninguna. Lo mismo con
`pisos-120m2` → `messina-pisos-120-rampa`.

### Lo que el H2 deja abierto

1. **El jefe de obra ve la lista recortada.** La policy de `drive_index` es
   `ve_economia() OR drive_file_id IN (drive_file_ids_vinculados())`, y esa función no conoce las
   carpetas: sólo `documentacion_legajo`, `obra_documento` (32 filas para 26 obras) y
   `cliente_documento`. La ficha lo DICE en vez de disimularlo. La migración
   `20260910T2210_drive_index_carpeta_de_obra.sql` agrega el cuarto origen; está escrita, medida
   (28,8 ms el peor caso) y **sin aplicar**, así que su corrección funcional está sin verificar.
2. **El portal del cliente resuelve la carpeta contra `public.obras`** y la ficha contra
   `obra_canonica`: la carpeta que ve el cliente puede no ser la que ve el equipo. Declarado como
   excepción en `DEFINICIONES.md`, con efecto hacia afuera.
3. **En la ficha de persona el bloque repite lo que ya muestra el legajo.** `legajos-sincronizar`
   espeja la carpeta entera en `documentacion_legajo`, así que las dos listas dicen casi lo mismo.
   Para persona el bloque agrega poco; para obra, cliente y proveedor agrega todo.
4. **La vuelta app→Drive sigue sin empezar** (H3, H4, H5). Nada de lo de este hito escribe en Drive.
