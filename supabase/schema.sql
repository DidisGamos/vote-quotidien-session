-- Utilisateurs (identifiants créés par l'admin, ex : U001, U002...)
-- Remplace le vote 100% anonyme : chaque votant se "connecte" avec son
-- identifiant, ce qui permet de tracer l'historique par personne tout en
-- gardant une seule table de votes pour tout le monde (pas de table par
-- utilisateur).
create table if not exists users (
  id text primary key,               -- ex: 'U001'
  label text,                        -- nom/étiquette optionnel donné par l'admin
  created_at timestamptz default now()
);

create table if not exists votes (
  id bigserial primary key,
  category text not null,
  value int not null,
  date text not null,
  comment text,
  created_at timestamptz default now()
);

-- Si la table `votes` existait déjà (avant l'ajout des identifiants), la
-- ligne ci-dessus ne fait rien : on ajoute donc la colonne manquante en
-- migration explicite, ce qui fonctionne aussi bien sur une base neuve.
alter table votes add column if not exists user_id text references users(id) on delete set null;

create index if not exists idx_votes_created_at on votes(created_at desc);
create index if not exists idx_votes_category_date on votes(category, date);
create index if not exists idx_votes_user on votes(user_id);

-- Un seul vote par utilisateur, par volet, par jour (les votes historiques
-- sans user_id, antérieurs à cette mise à jour, ne sont pas concernés).
create unique index if not exists idx_votes_user_category_date
  on votes(user_id, category, date)
  where user_id is not null;

-- Table pour archiver les votes lorsque l'admin réinitialise un identifiant
create table if not exists archived_votes (
  id bigserial primary key,
  original_id bigint,
  user_id text,
  category text not null,
  value int,
  date text,
  comment text,
  created_at timestamptz,
  archived_at timestamptz not null default now()
);

create index if not exists idx_archived_votes_archived_at on archived_votes(archived_at desc);
create index if not exists idx_archived_votes_user on archived_votes(user_id);

