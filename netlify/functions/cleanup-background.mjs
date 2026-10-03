import { getStore } from '@netlify/blobs';
import { createCloudService } from '../../server/cloud/service.mjs';
import { same } from '../../server/cloud/security.mjs';
export default async request => {
  const service = createCloudService({ store: getStore({ name: 'jobseeker-private', consistency: 'strong' }) });
  if (!same(request.headers.get('x-jobseeker-worker') || '', service.security.sign('cleanup', new Date().toISOString().slice(0,10)))) return new Response('Forbidden', { status: 403 });
  return Response.json(await service.cleanup());
};
