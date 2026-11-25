-- Audit trail kept outside Prisma
CREATE TABLE audit_log (
  id bigint PRIMARY KEY,
  user_id int REFERENCES "User" (id),
  action text NOT NULL
);
