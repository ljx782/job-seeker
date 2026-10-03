import { getStore } from '@netlify/blobs';
import { createCloudService } from '../../server/cloud/service.mjs';
export default async (request, context) => {
  try { return await createCloudService({ store: getStore({ name: 'jobseeker-private', consistency: 'strong' }) }).handle(request, context); }
  catch (error) { return Response.json({ hosting: 'netlify', error: error.code === 'SETUP_REQUIRED' ? error.message : '云端配置或存储尚未就绪，请检查 Netlify 环境变量和函数日志', code: error.code || 'CLOUD_SETUP' }, { status: 503, headers: { 'Cache-Control': 'no-store' } }); }
};
export const config = { path: '/api/*' };
