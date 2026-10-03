import { getLocalService } from './api.js';

export function cloudSettings() {
  if (getLocalService()?.hosting !== 'netlify') return '';
  return '<section class="panel"><div class="panel-heading"><h3>云端连接已开启</h3></div><p class="setting-description">打开链接即可使用，无需登录。AI 密钥仅保存在服务端；邮箱、任务及投递回执加密保存，并按当前浏览器隔离。个人简历与手账仍保存在当前浏览器。</p><p class="caption mt-20">请使用同一浏览器继续处理邮件。清除 Cookie 或更换浏览器后，需要重新连接邮箱；停止自动收信请先在下方断开邮箱。</p></section>';
}
