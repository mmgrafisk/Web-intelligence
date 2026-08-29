begin;

select plan(18);

select has_table('public', 'workspaces', 'workspaces table exists');
select has_table('public', 'projects', 'projects table exists');
select has_table('public', 'folders', 'folders table exists');
select has_table('public', 'playlists', 'playlists table exists');
select has_table('public', 'bookmarks', 'bookmarks table exists');
select has_table('public', 'bookmark_playlists', 'bookmark_playlists table exists');
select has_table('public', 'sync_operations', 'sync_operations table exists');

select ok((select relrowsecurity from pg_class where oid = 'public.workspaces'::regclass), 'workspaces RLS is enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.projects'::regclass), 'projects RLS is enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.folders'::regclass), 'folders RLS is enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.playlists'::regclass), 'playlists RLS is enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.bookmarks'::regclass), 'bookmarks RLS is enabled');
select ok(
  (select relrowsecurity from pg_class where oid = 'public.bookmark_playlists'::regclass),
  'bookmark_playlists RLS is enabled'
);
select ok((select relrowsecurity from pg_class where oid = 'public.sync_operations'::regclass), 'sync_operations RLS is enabled');

select ok(not has_table_privilege('anon', 'public.bookmarks', 'select'), 'anonymous clients cannot read bookmarks');
select ok(has_table_privilege('authenticated', 'public.bookmarks', 'select'), 'authenticated role can reach bookmarks through RLS');
select ok(exists(select 1 from storage.buckets where id = 'bookmark-assets' and public = false), 'asset bucket is private');
select is(
  (select count(*)::integer from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'bookmark_assets_%'),
  4,
  'asset bucket has separate CRUD policies'
);

select * from finish();
rollback;
