-- Phase 3 games were added to prisma/seed.ts but existing deployments only had match3 + blockblast.
INSERT INTO "Game" ("id", "slug", "title", "active", "maxScorePerSession")
VALUES
  (gen_random_uuid(), 'game2048', '2048', true, 50000),
  (gen_random_uuid(), 'flappy', 'Flappy', true, 500),
  (gen_random_uuid(), 'quiz', 'Викторина', true, 5000)
ON CONFLICT ("slug") DO NOTHING;

INSERT INTO "Quiz" ("id", "title", "active", "showInHub")
VALUES ('default-quiz', 'Друзья — викторина', true, false)
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "QuizQuestion" ("id", "quizId", "sort", "text", "options", "correctIndex")
VALUES
  (
    'default-quiz-q1',
    'default-quiz',
    1,
    'Что можно заказать в «Друзья»?',
    '["Кальян", "Суши", "Пицца", "Бургеры"]'::jsonb,
    0
  ),
  (
    'default-quiz-q2',
    'default-quiz',
    2,
    'Бонусы начисляются за…',
    '["Чек", "Парковку", "Wi‑Fi", "Отзыв"]'::jsonb,
    0
  )
ON CONFLICT ("id") DO NOTHING;
