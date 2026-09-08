# Pruebas de RLS contra un Postgres de verdad, antes de aplicar en la base real

Una policy no se puede revisar leyéndola. `for all` que tapa el `select`, un `with check` que deja
mudar la fila a otro dueño, una policy sin su `grant` —que Next muestra como un 404 y no como un
problema de permisos—: los tres se ven iguales en el diff y distintos al ejecutarlos.

Esto ejecuta la migración en un Postgres descartable, se hace pasar por cada rol y **aborta** si el
resultado no es el esperado. No toca la base real ni la necesita.

## `cliente_nota` — la nota manual del cliente

```bash
docker run -d --name pg-cliente-nota -e POSTGRES_PASSWORD=x -p 55471:5432 postgres:16-alpine
sleep 6

docker cp supabase/pruebas/cliente_nota_00_andamio.sql pg-cliente-nota:/tmp/00.sql
docker cp supabase/migrations/20260819T2000_la_nota_manual_del_cliente.sql pg-cliente-nota:/tmp/01.sql
docker cp supabase/pruebas/cliente_nota_02_rls.sql pg-cliente-nota:/tmp/02.sql

docker exec pg-cliente-nota psql -U postgres -q -v ON_ERROR_STOP=1 -f /tmp/00.sql   # andamio
docker exec pg-cliente-nota psql -U postgres -q -v ON_ERROR_STOP=1 -f /tmp/01.sql   # la migración
docker exec pg-cliente-nota psql -U postgres -q -v ON_ERROR_STOP=1 -f /tmp/02.sql   # las pruebas

docker rm -f pg-cliente-nota
```

Siete casos, y cada uno corta el script si falla:

1. Administración escribe y **la firma la pone la base** (`auth.uid()` por default), no el formulario.
2. Un jefe de obra **lee** la nota y **no puede escribirla**: consultar no es administrar.
3. Administración **no puede firmar con el id de otro** aunque lo mande a mano por la API.
4. Una nota en blanco la rechaza **el `check` de la base**, no sólo Zod en el borde.
5. El `update` y el `delete` sobre la nota **ajena** no tocan ni una fila.
6. `authenticated` tiene los cuatro **grants**. Una policy sin grant es `permission denied`, y Next
   lo muestra como un 404: la pantalla entera desaparece sin decir una palabra de permisos.
7. Borrar el cliente **se lleva sus notas** (`on delete cascade`).

El andamio (`_00_andamio.sql`) NO es el esquema de producción: es lo mínimo que la migración
necesita para poder ejecutarse (`auth.uid()`, `perfiles`, `clientes`, `es_administracion()`). Si la
migración empieza a depender de algo más, hay que agregarlo acá o la prueba deja de probar.

## `persona_nota` — las anotaciones de una persona

```bash
docker run -d --name pg-persona-nota -e POSTGRES_PASSWORD=x -p 55491:5432 postgres:16-alpine
sleep 6

docker cp supabase/pruebas/persona_nota_00_andamio.sql pg-persona-nota:/tmp/00.sql
docker cp supabase/migrations/20260908T1700_anotaciones_de_la_persona.sql pg-persona-nota:/tmp/01.sql
docker cp supabase/pruebas/persona_nota_02_rls.sql pg-persona-nota:/tmp/02.sql

docker exec pg-persona-nota psql -U postgres -q -v ON_ERROR_STOP=1 -f /tmp/00.sql   # andamio
docker exec pg-persona-nota psql -U postgres -q -v ON_ERROR_STOP=1 -f /tmp/01.sql   # la migración
docker exec pg-persona-nota psql -U postgres -q -v ON_ERROR_STOP=1 -f /tmp/02.sql   # las pruebas

docker rm -f pg-persona-nota
```

Ocho casos, y cada uno corta el script si falla:

1. Dirección anota y **la firma la pone la base** (`auth.uid()` por default), no el formulario.
2. El **jefe de obra lee y también anota**: es Administración desde el 19/08 y es quien ve trabajar
   a la gente.
3. El rol **`campo` no ve ninguna y no puede escribir**: es la ficha del EMPLEADOR sobre el empleado.
4. **Nadie firma con el id de otro**, ni aflojando una de las dos cerraduras (el grant de INSERT es
   sólo sobre `persona_id, texto`; el `with check` exige el propio uid).
5. Una anotación **en blanco** la rechaza el `check` de la base, no sólo Zod en el borde.
6. **Ni update ni delete, tampoco para el autor**: no hay policy ni grant. Para corregir se anota
   otra. Éste es el caso que se pone rojo si alguien "agrega la que faltaba".
7. Los **grants son exactamente dos**: `SELECT` de tabla e `INSERT (persona_id, texto)`.
8. Borrar la persona **se lleva sus anotaciones** (`on delete cascade`).

El andamio trae la `es_administracion()` VIGENTE —la que incluye a `jefe_obra`—, no la del andamio
de `cliente_nota`, que es de antes del 19/08. Con la vieja, el caso 2 acusaría al sistema de un
defecto que sólo tendría el andamio.

**Se verificó que estas pruebas PUEDEN dar rojo**: con `persona_nota_select` abierta a `using
(true)` —una mutación de un carácter sobre la migración— el caso 3 aborta con «FALLÓ: el rol campo
NO puede ver ninguna anotación».

## `registros_hh` — la ausencia sin obra

```bash
docker run -d --name pg-hh-ausencia -e POSTGRES_PASSWORD=x -p 55493:5432 postgres:16-alpine
sleep 7

docker cp supabase/pruebas/registros_hh_ausencia_00_andamio.sql pg-hh-ausencia:/tmp/00.sql
docker cp supabase/migrations/20260908T2000_ausencia_sin_obra.sql pg-hh-ausencia:/tmp/01.sql
docker cp supabase/pruebas/registros_hh_ausencia_02_rls.sql pg-hh-ausencia:/tmp/02.sql

docker exec pg-hh-ausencia psql -U postgres -q -v ON_ERROR_STOP=1 -f /tmp/00.sql   # andamio
docker exec pg-hh-ausencia psql -U postgres -q -v ON_ERROR_STOP=1 -f /tmp/01.sql   # la migración
docker exec pg-hh-ausencia psql -U postgres -q -v ON_ERROR_STOP=1 -f /tmp/02.sql   # las pruebas

docker rm -f pg-hh-ausencia
```

Diez casos, y cada uno corta el script si falla:

1. **Dirección declara una ausencia SIN obra** de cualquiera del plantel. Antes de la migración esa
   fila no entraba: `hh_insert_por_obra` exigía obra, y por eso el panel deducía una.
2. El **jefe de obra marca ausente a su gente**, también sin obra en la fila.
3. El jefe **no alcanza a quien no está asignado** a ninguna obra suya ese día. Es el caso que hace
   que la regla no sea una constante: `es_administracion()` incluye a `jefe_obra` y `ve_obra()` le
   da todas las obras, así que escribir la policy con cualquiera de las dos habría dejado al jefe
   marcando ausente a toda la empresa **con este script igual de verde**.
4. La cota mira la **fecha del registro**, no `current_date`: una ausencia se corrige días después.
5. Una fila `normal` **sin obra no entra por ninguna de las dos puertas** — la policy la rechaza
   como permiso y el `CHECK` la rechaza aunque la policy se afloje (ese caso corre sin RLS).
6. El rol **`campo` no escribe su propia ausencia, pero la lee**: sin obra la fila no queda
   invisible para su dueño, que es el agujero que describía `20260819T2900`.
7. Un `update` **no puede convertir la ausencia sin obra en trabajo** ni mudarla a una obra: el
   `with check` mira la fila nueva.
8. La fila **legacy sin obra y `normal` sigue existiendo**: el CHECK nace `not valid` porque en la
   base real hay 19 así (medido el 08/09/2026), y borrarlas sería perder historia.
9. **Quien declara la ausencia puede sacarla**: marcar ausente a alguien que sí vino tiene que ser
   corregible por quien lo marcó.
10. Los **grants no cambiaron**: `authenticated` conserva select/insert/update/delete de tabla y
    ninguno por columna.

**Se verificó que estas pruebas PUEDEN dar rojo**: reemplazando en `marca_ausencia_de()` el
`current_rol() in ('direccion','administracion')` por `es_administracion()` —un cambio que parece
inocente y que es el que estaba escrito en el pedido— el caso 3 aborta con «FALLÓ: el jefe pudo
marcar ausente a alguien sin asignación vigente».
