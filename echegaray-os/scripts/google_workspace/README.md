# Cuenta de servicio para Sheets, Docs y Drive

Esta carpeta le da a Claude la capacidad real de leer y **agregar** contenido
(nunca sobrescribir) en Sheets y Docs específicos que Echegaray comparta
explícitamente. Es más acotado que el conector de Gmail/Drive de claude.ai:
solo puede tocar los archivos puntuales que se compartan con esta cuenta de
servicio, nada más del Drive.

## Regla de seguridad (no negociable)

Los scripts de esta carpeta **nunca sobrescriben una celda o texto existente**
-- solo agregan filas nuevas, pestañas nuevas, o texto al final de un
documento. Si algún día hace falta editar una celda puntual con fórmula, eso
se agrega como una función nueva y explícita, revisada antes de usarse -- no
se generaliza un "sobrescribir cualquier rango" por comodidad.

## Incidente real: sobrescritura accidental (2026-07-09)

Al agregar un panel nuevo dentro de una pestaña que YA tenía contenido disperso
más abajo (RESUMEN de Cash Flow, fila 44), escribir en una fila que se asumía
"vacía" pisó datos reales (`Caja` / `$14.000.000` / `$-1.300.000`) sin haberlo
verificado antes. Se detectó por el valor sobrante en una columna no escrita,
se restauró leyendo la revisión anterior del archivo vía
`drive.revisions().get(fileId, revisionId, fields='exportLinks')` +
descarga del export xlsx de esa revisión puntual (Drive guarda historial real,
no hace falta pedírselo al dueño del archivo).

**Regla nueva, no negociable**: antes de escribir en cualquier rango que no sea
"agregar fila al final" (ej. un bloque nuevo en medio de una pestaña grande),
primero LEER ese rango exacto y confirmar que está 100% vacío. Nunca asumir
vacío por estar "lejos" del contenido conocido -- estas pestañas tienen
contenido disperso en filas/columnas no evidentes a simple vista.

## Trampa de locale al escribir fórmulas (2026-07-09)

Los Sheets reales de Echegaray usan **configuración regional en español/Argentina**:
el separador de argumentos de fórmula es **`;` (punto y coma), no `,`**. Cualquier
fórmula escrita con comas (`=FILTER(A:A,B:B="x")`) falla con "Formula parse error"
aunque la sintaxis sea válida en inglés. Siempre escribir `;` al generar fórmulas
por API en estos archivos, y verificar con `spreadsheets().get(...,
fields='sheets.data.rowData.values.effectiveValue')` que no haya quedado un
`errorValue` antes de dar por buena una escritura.

## Paso 1 -- Crear el proyecto y la cuenta de servicio (lo hacés vos, una sola vez)

1. Andá a [console.cloud.google.com](https://console.cloud.google.com) con tu cuenta de Google (la personal o la de `ecsas.com.ar`, cualquiera sirve).
2. **Crear proyecto** → nombre sugerido: `echegaray-business-os`.
3. En el buscador de arriba, activá estas 3 APIs (una por una, botón "Habilitar"):
   - **Google Sheets API**
   - **Google Docs API**
   - **Google Drive API**
4. Andá a **IAM y administración → Cuentas de servicio → Crear cuenta de servicio**.
   - Nombre: `echegaray-os-workspace`.
   - No hace falta darle ningún rol de proyecto (Skip/Listo directo) -- el acceso real se lo van a dar compartiendo cada archivo con ella, no con permisos de Google Cloud.
5. Entrá a la cuenta de servicio recién creada → pestaña **Claves** → **Agregar clave → Crear clave nueva → JSON**. Se descarga un archivo `.json`.
6. Copiá ese archivo a: `scripts/google_workspace/credentials/service-account.json` (esta carpeta ya está en `.gitignore`, nunca se sube a GitHub).
7. Copiá el **email** de la cuenta de servicio (algo como `echegaray-os-workspace@echegaray-business-os.iam.gserviceaccount.com`) -- lo necesitás para el paso 2.

## Paso 2 -- Compartir cada archivo real (lo hacés vos o Rodrigo, por archivo)

Para cada Sheet/Doc que querés que yo pueda leer o completar (Control de
Gastos, Flujo de Caja, Ingresos y Egresos - P&L, JORNALES, Avances de Obra,
etc.): abrilo → botón **Compartir** → pegá el email de la cuenta de servicio
→ dale **Editor** (si querés que también pueda agregar filas) o **Lector**
(si solo querés que lo lea) → Enviar.

Si un archivo no está compartido, `drive.py` no lo va a ver -- es la forma de
confirmar que el paso 2 quedó bien hecho.

## Instalación de dependencias (esto sí lo hago yo)

```bash
pip install google-api-python-client google-auth
```

## Uso

```bash
# Confirmar qué archivos ya están compartidos con la cuenta de servicio
python3 drive.py

# Leer un rango de un Sheet
python3 sheets.py leer <spreadsheet_id> "Hoja1!A1:D10"

# Agregar una fila al final de una hoja
python3 sheets.py agregar-fila <spreadsheet_id> "Hoja1" valor1 valor2 valor3

# Crear una pestaña nueva sin tocar las existentes
python3 sheets.py crear-pestana <spreadsheet_id> "Nombre de la pestaña"

# Leer un Doc completo
python3 docs.py leer <document_id>

# Agregar texto al final de un Doc
python3 docs.py agregar-texto <document_id> "texto a agregar"
```

`spreadsheet_id`/`document_id` es el ID que aparece en la URL de Drive
(la parte entre `/d/` y `/edit`).
