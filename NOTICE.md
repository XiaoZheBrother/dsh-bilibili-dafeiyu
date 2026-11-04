# 大肥鱼运行插件来源说明

本插件以 MIT 许可提供，基于 YOYOLnFu 的 dsh-bili-pond 1.3.14 与本地已授权补丁。LICENSE 保留上游版权。

本次原创模块为 character-store、experience-adapter、coordinator、growth-bridge、character-tools、platform、工作台及安装诊断；登录、B站协议、字幕和既有发送门禁仍有上游/既有本地实现，不声称全部从零重写。

以下保留原鱼塘 NOTICE；其中“本项目”“已重写”“不兼容”是该上游项目对它的前身的描述，不是本插件对鱼塘的声明。

---

# NOTICE

本项目（`dsh-bili-pond`，中文名「B站鱼塘」）以 MIT 许可发布，完整许可文本见 [LICENSE](./LICENSE)。

## 衍生关系

本项目基于 `dsh-bili-scroll` 0.1.10 衍生：

- 上游项目：https://github.com/c1overzz/dsh-bili-scroll
- 上游版权：Copyright (c) 2026 dsh-bili-duty contributors
- 上游许可：MIT

调度、模型选择、报告渲染、内容筛选、投递逻辑与安全闸均已重写。本项目不跟随上游版本，
也不与其兼容。按 MIT 要求在上述版权行中保留上游版权声明。

## 内嵌第三方代码

`vendor/bilibili-mcp/`

- 项目：bilibili-mcp
- 许可：MIT，Copyright (c) 2026 AGI_Ananas
- 完整许可见该目录下的 `LICENSE` 文件
