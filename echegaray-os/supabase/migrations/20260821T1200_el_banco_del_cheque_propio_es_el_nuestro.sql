-- UN CHEQUE QUE EMITE LA EMPRESA SALE DEL BANCO DE LA EMPRESA. LA BASE LO TENÍA EN BLANCO.
--
-- ═══ QUÉ PASÓ (21/08/2026) ═══
--
-- Segunda vuelta del mismo defecto, una capa más al costado. La clave única incluye
-- `coalesce(banco,'')`, y dos filas del módulo de eCHEQ del banco habían entrado con `banco` en
-- NULL: los ECHEQ 371 ($1.306.000) y 372 ($469.564,70). El importador escribe 'Santander', así que
-- para el índice eran otros cheques y los insertó de nuevo — mismo importe, mismo estado, dos filas.
--
-- Es exactamente lo que pasó con "00000366" contra "366": un campo que participa de la identidad y
-- que cada escritor rellena a su manera. La lección, ya pagada dos veces: si algo entra a la clave,
-- su forma la tiene que imponer la base, no la costumbre de quien escribe.
--
-- ═══ POR QUÉ SÓLO LOS EMITIDOS ═══
--
-- En un cheque RECIBIDO, `banco` es el banco del LIBRADOR y varía de verdad: hoy hay cheques de
-- Credicoop, Galicia, Santander y Supervielle. Ahí un NULL significa "no sé de qué banco es", y
-- rellenarlo con el nuestro sería inventar. En un cheque EMITIDO el banco es el nuestro por
-- definición: es de nuestra chequera, y las 104 filas del registro salen de la cuenta corriente del
-- Santander. Por eso el default y el CHECK se acotan a `tipo='emitido'`.

-- 1) Fundir. Se conserva la fila que YA tiene el banco escrito; entre iguales, la más reciente.
--    Va antes de rellenar: al revés, el UPDATE chocaría contra el índice único a mitad de camino.
with ranked as (
  select id, row_number() over (
           partition by tipo, coalesce(instrumento,''), numero
           order by (banco is not null) desc, importado_en desc, id desc) rn
    from public.cheques
   where tipo = 'emitido'
)
delete from public.cheques c using ranked r where c.id = r.id and r.rn > 1;

-- 2) Rellenar.
update public.cheques set banco = 'Santander' where tipo = 'emitido' and banco is null;

-- 3) Que no vuelva a pasar. Un NULL en un campo que forma parte de la identidad es un duplicado
--    esperando a que alguien escriba el mismo cheque con el campo lleno.
alter table public.cheques drop constraint if exists cheques_emitido_con_banco;
alter table public.cheques add constraint cheques_emitido_con_banco
  check (tipo <> 'emitido' or banco is not null);

comment on constraint cheques_emitido_con_banco on public.cheques is
  'Un cheque que emite la empresa sale del banco de la empresa: nunca NULL. Con el banco adentro de la clave única, un NULL y un "Santander" son dos cheques distintos para la base. En los recibidos SÍ puede faltar: ahí el banco es el del librador.';
