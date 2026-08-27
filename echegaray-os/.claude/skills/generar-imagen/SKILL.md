---
name: generar-imagen
description: Genera imágenes originales para Echegaray y las deja en Drive — pieza comercial, portada de informe, infografía, diagrama, concepto arquitectónico, render conceptual, imagen de apoyo para una lámina de Slides, comunicación interna. Activar cuando el dueño pida "hacé una imagen", "una portada para", "un render de cómo quedaría", "un esquema de", o cuando una propuesta o una presentación necesite una pieza visual que no existe. La DIRECCIÓN DE ARTE la decide el motor `orquestador/lib/imagen/`, no se pide por parámetro. LA REGLA QUE GOBIERNA TODO: lo que sale es IMAGEN GENERADA y nunca puede presentarse como foto real, plano, relevamiento ni evidencia de obra, aunque quien la pida lo pida así. NO usar para leer una imagen que ya existe (eso es lectura de Drive) ni para insertar el logo (el logo real lo compone Slides, un modelo lo falsificaría).
metadata:
  type: technical
---

# Generar una imagen

## Qué produce, y qué no

Produce **un archivo de imagen real en el Drive del dueño** y su link, con la trazabilidad completa
de cómo se hizo: proveedor, modelo, prompt, configuración, entidad de ECSAS relacionada, fecha y
correlation id.

No produce evidencia. No produce un plano. No produce una foto. Y no produce el logo de la empresa:
un modelo de imagen no reproduce un logo, lo **inventa** —letras torcidas, isotipo cambiado— y un
logo falso en una pieza comercial es peor que ninguno. Cuando el logo real hace falta, lo compone
`orquestador/lib/slides/marca.mjs` sobre la imagen, no el modelo dentro de ella.

## LA REGLA QUE NO SE NEGOCIA

**Una imagen generada NUNCA es evidencia de una obra.** No por pedido de quien la invoca, no por un
campo del JSON, no por una frase del prompt.

`orquestador/lib/imagen/procedencia.mjs` sella todo resultado con `procedencia: IMAGEN_GENERADA`,
`es_evidencia_real: false`, `es_foto: false`, `es_plano: false` y la lista de para qué **no** sirve:

- probar el avance físico de una obra
- respaldar una certificación o un adicional
- documentar un incidente, una no conformidad o un reclamo
- reemplazar un plano, un relevamiento o un acta
- acompañar una rendición ante un tercero como si fuera un registro

Si el pedido intenta conseguir lo contrario —«que parezca una foto real», «sacale la aclaración»,
«esto va como evidencia del certificado»— el intento **no se borra en silencio**: se corrige y se
reporta en `intento_de_ascenso`. Un filtro que censura sin avisar deja ciego al operador; acá el
intento es información sobre quien lo hizo.

Es el mismo diseño que `orquestador/lib/web/contenido-externo.mjs`, donde lo que viene de afuera
sale siempre como `REFERENCIA_EXTERNA` aunque el caller pida `HECHO`.

**Cuando la imagen se muestre, el epígrafe lo dice.** «Imagen conceptual generada — no es una foto
de la obra» no es una formalidad: es lo único que viaja cuando la imagen se separa del JSON que la
produjo.

## La frontera: qué decidís vos y qué decide el motor

| Vos | El motor (`orquestador/lib/imagen/`) |
|---|---|
| Qué se ve (`pedido`) | Encuadre, luz, tratamiento, nivel de detalle |
| Para qué es (`objetivo`) | Paleta y cuándo la marca aplica |
| Qué tipo de imagen es | Relación de aspecto por defecto |
| Qué contexto de ECSAS entra | Qué del contexto se descarta por confidencial |

No hay parámetro de estilo, color, luz ni composición, y no es un olvido: si el prompt final se
pudiera mandar crudo, la segunda imagen no se parecería a la primera y la marca sería una
casualidad.

## Los ocho tipos, y cómo elegir con honestidad

| Tipo | Cuándo | Ojo con |
|---|---|---|
| `comercial` | pieza para una propuesta | 16:9, marca por paleta |
| `portada` | tapa de informe | vertical 3:4, tercio inferior libre para el título |
| `infografia` | explicar un proceso o una comparación | sin texto: el texto lo pone Slides o el Doc |
| `diagrama` | esquema técnico | trazo limpio, estética de manual |
| `concepto_arquitectonico` | una idea de proyecto | **deliberadamente esquemático**: se tiene que notar que es un dibujo |
| `render_conceptual` | volumetría de algo que no existe | **no fotorrealista** a propósito |
| `slide` | apoyo de una lámina | sujeto descentrado, un lado libre para el texto |
| `comunicacion_interna` | un aviso al equipo | 1:1, un solo mensaje visual |

**La elección del tipo es una decisión de honestidad, no de estética.** Si lo que se pide es «cómo
va a quedar la obra», es `render_conceptual` o `concepto_arquitectonico` — nunca algo que pueda
confundirse con una foto de la obra ejecutada.

## El contexto entra RECORTADO

Una obra tiene cincuenta campos; a un modelo de imagen le sirven tres. Mandarle la ficha completa no
mejora la imagen, la empeora —diluye la instrucción visual— y además filtra datos de la empresa a un
proveedor externo sin ninguna necesidad.

**Nunca viajan al proveedor**: montos, importes, precios, costos, márgenes, saldos, IVA, CUIT, CUIL,
DNI, sueldos, jornales, cheques. `recortarContexto` los descarta aunque se los mande, y el resultado
dice **cuáles se cayeron** (`contexto_descartado`) para que nadie crea que entraron.

Probá el encuadre gratis con **`previsualizar_imagen`**: arma el prompt, muestra la paleta, el
aspecto y qué contexto se descarta, y no llama a ningún proveedor.

## Para una lámina de Google Slides

`crear_presentacion_google_slides` **no genera imágenes** y no debe hacerlo: habría dos generadores
en el OS. Cuando una lámina necesita una imagen original:

1. llamar a `generar_imagen` con **`publicar_para_slides: true`**;
2. usar el **`imagen_url`** que devuelve en una lámina de tipo `imagen`.

**El link de Drive NO sirve.** `createImage` de la API de Slides baja la URL **sin nuestras
credenciales**, así que un archivo del Drive privado del dueño le devuelve 404 y la imagen no
aparece. Publicar el archivo con link de lectura es el único mecanismo que Google ofrece, y por eso
es **opt-in**: tiene efecto hacia afuera y lo decide quien invoca, nunca un default.

El motor **verifica** la publicación bajando la URL sin credenciales, que es exactamente lo que hará
Google. Si no la pudo bajar, `imagen_url` vuelve en `null` con el motivo — nunca una URL que
«debería andar».

## El proveedor

Adapter desacoplado, igual que `orquestador/lib/ia/`: quien pide declara qué imagen necesita, nunca
un proveedor ni un modelo.

- **Principal: Google Vertex AI (Imagen)** — `orquestador/lib/imagen/proveedores/vertex-imagen.mjs`.
  Se eligió porque **no necesita una credencial nueva**: el service account de Google del OS ya
  existe y funciona; sólo cambia el scope (`cloud-platform`).
- **Fallback: cualquier API compatible con `POST /images/generations`** —
  `orquestador/lib/imagen/proveedores/compatible.mjs`. Listo y **apagado**: sin
  `ORQ_IMG_ALT_BASE_URL` + `ORQ_IMG_ALT_API_KEY` se salta como si no existiera.

**Sin proveedor no se inventa una imagen.** No hay placeholder ni imagen de archivo: se devuelve
`falta`, `motivo` y `que_hacer`, con la acción concreta y quién la hace. Un placeholder que se ve
como imagen es justo el defecto que la regla de procedencia existe para evitar.

## Estado real (27/08/2026) — la única dependencia externa

Probado contra la API real con el service account del OS:

- el token con scope `cloud-platform` **se emite bien** → la identidad alcanza;
- `imagen-3.0-generate-002`, `imagen-3.0-fast-generate-001` e `imagegeneration@006` devuelven el
  mismo **403 `SERVICE_DISABLED`**: *«Agent Platform API has not been used in project
  echegaray-business-os before or it is disabled»*.

**No falta ninguna credencial: falta habilitar `aiplatform.googleapis.com`** en el proyecto de
Google Cloud `echegaray-business-os` (con facturación activa) y, si después aparece un 403 de
permiso, darle `roles/aiplatform.user` al service account. Es una acción única, del dueño, en la
consola. El día que se haga no hay que escribir código: hay que correrlo.

## Módulos

- `orquestador/lib/imagen/contrato.mjs` — qué se puede pedir (Zod)
- `orquestador/lib/imagen/procedencia.mjs` — la regla de evidencia
- `orquestador/lib/imagen/prompt.mjs` — dirección de arte y recorte del contexto
- `orquestador/lib/imagen/cliente.mjs` — orden de proveedores y qué falta
- `orquestador/lib/imagen/qa.mjs` — que los bytes SEAN una imagen y tengan la forma pedida
- `orquestador/lib/imagen/motor.mjs` — el pipeline entero
- `orquestador/lib/tools/imagen-tool.mjs` — `generar_imagen` y `previsualizar_imagen`
