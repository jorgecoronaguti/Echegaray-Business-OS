# Ficha del cliente v3 — arquitectura de información

**Fecha:** 10/09/2026 · **Origen:** dos iteraciones que el dueño rechazó («quiero que se vean las OC,
y adentro de cada cliente también, y en Documentos tienen que estar claras las OC y las OP
correspondientes. Rehacer» · «el diseño de las secciones de cada cliente tenés que replantearlo con
la habilidad de UX»).

Este documento decide QUÉ secciones tiene la ficha, en qué ORDEN y qué muestra cada una. El código
sigue a esto, no al revés.

---

## 1 · Las preguntas que se hacen al abrir un cliente

Ordenadas por frecuencia real, no por módulo:

| # | Pregunta | Dónde se contesta hoy | Dónde se contesta en v3 |
|---|---|---|---|
| 1 | ¿Qué le vendimos y por cuánto? | solapa Obras (contratado de OBRAS) | **Obras** — + la OC que lo encarga |
| 2 | ¿Con qué papel nos lo encargó? | en ningún lado de la ficha | **Obras** (columna OC) y **Documentos** |
| 3 | ¿Qué nos pagó y contra qué? | solapa Cuenta corriente (certificados) | **Obras** (columna OP) y **Documentos** |
| 4 | ¿Qué papeles hay de esta relación? | Documentos (113 archivos de Drive, planos) | **Documentos**, agrupados por tipo |
| 5 | ¿Cómo se le cobra? | Esquema de pago | igual |
| 6 | ¿Qué se movió? | Actividad | igual |
| 7 | ¿Qué le ofrecimos y no cerró? | Presupuestos | igual |
| 8 | ¿Quién de afuera puede mirar? | Acceso al portal | igual |

**El agujero medido** (Messina, 10/09/2026): la ficha tiene 44 papeles del cliente en
`public.cliente_orden` —12 OC, 12 OP, 12 certificados de retención, 8 facturas nuestras— y **ninguno
se ve desde la ficha**. Sólo asomaban como chips en `/clientes`, mezclando OC y OP en un mismo
rótulo. Las preguntas 2 y 3, que son las dos que se hacen al hablar con el cliente por teléfono, no
tenían respuesta adentro del cliente.

---

## 2 · Las secciones y su orden

**Obras · Presupuestos · Documentos · Actividad · Cuenta corriente · Esquema de pago · Acceso al
portal** — las mismas siete, sin agregar ninguna.

### 2.1 · No se agrega la solapa «Órdenes» (decisión)

El pedido ofrecía sumarla entre Obras y Presupuestos. **No se suma**, por tres razones medidas:

1. La barra ya tiene 7 elementos y es el **segundo nivel de navegación**; el contrato visual admite
   dos niveles simultáneos y ninguno de ellos puede convertirse en un menú que hay que leer entero.
   Un octavo elemento a 12,5px empuja «Acceso al portal» fuera del ancho útil a 1440px.
2. Una solapa «Órdenes» y una solapa «Documentos» mostrarían **los mismos 44 papeles**: la OC es un
   documento. Dos caras del mismo dato es exactamente el defecto que ya se pagó con la cara
   «Resumen» (repetía Obras + Presupuestos) y con `CarteraHome` (repetía `/clientes` con otra
   verdad).
3. La pregunta «¿qué le vendimos?» no se contesta con una tabla de órdenes: se contesta **por obra**.
   La OC pertenece al renglón de su obra, no a una lista paralela.

**Documentos pasa a ser la cara de los papeles**, agrupada por tipo con su cuenta, y su primer grupo
son las órdenes de compra. Su cuenta en la solapa deja de ser «113 archivos de Drive» y pasa a ser
todos los papeles del cliente (157 en Messina).

### 2.2 · Fusiones evaluadas y DESCARTADAS (por escrito, no en silencio)

| Fusión | Por qué se descarta |
|---|---|
| Presupuestos → dentro de Obras | Es exactamente la cara «Resumen» que se eliminó en el v2 por ser dos tablas apiladas con otro nombre. Revertir una decisión tomada necesita evidencia nueva, y no la hay. |
| Esquema de pago → dentro de Cuenta corriente | Son la misma pregunta en dos tiempos (lo que se va a cobrar / lo que se cobró), pero son **dos pantallas a sangre con panel propio** (mockups 28 y 32) y su fusión es un rediseño de las dos, no un movimiento de solapa. Queda anotado como el candidato #1 si el dueño quiere bajar de siete. |
| Acceso al portal → al costado | El costado ya lleva el resumen del portal y el verbo «Gestionar accesos →». Mover la administración entera ahí obliga a meter una tabla con acciones en una columna de 300px. Candidato #2. |

### 2.3 · Los números de cabecera

Hoy: **Obras · Contratado en curso · Contactos · Documentos**. Los dos últimos son conteos que ya se
publican donde viven (el costado dice cuántos contactos hay, la solapa dice cuántos documentos): un
dato dos veces.

v3: **Obras · Contratado en curso · OC recibidas · OP recibidas**.

- `Obras` — `obra_panel`, todas (activas + cerradas).
- `Contratado en curso` — `obra_economia_cartera` (la pestaña OBRAS), **sólo obras activas**. No
  cambia: es la misma fuente que `/clientes`, y dos pantallas del mismo maestro no pueden diferir.
- `OC recibidas` — `n · $` sumando las OC **únicas por número** de `cliente_orden`.
- `OP recibidas` — `n · $` sumando las OP únicas por número.

**Lo que NO se publica en la cabecera, y por qué:**

- **«Facturado» y «Cobrado»**: la fuente existe (`cliente_cuenta_corriente.facturado_90d` /
  `cobrado_90d`) pero su ventana son **90 días**, mientras que Contratado y OC son acumulados desde
  2024. Ponerlos en la misma línea invita a restarlos, y eso es mezclar ventanas incompatibles
  (regla de oro 3). Facturado y cobrado se leen en Cuenta corriente, con su ventana escrita.
- **«Pendiente» (contratado − cobrado)**: no tiene fuente. `Contratado en curso` cubre sólo las 5
  obras activas y las OP incluyen pagos de obras cerradas desde 2024: la resta no es un saldo, es un
  número inventado. El saldo real vive en `cliente_cuenta_corriente.saldo`, en su cara.
- **El rótulo dice «recibidas», no «cobradas»**: una orden de pago es la instrucción del cliente a
  su banco. Que el dinero entró lo prueba el extracto, no la OP. Decir «cobrado» acá sería una
  afirmación sobre la caja hecha desde un PDF de un tercero.

---

## 3 · Qué muestra cada cara en la primera pantalla

### 3.1 · Obras — el eje

`OBRA · ESTADO · AVANCE · CONTRATADO · OC · OP · MARGEN`.

- **OC** = total de las órdenes de compra de esa obra + su cantidad (`$90.750.000 · 2 OC`).
- **OP** = total de las órdenes de pago imputadas a esa obra + su cantidad.
- **Contratado sigue saliendo de OBRAS.** Si el total de OC difiere del contratado **no se marca
  error**: son dos fuentes distintas (la pestaña OBRAS y el PDF del cliente) y se ven las dos. El
  desacuerdo es información, no un defecto de la pantalla.
- **Salen «Costo MO» y «Costo mat.»** de esta tabla. Este archivo ya declaraba que la ficha del
  cliente es «la cara COMERCIAL de la relación» y que el costo vive en la obra; con las dos columnas
  de costo puestas, la tabla no tiene ancho para las dos que contestan la pregunta comercial. Margen
  se queda: es plata de venta.
- **Las obras cerradas se listan siempre**, en un grupo `Cerradas · N` debajo de las activas. Hoy
  están detrás de `?archivadas=1` y por eso «ME - BASES TANQUE SO2» —con su OC 1864, su OP 4865 y
  sus dos facturas— no aparecía. Una obra cerrada con papeles no es una obra archivada: es la
  historia de lo que se le vendió a este cliente.

### 3.2 · Documentos — los papeles por tipo

Grupos, en este orden, cada uno con su cuenta: **Órdenes de compra · Órdenes de pago · Certificados
de retención · Facturas emitidas · Documentos de Drive**.

Cada fila: tipo · número · fecha · obra · importe · enlace al archivo, más el vínculo que la explica:

- una OC dice qué facturas la citan;
- una OP dice a qué obra se imputa (o «varias obras») y qué certificado de retención le corresponde;
- un certificado se rotula **«Retención · OP 5156»**, nunca «Documento N° …». (Se rotula
  «Retención», no «Retención Ganancias»: el PDF dice «Comprobante de Retención», «O/P» y «Código de
  Régimen: 78», y no imprime el impuesto. Nombrar el tributo sin que el papel lo diga es fabricar
  un dato fiscal.)
- una factura nuestra dice qué OC cita. **No es una orden del cliente** y por eso tiene grupo
  propio: contarla como OC duplicaba lo vendido.

### 3.3 · Las demás caras no cambian en este trabajo

Presupuestos, Actividad, Cuenta corriente, Esquema de pago y Acceso al portal quedan como están. Lo
que cambia de ellas es que dejan de cargar con preguntas que no son suyas.

---

## 4 · Principios que gobiernan lo de arriba

- **Un dato, una vez.** El conteo de contactos vive en el costado; el de documentos, en su solapa.
  La cabecera publica lo que ninguna otra parte de la ficha publica.
- **La obra es el eje.** Todo papel del cliente cuelga de una obra; lo que no se pudo atribuir se
  muestra igual, agrupado como «sin obra», que es trabajo pendiente y no un hueco.
- **Nada se contradice con `/clientes` ni con la obra.** Las tres pantallas leen `cliente_orden` y
  `obra_economia_cartera`, y la agrupación la hace **una sola función pura**
  (`services/papelesCliente.ts`): si la lista y la ficha difirieran, sería un defecto de datos, no de
  dos implementaciones.
- **Less is more.** Ninguna solapa nueva, dos columnas menos en Obras, dos números de cabecera
  reemplazados por dos que no estaban.

## 5 · Lo que este diseño NO puede contestar todavía

- **Qué facturas paga cada OP.** `cliente_orden.cita` está lleno en las 8 facturas (citan su OC) y
  **vacío en las 12 OP** (medido el 10/09/2026 sobre la tabla entera: 0 de 12). El dato existe en el
  texto del PDF de la orden de pago, que hoy el extractor no lee. La pantalla dice «no consta», no
  adivina: emparejar por importe acertaría en 2 de 12 y sería una inferencia dibujada como hecho.
- **Cuánto retuvo cada certificado.** El PDF lo imprime («Importe retenido: 650000.00») pero la
  tabla guarda `importe = null` para los 12 certificados. Se dice «sin importe».
