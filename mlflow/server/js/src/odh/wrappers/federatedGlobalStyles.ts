// CSS required by MLflow components. In standalone mode these are loaded by
// app.tsx; in federated mode we must import them here since app.tsx is not
// in the bundle. Kept in its own module so unit tests can mock it: Jest's
// `@databricks/design-system/(.+)` mapper cannot resolve the dist CSS paths.
import 'font-awesome/css/font-awesome.css';
import '@databricks/design-system/dist/index.css';
import '@databricks/design-system/dist/index-dark.css';
