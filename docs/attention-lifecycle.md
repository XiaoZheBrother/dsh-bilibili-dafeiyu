# 自主关注与收尾

在现有 GrowthBridge 探索队列中使用 dsh-agent-growth 的探索结果，不另起定时器或发送通道。设计参考 Surfcore 的[目的机制](https://github.com/Mieksido/surfcore/blob/main/docs/guides/PURPOSE_OUTREACH.md)，实现为本项目现有协议的增量字段，没有复制源码。

- `interests[].ownership`：模型记录目标的提出者（self/partner/viewer/other/unknown）、归属依据与自己是否也在意。别人的请求不会被程序直接转成她的愿望。
- `attention.decision`：continue 允许下一次继续思考，即使没有查资料请求；wait 等待模型给定的 revisitAt 或新资料；end 不因跨天、重启而重开。
- 明确的新 continue/search/inspect 决定可以重新邀请探索，明确 pause 优先停止。新资料仅邀请模型重新考虑，不指定要恢复哪个兴趣。
- wait/end 不允许同时携带查资料请求；旧格式仍可读，新格式包含 ownership 时必须保存 attention，避免模型遗漏收尾决定。
- 仍使用原预算、在途任务互斥、稳定任务 ID、只读观察去重；没有新增公共发言权限，不改变评论回复开关。

新资料判断只支持成功的字幕文本、评论内容和搜索结果，与前次任务有限证据窗口比较；失败回执、重复内容、重新导入旧时间记录和自己的记忆不触发唤醒。这不是全历史语义去重。incoming/messageId 事件格式预留，当前真实评论主要通过 bili_comments 结果进入。长期等待可通过现有明确继续决定解除。

此处收尾是探索/关注回合的结束，不是强制每次聊天说结束语，也不自动屏蔽观众的新问题。没有新增口癖、句式、撒娇或总结模板。原始经历、旧结果及旧兴趣保留，不改写历史数据。

运行验证：针对性测试覆盖 wait/end、跨天、重启、重复读取、失败结果、continue 无 request、旧格式兼容、单次入队和原有观察去重；真实模型输出另在隔离目录校验，不覆盖原记录。
