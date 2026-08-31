-- Family Purse — Phase 1 seed data (canonical demo: The Ramans, Aug 2026)
-- Deterministic ids so demo auth users can be linked by scripts/seed-demo.ts.

-- Users first (family_id defer), then the family, then link members back.
insert into public.users (id, email, name, role, family_id, created_at) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'aravind@example.com', 'Aravind', 'admin',  null, '2026-06-03T00:00:00Z'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', 'revathi@example.com', 'Revathi', 'member', null, '2026-06-03T00:00:00Z'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3', 'karthik@example.com', 'Karthik', 'member', null, '2026-06-03T00:00:00Z');

insert into public.families (id, name, owner_id, invite_code) values
  ('11111111-1111-4111-8111-111111111111', 'The Ramans', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'RAMANPLUS');

update public.users set family_id = '11111111-1111-4111-8111-111111111111' where id in
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3');

insert into public.categories (id, family_id, name, color, system, sort_order) values
  ('cccccccc-cccc-4ccc-8ccc-ccccccccccc1', '11111111-1111-4111-8111-111111111111', 'Food & Dining',     '#B0562F', false, 0),
  ('cccccccc-cccc-4ccc-8ccc-ccccccccccc2', '11111111-1111-4111-8111-111111111111', 'Travel',            '#7A6FA8', false, 1),
  ('cccccccc-cccc-4ccc-8ccc-ccccccccccc3', '11111111-1111-4111-8111-111111111111', 'Shopping',          '#C79A3A', false, 2),
  ('cccccccc-cccc-4ccc-8ccc-ccccccccccc4', '11111111-1111-4111-8111-111111111111', 'Groceries',         '#4A7A5E', false, 3),
  ('cccccccc-cccc-4ccc-8ccc-ccccccccccc5', '11111111-1111-4111-8111-111111111111', 'Utilities',         '#3E7CA6', false, 4),
  ('cccccccc-cccc-4ccc-8ccc-ccccccccccc6', '11111111-1111-4111-8111-111111111111', 'Others',            '#8A867C', false, 5),
  ('cccccccc-cccc-4ccc-8ccc-ccccccccccc7', '11111111-1111-4111-8111-111111111111', 'Interest Paid',     '#B0562F', true, 6),
  ('cccccccc-cccc-4ccc-8ccc-ccccccccccc8', '11111111-1111-4111-8111-111111111111', 'Interest Received', '#4A7A5E', true, 7),
  ('cccccccc-cccc-4ccc-8ccc-ccccccccccc9', '11111111-1111-4111-8111-111111111111', 'Balance Write-off', '#8A867C', true, 8);

insert into public.credit_cards (id, user_id, name, status) values
  ('dddddddd-dddd-4ddd-8ddd-ddddddddddd1', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'HDFC Millennia', 'active'),
  ('dddddddd-dddd-4ddd-8ddd-ddddddddddd2', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'Amex Gold',      'active');

insert into public.projects (id, family_id, name, created_by, status, budget) values
  ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1', '11111111-1111-4111-8111-111111111111', 'Goa Trip',       'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'active', 30000),
  ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2', '11111111-1111-4111-8111-111111111111', 'Diwali Shopping', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'active', 20000);

insert into public.project_members (project_id, user_id, role) values
  ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'owner'),
  ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', 'contributor'),
  ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3', 'contributor'),
  ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'owner'),
  ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', 'contributor');

insert into public.loans (id, direction, counterparty_user_id, counterparty_name, principal_amount, interest_rate, start_date, due_date, reminder_frequency, status, repayment_total, created_by) values
  ('ffffffff-ffff-4fff-8fff-fffffffffff1', 'given', null, 'Amit',               20000, null,  '2026-08-01', '2026-09-01', 'monthly', 'active', 5000,  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'),
  ('ffffffff-ffff-4fff-8fff-fffffffffff2', 'given', null, 'Ravi',               17500, null,  '2026-08-21', null,         'none',    'active', 0,     'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'),
  ('ffffffff-ffff-4fff-8fff-fffffffffff3', 'taken', null, 'HDFC Personal Loan', 50000, 8,     '2026-07-15', '2026-09-05', 'monthly', 'active', 36000, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1');

insert into public.budgets (id, scope_type, scope_id, category_id, amount, period) values
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1', 'personal', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1', 10000, 'monthly'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', 'personal', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'cccccccc-cccc-4ccc-8ccc-ccccccccccc2', 12000, 'monthly'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3', 'personal', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'cccccccc-cccc-4ccc-8ccc-ccccccccccc3', 6000,  'monthly'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb4', 'personal', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'cccccccc-cccc-4ccc-8ccc-ccccccccccc4', 8000,  'monthly'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb5', 'personal', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'cccccccc-cccc-4ccc-8ccc-ccccccccccc5', 5000,  'monthly'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb6', 'personal', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'cccccccc-cccc-4ccc-8ccc-ccccccccccc6', 4000,  'monthly');

insert into public.transactions
  (id, kind, type, scope_type, scope_id, amount, category_id, spent_through, card_id, date, note, created_by, counterparty_user_id, linked_loan_id, transfer_group_id) values
  -- P&L — August 2026 report period
  ('12121212-1212-4121-8121-121212121201', 'pl', 'expense',          'personal', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 640,   'cccccccc-cccc-4ccc-8ccc-ccccccccccc1', 'credit_card', 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1', '2026-08-24', 'Dinner',                    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', null, null, null),
  ('12121212-1212-4121-8121-121212121202', 'pl', 'expense',          'personal', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 380,   'cccccccc-cccc-4ccc-8ccc-ccccccccccc1', 'credit_card', 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1', '2026-08-23', 'Lunch',                     'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', null, null, null),
  ('12121212-1212-4121-8121-121212121203', 'pl', 'expense',          'project',  'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1', 3200,  'cccccccc-cccc-4ccc-8ccc-ccccccccccc1', 'manual',      null,                             '2026-08-20', 'Goa meals',                  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', null, null, null),
  ('12121212-1212-4121-8121-121212121204', 'pl', 'expense',          'personal', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', 7020,  'cccccccc-cccc-4ccc-8ccc-ccccccccccc1', 'manual',      null,                             '2026-08-18', 'Food & dining',              'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', null, null, null),
  ('12121212-1212-4121-8121-121212121205', 'pl', 'expense',          'project',  'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1', 6000,  'cccccccc-cccc-4ccc-8ccc-ccccccccccc2', 'manual',      null,                             '2026-08-20', 'Goa travel',                  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', null, null, null),
  ('12121212-1212-4121-8121-121212121206', 'pl', 'expense',          'personal', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 2900,  'cccccccc-cccc-4ccc-8ccc-ccccccccccc2', 'manual',      null,                             '2026-08-12', 'Travel',                      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', null, null, null),
  ('12121212-1212-4121-8121-121212121207', 'pl', 'expense',          'project',  'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2', 5340,  'cccccccc-cccc-4ccc-8ccc-ccccccccccc3', 'manual',      null,                             '2026-08-10', 'Shopping',                    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', null, null, null),
  ('12121212-1212-4121-8121-121212121208', 'pl', 'expense',          'personal', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 6120,  'cccccccc-cccc-4ccc-8ccc-ccccccccccc4', 'manual',      null,                             '2026-08-14', 'Groceries',                   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', null, null, null),
  ('12121212-1212-4121-8121-121212121209', 'pl', 'expense',          'personal', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', 4500,  'cccccccc-cccc-4ccc-8ccc-ccccccccccc5', 'manual',      null,                             '2026-08-08', 'Utilities',                   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', null, null, null),
  ('12121212-1212-4121-8121-121212121210', 'pl', 'expense',          'personal', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3', 4500,  'cccccccc-cccc-4ccc-8ccc-ccccccccccc6', 'manual',      null,                             '2026-08-06', 'Other household expense',     'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3', null, null, null),
  ('12121212-1212-4121-8121-121212121211', 'pl', 'interest_income',  'personal', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 300,   'cccccccc-cccc-4ccc-8ccc-ccccccccccc8', null,          null,                             '2026-08-15', 'Interest received from Amit', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', null, 'ffffffff-ffff-4fff-8fff-fffffffffff1', null),
  ('12121212-1212-4121-8121-121212121212', 'pl', 'revenue',          'personal', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 58000, null,                                 null,          null,                             '2026-08-01', 'Monthly income',              'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', null, null, null),
  -- Settlements
  ('12121212-1212-4121-8121-121212121213', 'settlement', 'card_payment',   'personal', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 38000, null, null, 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1', '2026-08-25', 'HDFC card payment',         'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', null,      null,  '12121212-1212-4121-8121-aaaaaaaac001'),
  ('12121212-1212-4121-8121-121212121214', 'settlement', 'loan_repayment', 'personal', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 5000,  null, null, null,                                        '2026-08-20', 'Amit repayment',           'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', null,      'ffffffff-ffff-4fff-8fff-fffffffffff1', '12121212-1212-4121-8121-aaaaaaaac002'),
  ('12121212-1212-4121-8121-121212121215', 'settlement', 'loan_repayment', 'personal', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 36000, null, null, null,                                        '2026-08-25', 'HDFC loan repayment',      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', null,      'ffffffff-ffff-4fff-8fff-fffffffffff3', '12121212-1212-4121-8121-aaaaaaaac003'),
  ('12121212-1212-4121-8121-121212121216', 'settlement', 'transfer',       'personal', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', 4000,  null, null, null,                                        '2026-08-10', 'Family transfer',          'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3', null,  '12121212-1212-4121-8121-aaaaaaaac004'),
  ('12121212-1212-4121-8121-121212121217', 'settlement', 'transfer',       'personal', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3', 4000,  null, null, null,                                        '2026-08-10', 'Family transfer mirror',   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', null,  '12121212-1212-4121-8121-aaaaaaaac004'),
  -- Card opening balances (P&L, outside report period)
  ('12121212-1212-4121-8121-121212121218', 'pl', 'expense', 'personal', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 75460, 'cccccccc-cccc-4ccc-8ccc-ccccccccccc6', 'credit_card', 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1', '2026-07-31', 'Prior HDFC card spend',     'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', null, null, null),
  ('12121212-1212-4121-8121-121212121219', 'pl', 'expense', 'personal', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 3650,  'cccccccc-cccc-4ccc-8ccc-ccccccccccc3', 'credit_card', 'dddddddd-dddd-4ddd-8ddd-ddddddddddd2', '2026-08-22', 'Amex spend',                'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', null, null, null);

insert into public.reminders (id, loan_id, card_id, category_id, due_date, status, type, title, amount) values
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1', null, 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1', null,  '2026-08-28', 'pending', 'card_payment_due',   'HDFC Card payment due',           8400),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', 'ffffffff-ffff-4fff-8fff-fffffffffff1', null, null, '2026-08-29', 'pending', 'loan_interest_check', 'Amit — interest check-in',        300),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3', 'ffffffff-ffff-4fff-8fff-fffffffffff3', null, null, '2026-09-05', 'pending', 'loan_due',            'HDFC Personal Loan installment',   5200),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb4', null, null, 'cccccccc-cccc-4ccc-8ccc-ccccccccccc3', '2026-08-28', 'pending', 'budget_threshold',    'Shopping budget nearly used up',   5520),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb5', 'ffffffff-ffff-4fff-8fff-fffffffffff2', null, null, '2026-09-10', 'pending', 'loan_due',            'Ravi — loan due date',             17500);