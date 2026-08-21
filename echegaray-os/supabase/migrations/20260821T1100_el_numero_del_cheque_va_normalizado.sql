-- "00000366" Y "366" SON EL MISMO CHEQUE, Y LA BASE LOS TENÍA DOS VECES.
--
-- ═══ QUÉ PASÓ (21/08/2026) ═══
--
-- El primer `--aplicar` de `importar-cheques-del-registro.mjs` cargó 82 filas y la base quedó con
-- 105 emitidos donde el registro tiene 104. El de más era el ECHEQ 366 de DUPEC, $635.020,10, dos
-- veces: `00000366` (como lo escribe el módulo del banco) y `366` (normalizado por el importador).
--
-- El índice único compara el TEXTO de `numero`, así que las dos formas del mismo número son dos
-- cheques distintos para la base. El código ya normalizaba —`norm()` existe en tres módulos y saca
-- los ceros a la izquierda— pero la base guardaba lo que le llegara: la regla vivía en el código y
-- la clave, en el índice. Es el mismo defecto que la migración anterior arregló para el instrumento,
-- una capa más abajo.
--
-- No dio error: dio una fila de más y $635.020,10 contados dos veces.
--
-- ═══ EL ORDEN IMPORTA ═══
--
-- Primero se funden los duplicados y recién después se normaliza. Al revés, el UPDATE chocaría
-- contra el índice único a mitad de camino y la migración fallaría dejando la tabla a medias.
--
-- Se conserva la fila con el estado MÁS AVANZADO: `Pagado` le gana a `Aceptado` porque un cheque no
-- vuelve para atrás, y en este caso además lo confirma el extracto. Los importes de las dos filas
-- son idénticos, así que la fusión no elige entre dos cifras — si algún día lo fueran, el índice
-- posterior lo impediría y habría que mirarlo a mano, que es lo correcto.

with normalizado as (
  select id, tipo, coalesce(instrumento,'') i, coalesce(banco,'') b,
         regexp_replace(regexp_replace(numero, '\D', '', 'g'), '^0+', '') num,
         case estado when 'Pagado' then 3 when 'Depositado' then 3 when 'Endosado' then 3
                     when 'Aceptado' then 2 when 'En custodia' then 2 else 1 end as avance,
         importado_en
    from public.cheques
), ranked as (
  select id, row_number() over (partition by tipo, i, b, num order by avance desc, importado_en desc, id desc) rn
    from normalizado
)
delete from public.cheques c using ranked r where c.id = r.id and r.rn > 1;

update public.cheques
   set numero = regexp_replace(regexp_replace(numero, '\D', '', 'g'), '^0+', '')
 where numero <> regexp_replace(regexp_replace(numero, '\D', '', 'g'), '^0+', '');

-- LA REGLA DEJA DE SER UNA COSTUMBRE DEL CÓDIGO. Sin esto, el próximo importador que no normalice
-- vuelve a meter la otra forma del mismo número y nadie se entera hasta contar las filas.
alter table public.cheques drop constraint if exists cheques_numero_normalizado;
alter table public.cheques add constraint cheques_numero_normalizado
  check (numero = regexp_replace(regexp_replace(numero, '\D', '', 'g'), '^0+', '') and numero <> '');

comment on constraint cheques_numero_normalizado on public.cheques is
  'El número va sólo en dígitos y sin ceros a la izquierda. "00000366" y "366" son el mismo cheque, y con el índice único sobre el texto crudo la base los tenía como dos.';
