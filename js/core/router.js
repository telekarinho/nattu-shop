/* ============================================
   CLUBE DO NATURAL — Hash Router
   Navegação SPA simples
   ============================================ */

const Router = (() => {
  const routes = {};
  let currentRoute = null;

  function parseHash() {
    const hash = window.location.hash.slice(1) || '/';
    const [path, queryString] = hash.split('?');
    const params = {};
    if (queryString) {
      queryString.split('&').forEach(pair => {
        const [k, v] = pair.split('=');
        params[decodeURIComponent(k)] = decodeURIComponent(v || '');
      });
    }
    return { path, params };
  }

  function matchRoute(path) {
    // Exact match first
    if (routes[path]) return { handler: routes[path], routeParams: {} };

    // Pattern match (e.g., /produto/:id)
    for (const [pattern, handler] of Object.entries(routes)) {
      const patternParts = pattern.split('/');
      const pathParts = path.split('/');
      if (patternParts.length !== pathParts.length) continue;

      const routeParams = {};
      let match = true;
      for (let i = 0; i < patternParts.length; i++) {
        if (patternParts[i].startsWith(':')) {
          routeParams[patternParts[i].slice(1)] = pathParts[i];
        } else if (patternParts[i] !== pathParts[i]) {
          match = false;
          break;
        }
      }
      if (match) return { handler, routeParams };
    }

    return null;
  }

  function navigate() {
    const { path, params } = parseHash();
    const match = matchRoute(path);

    if (match) {
      currentRoute = path;
      match.handler({ ...params, ...match.routeParams });
    } else if (routes['*']) {
      routes['*']({ path, ...params });
    }
  }

  return {
    add(path, handler) {
      routes[path] = handler;
      return this;
    },

    go(path) {
      window.location.hash = '#' + path;
    },

    start() {
      window.addEventListener('hashchange', navigate);
      navigate();
    },

    getCurrent() {
      return currentRoute;
    },
  };
})();
