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
3. **5 tablas legibles por `authenticated` sin RLS**: `orq.chat_cache`, `orq.chat_cost`,
   `orq.chat_request`, `orq.chat_result`, `orq.sheet_snapshots`. Las encontró el inventario nuevo.
   Contienen tráfico de chat y snapshots del Sheet. No se tocaron: ponerles RLS puede romper el
   worker y es una decisión propia.
4. **Los esquemas de la plataforma Supabase** (`auth`, `storage`, `realtime`, `vault`, `cron`,
   `graphql*`) quedaron deliberadamente fuera de la medición y de la corrección: los administra
   `supabase_admin` y tocarlos rompe el producto sin que podamos repararlo.
5. **La verificación es de la base, no de la app corriendo.** No se levantó el front ni se pasó un
   E2E: lo que se probó es que el rol `authenticated` lee y escribe lo que la policy le permite y
   que el auditor de permiso económico sigue dando 0 fugas.
