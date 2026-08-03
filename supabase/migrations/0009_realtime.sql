set lock_timeout = '5s';
set statement_timeout = '120s';

alter table public.casos replica identity full;
alter table public.entregas replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.casos;
exception
  when duplicate_object then null;
end;
$$;

do $$
begin
  alter publication supabase_realtime add table public.entregas;
exception
  when duplicate_object then null;
end;
$$;
