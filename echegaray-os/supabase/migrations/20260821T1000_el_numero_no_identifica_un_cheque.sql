-- EL NÚMERO NO IDENTIFICA UN CHEQUE: LA CHEQUERA TAMBIÉN.
--
-- ═══ QUÉ SE ROMPÍA (21/08/2026) ═══
--
-- `cheques_unico` era (tipo, coalesce(banco,''), numero). `tipo` es 'emitido'/'recibido' — NO es el
-- instrumento. Las chequeras física y electrónica numeran POR SEPARADO, así que el mismo número
-- existe dos veces y son dos cheques distintos. Medido sobre el registro real de «Cheques Emitidos»,
-- 104 filas: CUATRO números chocan entre chequeras.
--
--   N° 310  ECHEQ Maderas Literas $383.175   ||  FISICO Corralón Progreso $470.944
--   N° 311  ECHEQ Maderas Literas $383.175   ||  FISICO Corralón Progreso $470.944
--   N° 312  ECHEQ Maderas Literas $383.175   ||  FISICO Corralón Progreso $470.944
--   N° 313  ECHEQ Maderas Literas $383.175   ||  FISICO Corralón Progreso $470.945
--
-- Con la clave vieja, cargar el registro entero hacía que cada par colapsara en UNA fila: cuatro
-- cheques y $1.708.278 desaparecidos sin un solo error, porque un UPSERT que pisa es exactamente lo
-- que se le pidió. El código ya sabía esto —`cheques-emitidos-sync.mjs` cruza por (instrumento,
-- número) y lo dice en su comentario— pero la base no lo sabía: la regla vivía en un módulo y la
-- clave, en otra parte. Una clave declarada en prosa no es una clave.
--
-- ═══ POR QUÉ UNA COLUMNA Y NO SEGUIR DEDUCIÉNDOLO ═══
--
-- `instrumentoDe()` deduce el instrumento leyendo texto libre de `origen`/`cuenta` ("pantalla ECHEQs
-- Emitidos", "módulo echeq Santander") y devuelve null cuando no puede afirmarlo. Eso sirve para
-- avisar, no para ser clave: una clave que depende de que alguien haya escrito la palabra "echeq" en
-- un campo de procedencia se rompe el día que el PDF cambia de título. El instrumento es un HECHO del
-- cheque, así que va en su propia columna.
--
-- Los recibidos no tienen chequera propia (el instrumento lo eligió el librador), así que quedan en
-- NULL y la clave los sigue distinguiendo por banco+número como hasta hoy.

alter table public.cheques add column if not exists instrumento text;

comment on column public.cheques.instrumento is
  'FISICO o ECHEQ: con qué chequera se emitió. Las dos numeran por separado, así que forma parte de la identidad del cheque. NULL en los recibidos, donde la chequera es del librador.';

-- Relleno con lo que hoy se puede AFIRMAR, con el mismo criterio que `instrumentoDe()`. Lo que no se
-- puede afirmar queda NULL: poner un cheque en la chequera equivocada es peor que no saber.
update public.cheques
   set instrumento = 'ECHEQ'
 where tipo = 'emitido' and instrumento is null
   and (coalesce(origen,'') || ' ' || coalesce(cuenta,'')) ~* 'echeq|e-cheq';

update public.cheques
   set instrumento = 'FISICO'
 where tipo = 'emitido' and instrumento is null
   and (coalesce(origen,'') || ' ' || coalesce(cuenta,'')) ~* 'f[íi]sico|chequera';

alter table public.cheques drop constraint if exists cheques_unico;
drop index if exists public.cheques_unico;

-- La identidad completa. `coalesce` en los dos campos opcionales porque en SQL NULL <> NULL y dos
-- recibidos sin banco volverían a poder duplicarse.
create unique index cheques_unico
    on public.cheques (tipo, coalesce(instrumento,''), coalesce(banco,''), numero);

comment on index public.cheques_unico is
  'La identidad de un cheque: quién lo emitió (tipo), con qué chequera (instrumento), de qué banco y con qué número. Sin instrumento, el FISICO 313 y el ECHEQ 313 son el mismo cheque para la base y el segundo pisa al primero en silencio.';
