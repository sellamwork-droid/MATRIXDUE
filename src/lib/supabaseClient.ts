import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

const isConfigured =
  supabaseUrl &&
  supabaseAnonKey &&
  !supabaseUrl.includes('placeholder') &&
  !supabaseAnonKey.includes('placeholder')

// Real client when configured, stub when not
export const supabase = isConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : ((() => {
      /* eslint-disable @typescript-eslint/no-explicit-any */
      const makeBuilder = (): any => {
        const b: any = new Proxy({}, {
          get(_target, prop) {
            if (prop === 'then') return (resolve: any) => resolve({ data: [], error: null })
            if (prop === 'single' || prop === 'maybeSingle') return () => Promise.resolve({ data: null, error: null })
            return (..._args: any[]) => b
          },
        })
        return b
      }
      return {
        auth: {
          getUser: async () => ({ data: { user: null }, error: null }),
          getSession: async () => ({ data: { session: null }, error: null }),
          signInWithPassword: async () => ({ data: null, error: { message: 'Supabase non configurato' } }),
          signOut: async () => ({ error: null }),
          onAuthStateChange: (_cb: any) => ({ data: { subscription: { unsubscribe: () => {} } } }),
        },
        from: (_table: string) => makeBuilder(),
        rpc: async (_fn: string, _params?: any) => ({ data: null, error: null }),
        storage: {
          from: (_bucket: string) => ({
            upload: async () => ({ data: null, error: null }),
            download: async () => ({ data: null, error: null }),
            getPublicUrl: (_path: string) => ({ data: { publicUrl: '' } }),
          }),
        },
      }
    })() as any)

export const supabaseConfigured = isConfigured
