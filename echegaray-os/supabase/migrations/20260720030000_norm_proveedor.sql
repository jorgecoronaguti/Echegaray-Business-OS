-- NORMALIZACIÓN DE PROVEEDOR — fuente única en Postgres, igual que norm_obra().
--
-- Problema real: los comprobantes de ARCA traen el nombre como lo emitió el proveedor
-- ("ALUMETAL S A", "ACEROLATINA S.A.", "SIDERAGRO SAN JUAN SRL") y la tabla proveedores
-- lo tiene como lo escribe la empresa ("Alumetal", "Acerolatina SA", "SIDERAGRO").
-- Sin normalizar no cruzan, y sin cruzar no se puede imputar ni un comprobante a una obra.
--
-- El CUIT sería el identificador correcto, pero proveedores.cuit está NULL en las 25 filas.
-- Mientras eso siga así, el nombre normalizado es la mejor evidencia disponible — y se declara
-- como tal: es una heurística de matcheo, no una identidad. Cargar los CUIT la reemplaza.
create or replace function public.norm_proveedor(txt text)
returns text
language sql
immutable
as $$
  select nullif(
    trim(regexp_replace(
      regexp_replace(
        -- 1) sin tildes, minúsculas
        lower(translate(coalesce(txt, ''), 'áàäâãéèëêíìïîóòöôõúùüûñçÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇ',
                                            'aaaaaeeeeiiiiooooouuuuncAAAAAEEEEIIIIOOOOOUUUUNC')),
        -- 2) fuera las formas societarias y la puntuación que las acompaña
        '[[:space:].,]*\y(s\s*\.?\s*a\s*\.?\s*s|s\s*\.?\s*a|s\s*\.?\s*r\s*\.?\s*l|srl|sas|sa|s\s*\.?\s*h|sh|ltda|cia)\y[[:space:].]*$',
        '', 'g'),
      -- 3) todo lo que no sea letra o número pasa a espacio simple
      '[^a-z0-9]+', ' ', 'g')),
  '');
$$;

comment on function public.norm_proveedor(text) is
  'Normaliza un nombre de proveedor para poder cruzar el nombre de ARCA con el de la empresa. Heurística de matcheo, NO identidad: el identificador correcto es el CUIT (proveedores.cuit, hoy vacío).';
