import { useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured, saveSupabaseConfig, SUPABASE_URL, SUPABASE_ANON_KEY } from './lib/supabase';
import type { AppState } from './types';

interface AuthModalProps {
  user: User | null;
  state: AppState;
  onClose: () => void;
  onSyncPush: () => Promise<void>;
  onSyncPull: () => Promise<void>;
}

export default function AuthModal({ user, onClose, onSyncPush, onSyncPull }: AuthModalProps) {
  const [tab, setTab] = useState<'login' | 'signup' | 'config'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ type: 'error' | 'success'; text: string } | null>(null);

  // Manual config state
  const [configUrl, setConfigUrl] = useState(SUPABASE_URL);
  const [configKey, setConfigKey] = useState(SUPABASE_ANON_KEY);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) return;
    setLoading(true);
    setMsg(null);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: password.trim(),
      });
      if (error) {
        setMsg({ type: 'error', text: error.message });
      } else {
        setMsg({ type: 'success', text: 'Успешный вход! Загружаем данные...' });
        await onSyncPull();
        setTimeout(onClose, 800);
      }
    } catch (err: unknown) {
      setMsg({ type: 'error', text: (err as Error).message || 'Ошибка входа' });
    } finally {
      setLoading(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) return;
    setLoading(true);
    setMsg(null);
    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password: password.trim(),
      });
      if (error) {
        setMsg({ type: 'error', text: error.message });
      } else if (data?.session) {
        setMsg({ type: 'success', text: 'Успешная регистрация! Данные синхронизируются...' });
        await onSyncPush();
        setTimeout(onClose, 800);
      } else {
        setMsg({
          type: 'success',
          text: 'Аккаунт создан! Перейдите во вкладку «Вход» и войдите.',
        });
      }
    } catch (err: unknown) {
      setMsg({ type: 'error', text: (err as Error).message || 'Ошибка регистрации' });
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    onClose();
  };

  const handleSaveConfig = (e: React.FormEvent) => {
    e.preventDefault();
    if (!configUrl.trim() || !configKey.trim()) {
      setMsg({ type: 'error', text: 'Заполните URL и Anon Key' });
      return;
    }
    saveSupabaseConfig(configUrl, configKey);
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 440 }}>
        <div className="modal-header">
          <div className="flex items-center gap-8">
            <span style={{ fontSize: '1.4rem' }}>☁️</span>
            <div>
              <div className="modal-title">Синхронизация данных</div>
              <div className="text-xs text-muted">Сохранение на всех устройствах через Supabase</div>
            </div>
          </div>
          <button className="btn-icon" onClick={onClose}>✕</button>
        </div>

        {/* LOGGED IN VIEW */}
        {user ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ background: 'rgba(34, 197, 94, 0.1)', border: '1px solid rgba(34, 197, 94, 0.3)', borderRadius: 'var(--r-md)', padding: '12px 14px' }}>
              <div className="flex items-center gap-8">
                <span style={{ fontSize: '1.2rem' }}>🟢</span>
                <div>
                  <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--green)' }}>Синхронизация активна</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{user.email}</div>
                </div>
              </div>
            </div>

            <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              Любые изменения в расписании и автобусах на этом устройстве автоматически сохраняются в вашем облачном аккаунте.
            </p>

            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className="btn btn-primary"
                style={{ flex: 1, fontSize: '0.8rem' }}
                onClick={async () => {
                  setLoading(true);
                  await onSyncPush();
                  setLoading(false);
                  setMsg({ type: 'success', text: 'Данные выгружены в облако!' });
                }}
                disabled={loading}
              >
                📤 Сохранить в облако
              </button>
              <button
                className="btn btn-secondary"
                style={{ flex: 1, fontSize: '0.8rem' }}
                onClick={async () => {
                  setLoading(true);
                  await onSyncPull();
                  setLoading(false);
                  setMsg({ type: 'success', text: 'Данные получены из облака!' });
                }}
                disabled={loading}
              >
                📥 Загрузить из облака
              </button>
            </div>

            {msg && (
              <div style={{ fontSize: '0.8rem', color: msg.type === 'error' ? 'var(--red)' : 'var(--green)', padding: '4px 0' }}>
                {msg.text}
              </div>
            )}

            <button
              className="btn btn-ghost"
              style={{ color: 'var(--red)', marginTop: 8 }}
              onClick={handleLogout}
            >
              🚪 Выйти из аккаунта
            </button>
          </div>
        ) : !isSupabaseConfigured || tab === 'config' ? (
          /* CONFIG VIEW IF NOT YET SET */
          <form onSubmit={handleSaveConfig} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ background: 'rgba(99, 102, 241, 0.1)', border: '1px solid rgba(99, 102, 241, 0.25)', borderRadius: 'var(--r-md)', padding: 12 }}>
              <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--accent-light)' }}>
                🔑 Подключение Supabase
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: 4 }}>
                Введите Project URL и Anon Key из настроек вашего проекта Supabase (Project Settings → API).
              </div>
            </div>

            <div>
              <label className="form-label">Project URL</label>
              <input
                className="form-input"
                placeholder="https://xyzcompany.supabase.co"
                value={configUrl}
                onChange={e => setConfigUrl(e.target.value)}
                required
              />
            </div>

            <div>
              <label className="form-label">Anon / Public API Key</label>
              <input
                className="form-input"
                type="password"
                placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                value={configKey}
                onChange={e => setConfigKey(e.target.value)}
                required
              />
            </div>

            {msg && (
              <div style={{ fontSize: '0.8rem', color: msg.type === 'error' ? 'var(--red)' : 'var(--green)' }}>
                {msg.text}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              <button type="submit" className="btn btn-primary w-full">
                💾 Сохранить и подключить
              </button>
              {isSupabaseConfigured && (
                <button type="button" className="btn btn-secondary" onClick={() => setTab('login')}>
                  Назад
                </button>
              )}
            </div>
          </form>
        ) : (
          /* LOGIN / SIGNUP TABS */
          <div>
            <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: 16 }}>
              <button
                type="button"
                className={`tab-btn ${tab === 'login' ? 'active' : ''}`}
                style={{ flex: 1, padding: '8px 0', borderBottom: tab === 'login' ? '2px solid var(--accent)' : 'none' }}
                onClick={() => { setTab('login'); setMsg(null); }}
              >
                Вход
              </button>
              <button
                type="button"
                className={`tab-btn ${tab === 'signup' ? 'active' : ''}`}
                style={{ flex: 1, padding: '8px 0', borderBottom: tab === 'signup' ? '2px solid var(--accent)' : 'none' }}
                onClick={() => { setTab('signup'); setMsg(null); }}
              >
                Регистрация
              </button>
            </div>

            <form onSubmit={tab === 'login' ? handleLogin : handleSignup} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label className="form-label">Email</label>
                <input
                  type="email"
                  className="form-input"
                  placeholder="student@example.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                />
              </div>

              <div>
                <label className="form-label">Пароль</label>
                <input
                  type="password"
                  className="form-input"
                  placeholder="••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                />
              </div>

              {msg && (
                <div style={{ fontSize: '0.8rem', color: msg.type === 'error' ? 'var(--red)' : 'var(--green)' }}>
                  {msg.text}
                </div>
              )}

              <button type="submit" className="btn btn-primary w-full" disabled={loading} style={{ marginTop: 4 }}>
                {loading ? 'Загрузка...' : tab === 'login' ? 'Войти в аккаунт' : 'Создать аккаунт'}
              </button>

              <div className="flex items-center justify-between" style={{ marginTop: 8 }}>
                <span className="text-xs text-muted">
                  Данные защищены Row Level Security
                </span>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}
                  onClick={() => setTab('config')}
                >
                  ⚙️ Настройки Supabase
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
