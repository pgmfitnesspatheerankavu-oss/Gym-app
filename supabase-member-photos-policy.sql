-- Run this in Supabase Dashboard > SQL Editor for the member-photos bucket.
-- Public bucket enables photo viewing; this policy permits browser uploads using the publishable key.
-- Uploads are restricted to the member-photos bucket, image MIME types, and files under 5 MB.
create policy "Allow small member photo uploads"
on storage.objects
for insert
to anon, authenticated
with check (
  bucket_id = 'member-photos'
  and (metadata->>'mimetype') like 'image/%'
  and coalesce((metadata->>'size')::bigint, 0) < 5242880
  and name like '%/profile-%'
);
