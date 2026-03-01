-- Media storage bucket + policies for GTM Engine UI
-- Files are private and accessed through signed URLs issued by API routes.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'media',
  'media',
  false,
  52428800,
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'video/mp4',
    'video/webm',
    'audio/mpeg',
    'audio/wav',
    'audio/ogg',
    'application/pdf'
  ]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Service role manage media objects" on storage.objects;

create policy "Service role manage media objects"
on storage.objects
for all
to service_role
using (bucket_id = 'media')
with check (bucket_id = 'media');
