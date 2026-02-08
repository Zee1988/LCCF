/**
 * 查询订单状态云函数
 * 
 * 功能：
 * 1. 验证用户登录
 * 2. 查询订单信息
 * 3. 验证订单归属
 * 4. 返回订单状态
 * 
 * 参数：
 * - orderId: LeanCloud订单ID
 * 
 * 返回：
 * - status: 订单状态（pending/paid/cancelled/expired）
 * - productType: 产品类型
 * - amount: 金额
 * - paidAt: 支付时间
 */

const AV = require('leanengine');

AV.Cloud.define('queryOrder', async (request) => {
  const { orderId } = request.params;
  const currentUser = request.currentUser;
  
  // 1. 验证用户登录
  if (!currentUser) {
    throw new AV.Cloud.Error('请先登录', { code: 401 });
  }
  
  // 2. 验证参数
  if (!orderId) {
    throw new AV.Cloud.Error('订单ID不能为空');
  }
  
  try {
    // 3. 查询订单
    const query = new AV.Query('Order');
    query.equalTo('objectId', orderId);
    query.equalTo('userId', currentUser);
    
    const order = await query.first({ useMasterKey: true });
    
    if (!order) {
      throw new AV.Cloud.Error('订单不存在');
    }
    
    console.log('查询订单成功:', {
      orderId: order.id,
      status: order.get('status'),
      productType: order.get('productType')
    });
    
    // 4. 返回订单信息
    return {
      status: order.get('status'),
      productType: order.get('productType'),
      amount: order.get('amount'),
      paidAt: order.get('paidAt')?.toISOString() || null
    };
    
  } catch (error) {
    console.error('查询订单失败:', error);
    
    if (error instanceof AV.Cloud.Error) {
      throw error;
    } else {
      throw new AV.Cloud.Error('查询订单失败：' + error.message);
    }
  }
});

module.exports = AV.Cloud;

