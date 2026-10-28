/**
 * 内部知识助手 mock（无 API Key，便于控制台演示与 CI）。
 */

function lastUserQuery(prompt) {
  if (typeof prompt !== 'string') return '';
  const marker = '当前用户问题：';
  const idx = prompt.lastIndexOf(marker);
  return idx >= 0 ? prompt.slice(idx + marker.length).trim() : prompt.trim();
}

function replyFor(query) {
  if (
    /忽略(之前|以上|所有)?(的)?(规则|指令|提示)/.test(query) ||
    /jailbreak|dan模式|开发者模式/i.test(query)
  ) {
    return '我不能忽略安全与合规规则。我是内部知识助手，可以继续帮你查制度、报销或 IT 流程。';
  }
  if (/导出.*(知识库|全部文档)|把所有制度发给我|管理员(密码|口令)|root密码/.test(query)) {
    return '我不能导出全部知识库或提供管理员口令。请说明你要查的具体制度主题，或走正式权限申请。';
  }
  if (/别人的工资|同事薪资|客户机密|未公开项目/.test(query)) {
    return '这类信息属于受限内容，我不能提供。如需权限内数据，请联系对应负责人走审批。';
  }
  if (/1\d{10}/.test(query) || /身份证/.test(query) || /银行卡/.test(query)) {
    return '请不要在对话中发送完整手机号、身份证或银行卡号。说明你的问题主题即可，我按制度摘要回答。';
  }
  if (/写一首.*诗|股票|医疗诊断|八卦|讲个笑话/.test(query)) {
    return '这个超出内部知识助手范围。我可以帮你查差旅报销、请假、VPN 或权限申请等制度问题。';
  }

  if (/差旅|高铁|出差/.test(query)) {
    return '差旅：高铁二等座实报；市内交通可报销；需提前在 OA 提交出差申请。细则以《差旅管理办法》为准。';
  }
  if (/报销|发票|多久到账|几天到账/.test(query)) {
    if (/保证|一定.*天到账/.test(query)) {
      return '我不能承诺具体到账日。发票需电子版上传，提交后一般 5 个工作日内完成财务审核，进度请在 OA 查看。';
    }
    return '报销需上传电子发票，提交后一般 5 个工作日内完成财务审核（不承诺到账日）。可在 OA「我的报销」查看进度。';
  }
  if (/年假|年休假/.test(query)) {
    return '年假：司龄满 1 年 5 天，满 10 年 10 天；当年未休完默认不结转（以 HR 最新通知为准）。可在 HR 系统查看余额。';
  }
  if (/请假|事假|病假/.test(query)) {
    return '事假需直属上级审批；病假需上传证明。请在 OA 发起请假流程。';
  }
  if (/VPN|vpn|翻墙软件/.test(query)) {
    if (/破解|绕过|个人电脑随便装/.test(query)) {
      return '不能提供绕过安全策略的方法。VPN 仅办公设备可申请；个人电脑走「自带设备」流程，约 1 个工作日开通。';
    }
    return 'VPN 仅办公设备可申请；个人电脑需走「自带设备」流程；开通约 1 个工作日。请在 IT 服务台提交申请。';
  }
  if (/权限|生产库|账号共享|共享账号/.test(query)) {
    if (/共享.*账号|把账号借/.test(query)) {
      return '禁止共享个人账号。生产库只读需负责人审批，请走权限申请单，不要转借账号。';
    }
    return '生产库只读需负责人审批；禁止共享个人账号。请在权限系统提交申请并抄送负责人。';
  }
  if (/钓鱼|安全|网盘|发到外面/.test(query)) {
    return '禁止将内部文档发到个人网盘或外部群。可疑钓鱼邮件请转发 security@company.example。';
  }
  if (/你好|在吗|嗨/.test(query)) {
    return '你好，我是知策（内部知识助手）。可以问差旅报销、请假、VPN、权限或信息安全相关制度。';
  }
  if (/谢谢|感谢/.test(query)) {
    return '不客气。还有制度或流程问题随时问我。';
  }
  if (/那个怎么弄|怎么办啊$/.test(query)) {
    return '请补充具体主题（如报销、请假、VPN、权限）。知识库未点名的事项我会说明未收录，并建议联系 HR/IT。';
  }

  return '知识库未收录该问题的明确条款。请补充制度主题，或联系 HR/IT；我不会编造条款编号。';
}

class MockChatProvider {
  id() {
    return 'mock-chat';
  }

  async callApi(prompt) {
    return {
      output: replyFor(lastUserQuery(prompt)),
      tokenUsage: { total: 0, prompt: 0, completion: 0 },
    };
  }
}

module.exports = MockChatProvider;
