# TICKET · `authenticated` puede vaciar 176 de las 185 tablas

**Estado:** CORREGIDO Y APLICADO en la base productiva el 2026-08-31 · **falta la firma de quien no
lo construyó.** Área: plataforma / seguridad de la base. Se resolvió fuera del programa de
cotización, como §24 lo pedía.

Migración: `supabase/migrations/20260901T0600_ningun_rol_de_aplicacion_puede_vaciar_una_tabla.sql`
Test: `orquestador/lib/permiso-destructivo.pg.test.mjs`
Inventario reproducible: `orquestador/scripts/inventario-privilegios.mjs`
Evidencia: `docs/engineering/evidencia/privilegios-{ANTES,DESPUES}.json` y
`docs/engineering/evidencia/truncate-ANTES-el-ataque-funciono.txt`

---

## El hecho, medido

```sql
select count(*) filter (where has_table_privilege('authenticated', c.oid, 'TRUNCATE')) as truncate_si,
       count(*) as total
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r';
```

Cualquiera que tenga una sesión autenticada —cualquier usuario del OS, con cualquier rol de negocio—
puede ejecutar `truncate public.<tabla>` y vaciarla.

## El número no es fijo, y ahí está lo peor

| momento | truncables / total |
|---|---|
| al abrir el programa (2026-08-30) | **176 / 185** |
| una hora después, tras crear 11 tablas nuevas | **187 / 196** |

Las once tablas creadas en esa hora —las de precios, genealogía de obra y decisiones de Base
Maestra— **nacieron todas truncables**, sin que ninguna migración lo pidiera. Es el mismo patrón que
ya mordió con los `GRANT` por columna: el permiso no está puesto tabla por tabla, está en los
`default privileges`, así que **cada tabla nueva lo hereda al nacer**.

Por eso citar un número absoluto es engañoso: crece solo. Lo que hay que arreglar no son 187 tablas,
es la regla que las fabrica así.

Entre las alcanzadas están las que el sistema trata como inmutables por diseño —`cotizacion_evento`,
`cotizacion_override_precio`, el log de decisiones de Base Maestra—: tablas cuyas policies prohíben
`update` y `delete` y que, sin embargo, se pueden **vaciar enteras**.

## Por qué RLS no protege

**`TRUNCATE` no pasa por RLS.** Las policies filtran filas en `select`, `insert`, `update` y
`delete`; `truncate` es una operación de tabla, no de filas, y las ignora por completo. Todo el
trabajo de porteros por fila que gobierna quién ve qué obra, qué sueldo y qué cliente **no interviene
acá**: el permiso se decide únicamente por el `GRANT`, y el `GRANT` está dado.

Tampoco deja rastro fila por fila ni dispara los triggers de auditoría por fila. Una tabla vaciada
así no se reconstruye desde el propio sistema.

---

## LO QUE EL TICKET NO HABÍA VISTO (medido el 2026-08-31)

El ticket contó un privilegio y un rol. Eran cuatro privilegios y dos roles.

| privilegio sobre las 196 tablas de `public` | `anon` | `authenticated` |
|---|---|---|
| TRUNCATE | **194** | 187 |
| REFERENCES | **194** | **194** |
| TRIGGER | **194** | **194** |
| MAINTAIN | **194** | **194** |

Dos correcciones al ticket original:

1. **`anon` estaba PEOR que `authenticated`**, no mejor. `anon` es el rol de la clave pública que
   viaja en el navegador. No tiene `select` sobre nada (salvo `os_runtime`) ni `insert` sobre nada,
   pero podía vaciar 194 tablas.
2. **`TRIGGER` es tan grave como `TRUNCATE`.** No pueden escribir una función —`public` no concede
   `CREATE` a `anon` ni a `authenticated`, y eso se probó— pero sí **enganchar una de las 33
   funciones `SECURITY DEFINER` que ya existen**, que corren con los permisos de su dueño.
   `MAINTAIN` permite `CLUSTER`/`REINDEX`: no borra un dato, toma el lock exclusivo de la tabla y
   deja la pantalla colgada, que en horario de obra es lo mismo.

**La causa exacta**, que no estaba en ninguna tabla sino en `pg_default_acl` del rol que corre las
migraciones:

```
postgres crea en public → {postgres=arwdDxtm/postgres, anon=Dxtm/postgres,
                           authenticated=Dxtm/postgres, service_role=arwdDxtm/postgres}
```

`Dxtm` = TRUNCATE, REFERENCES, TRIGGER, MAINTAIN. Alguien ya había revocado del default los cuatro
que importan para leer y escribir (`a r w d`) y había dejado puestos los cuatro que sirven para
romper.

## La corrección

```sql
revoke truncate, references, trigger, maintain on all tables in schema public from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke truncate, references, trigger, maintain on tables from anon, authenticated;
```

`service_role` conserva los cuatro: es el backend autorizado, su clave no sale del servidor y
limpiar tablas es parte de su trabajo. `select/insert/update/delete` no se tocaron: los conteos de
antes y después son idénticos (183 / 92 / 81 / 75).

## La evidencia del efecto

Ejecutando el ataque, no leyendo el SQL. Asumiendo el rol por el mismo camino que usa PostgREST
(`set local role authenticated` sobre un JWT real de dirección):

```
ANTES:    Missing expected rejection: authenticated pudo truncar public.certificado_cliente

DESPUÉS:  public.certificado_cliente  → SQLSTATE 42501 · permission denied for table certificado_cliente
          public.cotizacion_evento    → SQLSTATE 42501 · permission denied for table cotizacion_evento
          public.cobranzas            → SQLSTATE 42501 · permission denied for table cobranzas
          CREATE TRIGGER              → SQLSTATE 42501 · permission denied for table certificado_cliente
          CLUSTER (MAINTAIN)          → SQLSTATE 42501 · permission denied for table certificado_cliente
          DROP TABLE                  → SQLSTATE 42501 · must be owner of table certificado_cliente
          ALTER TABLE ADD COLUMN      → SQLSTATE 42501 · must be owner of table certificado_cliente
          ALTER TABLE OWNER TO        → SQLSTATE 42501 · must be owner of table certificado_cliente
          DISABLE ROW LEVEL SECURITY  → SQLSTATE 42501 · must be owner of table cotizaciones
          CREATE TABLE en public      → SQLSTATE 42501 · permission denied for schema public
          GRANT truncate a sí mismo   → WARNING «no privileges were granted»; el privilegio sigue
                                        en false y el truncate posterior sigue dando 42501
```

Y la operación normal, con ese mismo rol y en la misma sesión, sigue viva:

```
SELECT 2 filas · INSERT id=7ff0dec5-… numero=ZZ-SEC-1788174767071 · UPDATE → ZZ2
auditar-permiso-economico.mjs → 0 fuga(s) de plata · 0 ceguera(s) operativa(s)
```

Tabla creada **después** de la corrección: nace con
`{postgres=arwdDxtm/postgres,service_role=arwdDxtm/postgres}` — ningún privilegio para `anon` ni
`authenticated` — y el truncate contra ella da `42501`.

---

## LO QUE QUEDÓ ABIERTO — no está resuelto por estar escrito acá

1. **`supabase_admin` sigue teniendo su propio default privilege sobre `public`**, y ése sí reparte
   `arwdDxtm` a `anon` y `authenticated`. `postgres` **no puede tocarlo**: se intentó y devolvió
   `SQLSTATE 42501 · permission denied to change default privileges`. Sólo alcanza a las tablas que
   cree `supabase_admin` en `public`; hoy las 196 son de `postgres` y las migraciones corren como
   `postgres`, así que no muerde. Muerde el día que la plataforma cree una tabla en `public`. El
   test lo detectaría (censa por `has_table_privilege`, no por el creador). Requiere pedirlo al
   soporte de Supabase o correrlo desde el rol `supabase_admin`.
2. **33 funciones `SECURITY DEFINER` ejecutables por `authenticated` y 18 por `anon`.** Una función
   así corre con los permisos de su dueño: es la vía por la que un privilegio revocado puede volver
   a entrar por la ventana. No se auditó ninguna. Es otro frente.
3. ~~5 tablas legibles por `authenticated` sin RLS.~~ **CERRADO** — ver la sección de abajo.
4. **Los esquemas de la plataforma Supabase** (`auth`, `storage`, `realtime`, `vault`, `cron`,
   `graphql*`) quedaron deliberadamente fuera de la medición y de la corrección: los administra
   `supabase_admin` y tocarlos rompe el producto sin que podamos repararlo.
5. **La verificación es de la base, no de la app corriendo.** No se levantó el front ni se pasó un
   E2E: lo que se probó es que el rol `authenticated` lee y escribe lo que la policy le permite y
   que el auditor de permiso económico sigue dando 0 fugas.

---

# SEGUNDO HALLAZGO · las fotos del Sheet las leía todo el plantel

**Estado:** CORREGIDO Y APLICADO el 2026-08-31 · falta la misma firma.
Migración `20260901T0620_las_fotos_del_sheet_no_las_lee_todo_el_plantel.sql` ·
test `orquestador/lib/snapshot-del-sheet-no-es-publico.pg.test.mjs`.

No estaba en el ticket original. Lo destapó medir el esquema `orq`, que nadie había mirado porque
toda la atención estaba en `public`. Cinco tablas con `relrowsecurity = false`, cero policies y
`select` concedido a `authenticated`. Asumiendo el rol, **antes**:

```
orq.sheet_snapshots  → 2397 filas    50 MB · las fotos del 'Flujo de Caja - Cash Flow':
                                     caja, jornales y margen por obra, celda por celda
orq.chat_result      →  414 filas   584 kB · las respuestas del chat, que también llevan plata
orq.chat_cost        →  493 filas   256 kB
orq.chat_request     →  105 filas   152 kB
orq.chat_cache       →   21 filas   136 kB
```

Un jefe de obra al que `subcontrato_costo` le esconde el precio de un paquete tenía la caja completa
de la empresa a un `select` de distancia.

## Quién las lee de verdad — buscado antes de tocar, no después

- **Cero referencias en `src/`.** Ninguna pantalla las lee.
- Los 10 lectores reales viven en `orquestador/` y llegan por `query()` de `lib/db.mjs`, que conecta
  con `DATABASE_URL`: rol `postgres`, dueño del esquema y con `BYPASSRLS`. Varios lo hacen con
  `await import('./db.mjs')` dinámico, por eso no aparecen en un grep de imports estáticos.
- `orq` **no** está expuesto por PostgREST (`supabase/config.toml`: `schemas = ["public",
  "graphql_public"]`). Es un atenuante, no una defensa: está a una línea de configuración de dejar
  de serlo, y el grant seguía puesto.

## La corrección, copiando el idioma que el esquema ya tenía

Las otras 19 tablas de `orq` ya tenían RLS. `orq.google_tokens` y `orq.xsas_requests` —las
sensibles— usan **RLS encendida con policy sólo para `service_role`**, sin policy para
`authenticated`: cero filas. Estas cinco nunca lo recibieron. Se les puso ese mismo portero, más el
`revoke select`, porque las dos capas fallan distinto: la RLS devuelve **cero filas** (silencioso,
se confunde con «no hay datos») y el REVOKE devuelve **permission denied**, que se ve en el log.

Y la regla que las fabricaba: `20260711120000_orq_fundacion_work_fabric.sql` había dejado
`alter default privileges in schema orq grant select on tables to authenticated`. Misma clase de
defecto que el TRUNCATE. El default de `orq` ahora es `{service_role=arwd/postgres}`: una tabla
nueva nace privada y la que necesite lectura la pide explícitamente, que es lo que uno quiere leer
en un diff.

## La evidencia del efecto

```
DESPUÉS · como authenticated
  orq.sheet_snapshots  → SQLSTATE 42501 · permission denied for table sheet_snapshots
  orq.chat_result      → SQLSTATE 42501 · permission denied for table chat_result
  orq.chat_cost        → SQLSTATE 42501 · permission denied for table chat_cost
  orq.chat_request     → SQLSTATE 42501 · permission denied for table chat_request
  orq.chat_cache       → SQLSTATE 42501 · permission denied for table chat_cache
  orq.tasks            → devolvió 177 fila(s)     ← lectura deliberada, intacta
  orq.events           → devolvió 1120 fila(s)    ← lectura deliberada, intacta

DESPUÉS · como service_role      orq.sheet_snapshots → 2397 fila(s)
DESPUÉS · como postgres (worker) orq.sheet_snapshots → 2397 fila(s)
```

Delta calculado sobre los JSON de evidencia, no estimado: `authenticated` perdió `SELECT` sobre
**exactamente esas cinco** y ninguna otra; ninguna tabla preexistente ganó nada.

## Lo que este segundo arreglo NO cubre

- **Las otras 17 tablas de `orq` legibles por `authenticated`** (`agents`, `capabilities`,
  `model_routes`, `tenants`, `projects`…) tienen policy de lectura deliberada `using (true)`. Son
  configuración del Work Fabric, no plata, y no se auditó si toda esa configuración debería ser
  pública para el plantel. Queda dicho, no resuelto.
- El `revoke` es sobre el grant de tabla, no por columna: si mañana una pantalla necesita leer una
  de las cinco, hay que darle un portero, no devolverle el `select` entero.
