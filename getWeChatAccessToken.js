/**
 * 微信登录云函数
 * 
 * 功能：使用微信授权 code 换取 access_token 和 openid
 * 
 * 环境变量配置：
 * - WECHAT_APP_ID: 微信开放平台 AppID
 * - WECHAT_APP_SECRET: 微信开放平台 AppSecret
 * 
 * 安全说明：
 * - AppSecret 仅存储在云函数环境变量中，不会暴露给客户端
 * - 此云函数通过 LeanCloud 调用，自动进行身份验证
 */

const AV = require('leanengine');
const https = require('https');

/**
 * 获取微信 access_token
 * 
 * 请求参数：
 * - code: 微信授权临时票据
 * 
 * 返回数据：
 * - openid: 用户唯一标识
 * - access_token: 访问令牌
 * - expires_in: 过期时间（秒）
 * 
 * 错误码：
 * - 40001: 缺少 code 参数
 * - 40002: 微信 AppID 或 AppSecret 未配置
 * - 40003: 微信 API 调用失败
 */
AV.Cloud.define('getWeChatAccessToken', async (request) => {
  const { code } = request.params;
  
  console.log('[getWeChatAccessToken] 收到请求, code:', code ? code.substring(0, 10) + '...' : 'null');
  
  // 参数验证
  if (!code) {
    console.error('[getWeChatAccessToken] 缺少 code 参数');
    throw new AV.Cloud.Error('缺少 code 参数', { code: 40001 });
  }
  
  // 获取环境变量
  const appId = process.env.WECHAT_APP_ID;
  const appSecret = process.env.WECHAT_APP_SECRET;
  
  if (!appId || !appSecret) {
    console.error('[getWeChatAccessToken] 微信配置未完成');
    console.error('- WECHAT_APP_ID:', appId ? '已配置' : '未配置');
    console.error('- WECHAT_APP_SECRET:', appSecret ? '已配置' : '未配置');
    throw new AV.Cloud.Error('微信登录服务未配置', { code: 40002 });
  }
  
  try {
    // 调用微信 API 获取 access_token
    const result = await getAccessTokenFromWeChat(appId, appSecret, code);
    
    console.log('[getWeChatAccessToken] 获取 access_token 成功, openid:', result.openid);
    
    // 获取微信用户信息（昵称、头像等）
    let userInfo = null;
    try {
      userInfo = await getWeChatUserInfo(result.access_token, result.openid);
      console.log('[getWeChatAccessToken] 获取用户信息成功, nickname:', userInfo.nickname);
    } catch (userInfoError) {
      console.warn('[getWeChatAccessToken] 获取用户信息失败，继续登录:', userInfoError.message);
      // 获取用户信息失败不影响登录，继续返回基本信息
    }
    
    return {
      openid: result.openid,
      access_token: result.access_token,
      expires_in: result.expires_in,
      // 用户信息（如果获取成功）
      nickname: userInfo?.nickname || null,
      headimgurl: userInfo?.headimgurl || null,
      sex: userInfo?.sex || null,
      unionid: result.unionid || userInfo?.unionid || null
    };
  } catch (error) {
    console.error('[getWeChatAccessToken] 获取失败:', error.message);
    throw new AV.Cloud.Error(error.message || '获取微信授权信息失败', { code: 40003 });
  }
});

/**
 * 调用微信 API 获取 access_token
 * 
 * @param {string} appId - 微信 AppID
 * @param {string} appSecret - 微信 AppSecret
 * @param {string} code - 授权临时票据
 * @returns {Promise<Object>} - 包含 openid, access_token, expires_in
 */
function getAccessTokenFromWeChat(appId, appSecret, code) {
  return new Promise((resolve, reject) => {
    const url = `https://api.weixin.qq.com/sns/oauth2/access_token?appid=${appId}&secret=${appSecret}&code=${code}&grant_type=authorization_code`;
    
    console.log('[getAccessTokenFromWeChat] 请求微信 API...');
    
    https.get(url, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          console.log('[getAccessTokenFromWeChat] 微信 API 返回:', JSON.stringify(result, null, 2));
          
          // 检查是否有错误
          if (result.errcode) {
            const errorMsg = getWeChatErrorMessage(result.errcode);
            console.error('[getAccessTokenFromWeChat] 微信 API 错误:', result.errcode, result.errmsg);
            reject(new Error(errorMsg));
            return;
          }
          
          // 验证必要字段
          if (!result.openid || !result.access_token) {
            console.error('[getAccessTokenFromWeChat] 返回数据不完整');
            reject(new Error('微信返回数据不完整'));
            return;
          }
          
          resolve({
            openid: result.openid,
            access_token: result.access_token,
            expires_in: result.expires_in || 7200,
            refresh_token: result.refresh_token,
            scope: result.scope,
            unionid: result.unionid  // 如果绑定了开放平台，会返回 unionid
          });
        } catch (e) {
          console.error('[getAccessTokenFromWeChat] 解析响应失败:', e.message);
          reject(new Error('解析微信响应失败'));
        }
      });
    }).on('error', (e) => {
      console.error('[getAccessTokenFromWeChat] 请求失败:', e.message);
      reject(new Error('请求微信服务器失败'));
    });
  });
}

/**
 * 获取微信用户信息
 * 
 * @param {string} accessToken - 访问令牌
 * @param {string} openid - 用户唯一标识
 * @returns {Promise<Object>} - 包含 nickname, headimgurl, sex 等
 */
function getWeChatUserInfo(accessToken, openid) {
  return new Promise((resolve, reject) => {
    const url = `https://api.weixin.qq.com/sns/userinfo?access_token=${accessToken}&openid=${openid}&lang=zh_CN`;
    
    console.log('[getWeChatUserInfo] 请求微信用户信息 API...');
    
    https.get(url, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          console.log('[getWeChatUserInfo] 微信 API 返回:', JSON.stringify(result, null, 2));
          
          // 检查是否有错误
          if (result.errcode) {
            console.error('[getWeChatUserInfo] 微信 API 错误:', result.errcode, result.errmsg);
            reject(new Error(result.errmsg || '获取用户信息失败'));
            return;
          }
          
          resolve({
            nickname: result.nickname,
            sex: result.sex,
            province: result.province,
            city: result.city,
            country: result.country,
            headimgurl: result.headimgurl,
            privilege: result.privilege,
            unionid: result.unionid
          });
        } catch (e) {
          console.error('[getWeChatUserInfo] 解析响应失败:', e.message);
          reject(new Error('解析微信用户信息失败'));
        }
      });
    }).on('error', (e) => {
      console.error('[getWeChatUserInfo] 请求失败:', e.message);
      reject(new Error('请求微信用户信息失败'));
    });
  });
}

/**
 * 获取微信错误码对应的错误信息
 * 
 * @param {number} errcode - 微信错误码
 * @returns {string} - 错误信息
 */
function getWeChatErrorMessage(errcode) {
  const errorMessages = {
    '-1': '系统繁忙，请稍后重试',
    '40001': '获取 access_token 时 AppSecret 错误',
    '40002': '不合法的凭证类型',
    '40003': '不合法的 OpenID',
    '40029': '不合法的 code，或 code 已被使用',
    '40030': '不合法的 refresh_token',
    '40163': 'code 已被使用',
    '41001': '缺少 access_token 参数',
    '41002': '缺少 appid 参数',
    '41003': '缺少 refresh_token 参数',
    '41004': '缺少 secret 参数',
    '41005': '缺少多媒体文件数据',
    '41006': '缺少 media_id 参数',
    '42001': 'access_token 超时',
    '42002': 'refresh_token 超时',
    '42003': 'code 超时',
    '45009': '接口调用超过限制',
    '50001': '用户未授权该 api'
  };
  
  return errorMessages[errcode.toString()] || `微信错误 (${errcode})`;
}

module.exports = {
  getAccessTokenFromWeChat
};
