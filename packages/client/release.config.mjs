import { buildReleaserc } from '../../scripts/release/build-releaserc.mjs';

export default buildReleaserc({
  pkg: 'client',
  deployWorkflow: 'deploy-client.yml',
});
