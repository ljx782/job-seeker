export function createRouter(render) {
  const routes=['jobs','resume','tracker','insights','settings'];
  const run=()=>{const route=location.hash.replace(/^#\/?/,'').split('?')[0]||'jobs';render(routes.includes(route)?route:'jobs');};
  window.addEventListener('hashchange',run);run();
  return {go(route){if(location.hash===`#/${route}`)run();else location.hash=`/${route}`;},refresh:run};
}
