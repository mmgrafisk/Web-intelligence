-- Optional cloud schema. Local/accountless mode does not depend on these tables.
-- Collaboration policies are intentionally deferred; V1 cloud data is single-owner.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table public.workspaces (
  id text primary key,
  owner_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 200),
  revision bigint not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, owner_id)
);

create table public.projects (
  id text primary key,
  workspace_id text not null,
  owner_id uuid not null,
  name text not null check (char_length(name) between 1 and 200),
  description text,
  revision bigint not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, owner_id, workspace_id),
  foreign key (workspace_id, owner_id)
    references public.workspaces (id, owner_id)
    on delete cascade
);

create table public.folders (
  id text primary key,
  workspace_id text not null,
  owner_id uuid not null,
  project_id text not null,
  parent_folder_id text,
  name text not null check (char_length(name) between 1 and 200),
  revision bigint not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, owner_id, workspace_id, project_id),
  foreign key (project_id, owner_id, workspace_id)
    references public.projects (id, owner_id, workspace_id)
    on delete cascade,
  foreign key (parent_folder_id, owner_id, workspace_id, project_id)
    references public.folders (id, owner_id, workspace_id, project_id)
    on delete cascade
);

create table public.playlists (
  id text primary key,
  workspace_id text not null,
  owner_id uuid not null,
  project_id text,
  name text not null check (char_length(name) between 1 and 200),
  description text,
  revision bigint not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, owner_id, workspace_id),
  foreign key (workspace_id, owner_id)
    references public.workspaces (id, owner_id)
    on delete cascade,
  foreign key (project_id, owner_id, workspace_id)
    references public.projects (id, owner_id, workspace_id)
    on delete cascade
);

create table public.bookmarks (
  id text primary key,
  workspace_id text not null,
  owner_id uuid not null,
  canonical_url text not null check (canonical_url ~ '^https?://'),
  original_url text not null check (original_url ~ '^https?://'),
  source text not null,
  content_type text not null check (
    content_type in ('webpage', 'article', 'video', 'image', 'selection', 'podcast', 'unknown')
  ),
  title text not null check (char_length(title) between 1 and 2000),
  description text,
  thumbnail_url text,
  creator jsonb,
  published_at timestamptz,
  duration_seconds bigint check (duration_seconds is null or duration_seconds >= 0),
  storage_mode text not null check (storage_mode in ('stream', 'cloud', 'local')),
  media_availability text not null default 'source-only' check (
    media_availability in ('source-only', 'available-local', 'available-cloud', 'missing', 'unavailable')
  ),
  project_id text,
  folder_id text,
  tags text[] not null default '{}',
  categories text[] not null default '{}',
  notes text,
  favorite boolean not null default false,
  custom_fields jsonb not null default '{}'::jsonb check (jsonb_typeof(custom_fields) = 'object'),
  archived_asset_ids text[] not null default '{}',
  transcript text,
  readable_text text,
  statistics jsonb not null default '{}'::jsonb check (jsonb_typeof(statistics) = 'object'),
  platform_metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(platform_metadata) = 'object'),
  provenance jsonb not null check (jsonb_typeof(provenance) = 'object'),
  saved_at timestamptz not null,
  updated_at timestamptz not null,
  last_checked_at timestamptz,
  deleted_at timestamptz,
  revision bigint not null default 1 check (revision > 0),
  unique (id, owner_id, workspace_id),
  check (folder_id is null or project_id is not null),
  foreign key (workspace_id, owner_id)
    references public.workspaces (id, owner_id)
    on delete cascade,
  foreign key (project_id, owner_id, workspace_id)
    references public.projects (id, owner_id, workspace_id)
    on delete restrict,
  foreign key (folder_id, owner_id, workspace_id, project_id)
    references public.folders (id, owner_id, workspace_id, project_id)
    on delete restrict
);

create table public.bookmark_playlists (
  workspace_id text not null,
  owner_id uuid not null,
  bookmark_id text not null,
  playlist_id text not null,
  created_at timestamptz not null default now(),
  primary key (bookmark_id, playlist_id),
  foreign key (bookmark_id, owner_id, workspace_id)
    references public.bookmarks (id, owner_id, workspace_id)
    on delete cascade,
  foreign key (playlist_id, owner_id, workspace_id)
    references public.playlists (id, owner_id, workspace_id)
    on delete cascade
);

create table public.sync_operations (
  id text primary key,
  workspace_id text not null,
  owner_id uuid not null,
  device_id text not null check (char_length(device_id) between 1 and 200),
  entity_type text not null check (entity_type in ('bookmark', 'project', 'folder', 'playlist', 'asset')),
  entity_id text not null,
  action text not null check (action in ('upsert', 'delete')),
  payload jsonb,
  base_revision bigint not null check (base_revision >= 0),
  client_created_at timestamptz not null,
  created_at timestamptz not null default now(),
  applied_at timestamptz,
  foreign key (workspace_id, owner_id)
    references public.workspaces (id, owner_id)
    on delete cascade
);

create index workspaces_owner_id_idx on public.workspaces (owner_id);
create index projects_owner_workspace_idx on public.projects (owner_id, workspace_id);
create index folders_project_id_idx on public.folders (project_id);
create index folders_parent_folder_id_idx on public.folders (parent_folder_id) where parent_folder_id is not null;
create index playlists_owner_workspace_idx on public.playlists (owner_id, workspace_id);
create index playlists_project_id_idx on public.playlists (project_id) where project_id is not null;
create index bookmarks_project_id_idx on public.bookmarks (project_id) where project_id is not null;
create index bookmarks_folder_id_idx on public.bookmarks (folder_id) where folder_id is not null;
create index bookmarks_owner_saved_cursor_idx
  on public.bookmarks (owner_id, saved_at desc, id desc)
  where deleted_at is null;
create unique index bookmarks_active_canonical_url_idx
  on public.bookmarks (workspace_id, canonical_url)
  where deleted_at is null;
create index bookmarks_tags_idx on public.bookmarks using gin (tags);
create index bookmarks_categories_idx on public.bookmarks using gin (categories);
create index bookmark_playlists_owner_workspace_idx
  on public.bookmark_playlists (owner_id, workspace_id);
create index bookmark_playlists_playlist_id_idx on public.bookmark_playlists (playlist_id);
create index sync_operations_owner_cursor_idx
  on public.sync_operations (owner_id, created_at, id);
create index sync_operations_workspace_owner_idx
  on public.sync_operations (workspace_id, owner_id);
create index sync_operations_entity_idx
  on public.sync_operations (owner_id, entity_type, entity_id);

alter table public.workspaces enable row level security;
alter table public.projects enable row level security;
alter table public.folders enable row level security;
alter table public.playlists enable row level security;
alter table public.bookmarks enable row level security;
alter table public.bookmark_playlists enable row level security;
alter table public.sync_operations enable row level security;

alter table public.workspaces force row level security;
alter table public.projects force row level security;
alter table public.folders force row level security;
alter table public.playlists force row level security;
alter table public.bookmarks force row level security;
alter table public.bookmark_playlists force row level security;
alter table public.sync_operations force row level security;

create policy workspaces_select_own on public.workspaces
  for select to authenticated using ((select auth.uid()) = owner_id);
create policy workspaces_insert_own on public.workspaces
  for insert to authenticated with check ((select auth.uid()) = owner_id);
create policy workspaces_update_own on public.workspaces
  for update to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);
create policy workspaces_delete_own on public.workspaces
  for delete to authenticated using ((select auth.uid()) = owner_id);

create policy projects_select_own on public.projects
  for select to authenticated using ((select auth.uid()) = owner_id);
create policy projects_insert_own on public.projects
  for insert to authenticated with check ((select auth.uid()) = owner_id);
create policy projects_update_own on public.projects
  for update to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);
create policy projects_delete_own on public.projects
  for delete to authenticated using ((select auth.uid()) = owner_id);

create policy folders_select_own on public.folders
  for select to authenticated using ((select auth.uid()) = owner_id);
create policy folders_insert_own on public.folders
  for insert to authenticated with check ((select auth.uid()) = owner_id);
create policy folders_update_own on public.folders
  for update to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);
create policy folders_delete_own on public.folders
  for delete to authenticated using ((select auth.uid()) = owner_id);

create policy playlists_select_own on public.playlists
  for select to authenticated using ((select auth.uid()) = owner_id);
create policy playlists_insert_own on public.playlists
  for insert to authenticated with check ((select auth.uid()) = owner_id);
create policy playlists_update_own on public.playlists
  for update to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);
create policy playlists_delete_own on public.playlists
  for delete to authenticated using ((select auth.uid()) = owner_id);

create policy bookmarks_select_own on public.bookmarks
  for select to authenticated using ((select auth.uid()) = owner_id);
create policy bookmarks_insert_own on public.bookmarks
  for insert to authenticated with check ((select auth.uid()) = owner_id);
create policy bookmarks_update_own on public.bookmarks
  for update to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);
create policy bookmarks_delete_own on public.bookmarks
  for delete to authenticated using ((select auth.uid()) = owner_id);

create policy bookmark_playlists_select_own on public.bookmark_playlists
  for select to authenticated using ((select auth.uid()) = owner_id);
create policy bookmark_playlists_insert_own on public.bookmark_playlists
  for insert to authenticated with check ((select auth.uid()) = owner_id);
create policy bookmark_playlists_update_own on public.bookmark_playlists
  for update to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);
create policy bookmark_playlists_delete_own on public.bookmark_playlists
  for delete to authenticated using ((select auth.uid()) = owner_id);

create policy sync_operations_select_own on public.sync_operations
  for select to authenticated using ((select auth.uid()) = owner_id);
create policy sync_operations_insert_own on public.sync_operations
  for insert to authenticated with check ((select auth.uid()) = owner_id);
create policy sync_operations_update_own on public.sync_operations
  for update to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);
create policy sync_operations_delete_own on public.sync_operations
  for delete to authenticated using ((select auth.uid()) = owner_id);

revoke all on table public.workspaces from anon;
revoke all on table public.projects from anon;
revoke all on table public.folders from anon;
revoke all on table public.playlists from anon;
revoke all on table public.bookmarks from anon;
revoke all on table public.bookmark_playlists from anon;
revoke all on table public.sync_operations from anon;

grant usage on schema public to authenticated;
grant select, insert, update, delete on table public.workspaces to authenticated;
grant select, insert, update, delete on table public.projects to authenticated;
grant select, insert, update, delete on table public.folders to authenticated;
grant select, insert, update, delete on table public.playlists to authenticated;
grant select, insert, update, delete on table public.bookmarks to authenticated;
grant select, insert, update, delete on table public.bookmark_playlists to authenticated;
grant select, insert, update, delete on table public.sync_operations to authenticated;

insert into storage.buckets (id, name, public, file_size_limit)
values ('bookmark-assets', 'bookmark-assets', false, 52428800)
on conflict (id) do nothing;

create policy bookmark_assets_select_own on storage.objects
  for select to authenticated
  using (
    bucket_id = 'bookmark-assets'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and owner_id = (select auth.uid())::text
  );

create policy bookmark_assets_insert_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'bookmark-assets'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy bookmark_assets_update_own on storage.objects
  for update to authenticated
  using (
    bucket_id = 'bookmark-assets'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and owner_id = (select auth.uid())::text
  )
  with check (
    bucket_id = 'bookmark-assets'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy bookmark_assets_delete_own on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'bookmark-assets'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and owner_id = (select auth.uid())::text
  );
