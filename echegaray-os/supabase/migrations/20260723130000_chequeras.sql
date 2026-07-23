-- EL PADRÓN DE CHEQUERAS — PARA SABER QUÉ CHEQUE FÍSICO FALTA ANTES DE QUE LO COBREN.
--
-- POR QUÉ (23/07). Aparecieron dos CPD firmados y SIN beneficiario (Nº 327 y 328, $1.000.000 cada
-- uno): al portador de hecho, los cobra quien los tenga. La skill lectura-cheques-imagen declaró el
-- gap que hace ciego al OS ante esto: la correlatividad de una chequera se controla contra lo que ya
-- está cargado en 'Cheques Emitidos', no contra un PADRÓN de chequeras entregadas por el banco. Sin
-- padrón, si desaparece un cheque de una chequera que todavía no se terminó de usar, nadie se entera
-- hasta que lo cobran.
--
-- QUÉ ES ESTA TABLA (y qué NO es). Es el registro de las CHEQUERAS físicas de la empresa: su
-- identificador impreso, la cuenta, el tipo (común / pago diferido) y — cuando se conoce — el rango
-- de numeración que abarca. NO copia los números de cheque usados: esos viven en 'Cheques Emitidos'
-- (columna Nro), que es la única fuente de "qué número se usó". Fuente única: el padrón aporta el
-- MARCO (qué chequeras hay y qué rango cubren); el registro aporta el HECHO (qué números se libraron);
-- la capacidad chequeras.mjs los cruza y devuelve los huecos. Duplicar los números acá sería crear una
-- segunda verdad que se desincroniza.
--
-- POR QUÉ EN POSTGRES Y NO EN UNA PESTAÑA. Es dato de referencia estructurado, nuevo, que hoy no
-- existe en ningún lado del OS (ni en el Sheet, ni en la base). Lo consume una capacidad
-- determinística, no una persona que lo edita a mano cada día; y por regla del proyecto toda tabla
-- nueva del OS lleva RLS. Una pestaña más en el Cash Flow sería una pantalla para descifrar, no un
-- sistema.
--
-- LO QUE NO SE SABE, SE DECLARA. Una chequera argentina suele traer 25 o 50 cheques, pero eso NO se
-- verificó para estas dos: el rango real está DESCONOCIDO. No se inventa. El rango se puede INFERIR
-- después de los números usados de la serie (lo hace la capacidad, y lo etiqueta como inferido) — la
-- tabla guarda sólo lo que se leyó de verdad de las fotos.

create table if not exists public.chequeras (
  id             bigserial primary key,
  -- Identificador impreso de la chequera (p.ej. 'H17 C-VI/26'). Es la clave natural del padrón.
  identificador  text        not null,
  banco          text,
  cuenta         text        not null default '179-091383/6',
  cuit_librador  text        not null default '30716304643',
  -- 'COMUN' = cheque común (a la vista) · 'CPD' = cheque de pago diferido. Numeraciones DISTINTAS: un
  -- común y un CPD pueden tener el mismo número y ser cheques distintos. No se mezclan en un rango.
  tipo           text        not null check (tipo in ('COMUN', 'CPD')),
  -- Rango de numeración de la chequera. NULL = DESCONOCIDO (no leído de la chequera). Cuando se
  -- conoce, es el número impreso SIN ceros a la izquierda (00000327 -> 327), igual que 'Cheques
  -- Emitidos'.
  numero_desde   integer,
  numero_hasta   integer,
  -- De dónde sale el rango de arriba: 'REAL' (leído de la chequera/banco), 'INFERIDO' (deducido de los
  -- números usados, con margen de error) o 'DESCONOCIDO' (no hay dato). Nunca un rango sin etiqueta.
  rango_confianza text       not null default 'DESCONOCIDO'
                   check (rango_confianza in ('REAL', 'INFERIDO', 'DESCONOCIDO')),
  -- Números CONCRETOS vistos de esta chequera (foto o evidencia directa). Son ANCLAS de verdad, no el
  -- registro entero: sirven para atar la chequera a la serie y para inferir su rango. P.ej. la común
  -- H14 sólo tiene visto el 62 (en blanco) y no figura en el registro.
  numeros_conocidos integer[] not null default '{}',
  estado         text        not null default 'DESCONOCIDO'
                   check (estado in ('ACTIVA', 'SIN_USAR', 'AGOTADA', 'ANULADA', 'DESCONOCIDO')),
  observacion    text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- Una chequera por identificador+cuenta. Recargar el seed no duplica.
create unique index if not exists chequeras_unica
  on public.chequeras (identificador, cuenta);

-- Coherencia del rango cuando existe: desde <= hasta. No obliga a completarlo (NULL permitido).
alter table public.chequeras drop constraint if exists chequeras_rango_coherente;
alter table public.chequeras add constraint chequeras_rango_coherente
  check (numero_desde is null or numero_hasta is null or numero_desde <= numero_hasta);

alter table public.chequeras enable row level security;

drop policy if exists chequeras_lectura on public.chequeras;
create policy chequeras_lectura on public.chequeras
  for select using (auth.role() = 'authenticated');

-- La escritura es del service role (el OS carga el padrón). Nadie lo edita desde la web todavía.
drop policy if exists chequeras_escritura on public.chequeras;
create policy chequeras_escritura on public.chequeras
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

comment on table public.chequeras is
  'Padrón de chequeras físicas de Echegaray (cuenta 179-091383/6). Marco para detectar cheques faltantes: qué chequeras hay y qué rango cubren. Los números USADOS viven en el Sheet Cheques Emitidos, no acá — se referencian, no se copian. Lo no verificado queda DESCONOCIDO.';

-- ─────────────────────────────────────────────────────────────────────────────────────────────────
-- SEED: las 2 chequeras CONOCIDAS al 23/07/2026 (leídas de fotos, caso lectura-cheques-imagen).
-- Sólo dato real. Ningún rango inventado: ambos van DESCONOCIDO porque no se leyó la tapa de la
-- chequera ni un resumen del banco. Los números conocidos son las anclas vistas de verdad.
-- ─────────────────────────────────────────────────────────────────────────────────────────────────
insert into public.chequeras
  (identificador, banco, cuenta, cuit_librador, tipo, numero_desde, numero_hasta, rango_confianza, numeros_conocidos, estado, observacion)
values
  ('H14-III/19', 'Santander Río', '179-091383/6', '30716304643', 'COMUN',
   null, null, 'DESCONOCIDO', '{62}', 'DESCONOCIDO',
   'Chequera de cheques COMUNES. Sólo se vio el Nº 62, en blanco (sin fecha, importe ni beneficiario). '
   || 'Ningún cheque de esta serie figura en Cheques Emitidos (los FISICO del registro arrancan en 193). '
   || 'Rango real no verificado.'),
  ('H17 C-VI/26', 'Santander', '179-091383/6', '30716304643', 'CPD',
   null, null, 'DESCONOCIDO', '{327,328}', 'ACTIVA',
   'Chequera de cheques de PAGO DIFERIDO (CPD). Se vieron el 327 y el 328, ambos $1.000.000, firmados y '
   || 'SIN beneficiario (al portador de hecho) — riesgo de tenencia. Ambos ya cargados en Cheques Emitidos '
   || '(FISICO). Rango real no verificado: la capacidad lo infiere de la serie física reciente.')
on conflict (identificador, cuenta) do update set
  banco = excluded.banco,
  tipo = excluded.tipo,
  numeros_conocidos = excluded.numeros_conocidos,
  estado = excluded.estado,
  observacion = excluded.observacion,
  updated_at = now();
