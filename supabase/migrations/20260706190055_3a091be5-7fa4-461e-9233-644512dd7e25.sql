ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS requested_role public.app_role;