import { getStore } from '@netlify/blobs';
import { createCloudService } from '../../server/cloud/service.mjs';
import { same } from '../../server/cloud/security.mjs';
export default async request => {
  const service = createCloudService({ store: getStore({ name: 'jobseeker-private', consistency: 'strong' }) });
  const supplied = request.headers.get('x-jobseeker-worker') || '';
  const minute = Math.floor(Date.now()/60000);
  if (request.method !== 'POST' || ![minute,minute-1,minute-2].some(t => same(supplied,service.security.sign('schedule',String(t))))) return new Response('Forbidden',{status:403});
  return Response.json(await service.schedule());
};
