// Route all /api/* requests to the bundled Express application.
// Its internal TypeScript modules are prebundled by the build command.
import apiApp from '../server-bundle.mjs';
export default apiApp;
