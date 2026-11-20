// https://docs.expo.dev/guides/customizing-metro/
const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

/** First value of a header that a chain of proxies may have repeated ("https, https" -> "https"). */
function firstValue(value) {
  return String(Array.isArray(value) ? value[0] : value)
    .split(',')[0]
    .trim();
}

const upstream = config.server?.enhanceMiddleware;
config.server = {
  ...config.server,
  enhanceMiddleware: (middleware, server) => {
    const base = upstream ? upstream(middleware, server) : middleware;
    return (req, res, next) => {
      // Through a tunnel, each proxy hop can add its own X-Forwarded-* value. Node joins repeats
      // as "https, https", and Metro builds a URL from that string and throws "Invalid URL" (a 500
      // on every bundle request). Keep only the first value.
      for (const name of ['x-forwarded-proto', 'x-forwarded-host']) {
        if (req.headers[name]) req.headers[name] = firstValue(req.headers[name]);
      }

      // Phones request dev bundles as multipart (for a progress bar), and the dev server never gzips
      // multipart responses. Dropping that header makes Metro answer with a plain bundle that is
      // gzipped: about 6x smaller on the wire, which matters over a tunnel or a slow link.
      if (req.url?.includes('.bundle') && /multipart\/mixed/i.test(String(req.headers.accept ?? ''))) {
        delete req.headers.accept;
      }

      return base(req, res, next);
    };
  },
};

module.exports = config;
