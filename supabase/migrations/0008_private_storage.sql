set lock_timeout = '5s';
set statement_timeout = '120s';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('cnis', 'cnis', false, 52428800, array['application/pdf']),
  (
    'timbrados',
    'timbrados',
    false,
    52428800,
    array['application/vnd.openxmlformats-officedocument.wordprocessingml.document']
  ),
  (
    'entregas',
    'entregas',
    false,
    52428800,
    array['application/vnd.openxmlformats-officedocument.wordprocessingml.document']
  )
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy cnis_insert_own_folder
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'cnis'
  and (storage.foldername(name))[1] = (select public.current_escritorio_id())::text
);

create policy cnis_select_own_folder
on storage.objects for select
to authenticated
using (
  bucket_id = 'cnis'
  and (storage.foldername(name))[1] = (select public.current_escritorio_id())::text
);

create policy cnis_update_own_folder
on storage.objects for update
to authenticated
using (
  bucket_id = 'cnis'
  and (storage.foldername(name))[1] = (select public.current_escritorio_id())::text
)
with check (
  bucket_id = 'cnis'
  and (storage.foldername(name))[1] = (select public.current_escritorio_id())::text
);

create policy cnis_delete_own_folder
on storage.objects for delete
to authenticated
using (
  bucket_id = 'cnis'
  and (storage.foldername(name))[1] = (select public.current_escritorio_id())::text
);

create policy timbrados_insert_own_folder
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'timbrados'
  and (storage.foldername(name))[1] = (select public.current_escritorio_id())::text
);

create policy timbrados_select_own_folder
on storage.objects for select
to authenticated
using (
  bucket_id = 'timbrados'
  and (storage.foldername(name))[1] = (select public.current_escritorio_id())::text
);

create policy timbrados_update_own_folder
on storage.objects for update
to authenticated
using (
  bucket_id = 'timbrados'
  and (storage.foldername(name))[1] = (select public.current_escritorio_id())::text
)
with check (
  bucket_id = 'timbrados'
  and (storage.foldername(name))[1] = (select public.current_escritorio_id())::text
);

create policy timbrados_delete_own_folder
on storage.objects for delete
to authenticated
using (
  bucket_id = 'timbrados'
  and (storage.foldername(name))[1] = (select public.current_escritorio_id())::text
);

-- Não existe policy de cliente para o bucket entregas. O backend emite signed URL
-- curta depois de confirmar usuário, escritório e caso.
