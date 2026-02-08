/**
 * 创建支付订单云函数
 * 
 * 功能：
 * 1. 验证用户登录状态
 * 2. 生成商户订单号
 * 3. 调用云勾支付API创建订单
 * 4. 保存订单到数据库
 * 5. 返回支付参数供App调起微信支付
 * 
 * 参数：
 * - productType: 产品类型（lifetime）
 * 
 * 返回：
 * - orderId: LeanCloud订单ID
 * - outTradeNo: 商户订单号
 * - appId: 微信AppID
 * - partnerId: 商户号
 * - prepayId: 预支付ID
 * - package: 扩展字段
 * - nonceStr: 随机字符串
 * - timeStamp: 时间戳
 * - sign: 签名
 */

const AV = require('leanengine');
const axios = require('axios');

// 配置信息（需要在LeanCloud云引擎环境变量中配置）
const YUNGOU_MCH_ID = process.env.YUNGOU_MCH_ID || 'YOUR_YUNGOU_MCH_ID';
const YUNGOU_API_KEY = process.env.YUNGOU_API_KEY || 'YOUR_YUNGOU_API_KEY';
const PAYMENT_NOTIFY_URL = process.env.PAYMENT_NOTIFY_URL || 'https://your-app.leanapp.cn/api/payment/callback';
const YUNGOU_APP_PAY_URL = 'https://api.pay.yungouos.com/api/pay/wxpay/appPay';

// 价格配置（单位：分）
const PRICE_MAP = {
  lifetime: 6900  // ¥69
};

AV.Cloud.define('createOrder', async (request) => {
  const { productType } = request.params;
  const currentUser = request.currentUser;
  
  // 1. 验证用户登录
  if (!currentUser) {
    throw new AV.Cloud.Error('请先登录', { code: 401 });
  }
  
  // 2. 验证产品类型
  if (!productType || !PRICE_MAP[productType]) {
    throw new AV.Cloud.Error('无效的产品类型');
  }
  
  // 3. 检查配置
  if (YUNGOU_MCH_ID === 'YOUR_YUNGOU_MCH_ID' || YUNGOU_API_KEY === 'YOUR_YUNGOU_API_KEY') {
    throw new AV.Cloud.Error('支付功能尚未配置，请联系开发者');
  }
  
  const amount = PRICE_MAP[productType];
  
  // 4. 生成商户订单号（格式：VIP_用户ID_时间戳）
  const outTradeNo = `VIP_${currentUser.id}_${Date.now()}`;
  
  // 5. 调用云勾支付API创建订单
  try {
    console.log('调用云勾支付API:', {
      mch_id: YUNGOU_MCH_ID,
      out_trade_no: outTradeNo,
      total_fee: amount,
      body: `英语学习VIP-${productType}`,
      notify_url: PAYMENT_NOTIFY_URL
    });
    
    const response = await axios.post(YUNGOU_APP_PAY_URL, {
      mch_id: YUNGOU_MCH_ID,
      out_trade_no: outTradeNo,
      total_fee: amount,
      body: `英语学习VIP-${productType}`,
      notify_url: PAYMENT_NOTIFY_URL,
      attach: JSON.stringify({ 
        userId: currentUser.id, 
        productType: productType 
      }),
      key: YUNGOU_API_KEY
    });
    
    console.log('云勾支付API返回:', response.data);
    
    if (response.data.code !== 0) {
      throw new AV.Cloud.Error('创建订单失败：' + response.data.msg);
    }
    
    const payData = response.data.data;
    
    // 6. 保存订单到数据库
    const Order = AV.Object.extend('Order');
    const order = new Order();
    
    order.set('orderId', payData.order_id);
    order.set('userId', currentUser);
    order.set('productType', productType);
    order.set('amount', amount);
    order.set('status', 'pending');
    order.set('payMethod', 'wxpay');
    order.set('outTradeNo', outTradeNo);
    
    await order.save();
    
    console.log('订单保存成功:', order.id);
    
    // 7. 返回支付参数
    return {
      orderId: order.id,
      outTradeNo: outTradeNo,
      appId: payData.appid,
      partnerId: payData.partnerid,
      prepayId: payData.prepay_id,
      package: payData.package,
      nonceStr: payData.noncestr,
      timeStamp: payData.timestamp,
      sign: payData.sign
    };
    
  } catch (error) {
    console.error('创建订单失败:', error);
    
    if (error.response) {
      // HTTP错误
      throw new AV.Cloud.Error('创建订单失败：' + (error.response.data?.msg || error.message));
    } else if (error instanceof AV.Cloud.Error) {
      // 已经是Cloud.Error，直接抛出
      throw error;
    } else {
      // 其他错误
      throw new AV.Cloud.Error('创建订单失败：' + error.message);
    }
  }
});

module.exports = AV.Cloud;

