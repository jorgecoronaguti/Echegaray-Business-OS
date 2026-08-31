# XSAS · Drive/Archivos — inventario de lo que YA existe

Fecha del relevamiento: **2026-08-31**. Rama `xsas/drive-capability`.

Objetivo del relevamiento: saber qué parte de «XSAS maneja Drive sin Claude» ya está construida,
para no crear una segunda integración con Google. Clasificación:

- **READY** — se ejecutó de verdad contra Drive/Postgres en este relevamiento y anduvo.
- **PARTIAL** — funciona, pero le falta algo que el contrato de la capability exige.
- **LEGACY** — anda, pero su forma de consumo no sirve al objetivo (sólo alcanzable como tool de un modelo).
- **BROKEN** — tiene un defecto verificado.
- **MISSING** — no existe.

---

## 0. El hallazgo que ordena todo el resto

**El agujero NO está en el código: está en la superficie conversacional.**

`184` archivos del repo construyen su propio cliente con `makeGoogleClient` y hablan con Drive
directamente, sin modelo de por medio (contado con `grep -rl makeGoogleClient`, excluyendo
`node_modules`). Los scripts, los generadores y los timers ya son «XSAS hace Drive».

Lo que **sí** depende de un modelo es la ruta agéntica/conversacional: `driveReadTools(google)` y
`driveWriteTools(google)` devuelven `{ schema:{name}, run(args) }` y se consumen desde
`orquestador/os.mjs`, `orquestador/interactive-server.mjs`, `orquestador/handlers/specialist.mjs` y
`orquestador/handlers/operation_execute.mjs`. Para hacer una operación de Drive desde código hay que
**armar un registro de tools y buscar la entrada por `schema.name`**: no hay función llamable.

Esa inversión —bajar la lógica a `lib/drive/` y dejar las tools como cara fina— es el trabajo.

---

## 1. Cliente Google — `orquestador/lib/google.mjs` (1.822 líneas, 115 KB)

Un solo `makeGoogleClient({config, auth, fetchImpl, impersonate, scopes, getToken, soloUsuario})`
que devuelve un objeto `cliente` con ~90 métodos. Trae reintentos (`ESPERAS_5XX`, `ESPERAS_429`),
timeout por llamada (`ORQ_GOOGLE_FETCH_TIMEOUT_MS`, 45 s) y tres identidades
(`orquestador/lib/google-os.mjs`: institucional / operadora / personal).

### READ — identidad y almacenamiento

| Método | Estado | Nota |
|---|---|---|
| `searchFile(name)` | READY | `name contains`, `trashed=false`, `pageSize=10`. Ejecutado. |
| `findFolder(name)` | READY | Ejecutado: `PRESUPUESTOS` → `1kOo4LRKjhS445_DAvPqQteFeeFet9uy9` («PRESUPUESTOS - CLIENTES»). |
| `listarCarpeta(id,{q,campos,tope})` | READY | **Pagina** con `nextPageToken` hasta `tope=2000`. |
| `listFolder(id)` | **BROKEN** | `pageSize=1000` **sin `pageToken`**: una carpeta con más de 1.000 hijos se trunca en silencio. Y no mira si la carpeta misma está en la papelera → devuelve `[]` sin error (la trampa «carpeta en la papelera» ya pagada). Ejecutado: 56 ítems en PRESUPUESTOS. |
| `getMeta(fileId)` | **PARTIAL** | `fields=id,name,mimeType,size,webViewLink`. **Sin `parents`, sin `trashed`, sin `modifiedTime`, sin `md5Checksum`, sin `version`.** Verificado ejecutándolo: la respuesta real no trae esos campos. Sin `parents` no hay identidad de ubicación; sin `trashed` no se puede distinguir «vacía» de «en la papelera»; sin `md5Checksum` no hay hash. Sólo 3 llamadores en el repo → ampliarlo es barato. |
| `fileMeta(fileId)` | READY | Sí pide `trashed` y **lanza** si el archivo no existe o está en la papelera. Es la pieza correcta, pero devuelve sólo `{id,name,mimeType}`. |
| `listarRevisiones(fileId)` | READY | `revisions(id,modifiedTime,lastModifyingUser/emailAddress)`, paginado a 1.000. |
| `exportarRevision(fileId,revId,mime)` | READY | Resuelve `exportLinks` de la revisión (los nativos no tienen bytes). |
| `descargarBytes(fileId)` | READY | `alt=media`. |
| `exportarBytesComo(fileId,mime)` | READY | Export en memoria. |
| `exportarComoPdf(fileId,{nombre,parentId})` | READY | Export + guarda el PDF en Drive. |
| `readExcel` / `readPdfText` / `readDocText` / `readSheetValues|Grid|Formats|Validations` / `listTabs` / `getSheetMeta` | READY | Lectura de **contenido**: fuera del borde de esta capability (es de los motores). |

### CREATE / MANAGEMENT

| Método | Estado | Nota |
|---|---|---|
| `createFile({name,mimeType,parents})` | **PARTIAL** | Usa `ownerToken()` (cuota real) y fija `locale es_AR` a los Sheets nuevos — bien. **No relee** el archivo creado: devuelve lo que dijo la API. **No tiene idempotencia**: dos llamadas = dos archivos con el mismo nombre. |
| `uploadFile(name,b64,mime,{parentId})` | **PARTIAL** | Multipart, `fields=id,webViewLink`. Usa `accessToken()` (**el robot**, no el dueño) mientras `createFile`/`copyFile` usan `ownerToken()` porque el robot no tiene cuota. Inconsistencia de identidad no explicada en el código. Sin verify, sin idempotencia. |
| `renameFile(fileId,name)` | **PARTIAL** | `PATCH ?fields=id,name`. Devuelve el nombre que contestó Google, **no releído**. |
| `moveFile(fileId,folderId)` | **PARTIAL** | Lee `parents`, los saca y agrega el destino. Devuelve `parents` de la respuesta del PATCH, **no releído**. |
| `copyFile(fileId,name,parents)` | **PARTIAL** | Sin verify, sin idempotencia. |
| `trashFile(fileId)` | **PARTIAL** | Sin verify. |
| borrado definitivo | **MISSING (a propósito)** | No existe en `google.mjs`. `drive.delete` es Nivel F y su `run()` sólo devuelve error. **Se deja así.** |
| `shareFile` / `publicarLectura` | READY | Permisos de Drive. Fuera del alcance de esta lane. |

---

## 2. Tools — `orquestador/lib/tools/drive.mjs` y `drive-write.mjs`

**LEGACY** (por forma de consumo, no por calidad).

- `driveReadTools(google)` → `drive.list`, `drive.tabs`, `drive.lastrow`, `drive.read`, `drive.obras`, `drive.navigate`.
- `driveWriteTools(google)` → `drive.update`, `drive.append`, `drive.create`, `drive.write_doc`,
  `drive.rename`, `drive.move`, `drive.batchupdate`, `drive.insertrows`, `drive.deleterows`,
  `drive.clear`, `drive.rename_tab`, `drive.delete_tab`, `drive.addtab`, `drive.copy`,
  `drive.trash`, `drive.delete`.

La lógica vive **dentro** de cada `run()`. Un `drive.list` desde código obliga a instanciar el
registro completo y buscar por `schema.name`. Sus firmas **no se rompen**: los cuatro entrypoints de
arriba dependen de ellas.

`drive.create` ya tiene un buen precedente: traduce el `storageQuota` de Google a un mensaje con
causa. Es el germen de la degradación con nombre propio, pero es un `if` por tool, no una taxonomía.

---

## 3. Índice y búsqueda determinística

| Pieza | Estado | Nota |
|---|---|---|
| `public.drive_index` | READY | **3.695 filas** al 31/08 (ejecutado). Columnas: `drive_file_id, name, path, mime_type, is_folder, tipo, size_bytes, modified_time, parent_id, depth, indexed_at, nombre_norm, path_norm, tokens, owner_email, hash, actualizado_at`. |
| `orquestador/lib/drive-indice.mjs` | READY | Indexador con `PISO_BORRADO=0.7` y `planDeBorrado()`: si una corrida ve menos del 70 % de lo que había, **no borra**. Ya es un centinela anti-vaciado. |
| `orquestador/lib/drive-busqueda/` | READY | `buscar()` = 5 etapas + ranking explicable + aprendizaje por aceptación/rechazo. **Cero modelo**, con `sin-modelo.test.mjs` que recorre el árbol de imports y falla si aparece una llamada a Anthropic. Es la pieza que mejor cumple el objetivo de la lane. |
| Consumidores de `buscar()` | 2 | `scripts/auditar-drive-busqueda.mjs` y `comunicacion/asistente/capacidades/drive-buscar.mjs`. **Ninguna tool de Drive lo usa**: `drive.read` y `drive.navigate` siguen resolviendo nombres con `searchFile`/`findFolder` contra la API, que es el modo de buscar que este repo ya declaró inútil («vision/traccion»). |

**Ese es el defecto de arquitectura más caro del inventario**: hay dos maneras de resolver un nombre
a un `file_id` y la buena la usa una sola superficie.

---

## 4. Ingesta y lectura de contenido — fuera del borde

`orquestador/lib/ingesta/` (pdf, docx, word, doc-ole, planilla, dxf, dwg, zip, segmentar, recortes,
registro, capacidades) y `orquestador/lib/archivos/` (deteccion, planilla, mensaje):
**READY, y fuera del alcance de esta capability.** Son motores de contenido.
`orquestador/lib/slides/`, `operaciones-sheet.mjs`, `sheet-formulas.mjs`, `pivot-sheets.mjs`,
`evaluar-formula-sheet.mjs`: ídem, motores de contenido (otra lane).

**El borde que esta capability respeta:** identidad, almacenamiento y gestión. Nada de editar el
contenido de un documento, una planilla o una presentación.

---

## 5. Permisos, aprobación y auditoría

| Pieza | Estado | Nota |
|---|---|---|
| `orq.capabilities` | READY | 58 filas. Ya existen `drive.read` (clearance A, blast `none`), `drive.write` (C, `low`, `disposition_override='auto'`), `drive.delete` (F, `critical`, `forbidden`), `drive.draft` (C), `doc.create` (C), `doc.write` (B). Columnas: `slug, domain, description, required_clearance, blast_radius, idempotency, disposition_override, input_schema, output_schema, rate_limit_per_min, secret_scope, enabled, agent_role`. |
| `orq.policy_decide(cap, principal, blast)` | READY | Función SQL. `orquestador/lib/policy.mjs` es un envoltorio de 9 líneas. |
| `orq.pending_operations` | READY | Cola de aprobación humana. |
| `orquestador/handlers/operation_execute.mjs` | READY para RBAC, **BROKEN para cierre** | Re-verifica la policy después de aprobado (un Nivel F queda `forbidden` aunque alguien lo apruebe) — eso está bien. Pero marca `status='executed'` **con lo que devolvió la tool, no con el efecto releído**. Es exactamente el defecto que el Principio de Cierre prohíbe y que en este repo ya mintió una vez (un 204 de PostgREST tomado como prueba de escritura). |
| Idempotencia | **PARTIAL** | `dedupe_key = opexec:<id>` evita ejecutar **dos veces la misma fila**. No evita que «crear informe agosto» lanzado dos veces deje «Informe agosto» y «Informe agosto (1)». Falta la clave de negocio. |
| `orq.events` | READY | Log genérico con `subject_type, subject_id(uuid), type, actor_id, correlation_id, causation_id, blast_radius, payload jsonb`. `subject_id` es **uuid**: un `file_id` de Drive (texto) no entra ahí, iría al payload. |
| Auditoría de Drive | **MISSING** | No hay `orq.audit_log` ni `orq.audit_events`. No existe ninguna tabla que conteste «qué cambió, en qué archivo, quién, cuándo, qué versión quedó». |
| `orq.sheet_snapshots` + `sheet-snapshot.mjs` | READY | Marcha atrás **de contenido de pestañas**, disparada en `tool-executor.mjs` antes de escribir. No cubre operaciones de archivo (rename/move/copy/trash). |
| Freno de Sheets (`congelador-sheets.mjs`) | READY y **PUESTO** al 31/08 18:03 | Cubre las cinco escrituras de **valores** de Sheets. **No cubre** operaciones a nivel archivo (create/rename/move/copy/trash), que es correcto: son otra cosa. |

---

## 6. Identidad que sobrevive al movimiento

**MISSING.** `public.drive_index` guarda `drive_file_id, name, path, parent_id, hash, modified_time`,
pero nada reconcilia un archivo renombrado o movido con su registro anterior: la siguiente corrida
del indexador lo ve como otro `path`, y la relación con lo que el negocio sabía de él se pierde.

## 7. Relación archivo ↔ entidad de negocio

**PARTIAL y fragmentada.** Existen a pedazos y sin forma común: `public.obra_documento`,
`obra_documento_candidato`, `cliente_documento`, `documento_cliente`, `subcontrato_documento`,
`mi_documento_legajo`, `documentacion_legajo`, `drive_alias_documento`, `drive_alias`.
No hay contrato `file_id ↔ business_entity ↔ relation_type`. **No se toca en esta lane**: unificarlas
requiere decidir qué migra de cada una, y eso es una decisión del dueño, no un refactor.

---

## 8. Errores con nombre propio

**PARTIAL.** `orquestador/comunicacion/asistente/google-cliente.mjs` tiene `clasificarErrorGoogle()`
y `orquestador/comunicacion/asistente/contratos.mjs` tiene `ERROR` con
`google_sin_acceso · no_encontrado · error_temporal · error_definitivo · permiso_denegado`.
Es una taxonomía **de la capa de asistencia** (mensajes para una persona en un chat), no del núcleo:
las tools de Drive no la usan y devuelven `{error: string}` o dejan propagar el `Error` crudo de
`google.mjs` (`google upload 403: …`).

---

## 9. Qué se reusa y qué se construye

**Se reusa tal cual:** `makeGoogleClient` y sus ~90 métodos · `googleDelOs()` y las tres identidades ·
`orq.capabilities` + `orq.policy_decide` + `orq.pending_operations` + `operation_execute.mjs` ·
`drive-busqueda/buscar.mjs` + `public.drive_index` · `congelador-sheets.mjs` · `db.mjs` (`query`, `withTx`).

**Se arregla donde está:** `getMeta` (proyección de campos), `listFolder` (paginado y papelera).

**Se construye nuevo, y sólo esto:** `orquestador/lib/drive/` — la capa llamable que agrega
referencia por ID, verify-after-write, idempotencia de negocio, taxonomía de errores y auditoría.

---

# LO QUE SE CONSTRUYÓ — `orquestador/lib/drive/`

Llamable como función. Ningún modelo participa de ninguna de estas operaciones.

```js
import { crearCapacidadDrive } from 'orquestador/lib/drive/index.mjs'
const drive = crearCapacidadDrive({ google, db, indice, actor, actorTipo, correlationId, politica, principalId })
```

## READ — identidad y almacenamiento

| Función | Devuelve |
|---|---|
| `referencia(file_id, {displayPath})` | la referencia canónica, **incluida `trashed`** |
| `referenciaViva(file_id)` | igual, pero un archivo en la papelera levanta `TRASHED` |
| `listarCarpeta(folder_id, {tope})` | `{carpeta, count, truncado, items[]}` — pagina, y una carpeta archivada levanta `TRASHED` |
| `buscarCarpetas(nombre, {limite})` | todas las coincidencias (que haya dos con el mismo nombre es información) |
| `buscarPorNombre(texto, {limite, mimeType, enCarpeta})` | búsqueda literal `name contains`, con las comillas escapadas |
| `buscarPorMetadata({nombreExacto, nombreContiene, mimeType, enCarpeta, modificadoDesde, propiedad, incluirPapelera, limite})` | sin ningún criterio, `INVALID_ARGUMENT` |
| `porClaveDeIdempotencia(clave, {enCarpeta})` | el archivo que ya produjo esa clave, o `null` |
| `buscarEnIndice(texto, {tipo, usuario, limite})` | el buscador determinístico de `drive-busqueda/`; sin índice dice `UNSUPPORTED_OPERATION` |
| `revisiones(file_id)` | el historial, de la más vieja a la más nueva |
| `descargar(file_id)` | `{referencia, bytes, mime_type}`; un nativo de Google dice `UNSUPPORTED_OPERATION` y sugiere exportar |
| `exportar(file_id, formato)` | bytes en memoria; la conversión se valida **antes** de llamar a Drive |

**La referencia canónica**: `provider · file_id · name · mime_type · tipo · is_folder · parents · folder_id ·
display_path · size_bytes · hash · revision_id · modified_at · created_at · trashed · web_view_link ·
owner_email · idempotency_key`.

## CREATE + MANAGEMENT — con portero, relectura y auditoría

| Función | Verifica releyendo |
|---|---|
| `crearCarpeta({nombre, padre, clave_idempotencia})` | `name`, `mime_type`, `trashed` |
| `crearNativo({nombre, tipo, padre, clave_idempotencia})` | `name`, `mime_type`, `trashed` |
| `subir({nombre, contenido_base64, mime_type, padre, clave_idempotencia})` | `name`, `trashed` |
| `renombrar({file_id, nombre})` | `name` |
| `mover({file_id, destino})` | `parents` |
| `copiar({file_id, nombre, destino, clave_idempotencia})` | `name`, `trashed`, `parents` |
| `archivar({file_id})` | `trashed` |
| `exportarADrive({file_id, formato, nombre, destino, clave_idempotencia})` | `trashed` |
| `borrarDefinitivo()` | no existe: siempre `FORBIDDEN` (Nivel F) |

Toda mutación devuelve
`{ok, operacion, idempotente, referencia, antes, verificado:{campos, leido_en, metodo}, audit, capability, actor, policy}`.

`historia(file_id)` contesta qué cambió, quién, cuándo y con qué versión quedó.

## Códigos de error

`DRIVE_UNAVAILABLE · NOT_FOUND · TRASHED · FORBIDDEN · PERMISSION_REQUIRED · UNSUPPORTED_OPERATION ·
INVALID_ARGUMENT · VERIFY_FAILED · CONFLICT · QUOTA · AUDIT_UNAVAILABLE`.

Ninguno nombra al OS, y hay un test que recorre la tabla y falla si alguno lo hiciera.

---

# LO QUE LA CORRIDA REAL DESTAPÓ

## 1. La identidad que CREA no es la que LEE

`google.mjs` usa `ownerToken()` para `createFile`, `copyFile`, `renameFile`, `moveFile` y `trashFile`
—porque la cuenta de servicio no tiene cuota de almacenamiento— y `accessToken()` para todo lo demás.

Con el cliente institucional (`googleDelOs()`, el service account), eso significa: **el archivo nace en
el Drive del dueño y el robot no lo ve**. La primera corrida de la prueba real murió exactamente ahí:

```
✖ la corrida murió: NOT_FOUND No existe el archivo 1sMABg5Yom83oEZK7TwQWU-3rnVF-iLIk.
```

El archivo existía. **Verificar una creación es imposible por construcción con ese cliente.** Ahora
sale como `VERIFY_FAILED` con el motivo escrito, y la prueba real se arma con la cuenta operadora —el
mismo patrón que ya usa `handlers/operation_execute.mjs` para ejecutar lo aprobado.

## 2. El listado crudo de una carpeta archivada no es determinístico

Dos corridas seguidas de `google.listFolder()` sobre la misma carpeta recién archivada devolvieron
**1 archivo** y **0 archivos**. Drive propaga la papelera a los descendientes de forma diferida y las
dos veces contesta 200 sin decir nada. Sobre esa respuesta no se puede afirmar «no hay archivos».

## 3. `ocurrido_en` no ordena un libro de auditoría

Dos filas escritas en la misma transacción reciben el **mismo** `now()` (es el instante del `begin`) y
quedan sin orden entre sí: en el ensayo, un `mover` y un `renombrar` del mismo pedido salieron al
revés. Por eso `orq.drive_audit` tiene `seq bigserial` y la historia se ordena por ahí.
