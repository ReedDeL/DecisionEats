-- Rollback-only pantry database proof. Run after migrations with:
-- psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/pantry_sync_verification.sql
-- Inspect the PASS/FAIL result set before ROLLBACK. SQL claims simulate
-- authenticated sessions; they do not prove physical two-device behavior.
begin;
create temp table _pantry_fixture (
  a uuid not null, b uuid not null, ha uuid, hb uuid
) on commit drop;
create temp table _pantry_results (
  n int, assertion text, expected text, actual text,
  pass boolean generated always as (expected = actual) stored
) on commit drop;
insert into _pantry_fixture (a, b) values (gen_random_uuid(), gen_random_uuid());
-- Unique invalid-domain addresses are never used for network sign-in.
insert into auth.users
  (instance_id, id, aud, role, email, raw_user_meta_data, created_at, updated_at)
select '00000000-0000-0000-0000-000000000000'::uuid, x.id,
       'authenticated', 'authenticated',
       'pantry-proof-' || x.id::text || '@test.invalid', '{}'::jsonb, now(), now()
from _pantry_fixture f
cross join lateral (values (f.a), (f.b)) x(id);
update _pantry_fixture f
set ha = (select household_id from public.profiles where id = f.a),
    hb = (select household_id from public.profiles where id = f.b);

do $proof$
declare
  a uuid; b uuid; ha uuid; hb uuid;
  n int; blocked boolean; r text[] := '{}';
begin
  select f.a, f.b, f.ha, f.hb into a, b, ha, hb from _pantry_fixture f;
  select count(*) into n from public.profiles where id in (a,b);
  r := r || format('01|Signup profiles|2|%s',n);
  select count(*) into n from public.household_members
    where (user_id=a and household_id=ha) or (user_id=b and household_id=hb);
  r := r || format('02|Signup memberships|2|%s',n);
  select count(*) into n from public.user_preferences where user_id in (a,b);
  r := r || format('03|Signup preferences|2|%s',n);
  r := r || format('04|Distinct account households|true|%s',
    case when ha is not null and hb is not null and ha<>hb then 'true' else 'false' end);
  select count(*) into n from public.inventory where household_id in (ha,hb);
  r := r || format('05|New pantries empty|0|%s',n);

  -- A phase 1: authenticated client add.
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims',
    json_build_object('sub',a,'role','authenticated')::text,true);
  r := r || format('06|Client role authenticated|authenticated|%s',current_user);
  insert into public.inventory (household_id,ingredient_id,source,added_by)
    values (ha,'egg','manual',a);
  get diagnostics n = row_count;
  r := r || format('07|A phase 1 add|1|%s',n);

  -- A phase 2: a new client view with the same subject.
  perform set_config('request.jwt.claims',
    json_build_object('sub',a,'role','authenticated')::text,true);
  select count(*) into n from public.inventory where household_id=ha and ingredient_id='egg';
  r := r || format('08|A phase 2 sees add|1|%s',n);
  delete from public.inventory where household_id=ha and ingredient_id='egg';
  get diagnostics n = row_count;
  r := r || format('09|A phase 2 delete|1|%s',n);

  perform set_config('request.jwt.claims',
    json_build_object('sub',a,'role','authenticated')::text,true);
  select count(*) into n from public.inventory where household_id=ha and ingredient_id='egg';
  r := r || format('10|A phase 1 sees deletion|0|%s',n);
  -- Presence retries use the same upsert shape as the client.
  insert into public.inventory (household_id,ingredient_id,source,added_by)
    values (ha,'egg','manual',a)
    on conflict (household_id,ingredient_id) do nothing;
  insert into public.inventory (household_id,ingredient_id,source,added_by)
    values (ha,'egg','manual',a)
    on conflict (household_id,ingredient_id) do nothing;
  select count(*) into n from public.inventory where household_id=ha and ingredient_id='egg';
  r := r || format('11|Retried add leaves one item|1|%s',n);

  perform set_config('request.jwt.claims',
    json_build_object('sub',b,'role','authenticated')::text,true);
  insert into public.inventory (household_id,ingredient_id,source,added_by)
    values (hb,'rice','manual',b);
  select count(*) into n from public.inventory where household_id=hb and ingredient_id='rice';
  r := r || format('12|B can use own pantry|1|%s',n);
  select count(*) into n from public.inventory where household_id=ha;
  r := r || format('13|B cannot read A|0|%s',n);
  blocked := false;
  begin
    insert into public.inventory (household_id,ingredient_id,source,added_by)
      values (ha,'milk','manual',b);
  exception when insufficient_privilege then blocked := true;
  end;
  r := r || format('14|B cannot insert into A|blocked|%s',
    case when blocked then 'blocked' else 'ALLOWED' end);
  update public.inventory set quantity=2 where household_id=ha and ingredient_id='egg';
  get diagnostics n = row_count;
  r := r || format('15|B cannot update A|0|%s',n);
  delete from public.inventory where household_id=ha and ingredient_id='egg';
  get diagnostics n = row_count;
  r := r || format('16|B cannot delete A|0|%s',n);
  blocked := false;
  begin
    update public.inventory set household_id=ha
      where household_id=hb and ingredient_id='rice';
  exception when insufficient_privilege then blocked := true;
  end;
  r := r || format('17|B cannot move item into A|blocked|%s',
    case when blocked then 'blocked' else 'ALLOWED' end);

  -- The profile pointer is mutable under current grants. Membership is the
  -- authoritative RLS source, so changing it must not confer access.
  update public.profiles set household_id=ha where id=b;
  select count(*) into n from public.household_members where user_id=b and household_id=ha;
  r := r || format('18|Profile pointer gives no membership|0|%s',n);
  select count(*) into n from public.inventory where household_id=ha;
  r := r || format('19|Profile pointer gives no pantry access|0|%s',n);
  update public.profiles set household_id=hb where id=b;

  perform set_config('request.jwt.claims',
    json_build_object('sub',a,'role','authenticated')::text,true);
  select count(*) into n from public.inventory where household_id=ha and ingredient_id='egg';
  r := r || format('20|B attempts leave A row intact|1|%s',n);
  select count(*) into n from public.inventory where household_id=hb;
  r := r || format('21|A cannot read B|0|%s',n);
  delete from public.inventory where household_id=ha and ingredient_id='egg';
  delete from public.inventory where household_id=ha and ingredient_id='egg';
  get diagnostics n = row_count;
  r := r || format('22|Retried delete affects zero rows|0|%s',n);
  select count(*) into n from public.inventory where household_id=ha and ingredient_id='egg';
  r := r || format('23|Retried delete leaves A empty|0|%s',n);

  perform set_config('role','anon',true);
  perform set_config('request.jwt.claims','{"role":"anon"}',true);
  select count(*) into n from public.inventory where household_id in (ha,hb);
  r := r || format('24|Anon cannot read pantries|0|%s',n);
  blocked := false;
  begin
    insert into public.inventory (household_id,ingredient_id,source)
      values (ha,'milk','manual');
  exception when insufficient_privilege then blocked := true;
  end;
  r := r || format('25|Anon cannot write pantry|blocked|%s',
    case when blocked then 'blocked' else 'ALLOWED' end);

  perform set_config('role','postgres',true);
  insert into _pantry_results (n,assertion,expected,actual)
  select split_part(x,'|',1)::int, split_part(x,'|',2),
         split_part(x,'|',3), split_part(x,'|',4)
  from unnest(r) x;
end $proof$;

select n, assertion, expected, actual,
       case when pass then 'PASS' else 'FAIL' end as result
from _pantry_results order by n;
do $fail$
begin
  if exists (select 1 from _pantry_results where pass is not true) then
    raise exception 'Pantry SQL proof failed; inspect PASS/FAIL rows above';
  end if;
end $fail$;
rollback;
