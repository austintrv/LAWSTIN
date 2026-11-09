-- Graded essays count toward the day like quiz answers. The app writes one row per answer an
-- essay stands for (five, or ten at exam length), `correct` in proportion to its score.
-- 'voice' was added earlier for spoken quizzes through the cloud connector.
alter table public.study_events drop constraint if exists study_events_kind_check;
alter table public.study_events add constraint study_events_kind_check check (kind in ('card', 'drill', 'voice', 'written'));
