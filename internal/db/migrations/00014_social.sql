-- +goose Up
CREATE TABLE IF NOT EXISTS posts (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id  uuid NOT NULL,
  kind       text NOT NULL,
  body       text NOT NULL,
  media_keys text[],
  refs       jsonb DEFAULT '{}',
  circle_id  uuid,
  visibility text NOT NULL DEFAULT 'public'
             CHECK (visibility IN ('public','circle','followers','private')),
  created_at timestamptz NOT NULL DEFAULT now(),
  score      numeric DEFAULT 0,
  hidden     boolean DEFAULT false
);
CREATE INDEX IF NOT EXISTS idx_posts_recent ON posts(created_at DESC) WHERE NOT hidden;
CREATE INDEX IF NOT EXISTS idx_posts_circle ON posts(circle_id, created_at DESC);

CREATE TABLE IF NOT EXISTS follows (
  follower_id uuid NOT NULL,
  followee_id uuid NOT NULL,
  created_at  timestamptz DEFAULT now(),
  PRIMARY KEY (follower_id, followee_id)
);

CREATE TABLE IF NOT EXISTS post_claps (
  post_id    uuid NOT NULL,
  user_id    uuid NOT NULL,
  count      int NOT NULL DEFAULT 1 CHECK (count BETWEEN 1 AND 50),
  updated_at timestamptz DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);

CREATE TABLE IF NOT EXISTS reshares (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id    uuid NOT NULL,
  user_id    uuid NOT NULL,
  quote_text text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS streaks (
  user_id      uuid NOT NULL,
  kind         text NOT NULL,
  count        int NOT NULL DEFAULT 0,
  last_hit_at  timestamptz,
  freezes_left int NOT NULL DEFAULT 1,
  PRIMARY KEY (user_id, kind)
);

CREATE TABLE IF NOT EXISTS transparency_holds (
  user_id      uuid PRIMARY KEY,
  wings_locked bigint NOT NULL DEFAULT 0,
  reason       text NOT NULL,
  locked_at    timestamptz DEFAULT now(),
  release_by   timestamptz NOT NULL
);

-- +goose Down
DROP TABLE IF EXISTS transparency_holds;
DROP TABLE IF EXISTS streaks;
DROP TABLE IF EXISTS reshares;
DROP TABLE IF EXISTS post_claps;
DROP TABLE IF EXISTS follows;
DROP TABLE IF EXISTS posts;
