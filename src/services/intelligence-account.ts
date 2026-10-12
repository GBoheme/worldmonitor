import type { AuthSession } from './auth-state';

export interface IntelligenceAccountDependencies {
  enabled(): boolean;
  initialize(): Promise<void>;
  install(variant: string): void;
  subscribe(listener: (state: AuthSession) => void): () => void;
  signIn(userId: string, variant: string): Promise<void>;
  signOut(): void;
}

/** Reuse the existing account reconciler; never create a parallel credential store. */
export async function startIntelligenceAccountSync(variant: string, signal: AbortSignal,
  dependencies?: IntelligenceAccountDependencies): Promise<() => void> {
  let bridge = dependencies;
  if (!bridge) {
    const [auth, cloud] = await Promise.all([import('./auth-state'), import('@/utils/cloud-prefs-sync')]);
    bridge = { enabled: cloud.isCloudSyncEnabled, initialize: auth.initAuthState, install: cloud.install,
      subscribe: auth.subscribeAuthState, signIn: cloud.onSignIn, signOut: cloud.onSignOut };
  }
  if (signal.aborted || !bridge.enabled()) return () => {};
  await bridge.initialize();
  if (signal.aborted) return () => {};
  bridge.install(variant);
  const account = bridge;
  let previous: string | null = null;
  const unsubscribe = account.subscribe(state => {
    if (signal.aborted) return;
    const userId = state.user?.id ?? null;
    if (userId === previous) return;
    previous = userId;
    if (userId) {
      // Generation fences, retries and observable errors belong to the original reconciler.
      void account.signIn(userId, variant).catch(() => {});
    } else account.signOut();
  });
  let disposed = false;
  const dispose = (): void => {
    if (disposed) return;
    disposed = true; unsubscribe(); signal.removeEventListener('abort', dispose);
  };
  signal.addEventListener('abort', dispose, { once: true });
  if (signal.aborted) dispose();
  return dispose;
}
