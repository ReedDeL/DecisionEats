-- ---------------------------------------------------------------------------
-- RLS verification: two households, three accounts.
--
-- Proves the privacy rule in docs/01_TECHNICAL_SPEC.md §3 actually holds on the
-- live database, not just in the migration text:
--
--   inventory  joins to household_id -- roommates SHARE it
--   preferences, allergens, feedback join to user_id -- roommates CANNOT see it
--
-- Run against any environment. The whole script is one transaction ending in
-- ROLLBACK, so it writes nothing and is safe against a live project:
--
--   psql "$DATABASE_URL" -f supabase/tests/rls_verification.sql
--
-- A read-only reviewer proof would not be enough here. RLS is only observable
-- from inside a session that has actually assumed the `authenticated` role with
-- a JWT claim set, which is what the DO block below does.
-- ---------------------------------------------------------------------------

\set ON_ERROR_STOP on

begin;

create temp table _rls_results (
  n         int,
  assertion text,
  expected  text,
  actual    text,
  pass      boolean
);

-- Three users. The on_auth_user_created trigger bootstraps a household, a
-- profile, a membership row and an empty preferences row for each -- so this
-- exercises the signup path at the same time.
insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-4000-8000-000000000001',
   'authenticated', 'authenticated', 'rls-a@test.invalid',  '{"display_name":"A"}',  now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-4000-8000-000000000002',
   'authenticated', 'authenticated', 'rls-a2@test.invalid', '{"display_name":"A2"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'bbbbbbbb-0000-4000-8000-000000000001',
   'authenticated', 'authenticated', 'rls-b@test.invalid',  '{"display_name":"B"}',  now(), now());

-- A2 moves into A's household. This is the roommate case -- the only reason the
-- household/user split exists at all.
update public.household_members
   set household_id = (select household_id from public.profiles where id = 'aaaaaaaa-0000-4000-8000-000000000001')
 where user_id = 'aaaaaaaa-0000-4000-8000-000000000002';

update public.profiles
   set household_id = (select household_id from public.profiles where id = 'aaaaaaaa-0000-4000-8000-000000000001')
 where id = 'aaaaaaaa-0000-4000-8000-000000000002';

-- Seeded as the table owner, which bypasses RLS. Every read below does not.
insert into public.inventory (household_id, ingredient_id, source)
select household_id, x.ingredient_id, 'manual'
  from public.profiles p
  cross join (values ('egg'), ('milk')) as x(ingredient_id)
 where p.id = 'aaaaaaaa-0000-4000-8000-000000000001';

insert into public.inventory (household_id, ingredient_id, source)
select household_id, 'rice', 'manual'
  from public.profiles where id = 'bbbbbbbb-0000-4000-8000-000000000001';

insert into public.meal_feedback (user_id, recipe_id, verdict)
values ('aaaaaaaa-0000-4000-8000-000000000001', 'bundled-0001', 'liked'),
       ('bbbbbbbb-0000-4000-8000-000000000001', 'bundled-0002', 'disliked');

insert into public.body_profiles (
  user_id, age_years, height_centimeters, weight_kilograms, calculation_sex,
  activity_level, goal, pregnant, breastfeeding
)
values
  ('aaaaaaaa-0000-4000-8000-000000000001', 30, 170, 70, 'female', 'moderate',
   'maintain', false, false),
  ('bbbbbbbb-0000-4000-8000-000000000001', 40, 180, 85, 'male', 'active',
   'gain', false, false);

insert into public.taste_signals (user_id, kind, recipe_id, journey, recorded_at)
values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'photo_selected', 'bundled-0001', 'now', now()),
  ('bbbbbbbb-0000-4000-8000-000000000001', 'photo_selected', 'bundled-0002', 'week', now());

insert into public.meal_satiety (user_id, recipe_id, level)
values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'bundled-0001', 'satisfied'),
  ('bbbbbbbb-0000-4000-8000-000000000001', 'bundled-0002', 'too_full');

insert into public.onboarding_progress (user_id, safety_completed)
values
  ('aaaaaaaa-0000-4000-8000-000000000001', true),
  ('bbbbbbbb-0000-4000-8000-000000000001', true);

insert into public.meal_reminder_preferences (user_id, enabled, lead_minutes)
values
  ('aaaaaaaa-0000-4000-8000-000000000001', true, 15),
  ('bbbbbbbb-0000-4000-8000-000000000001', false, 30);

insert into public.weekly_meal_plans (id, user_id, week_start, status, stated_relaxations)
values
  ('a0000000-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001',
   '2026-08-24', 'draft', array[]::text[]),
  ('b0000000-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000001',
   '2026-08-24', 'draft', array[]::text[]);

insert into public.weekly_meal_plan_entries (
  id, plan_id, user_id, entry_date, kind, recipe_id, planned_meal_time,
  reason, stated_relaxations, portion_servings, portion_label, portion_disclaimer
)
values
  ('a1000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001',
   'aaaaaaaa-0000-4000-8000-000000000001', '2026-08-24', 'recipe', 'bundled-0001',
   '2026-08-24T19:00:00-07:00', null, array[]::text[], 1, 'Start with 1 serving',
   'Estimate only—adjust to your hunger.'),
  ('b1000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001',
   'bbbbbbbb-0000-4000-8000-000000000001', '2026-08-24', 'day_of_decision', null, null,
   'no_safe_recipe', array[]::text[], null, null, null);

insert into public.plan_linked_grocery_needs (
  id, plan_id, user_id, ingredient_id, recipe_ids, dates
)
values
  ('a2000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001',
   'aaaaaaaa-0000-4000-8000-000000000001', 'egg', array['bundled-0001'],
   array['2026-08-24']::date[]),
  ('b2000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001',
   'bbbbbbbb-0000-4000-8000-000000000001', 'rice', array['bundled-0002'],
   array['2026-08-24']::date[]);

-- An allergen is the highest-stakes private field in the schema. If a roommate
-- can read this row, the privacy model has failed.
update public.user_preferences
   set allergens = array['peanut'], equipment = array['microwave']
 where user_id = 'aaaaaaaa-0000-4000-8000-000000000001';


do $$
declare
  user_a  uuid := 'aaaaaaaa-0000-4000-8000-000000000001';
  user_a2 uuid := 'aaaaaaaa-0000-4000-8000-000000000002';
  user_b  uuid := 'bbbbbbbb-0000-4000-8000-000000000001';
  household_b uuid;
  results text[] := '{}';
  n int;
  blocked boolean;
begin
  select household_id into household_b from public.profiles where id = user_b;

  ------------------------------------------------------------------ as A -----
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
                     json_build_object('sub', user_a, 'role', 'authenticated')::text, true);

  select count(*) into n from public.households;
  results := results || format('1|A sees only their own household|1|%s', n);

  select count(*) into n from public.profiles;
  results := results || format('2|A sees self plus roommate, not B|2|%s', n);

  select count(*) into n from public.household_members;
  results := results || format('3|A sees own household roster only|2|%s', n);

  select count(*) into n from public.inventory;
  results := results || format('4|A sees own pantry only|2|%s', n);

  select count(*) into n from public.inventory where household_id = household_b;
  results := results || format('5|B pantry invisible to A|0|%s', n);

  select count(*) into n from public.user_preferences;
  results := results || format('6|A sees own preferences only|1|%s', n);

  select count(*) into n from public.meal_feedback;
  results := results || format('7|A sees own feedback only|1|%s', n);

  -- Negative writes. Each runs in its own subtransaction so a policy violation
  -- does not abort the run -- being blocked IS the passing outcome.
  blocked := false;
  begin
    insert into public.inventory (household_id, ingredient_id, source)
    values (household_b, 'saffron', 'manual');
  exception when others then blocked := true;
  end;
  results := results || format('8|A cannot stock B pantry|blocked|%s',
                               case when blocked then 'blocked' else 'ALLOWED' end);

  blocked := false;
  begin
    insert into public.meal_feedback (user_id, recipe_id, verdict)
    values (user_b, 'bundled-0003', 'liked');
  exception when others then blocked := true;
  end;
  results := results || format('9|A cannot write feedback as B|blocked|%s',
                               case when blocked then 'blocked' else 'ALLOWED' end);

  update public.user_preferences set allergens = array['nothing'] where user_id = user_b;
  get diagnostics n = row_count;
  results := results || format('10|A cannot edit B allergens|0|%s', n);

  delete from public.inventory where household_id = household_b;
  get diagnostics n = row_count;
  results := results || format('11|A cannot clear B pantry|0|%s', n);

  -- Positive inventory control: a policy set that denies every pantry write
  -- is not a passing policy set.
  insert into public.inventory (household_id, ingredient_id, source)
  values ((select household_id from public.profiles where id = user_a), 'flour', 'manual');
  get diagnostics n = row_count;
  results := results || format('12|Positive control: A CAN stock own pantry|1|%s', n);

  ----------------------------------------------------- as A2, the roommate ---
  perform set_config('request.jwt.claims',
                     json_build_object('sub', user_a2, 'role', 'authenticated')::text, true);

  -- Shared: this one is supposed to succeed. A pantry nobody can share is just
  -- as broken as preferences everybody can read. 3, not 2 -- the positive
  -- control above added flour to the same household.
  select count(*) into n from public.inventory;
  results := results || format('13|Roommate SHARES the pantry|3|%s', n);

  select count(*) into n from public.user_preferences;
  results := results || format('14|Roommate sees only own preferences|1|%s', n);

  select count(*) into n from public.user_preferences where 'peanut' = any(allergens);
  results := results || format('15|Roommate cannot read A allergens|0|%s', n);

  select count(*) into n from public.meal_feedback;
  results := results || format('16|Roommate cannot read A feedback|0|%s', n);

  --------------------------------------------------------------- as anon -----
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);

  select count(*) into n from public.inventory;
  results := results || format('17|Anon sees no pantry|0|%s', n);

  select count(*) into n from public.user_preferences;
  results := results || format('18|Anon sees no preferences|0|%s', n);

  select count(*) into n from public.households;
  results := results || format('19|Anon sees no households|0|%s', n);

  perform set_config('role', 'postgres', true);

  insert into _rls_results (n, assertion, expected, actual, pass)
  select split_part(r, '|', 1)::int,
         split_part(r, '|', 2),
         split_part(r, '|', 3),
         split_part(r, '|', 4),
         split_part(r, '|', 3) = split_part(r, '|', 4)
    from unnest(results) as r;
end $$;

-- ------------------------------------------------ personal meal journeys ---
-- These assertions cover owner A, roommate A2, unrelated owner B, and anon.
-- The append-only and immutable-child negative writes also prove the table
-- grants are no broader than the RLS policies.

do $$
declare
  user_a uuid := 'aaaaaaaa-0000-4000-8000-000000000001';
  user_a2 uuid := 'aaaaaaaa-0000-4000-8000-000000000002';
  user_b uuid := 'bbbbbbbb-0000-4000-8000-000000000001';
  results text[] := '{}';
  n int;
  blocked boolean;
  replacement_entries jsonb;
  creation_entries jsonb;
  created_plan_id uuid;
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
                     json_build_object('sub', user_a, 'role', 'authenticated')::text, true);

  select count(*) into n from public.body_profiles;
  results := results || format('24|A sees own body profile only|1|%s', n);
  select count(*) into n from public.taste_signals;
  results := results || format('25|A sees own taste signals only|1|%s', n);
  select count(*) into n from public.meal_satiety;
  results := results || format('26|A sees own satiety only|1|%s', n);
  select count(*) into n from public.onboarding_progress;
  results := results || format('27|A sees own onboarding progress only|1|%s', n);
  select count(*) into n from public.weekly_meal_plans;
  results := results || format('28|A sees own weekly plans only|1|%s', n);
  select count(*) into n from public.weekly_meal_plan_entries;
  results := results || format('29|A sees own weekly entries only|1|%s', n);
  select count(*) into n from public.plan_linked_grocery_needs;
  results := results || format('30|A sees own plan needs only|1|%s', n);
  select count(*) into n from public.meal_reminder_preferences;
  results := results || format('31|A sees own reminders only|1|%s', n);

  update public.body_profiles set weight_kilograms = 71 where user_id = user_a;
  get diagnostics n = row_count;
  results := results || format('32|A can update own body profile|1|%s', n);
  update public.onboarding_progress set reminder_completed = true where user_id = user_a;
  get diagnostics n = row_count;
  results := results || format('33|A can update own onboarding progress|1|%s', n);
  update public.meal_reminder_preferences set lead_minutes = 10 where user_id = user_a;
  get diagnostics n = row_count;
  results := results || format('34|A can update own reminder preferences|1|%s', n);
  update public.weekly_meal_plans set status = 'confirmed' where user_id = user_a;
  get diagnostics n = row_count;
  results := results || format('35|A can confirm own parent plan|1|%s', n);

  blocked := false;
  begin
    insert into public.meal_satiety (user_id, recipe_id, level)
    values (user_b, 'bundled-cross', 'still_hungry');
  exception when others then blocked := true;
  end;
  results := results || format('36|A cannot insert satiety as B|blocked|%s',
                               case when blocked then 'blocked' else 'ALLOWED' end);

  update public.body_profiles set weight_kilograms = 72 where user_id = user_b;
  get diagnostics n = row_count;
  results := results || format('37|A cannot update B body profile|0|%s', n);

  blocked := false;
  begin
    update public.taste_signals set journey = 'week' where user_id = user_a;
  exception when others then blocked := true;
  end;
  results := results || format('38|Taste signals reject client update|blocked|%s',
                               case when blocked then 'blocked' else 'ALLOWED' end);

  blocked := false;
  begin
    delete from public.meal_satiety where user_id = user_a;
  exception when others then blocked := true;
  end;
  results := results || format('39|Satiety rejects client delete|blocked|%s',
                               case when blocked then 'blocked' else 'ALLOWED' end);

  blocked := false;
  begin
    update public.weekly_meal_plan_entries set recipe_id = 'bundled-other'
     where user_id = user_a;
  exception when others then blocked := true;
  end;
  results := results || format('40|Weekly children reject client update|blocked|%s',
                               case when blocked then 'blocked' else 'ALLOWED' end);

  blocked := false;
  begin
    insert into public.plan_linked_grocery_needs (
      plan_id, user_id, ingredient_id, recipe_ids, dates
    ) values (
      'b0000000-0000-4000-8000-000000000001', user_a, 'saffron',
      array['bundled-cross'], array['2026-08-25']::date[]
    );
  exception when others then blocked := true;
  end;
  results := results || format('41|Child ownership cannot differ from parent|blocked|%s',
                               case when blocked then 'blocked' else 'ALLOWED' end);

  insert into public.taste_signals (user_id, kind, recipe_id, journey, recorded_at)
  values (user_a, 'photo_selected', 'bundled-own-insert', 'now', now());
  get diagnostics n = row_count;
  results := results || format('66|A can insert own taste signal|1|%s', n);

  insert into public.meal_satiety (recipe_id, level)
  values ('bundled-own-insert', 'satisfied');
  get diagnostics n = row_count;
  results := results || format('67|A can insert satiety with server ownership|1|%s', n);

  select jsonb_agg(
           jsonb_build_object(
             'entry_date', (date '2026-08-24' + day_offset)::text,
             'kind', 'recipe',
             'recipe_id', 'bundled-replanned',
             'planned_meal_time',
               (date '2026-08-24' + day_offset)::text || 'T18:30:00-07:00',
             'reason', null,
             'stated_relaxations', jsonb_build_array('time'),
             'portion_servings', null,
             'portion_label', null,
             'portion_disclaimer', null
           ) order by day_offset
         )
    into replacement_entries
    from generate_series(0, 6) as days(day_offset);

  perform public.replace_weekly_plan_children(
    'a0000000-0000-4000-8000-000000000001',
    replacement_entries,
    jsonb_build_array(jsonb_build_object(
      'ingredient_id', 'milk',
      'recipe_ids', jsonb_build_array('bundled-replanned'),
      'dates', jsonb_build_array('2026-08-25')
    ))
  );
  select count(*) into n
    from public.plan_linked_grocery_needs
   where user_id = user_a and ingredient_id = 'milk';
  results := results || format('84|Replacement inserts the complete new need set|1|%s', n);
  select count(*) into n
    from public.plan_linked_grocery_needs
   where user_id = user_a and ingredient_id = 'egg';
  results := results || format('85|Replacement leaves no stale plan needs|0|%s', n);

  blocked := false;
  begin
    perform public.replace_weekly_plan_children(
      'a0000000-0000-4000-8000-000000000001', '[]'::jsonb, '[]'::jsonb
    );
  exception when others then blocked := true;
  end;
  results := results || format('87|Incomplete replacement is rejected|blocked|%s',
                               case when blocked then 'blocked' else 'ALLOWED' end);
  select count(*) into n
    from public.plan_linked_grocery_needs
   where user_id = user_a and ingredient_id = 'milk';
  results := results || format('88|Rejected incomplete replacement preserves needs|1|%s', n);

  blocked := false;
  begin
    perform public.replace_weekly_plan_children(
      'a0000000-0000-4000-8000-000000000001', null, null
    );
  exception when others then blocked := true;
  end;
  results := results || format('89|Null replacement payloads are rejected|blocked|%s',
                               case when blocked then 'blocked' else 'ALLOWED' end);

  blocked := false;
  begin
    perform public.replace_weekly_plan_children(
      'a0000000-0000-4000-8000-000000000001',
      replacement_entries,
      jsonb_build_array(jsonb_build_object(
        'ingredient_id', 'borrowed',
        'recipe_ids', jsonb_build_array('borrowed-recipe'),
        'dates', jsonb_build_array('2026-08-24')
      ))
    );
  exception when others then blocked := true;
  end;
  results := results || format('90|Invalid grocery recipe reference is rejected|blocked|%s',
                               case when blocked then 'blocked' else 'ALLOWED' end);
  select count(*) into n
    from public.plan_linked_grocery_needs
   where user_id = user_a and ingredient_id = 'milk';
  results := results || format('91|Rejected grocery replacement preserves needs|1|%s', n);

  blocked := false;
  begin
    perform public.replace_weekly_plan_children(
      'a0000000-0000-4000-8000-000000000001',
      jsonb_set(
        replacement_entries,
        '{0,planned_meal_time}',
        '"2026-08-24T18:30:00"'::jsonb
      ),
      '[]'::jsonb
    );
  exception when others then blocked := true;
  end;
  results := results || format('96|Meal time without an offset is rejected|blocked|%s',
                               case when blocked then 'blocked' else 'ALLOWED' end);
  select count(*) into n
    from public.plan_linked_grocery_needs
   where user_id = user_a and ingredient_id = 'milk';
  results := results || format('97|Rejected timestamp preserves prior children|1|%s', n);

  blocked := false;
  begin
    perform public.replace_weekly_plan_children(
      'a0000000-0000-4000-8000-000000000001',
      jsonb_set(
        jsonb_set(replacement_entries, '{6,entry_date}', '"2026-09-03"'::jsonb),
        '{6,planned_meal_time}',
        '"2026-09-03T18:30:00-07:00"'::jsonb
      ),
      '[]'::jsonb
    );
  exception when others then blocked := true;
  end;
  results := results || format('98|Nonconsecutive weekly dates are rejected|blocked|%s',
                               case when blocked then 'blocked' else 'ALLOWED' end);
  select count(*) into n
    from public.plan_linked_grocery_needs
   where user_id = user_a and ingredient_id = 'milk';
  results := results || format('99|Rejected date set preserves prior children|1|%s', n);

  select jsonb_agg(
           jsonb_build_object(
             'entry_date', (date '2026-08-31' + day_offset)::text,
             'kind', 'recipe',
             'recipe_id', 'bundled-created',
             'planned_meal_time',
               (date '2026-08-31' + day_offset)::text || 'T18:30:00-07:00',
             'reason', null,
             'stated_relaxations', jsonb_build_array(),
             'portion_servings', null,
             'portion_label', null,
             'portion_disclaimer', null
           ) order by day_offset
         )
    into creation_entries
    from generate_series(0, 6) as days(day_offset);

  created_plan_id := public.create_weekly_meal_plan(
    '2026-08-31', 'draft', array[]::text[], creation_entries, '[]'::jsonb
  );
  results := results || format('92|Transactional plan creation returns an id|true|%s',
                               case when created_plan_id is not null then 'true' else 'false' end);
  select count(*) into n
    from public.weekly_meal_plan_entries
   where plan_id = created_plan_id and user_id = user_a;
  results := results || format('93|Transactional creation inserts all seven entries|7|%s', n);

  blocked := false;
  begin
    perform public.create_weekly_meal_plan(
      '2026-09-07', 'draft', array[]::text[], '[]'::jsonb, '[]'::jsonb
    );
  exception when others then blocked := true;
  end;
  results := results || format('94|Invalid transactional creation is rejected|blocked|%s',
                               case when blocked then 'blocked' else 'ALLOWED' end);
  select count(*) into n
    from public.weekly_meal_plans
   where user_id = user_a and week_start = '2026-09-07';
  results := results || format('95|Rejected creation leaves no parent row|0|%s', n);

  perform set_config('request.jwt.claims',
                     json_build_object('sub', user_a2, 'role', 'authenticated')::text, true);
  select count(*) into n from public.weekly_meal_plans;
  results := results || format('42|Roommate cannot read A weekly plan|0|%s', n);
  select count(*) into n from public.body_profiles;
  results := results || format('43|Roommate cannot read A body profile|0|%s', n);
  select count(*) into n from public.taste_signals;
  results := results || format('44|Roommate cannot read A taste|0|%s', n);
  select count(*) into n from public.meal_satiety;
  results := results || format('45|Roommate cannot read A satiety|0|%s', n);
  select count(*) into n from public.onboarding_progress;
  results := results || format('68|Roommate cannot read A onboarding|0|%s', n);
  select count(*) into n from public.weekly_meal_plan_entries;
  results := results || format('69|Roommate cannot read A weekly entries|0|%s', n);
  select count(*) into n from public.plan_linked_grocery_needs;
  results := results || format('70|Roommate cannot read A plan needs|0|%s', n);
  select count(*) into n from public.meal_reminder_preferences;
  results := results || format('71|Roommate cannot read A reminders|0|%s', n);
  blocked := false;
  begin
    perform public.replace_weekly_plan_children(
      'a0000000-0000-4000-8000-000000000001', '[]'::jsonb, '[]'::jsonb
    );
  exception when others then blocked := true;
  end;
  results := results || format('86|Roommate cannot replace A plan children|blocked|%s',
                               case when blocked then 'blocked' else 'ALLOWED' end);

  perform set_config('request.jwt.claims',
                     json_build_object('sub', user_b, 'role', 'authenticated')::text, true);
  select count(*) into n from public.weekly_meal_plans;
  results := results || format('46|B positive control sees own weekly plan|1|%s', n);
  select count(*) into n from public.plan_linked_grocery_needs;
  results := results || format('47|B positive control sees own plan need|1|%s', n);
  select count(*) into n from public.body_profiles;
  results := results || format('72|B positive control sees own body profile|1|%s', n);
  select count(*) into n from public.taste_signals;
  results := results || format('73|B positive control sees own taste|1|%s', n);
  select count(*) into n from public.meal_satiety;
  results := results || format('74|B positive control sees own satiety|1|%s', n);
  select count(*) into n from public.onboarding_progress;
  results := results || format('75|B positive control sees own onboarding|1|%s', n);
  select count(*) into n from public.weekly_meal_plan_entries;
  results := results || format('76|B positive control sees own weekly entry|1|%s', n);
  select count(*) into n from public.meal_reminder_preferences;
  results := results || format('77|B positive control sees own reminders|1|%s', n);

  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  blocked := false;
  begin
    perform count(*) from public.body_profiles;
  exception when others then blocked := true;
  end;
  results := results || format('48|Anon cannot read body profiles|blocked|%s',
                               case when blocked then 'blocked' else 'ALLOWED' end);
  blocked := false;
  begin
    insert into public.taste_signals (kind, recipe_id, journey, recorded_at)
    values ('photo_selected', 'bundled-anon', 'now', now());
  exception when others then blocked := true;
  end;
  results := results || format('49|Anon cannot insert taste|blocked|%s',
                               case when blocked then 'blocked' else 'ALLOWED' end);

  blocked := false;
  begin
    perform count(*) from public.meal_satiety;
  exception when others then blocked := true;
  end;
  results := results || format('78|Anon cannot read satiety|blocked|%s',
                               case when blocked then 'blocked' else 'ALLOWED' end);
  blocked := false;
  begin
    perform count(*) from public.onboarding_progress;
  exception when others then blocked := true;
  end;
  results := results || format('79|Anon cannot read onboarding|blocked|%s',
                               case when blocked then 'blocked' else 'ALLOWED' end);
  blocked := false;
  begin
    perform count(*) from public.weekly_meal_plans;
  exception when others then blocked := true;
  end;
  results := results || format('80|Anon cannot read weekly plans|blocked|%s',
                               case when blocked then 'blocked' else 'ALLOWED' end);
  blocked := false;
  begin
    perform count(*) from public.weekly_meal_plan_entries;
  exception when others then blocked := true;
  end;
  results := results || format('81|Anon cannot read weekly entries|blocked|%s',
                               case when blocked then 'blocked' else 'ALLOWED' end);
  blocked := false;
  begin
    perform count(*) from public.plan_linked_grocery_needs;
  exception when others then blocked := true;
  end;
  results := results || format('82|Anon cannot read plan needs|blocked|%s',
                               case when blocked then 'blocked' else 'ALLOWED' end);
  blocked := false;
  begin
    perform count(*) from public.meal_reminder_preferences;
  exception when others then blocked := true;
  end;
  results := results || format('83|Anon cannot read reminders|blocked|%s',
                               case when blocked then 'blocked' else 'ALLOWED' end);

  perform set_config('role', 'postgres', true);
  insert into _rls_results (n, assertion, expected, actual, pass)
  select split_part(r, '|', 1)::int,
         split_part(r, '|', 2),
         split_part(r, '|', 3),
         split_part(r, '|', 4),
         split_part(r, '|', 3) = split_part(r, '|', 4)
    from unnest(results) as r;
end $$;

-- ----------------------------------------------------- scan budget (0005) ----
-- The Gemini daily-scan budget. Three properties matter: clients cannot read
-- the ledger, the cap actually caps, and each user's budget is their own.
-- Calls run as postgres because EXECUTE belongs to service_role only -- the
-- Edge Function's seat -- but identity still comes from the JWT claims, so
-- what is exercised here is the same code path production takes.

do $$
declare
  user_a        uuid := 'aaaaaaaa-0000-4000-8000-000000000001';
  user_b        uuid := 'bbbbbbbb-0000-4000-8000-000000000001';
  results       text[] := '{}';
  blocked       boolean;
  granted       boolean;
  granted_count int;
  i             int;
begin
  -- Ledger hidden from an authenticated session: `private` carries no USAGE
  -- for anon/authenticated (0001), and RLS on the table denies all anyway.
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
                     json_build_object('sub', user_a, 'role', 'authenticated')::text, true);

  blocked := false;
  begin
    perform count(*) from private.pantry_scan_usage;
  exception when others then blocked := true;
  end;
  results := results || format('20|Scan ledger hidden from clients|blocked|%s',
                               case when blocked then 'blocked' else 'ALLOWED' end);

  blocked := false;
  begin
    perform count(*) from private.pantry_scan_global_usage;
  exception when others then blocked := true;
  end;
  results := results || format('24|Global scan ledger hidden from clients|blocked|%s',
                               case when blocked then 'blocked' else 'ALLOWED' end);

  -- Spend A's budget against a limit of 2: two grants, then a refusal. The
  -- refusal is the point -- an off-by-one here is the cost attack reopening.
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims',
                     json_build_object('sub', user_a, 'role', 'authenticated')::text, true);

  granted_count := 0;
  for i in 1 .. 3 loop
    granted := private.claim_pantry_scan(2, 1000);
    if granted then
      granted_count := granted_count + 1;
    end if;
  end loop;
  results := results || format('21|Budget grants exactly the daily limit|2|%s', granted_count);

  -- B's budget starts fresh regardless of how much A has spent today.
  perform set_config('request.jwt.claims',
                     json_build_object('sub', user_b, 'role', 'authenticated')::text, true);
  results := results || format('22|Roommate budget independent|true|%s',
                               case when private.claim_pantry_scan(2, 1000) then 'true' else 'false' end);

  -- A global cap applies across users. A has spent two and B has spent one;
  -- with a global limit of three, the next request must be refused even though
  -- B has not reached its own per-user limit.
  results := results || format('25|Global budget caps all users|false|%s',
                               case when private.claim_pantry_scan(2, 3) then 'true' else 'false' end);

  -- No JWT claims, no identity, no scan. This is the branch that keeps the
  -- function safe even if it were ever called without forwarding auth.
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  results := results || format('23|Anonymous claim refused|false|%s',
                               case when private.claim_pantry_scan(2, 1000) then 'true' else 'false' end);

  insert into _rls_results (n, assertion, expected, actual, pass)
  select split_part(r, '|', 1)::int,
         split_part(r, '|', 2),
         split_part(r, '|', 3),
         split_part(r, '|', 4),
         split_part(r, '|', 3) = split_part(r, '|', 4)
    from unnest(results) as r;
end $$;

select n, assertion, expected, actual,
       case when pass then 'PASS' else 'FAIL' end as result
  from _rls_results
 order by n;

-- The SELECT above is just a report -- a FAIL row does not make psql exit
-- non-zero on its own. Raise so a real regression cannot read as CI green.
do $$
declare
  failed int;
begin
  select count(*) into failed from _rls_results where pass is not true;
  if failed > 0 then
    raise exception '% of % RLS assertions failed -- see the table above', failed,
      (select count(*) from _rls_results);
  end if;
end $$;

-- Nothing above is kept. Re-runnable as many times as you like.
rollback;
