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
