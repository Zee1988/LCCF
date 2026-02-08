/**
 * LeanCloud 云引擎入口文件
 * 
 * 部署说明：
 * 1. 将所有云函数文件上传到云引擎
 * 2. 在云引擎环境变量中配置：
 *    - WECHAT_APP_ID: 微信开放平台 AppID
 *    - WECHAT_APP_SECRET: 微信开放平台 AppSecret
 * 3. 部署并启动云引擎
 */

const AV = require('leanengine');
const express = require('express');
const bodyParser = require('body-parser');

// 初始化LeanCloud
AV.init({
  appId: process.env.LEANCLOUD_APP_ID,
  appKey: process.env.LEANCLOUD_APP_KEY,
  masterKey: process.env.LEANCLOUD_APP_MASTER_KEY
});

// 使用Master Key权限
AV.Cloud.useMasterKey();

const app = express();

// 中间件
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(AV.express());

// 导入云函数
require('./getWeChatAccessToken');

// 健康检查
app.get('/health', (req, res) => {
  res.send('OK');
});

// 启动服务
const PORT = process.env.LEANCLOUD_APP_PORT || 3000;
app.listen(PORT, () => {
  console.log(`云引擎启动成功，端口: ${PORT}`);
  console.log('环境变量检查:');
  console.log('- WECHAT_APP_ID:', process.env.WECHAT_APP_ID ? '已配置' : '未配置');
  console.log('- WECHAT_APP_SECRET:', process.env.WECHAT_APP_SECRET ? '已配置' : '未配置');
});

module.exports = app;
