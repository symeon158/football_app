-- The coin ledger: idempotent, never negative, append-only.
begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

insert into auth.users (id, email, raw_user_meta_data)
values ('33333333-3333-3333-3333-333333333333', 'carol@example.test', '{"username":"carol"}');

select is((private.apply_coin_transaction('33333333-3333-3333-3333-333333333333', -400, 'card_purchase', 'test:purchase:0001')).balance_after,
          600::bigint, 'debit reduces balance');

select is((private.apply_coin_transaction('33333333-3333-3333-3333-333333333333', -400, 'card_purchase', 'test:purchase:0001')).balance_after,
          600::bigint, 'replaying the same idempotency key does not charge twice');

select is((select balance from public.wallets where user_id = '33333333-3333-3333-3333-333333333333'),
          600::bigint, 'wallet balance reflects a single debit');

select throws_ok(
  $$select private.apply_coin_transaction('33333333-3333-3333-3333-333333333333', -500, 'card_purchase', 'test:purchase:0001')$$,
  '22023', 'IDEMPOTENCY_KEY_REUSED', 'reusing a key with different amount is rejected');

select throws_ok(
  $$select private.apply_coin_transaction('33333333-3333-3333-3333-333333333333', -601, 'card_purchase', 'test:purchase:0002')$$,
  'P0001', 'INSUFFICIENT_FUNDS', 'cannot overspend');

select is((select sum(amount) from public.coin_transactions where user_id = '33333333-3333-3333-3333-333333333333'),
          (select balance::numeric from public.wallets where user_id = '33333333-3333-3333-3333-333333333333'),
          'ledger sum equals wallet balance');

select throws_ok(
  $$update public.coin_transactions set amount = 99999 where user_id = '33333333-3333-3333-3333-333333333333'$$,
  '42501', 'LEDGER_IS_APPEND_ONLY', 'ledger rows cannot be edited');

-- Deleting the account cascades cleanly through the ledger.
delete from auth.users where id = '33333333-3333-3333-3333-333333333333';
select is((select count(*)::int from public.coin_transactions where user_id = '33333333-3333-3333-3333-333333333333'),
          0, 'account deletion removes ledger rows');

select * from finish();
rollback;
