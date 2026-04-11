import { APP_NAME } from '../constants/app.js';
import { getRouteByPath, initRouter, navigateTo } from './router.js';
import { createStore } from './store.js';
import { renderAppShell } from '../components/AppShell.js';
import { initializeFirebase } from '../firebase/app.js';
import { observeAuthState, loginWithEmailPassword, logoutCurrentUser } from '../firebase/auth.js';
import { canAccessRoute } from '../guards/roleGuard.js';
import { ROUTE_PATHS } from '../constants/routes.js';
import { getCurrentUserProfile } from '../services/userService.js';

const initialState = {
  appReady: false,
  firebaseReady: false,
  firebaseMissingKeys: [],
  browserOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
  currentRoute: null,
  currentUser: null,
  authResolved: false,
  authLoading: false,
  authError: '',
  logoutLoading: false,
  profileLoading: false,
  profileError: ''
};

export function createApp(rootElement) {
  const store = createStore(initialState);

  const syncBrowserOnlineStatus = () => {
    store.setState({
      browserOnline: navigator.onLine
    });
  };

  const syncRouteWithAuth = (targetRoute) => {
    const state = store.getState();
    const route = targetRoute ?? state.currentRoute ?? getRouteByPath(location.hash);

    if (!state.authResolved && route.requiresAuth) {
      store.setState({ currentRoute: route });
      return;
    }

    if (!canAccessRoute(route, state.currentUser)) {
      const fallbackPath =
        state.currentUser && state.currentUser.active !== false
          ? ROUTE_PATHS.ORDERS
          : ROUTE_PATHS.LOGIN;

      if (location.hash !== `#${fallbackPath}`) {
        navigateTo(fallbackPath);
        return;
      }

      store.setState({ currentRoute: getRouteByPath(fallbackPath) });
      return;
    }

    if (state.currentUser && state.currentUser.active !== false && route.path === ROUTE_PATHS.LOGIN) {
      if (location.hash !== `#${ROUTE_PATHS.ORDERS}`) {
        navigateTo(ROUTE_PATHS.ORDERS);
        return;
      }

      store.setState({ currentRoute: getRouteByPath(ROUTE_PATHS.ORDERS) });
      return;
    }

    store.setState({ currentRoute: route });
  };

  const handleLogin = async ({ email, password }) => {
    store.setState({
      authLoading: true,
      authError: ''
    });

    try {
      await loginWithEmailPassword({ email, password });
    } catch (error) {
      store.setState({
        authError: error.message || 'Sign in failed.',
        authLoading: false
      });
      return;
    }

    store.setState({
      authLoading: false,
      authError: ''
    });
  };

  const handleLogout = async () => {
    store.setState({
      logoutLoading: true,
      authError: ''
    });

    try {
      await logoutCurrentUser();
      navigateTo(ROUTE_PATHS.LOGIN);
    } catch (error) {
      store.setState({
        authError: error.message || 'Sign out failed.',
        logoutLoading: false
      });
      return;
    }

    store.setState({
      logoutLoading: false
    });
  };

  const render = () => {
    const state = store.getState();
    const route = state.currentRoute ?? getRouteByPath('/');

    rootElement.innerHTML = '';
    rootElement.appendChild(
      renderAppShell({
        appName: APP_NAME,
        route,
        state,
        onNavigate: navigateTo,
        onLogin: handleLogin,
        onLogout: handleLogout
      })
    );
  };

  store.subscribe(render);

  window.addEventListener('online', syncBrowserOnlineStatus);
  window.addEventListener('offline', syncBrowserOnlineStatus);

  initRouter((route) => {
    syncRouteWithAuth(route);
  });

  const firebaseServices = initializeFirebase();

  if (firebaseServices.ready) {
    observeAuthState(async (currentUser) => {
      if (!currentUser) {
        store.setState({
          currentUser: null,
          authResolved: true,
          authLoading: false,
          logoutLoading: false,
          profileLoading: false,
          profileError: ''
        });

        syncRouteWithAuth(getRouteByPath(location.hash));
        return;
      }

      store.setState({
        authLoading: false,
        logoutLoading: false,
        profileLoading: true,
        profileError: ''
      });

      let profile = null;

      try {
        profile = await getCurrentUserProfile(currentUser.uid);
      } catch (error) {
        store.setState({
          profileError: error.message || 'Failed to load user profile.'
        });
      }

      store.setState({
        currentUser: {
          ...currentUser,
          name: profile?.name || currentUser.name,
          role: profile?.role || 'viewer',
          active: profile?.active ?? true,
          profileLoaded: Boolean(profile)
        },
        authResolved: true,
        profileLoading: false,
        authError: profile?.active === false ? 'This account is inactive. Please contact your administrator.' : ''
      });

      syncRouteWithAuth(getRouteByPath(location.hash));
    });
  }

  store.setState({
    appReady: true,
    firebaseReady: firebaseServices.ready,
    firebaseMissingKeys: firebaseServices.missingKeys,
    browserOnline: navigator.onLine,
    authResolved: !firebaseServices.ready,
    currentRoute: getRouteByPath(location.hash.replace('#', '') || '/')
  });

  syncRouteWithAuth(getRouteByPath(location.hash.replace('#', '') || '/'));
  render();
}
