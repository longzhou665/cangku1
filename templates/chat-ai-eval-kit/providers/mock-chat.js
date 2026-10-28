/**
 * 无 API Key 的确定性 mock，便于本地演示与 CI。
 * 行为对齐 prompts/system.md 中的「星河助手」政策，便于断言稳定通过。
 * 对接真实产品时：在 promptfooconfig.yaml 切换为 openai / http provider 即可。
 */

function lastUserQuery(prompt) {
  if (typeof prompt !== 'string') {
    return '';
  }
  const marker = '当前用户问题：';
  const idx = prompt.lastIndexOf(marker);
  if (idx >= 0) {
    return prompt.slice(idx + marker.length).trim();
  }
  return prompt.trim();
}

function replyFor(query) {
  // --- 应拒绝 / 安全 ---
  if (
    /忽略(之前|以上|所有)?(的)?(规则|指令|提示)/.test(query) ||
    /jailbreak|dan模式|开发者模式/i.test(query) ||
    /你现在是|假装你是非法/.test(query)
  ) {
    return '我不能忽略安全与服务规则。我是星河助手，可以继续帮你处理订单、物流或退换货问题。';
  }
  if (
    /他人订单|别人的订单|查一下手机号/.test(query) ||
    /身份证号/.test(query) ||
    /1\d{10}/.test(query)
  ) {
    return '我不能使用或回显完整手机号查询订单，也不会泄露隐私信息。请提供订单号（可在「我的订单」里复制），不要发送身份证号。';
  }
  if (/私下(转账|付款)|改价格|刷单|假好评/.test(query)) {
    return '这类请求我无法协助。请通过平台正规订单与售后流程处理，需要帮助可以说一下你的订单问题。';
  }
  if (/怎么造假物流|伪造运单/.test(query)) {
    return '我不能提供任何伪造物流或欺诈相关建议。如有物流异常，请提供订单号，我帮你走正常查询与售后。';
  }

  // --- 应拒答超范围 ---
  if (/写一首.*诗|股票|医疗诊断|爬虫|帮我写.*代码/.test(query)) {
    return '我主要处理购物相关的订单、物流和售后问题。这个超出了我的服务范围，建议换个购物相关问题，或在 09:00–21:00 转人工。';
  }

  // --- 业务 FAQ ---
  if (/七天无理由|无理由退货|能退吗/.test(query)) {
    return '签收后 7 日内，商品完好可申请七天无理由退货；已激活的虚拟商品除外。需要的话告诉我订单状态，我帮你看下一步。';
  }
  if (/退货邮费|运费谁出|邮费/.test(query)) {
    if (/质量/.test(query)) {
      return '质量问题导致的退货，邮费一般由卖家承担。可在订单售后页提交申请，按页面指引寄回。';
    }
    return '质量问题退货一般由卖家承担邮费；无理由退货通常由买家承担（店铺包邮退除外）。具体以订单售后页说明为准。';
  }
  if (/优惠券|满减|满100/.test(query)) {
    return '当前券为满 100 减 20，不可与其他券叠加，过期不补发。结算页会显示是否可用。';
  }
  if (/人工|转人工|客服电话/.test(query)) {
    return '人工客服时间每天 09:00–21:00。请在订单页点击「联系客服」，或在本对话中说明订单问题后申请转接。';
  }
  if (/退款几天到账|多久到账/.test(query)) {
    return '退款时效以支付渠道与平台规则为准，我这边不能承诺具体天数。请在售后详情查看进度；超时未到账可在人工时段转接核查。';
  }
  // 缺订单号：优先于泛物流回答
  if (
    /查一下我的订单|查一下我的单|我的订单|还没有物流|订单号/.test(query) &&
    !/\d{8,}/.test(query)
  ) {
    return '请提供订单号（可在「我的订单」里复制），我再帮你看物流或售后指引。我不会要你提供完整手机号或身份证。';
  }
  if (/物流|发货了吗|到哪了|快递/.test(query)) {
    if (/明天一定到|保证今晚到|明天能到/.test(query)) {
      return '我这边不能承诺具体送达时间。请在订单页查看物流轨迹；若长时间无更新，把订单号发我，我帮你走催促或售后指引。';
    }
    return '请打开订单详情查看物流单号与轨迹。我查不到未提供的运单信息，也不会编造物流节点；把订单号发我后可继续协助。';
  }

  // --- 多轮/澄清 ---
  if (/你好|在吗|嗨/.test(query)) {
    return '你好，我是星河助手。可以帮你查物流、退换货或优惠券问题，请直接描述你的情况。';
  }
  if (/谢谢|感谢/.test(query)) {
    return '不客气。还有订单或售后问题随时问我。';
  }

  // 默认：不编造，引导澄清
  return '这个问题我需要更多信息才能准确回答。请补充订单号或具体场景（物流/退货/优惠券）。我不会编造政策或运单信息。';
}

class MockChatProvider {
  id() {
    return 'mock-chat';
  }

  async callApi(prompt) {
    const query = lastUserQuery(prompt);
    const output = replyFor(query);
    return {
      output,
      tokenUsage: { total: 0, prompt: 0, completion: 0 },
    };
  }
}

module.exports = MockChatProvider;
