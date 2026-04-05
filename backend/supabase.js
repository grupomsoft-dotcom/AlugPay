const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://ofjpabnnjgbuzsltqlfm.supabase.co',
  'sb_publishable_0GcMJM2KZuxF0rxDWcni-A_J_TkXoj7'
);

module.exports = supabase;