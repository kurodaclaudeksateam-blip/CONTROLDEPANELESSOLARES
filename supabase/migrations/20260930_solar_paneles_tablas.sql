-- Control de Paneles Solares: tablas nuevas con prefijo solar_ (no modifica tablas existentes)
-- Aplicada en el proyecto Supabase gk-control-operativo-entregas

create table public.solar_empresas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (length(trim(nombre)) > 0),
  rfc text,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);
create unique index solar_empresas_nombre_uidx on public.solar_empresas (lower(trim(nombre)));

create table public.solar_sucursales (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.solar_empresas(id) on delete cascade,
  nombre text not null check (length(trim(nombre)) > 0),
  ubicacion text,
  paneles integer not null default 10 check (paneles > 0),
  watts numeric(8,2) not null default 450 check (watts > 0),
  hsp numeric(4,2) not null default 5 check (hsp >= 0),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);
create unique index solar_sucursales_nombre_uidx on public.solar_sucursales (empresa_id, lower(trim(nombre)));

create table public.solar_lecturas (
  id uuid primary key default gen_random_uuid(),
  sucursal_id uuid not null references public.solar_sucursales(id) on delete cascade,
  fecha date not null,
  generada_kwh numeric(10,2) not null check (generada_kwh >= 0),
  consumida_kwh numeric(10,2) not null check (consumida_kwh >= 0),
  hsp numeric(4,2) check (hsp >= 0),
  clima text not null default 'Soleado'
    check (clima in ('Soleado', 'Parcialmente nublado', 'Nublado', 'Lluvioso')),
  notas text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);
create index solar_lecturas_sucursal_fecha_idx on public.solar_lecturas (sucursal_id, fecha);
create index solar_lecturas_fecha_idx on public.solar_lecturas (fecha);

create table public.solar_config (
  id smallint primary key default 1 check (id = 1),
  tarifa numeric(10,4) not null default 0.15 check (tarifa >= 0),
  moneda text not null default 'MXN',
  co2 numeric(6,3) not null default 0.45 check (co2 >= 0),
  updated_at timestamptz not null default now()
);
insert into public.solar_config (id) values (1);

-- updated_at automático
create or replace function public.solar_set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
create trigger solar_lecturas_updated_at before update on public.solar_lecturas
  for each row execute function public.solar_set_updated_at();
create trigger solar_config_updated_at before update on public.solar_config
  for each row execute function public.solar_set_updated_at();

-- Seguridad: solo usuarios autenticados; anon sin acceso
alter table public.solar_empresas enable row level security;
alter table public.solar_sucursales enable row level security;
alter table public.solar_lecturas enable row level security;
alter table public.solar_config enable row level security;

revoke all on public.solar_empresas, public.solar_sucursales, public.solar_lecturas, public.solar_config from anon;

create policy solar_empresas_auth on public.solar_empresas
  for all to authenticated using (true) with check (true);
create policy solar_sucursales_auth on public.solar_sucursales
  for all to authenticated using (true) with check (true);
create policy solar_lecturas_auth on public.solar_lecturas
  for all to authenticated using (true) with check (true);
create policy solar_config_select on public.solar_config
  for select to authenticated using (true);
create policy solar_config_update on public.solar_config
  for update to authenticated using (true) with check (true);
