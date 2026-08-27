// Fires a GA4 pageview for the given path. The base gtag.js snippet lives in index.html with
// send_page_view disabled -- this is the single source of truth for every pageview (the first
// one included), since a client-side-routed SPA only gets one real page load per session. Same
// pattern as CFB_top25's src/utils/analytics.js -- both apps share the G-9K08FK3SWH property;
// page_path/page_location below is what keeps them broken out from each other in reports.
export function trackPageview(path, title) {
  if (typeof window === 'undefined' || typeof window.gtag !== 'function') return;
  window.gtag('event', 'page_view', {
    page_path: path,
    page_title: title || document.title,
    page_location: window.location.href,
  });
}
