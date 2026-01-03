/**
 * 支付回调处理
 * 
 * 功能：
 * 1. 接收云勾支付的回调通知
 * 2. 验证签名防止伪造
 * 3. 更新订单状态
 * 4. 开通VIP权限
 * 5. 返回SUCCESS确认
 * 
 * 这个文件需要部署为云引擎的Express路由
 * 路由地址：/api/payment/callback
 */

const AV = require('leanengine');
const crypto = require('crypto');

// 配置信息
const YUNGOU_API_KEY = process.env.YUNGOU_API_KEY || 'YOUR_YUNGOU_API_KEY';

/**
 * 计算签名
 */
function calculateSign(params, key) {
  // 将参数按字典序排序
  const sortedKeys = Object.keys(params).sort();
  const signStr = sortedKeys
    .filter(k => k !== 'sign' && params[k] !== '' && params[k] !== null && params[k] !== undefined)
    .map(k => `${k}=${params[k]}`)
    .join('&');
  
  const fullStr = `${signStr}&key=${key}`;
  return crypto.createHash('md5').update(fullStr).digest('hex').toUpperCase();
}

/**
 * 支付回调处理函数
 */
async function handlePaymentCallback(req, res) {
  try {
    console.log('收到支付回调:', req.body);
    
    const {
      out_trade_no,
      transaction_id,
      total_fee,
      attach,
      sign
    } = req.body;
    
    // 1. 验证签名
    const calcSign = calculateSign({
      out_trade_no,
      transaction_id,
      total_fee
    }, YUNGOU_API_KEY);
    
    if (sign !== calcSign) {
      console.error('签名验证失败:', { sign, calcSign });
      return res.send('FAIL');
    }
    
    console.log('签名验证成功');
    
    // 2. 解析附加数据
    let attachData;
    try {
      attachData = JSON.parse(attach);
    } catch (e) {
      console.error('解析attach失败:', e);
      return res.send('FAIL');
    }
    
    const { userId, productType } = attachData;
    
    // 3. 查询订单
    const query = new AV.Query('Order');
    query.equalTo('outTradeNo', out_trade_no);
    const order = await query.first({ useMasterKey: true });
    
    if (!order) {
      console.error('订单不存在:', out_trade_no);
      return res.send('FAIL');
    }
    
    // 4. 更新订单状态（幂等性处理）
    const currentStatus = order.get('status');
    if (currentStatus === 'paid') {
      console.log('订单已支付，跳过处理');
      return res.send('SUCCESS');
    }
    
    if (currentStatus === 'pending') {
      order.set('status', 'paid');
      order.set('transactionId', transaction_id);
      order.set('paidAt', new Date());
      await order.save(null, { useMasterKey: true });
      
      console.log('订单状态更新为已支付:', order.id);
      
      // 5. 开通VIP
      const userQuery = new AV.Query('_User');
      const user = await userQuery.get(userId, { useMasterKey: true });
      
      if (user) {
        user.set('vipType', productType);
        user.set('vipPurchaseTime', new Date());
        
        // 设置过期时间（终身会员不设置过期时间）
        if (productType === 'lifetime') {
          user.set('vipExpireTime', null);
        }
        
        // 添加订单ID到用户的订单列表
        const orderIds = user.get('vipOrderIds') || [];
        orderIds.push(order.id);
        user.set('vipOrderIds', orderIds);
        
        await user.save(null, { useMasterKey: true });
        
        console.log('VIP开通成功:', {
          userId: user.id,
          vipType: productType
        });
      } else {
        console.error('用户不存在:', userId);
      }
    }
    
    // 6. 返回SUCCESS
    res.send('SUCCESS');
    
  } catch (error) {
    console.error('支付回调处理失败:', error);
    res.send('FAIL');
  }
}

module.exports = {
  handlePaymentCallback
};

