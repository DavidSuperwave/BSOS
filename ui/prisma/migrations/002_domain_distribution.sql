-- ============================================================
-- MIGRATION: Domain Distribution System
-- Tables: domain_inventory, domain_transactions, 
--         mailbox_subscriptions, company_billing
-- Date: 2026-03-02
-- ============================================================

-- 1. Domain inventory pool (admin-managed)
-- This is the Superwave-controlled pool of domains.
-- Admin buys slots in bulk from Inboxing.com, domains land here.
-- Users can only see/purchase domains assigned to them via Stripe.
create table if not exists domain_inventory (
  id uuid primary key default gen_random_uuid(),
  domain_name text unique not null,
  domain_type text not null check (domain_type in ('elite', 'standard', 'byo')),
  
  -- Cost tracking
  purchase_cost decimal(10,2) default 0,          -- What Superwave paid Inboxing.com
  sale_price decimal(10,2) default 0,             -- What the user pays (markup)
  
  -- Status lifecycle: available -> reserved -> assigned | reclaimed
  status text not null default 'available' 
    check (status in ('available', 'reserved', 'assigned', 'reclaimed', 'suspended')),
  
  -- Assignment tracking
  assigned_to_company_id uuid references companies(id) on delete set null,
  assigned_at timestamptz,
  reserved_until timestamptz,  -- For checkout hold (15min TTL)
  
  -- Inboxing.com reference
  inboxing_id text,                     -- Inboxing.com domain ID
  inboxing_status text,                 -- Mirrors Inboxing status
  mailbox_count int default 0,
  user_count int default 49,            -- 25 or 49 mailboxes per domain
  nameservers text[] default '{}',
  
  -- Domain metadata
  domain_age_years int,                 -- For elite domains
  warmup_started_at timestamptz,
  warmup_completed_at timestamptz,
  health_score int,                     -- 0-100
  tags text[] default '{}',
  notes text,                           -- Admin notes
  
  -- Audit
  created_by text,                      -- Admin email who added it
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Indexes for domain_inventory
create index if not exists idx_domain_inventory_status on domain_inventory(status);
create index if not exists idx_domain_inventory_assigned_company on domain_inventory(assigned_to_company_id);
create index if not exists idx_domain_inventory_type on domain_inventory(domain_type);
create index if not exists idx_domain_inventory_inboxing_id on domain_inventory(inboxing_id);


-- 2. Domain transactions (sales ledger)
-- Records every purchase, refund, and transfer.
create table if not exists domain_transactions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id) not null,
  domain_inventory_id uuid references domain_inventory(id),
  
  -- Stripe references
  stripe_payment_intent_id text,
  stripe_checkout_session_id text,
  stripe_subscription_id text,          -- For monthly mailbox fees
  
  -- Financial
  amount_paid decimal(10,2) not null default 0,
  currency text default 'usd',
  
  -- Type: purchase (user buys), refund (money back), transfer (admin moves)
  type text not null check (type in ('purchase', 'refund', 'transfer', 'admin_assign')),
  
  -- Status: pending (checkout started), completed (paid), failed, refunded
  status text not null default 'pending'
    check (status in ('pending', 'completed', 'failed', 'refunded')),
  
  -- Metadata
  metadata jsonb default '{}',         -- Extra context (transfer reason, etc.)
  
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Indexes for domain_transactions
create index if not exists idx_domain_transactions_company on domain_transactions(company_id);
create index if not exists idx_domain_transactions_domain on domain_transactions(domain_inventory_id);
create index if not exists idx_domain_transactions_stripe_session on domain_transactions(stripe_checkout_session_id);
create index if not exists idx_domain_transactions_status on domain_transactions(status);


-- 3. Mailbox subscriptions (monthly recurring billing)
-- Tracks per-domain monthly mailbox fees.
create table if not exists mailbox_subscriptions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id) not null,
  domain_inventory_id uuid references domain_inventory(id) not null,
  
  -- Billing
  mailbox_count int not null default 3,
  price_per_mailbox decimal(10,2) default 10.00,   -- $10/mailbox/mo
  monthly_price decimal(10,2) generated always as (mailbox_count * price_per_mailbox) stored,
  
  -- Stripe subscription
  stripe_subscription_id text,
  stripe_price_id text,                 -- Stripe recurring price object
  
  -- Status
  status text not null default 'active'
    check (status in ('active', 'canceled', 'past_due', 'paused', 'trialing')),
  
  -- Period tracking
  current_period_start timestamptz,
  current_period_end timestamptz,
  canceled_at timestamptz,
  
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Indexes for mailbox_subscriptions
create index if not exists idx_mailbox_subs_company on mailbox_subscriptions(company_id);
create index if not exists idx_mailbox_subs_domain on mailbox_subscriptions(domain_inventory_id);
create index if not exists idx_mailbox_subs_stripe on mailbox_subscriptions(stripe_subscription_id);
create index if not exists idx_mailbox_subs_status on mailbox_subscriptions(status);


-- 4. Company billing (Stripe customer mapping)
-- One record per company for Stripe integration.
create table if not exists company_billing (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id) unique not null,
  
  -- Stripe customer
  stripe_customer_id text unique,
  payment_method_id text,               -- Default payment method
  
  -- Billing info
  billing_email text,
  billing_name text,
  
  -- Preferences
  auto_renew_domains boolean default true,
  
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Indexes for company_billing
create index if not exists idx_company_billing_stripe on company_billing(stripe_customer_id);


-- 5. Enable RLS on all new tables (service_role bypasses)
alter table domain_inventory enable row level security;
alter table domain_transactions enable row level security;
alter table mailbox_subscriptions enable row level security;
alter table company_billing enable row level security;

-- RLS policies: service_role gets full access (matches existing pattern)
create policy "Service role full access" on domain_inventory
  for all using (true) with check (true);

create policy "Service role full access" on domain_transactions
  for all using (true) with check (true);

create policy "Service role full access" on mailbox_subscriptions
  for all using (true) with check (true);

create policy "Service role full access" on company_billing
  for all using (true) with check (true);


-- 6. Updated_at triggers
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger domain_inventory_updated_at
  before update on domain_inventory
  for each row execute function update_updated_at();

create trigger domain_transactions_updated_at
  before update on domain_transactions
  for each row execute function update_updated_at();

create trigger mailbox_subscriptions_updated_at
  before update on mailbox_subscriptions
  for each row execute function update_updated_at();

create trigger company_billing_updated_at
  before update on company_billing
  for each row execute function update_updated_at();


-- ============================================================
-- VIEWS for admin dashboard quick queries
-- ============================================================

-- Domain inventory stats (used by admin dashboard)
create or replace view domain_inventory_stats as
select
  count(*) filter (where status = 'available') as available_count,
  count(*) filter (where status = 'assigned') as assigned_count,
  count(*) filter (where status = 'reserved') as reserved_count,
  count(*) filter (where status = 'suspended') as suspended_count,
  count(*) as total_count,
  count(*) filter (where domain_type = 'elite') as elite_count,
  count(*) filter (where domain_type = 'standard') as standard_count,
  count(*) filter (where domain_type = 'byo') as byo_count,
  coalesce(sum(purchase_cost), 0) as total_purchase_cost,
  coalesce(sum(sale_price) filter (where status = 'assigned'), 0) as total_revenue
from domain_inventory;

-- Per-company domain usage
create or replace view company_domain_usage as
select
  c.id as company_id,
  c.name as company_name,
  count(di.id) as domain_count,
  coalesce(sum(ms.monthly_price), 0) as monthly_recurring,
  coalesce(sum(dt.amount_paid) filter (where dt.status = 'completed'), 0) as total_spent
from companies c
left join domain_inventory di on di.assigned_to_company_id = c.id and di.status = 'assigned'
left join mailbox_subscriptions ms on ms.company_id = c.id and ms.status = 'active'
left join domain_transactions dt on dt.company_id = c.id
group by c.id, c.name;
