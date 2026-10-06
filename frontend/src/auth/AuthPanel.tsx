import { useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from './AuthContext.js';

export function AuthPanel() {
  const {
    user,
    profile,
    loading,
    dialogOpen,
    openAuthDialog,
    closeAuthDialog,
    login,
    register,
    logout,
  } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === 'login') await login({ email, password });
      else await register({ email, displayName, password });
      setPassword('');
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'No pudimos continuar.');
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    setBusy(true);
    setError(null);
    try {
      await logout();
    } catch (signOutError) {
      setError(signOutError instanceof Error ? signOutError.message : 'No pudimos cerrar sesión.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button className="account-button" type="button" onClick={openAuthDialog}>
        {loading ? 'Cargando…' : user ? user.displayName : 'Ingresar'}
      </button>
      {dialogOpen &&
        createPortal(
          <div
            className="auth-backdrop"
            onMouseDown={(event) => event.target === event.currentTarget && closeAuthDialog()}
          >
            <section
              className="auth-panel"
              role="dialog"
              aria-modal="true"
              aria-labelledby="auth-title"
            >
              <button
                className="auth-panel__close"
                type="button"
                onClick={closeAuthDialog}
                aria-label="Cerrar"
              >
                ×
              </button>
              {user ? (
                <>
                  <span className="auth-panel__eyebrow">PERFIL</span>
                  <h2 id="auth-title">Hola, {profile?.displayName ?? user.displayName}</h2>
                  <p>{user.email}</p>
                  {profile && (
                    <dl className="profile-stats">
                      <div>
                        <dt>Reportes</dt>
                        <dd>{profile.reportCount}</dd>
                      </div>
                      <div>
                        <dt>Confirmaciones dadas</dt>
                        <dd>{profile.confirmationsGiven}</dd>
                      </div>
                      <div>
                        <dt>Reportes confirmados</dt>
                        <dd>{profile.reputation.confirmedReports}</dd>
                      </div>
                      <div>
                        <dt>Reportes resueltos</dt>
                        <dd>{profile.reputation.resolvedReports}</dd>
                      </div>
                      <div>
                        <dt>Feedback útil</dt>
                        <dd>{profile.reputation.usefulFeedback}</dd>
                      </div>
                    </dl>
                  )}
                  {profile && (
                    <p>
                      En Street Status desde{' '}
                      {new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium' }).format(
                        new Date(profile.createdAt),
                      )}
                    </p>
                  )}
                  {error && (
                    <p role="alert" className="auth-panel__error">
                      {error}
                    </p>
                  )}
                  <button
                    className="auth-submit"
                    type="button"
                    onClick={() => void signOut()}
                    disabled={busy}
                  >
                    {busy ? 'Cerrando sesión…' : 'Cerrar sesión'}
                  </button>
                </>
              ) : (
                <>
                  <span className="auth-panel__eyebrow">STREET STATUS</span>
                  <h2 id="auth-title">
                    {mode === 'login' ? 'Ingresá a tu cuenta' : 'Creá tu cuenta'}
                  </h2>
                  <form onSubmit={(event) => void submit(event)} className="auth-form">
                    {mode === 'register' && (
                      <label>
                        Nombre visible
                        <input
                          autoComplete="name"
                          value={displayName}
                          onChange={(event) => setDisplayName(event.target.value)}
                          required
                          maxLength={80}
                        />
                      </label>
                    )}
                    <label>
                      Email
                      <input
                        type="email"
                        autoComplete="email"
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        required
                        maxLength={254}
                      />
                    </label>
                    <label>
                      Contraseña
                      <input
                        type="password"
                        autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        required
                        minLength={12}
                        maxLength={128}
                      />
                    </label>
                    {mode === 'register' && <small>Usá al menos 12 caracteres.</small>}
                    {error && (
                      <p role="alert" className="auth-panel__error">
                        {error}
                      </p>
                    )}
                    <button className="auth-submit" type="submit" disabled={busy}>
                      {busy ? 'Un momento…' : mode === 'login' ? 'Ingresar' : 'Crear cuenta'}
                    </button>
                  </form>
                  <button
                    className="auth-switch"
                    type="button"
                    onClick={() => {
                      setMode(mode === 'login' ? 'register' : 'login');
                      setError(null);
                    }}
                  >
                    {mode === 'login'
                      ? '¿No tenés cuenta? Registrate'
                      : '¿Ya tenés cuenta? Ingresá'}
                  </button>
                </>
              )}
            </section>
          </div>,
          document.body,
        )}
    </>
  );
}
