create table if not exists votes (
  id bigserial primary key,
  category text not null,
  value int not null,
  date text not null,
  comment text,
  created_at timestamptz default now()
);

create index if not exists idx_votes_created_at on votes(created_at desc);
create index if not exists idx_votes_category_date on votes(category, date);
