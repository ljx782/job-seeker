import { cloudSecurity } from '../../server/cloud/security.mjs';
export default async () => {
  const security=cloudSecurity(), origin=new URL(process.env.DEPLOY_URL||process.env.URL).origin;
  const response=await fetch(origin+'/.netlify/functions/mail-sweep-background',{method:'POST',headers:{'X-Jobseeker-Worker':security.sign('schedule',String(Math.floor(Date.now()/60000)))},signal:AbortSignal.timeout(10000),redirect:'error'});
  if(!response.ok)throw new Error('Mailbox sweep could not be started');
  return Response.json({scheduled:true});
};
export const config = { schedule: '*/2 * * * *' };
