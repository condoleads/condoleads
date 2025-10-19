-- Create open_houses table
CREATE TABLE IF NOT EXISTS public.open_houses (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    listing_id UUID NOT NULL REFERENCES public.mls_listings(id) ON DELETE CASCADE,
    open_house_key TEXT,
    open_house_id TEXT,
    open_house_date DATE,
    open_house_start_time TIMESTAMPTZ,
    open_house_end_time TIMESTAMPTZ,
    open_house_type TEXT,
    open_house_status TEXT,
    original_entry_timestamp TIMESTAMPTZ,
    modification_timestamp TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_open_houses_listing_id ON public.open_houses(listing_id);
CREATE INDEX IF NOT EXISTS idx_open_houses_date ON public.open_houses(open_house_date);
CREATE INDEX IF NOT EXISTS idx_open_houses_status ON public.open_houses(open_house_status);

-- Enable RLS
ALTER TABLE public.open_houses ENABLE ROW LEVEL SECURITY;

-- Create policy for authenticated users
CREATE POLICY "Allow authenticated read access" ON public.open_houses
    FOR SELECT TO authenticated USING (true);

-- Create policy for service role
CREATE POLICY "Allow service role full access" ON public.open_houses
    FOR ALL TO service_role USING (true);