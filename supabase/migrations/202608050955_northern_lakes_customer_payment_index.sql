-- Cover the customer_payments customer foreign key and customer-portal ownership lookup.
create index if not exists customer_payments_customer_idx
  on public.customer_payments (customer_id);
