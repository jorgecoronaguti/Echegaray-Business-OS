-- EL FAJO QUE GOOGLE DEJÓ SIN CARGAR ESPERA EN LA BASE, NO SE TIRA (15/09/2026).
--
-- A las 14:44 el dueño mandó 8 fotos de comprobantes. La visión leyó las 8, el fajo se armó, y el
-- cargador murió con un HTTP 504 de Google Sheets al leer los rótulos de Compras — antes de escribir
-- nada. El bot contestó «Terminé, pero no cargué ninguno de los 8» y las ocho lecturas se perdieron.
--
-- `comunicacion.comprobante_fajos` ya guarda los ítems leídos (jsonb). Lo que faltaba era un ESTADO
-- para «leído, sin escribir, esperando a Google» y el reloj del reintento. No se crea una segunda
-- tabla: el fajo es uno solo, y un `fajo_pendiente` aparte sería una segunda verdad del mismo fajo.
--
-- ADITIVA. El código anda antes y después: sin esta migración, `programarReintento` falla por el
-- check y `escribirFajo` cae al camino viejo (reabrir el fajo con su error).
--
-- SIN RLS Y SIN UN SOLO GRANT, igual que todo el schema `comunicacion` (ver
-- `20260803120000_comprobantes_por_chat.sql`): no está expuesto a PostgREST ni a `anon`/
-- `authenticated`, se accede sólo desde el worker por DATABASE_URL. Las dos columnas nuevas nacen
-- con los mismos permisos que la tabla: ninguno para la web.

alter table comunicacion.comprobante_fajos
  add column if not exists intentos           integer not null default 0,
  add column if not exists proximo_intento_at timestamptz;

-- EL CHECK DE `estado` SE REEMPLAZA POR EL MISMO MÁS `reintento`. El nombre no se supone: se busca
-- en el catálogo cualquier check de la tabla que mencione `estado` y se lo deja caer. Un
-- `drop constraint if exists comprobante_fajos_estado_check` a secas pasaría en silencio si el
-- constraint se llamara distinto —y entonces esta migración diría OK y el estado nuevo seguiría
-- prohibido, que es exactamente el tipo de verde falso que este repo ya pagó—.
do $$
declare c record;
begin
  for c in
    select con.conname
      from pg_constraint con
      join pg_class cl on cl.oid = con.conrelid
      join pg_namespace ns on ns.oid = cl.relnamespace
     where ns.nspname = 'comunicacion' and cl.relname = 'comprobante_fajos'
       and con.contype = 'c' and pg_get_constraintdef(con.oid) ilike '%estado%'
  loop
    execute format('alter table comunicacion.comprobante_fajos drop constraint %I', c.conname);
  end loop;
end $$;

alter table comunicacion.comprobante_fajos add constraint comprobante_fajos_estado_check
  check (estado in ('abierto','confirmado','cargado','encolado','descartado','error','reintento'));

-- El barrido del worker pregunta cada minuto «¿a quién le llegó el turno?». Parcial sobre el estado:
-- casi nunca hay más de un puñado de filas ahí, y el índice no le cuesta nada al resto de la tabla.
create index if not exists comprobante_fajos_reintento_idx
  on comunicacion.comprobante_fajos (proximo_intento_at)
  where estado = 'reintento';

comment on column comunicacion.comprobante_fajos.intentos is
  'Cuántas veces se corrió el cargador para este fajo y Google no contestó antes de escribir (5xx/429/red en fase lectura). El primero es en línea; los demás, desde el worker de comunicación.';
comment on column comunicacion.comprobante_fajos.proximo_intento_at is
  'Cuándo vuelve a intentarse un fajo en estado reintento: 1, 2, 4, 8, 16, 30, 30… minutos después de cada fallo. NULL fuera de ese estado.';
