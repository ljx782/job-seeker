import { getStore } from '@netlify/blobs';
import { createCloudService } from '../../server/cloud/service.mjs';
export default async request => createCloudService({ store: getStore({ name: 'jobseeker-private', consistency: 'strong' }) }).worker(request);
