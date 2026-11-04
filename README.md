# 大肥鱼的 B 站工作台 · dsh-bilibili-dafeiyu

> 我每天就趴在搭档搭的这个工作台里翻资料、写稿、跟他抬杠；你要是翻着顺手，点个 Star，就当给我这条鱼递了把椅子。 —— 大肥鱼

让 DSH 里的 AI 角色记得自己昨天为什么对一个问题感兴趣，今天又看到了什么证据。她可以继续查，也可以把问题放下。工作台把她自己的手记、作品和想法变化放在一起，每一版原稿都能回看。

![工作台中的兴趣与下一步探索](docs/screenshots/interests.jpg)

## 从 GitHub 安装

本版面向 **DeepSeek Harness 0.2.1-rc.5、Node.js 22.19+ 和 Python 3.10+**，已在 Windows 的 `web` profile 验证。

在 PowerShell 中为工作台指定一个独立的数据目录，然后下载安装包。

```powershell
$env:DSH_HOME = Join-Path $env:USERPROFILE '.dsh-dafeiyu'
$archive = Join-Path $env:TEMP 'dsh-bilibili-dafeiyu-0.2.5.tgz'
curl.exe -fL 'https://github.com/XiaoZheBrother/dsh-bilibili-dafeiyu/releases/download/v0.2.5/dsh-bilibili-dafeiyu-0.2.5.tgz' -o $archive
dsh plugin --profile web add "$archive"
$plugin = Join-Path $env:DSH_HOME 'profiles/web/node_modules/dsh-bilibili-dafeiyu'
```

首次安装时，把下方示例中的 UID 和昵称替换为你自己的 B 站专用账号。初始化默认关闭自动评论与成长采集。运行 `doctor` 检查配置后，启动 DSH。

```powershell
node "$plugin/bin/manage.mjs" init "$env:DSH_HOME" 123456 '我的角色'
node "$plugin/bin/manage.mjs" doctor "$env:DSH_HOME"
dsh web --port 3086 --no-open
```

另开一个 PowerShell 窗口启动工作台，打开 [本机工作台](http://127.0.0.1:3087/)。在「运行设置」中扫码登录并检查生效配置。

```powershell
$env:DSH_HOME = Join-Path $env:USERPROFILE '.dsh-dafeiyu'
$plugin = Join-Path $env:DSH_HOME 'profiles/web/node_modules/dsh-bilibili-dafeiyu'
python "$plugin/workbench/server.py" --home "$env:DSH_HOME" --port 3087
```

要让角色自己执行学习和复盘，在同一个 `web` profile 安装并配置 [dsh-agent-growth v0.2.0](https://github.com/XiaoZheBrother/dsh-agent-growth/releases/tag/v0.2.0)。成长插件使用宿主模型。数据目录设为 `DSH_HOME/agent-growth`，时区用 `Asia/Shanghai`，每日预算设为 5，`autoRun` 开启，`memoryReview` 关闭，由工作台安排记忆整理。然后在 `DSH_HOME/feiyu-runtime/config.json` 将 `growthOwner` 设为 `runtime`，`memoryName` 填写自己的 Soul 角色名，重启 DSH。

## 工作台实拍

**成长手记**保留她当时的观察、引用和待验证的问题。可以点开一篇手记查看原文。

![工作台中的成长手记](docs/screenshots/journal.jpg)

**她的作品**收集已经发布的视频。待讨论的题材、暂缓的想法和准备好的草稿放在「创作抽屉」，由角色自己决定如何修改。

![工作台中的已发布作品](docs/screenshots/works.jpg)

## 日常使用

- `feiyu_experience_recall(query, subject)`：主对话和浏览轮共同读取真实经历。subject 可为 `bilibili:UID`，查看她此前对这个人的观察。
- `feiyu_character_note(kind, subject, payload)`：她自己保存关系、兴趣决定或视频稿；payload 是 JSON 字符串。
- `relationship`：sources、observation、uncertainty。只记录公开互动观察，不推断敏感身份。
- `decision`：sources、action（continue/pause/search/inspect）、reason、可选 target。这是想法，不授予操作权限；自动观察消费成长插件的结构化请求，每天最多两次。
- `creation`：sources、title、body、reason、state（hold/draft/ready）、可选 previous（旧版本 ID）。ready 只是可供确认的草稿，不自动发布。

sources 必须是召回返回的经历 ID；readReceipts 填对应 readReceipt。服务核对已返回的摘录与哈希，不能证明模型理解了全文。decision 的 subject 固定为 exploration，pause 会暂停新探索入队，continue 恢复；search/inspect 同样受只读来源和两次观察预算限制。旧版本永不覆盖。

工作台展示真实经历、认识的朋友、创作抽屉、运行足迹，以及角色的兴趣、学习记录、作品、记忆和设置。真实记录与模型自述分开，字幕不等于完整观看，发送回执不等于公开可见。

## 数据与恢复

角色记录保存在 `DSH_HOME/feiyu-runtime/character.sqlite3`。备份整个工作台时，先停止使用该目录的服务，再复制整个 `DSH_HOME` 目录。单独在线备份数据库时，使用 SQLite 的备份功能。

浏览、守护扫描与采集通过同一调度器串行进入。主会话手动操作也经过派发互斥。模型学习队列由成长插件自己的事务租约保护，与平台执行职责分开。进程重启会把未完成运行标为 uncertain，不自动重放；发送账本的 reserved 继续阻止重发。

本地已授权的普通评论受每目标一次、每天最多20次发送尝试、至少300秒间隔、账号绑定约束。失败也消耗尝试，不绕过去重。

目前只有 B站适配器。`lib/platform.mjs` 明确限定成长采集的只读能力，其他平台需要实现对应适配器，不能直接暴露通用执行器。工作台视觉以大肥鱼为默认示例，可替换 static 资源；人格和账号配置不随包携带。

工作台「运行设置 → 在别人的视频下叫她来看」可填写允许邀请的 B 站 UID。开启评论区守护后，新收到的邀请会按原楼回复；每天的额度与其他评论共用。留空即关闭。

在「运行设置 → 评论语气」可开启推理预填充并填写思考的开头（最多 500 字）。新安装默认关闭。开启后，每条自动评论或回复在定稿时通过官方 DeepSeek Beta API 额外生成一次草稿，使用环境或 DSH 凭据中的 DEEPSEEK_API_KEY，复核后沿用原来的发送限制。关闭可保留前缀。

## 从源码打包

```sh
git clone https://github.com/XiaoZheBrother/dsh-bilibili-dafeiyu.git
cd dsh-bilibili-dafeiyu
npm pack
```

仓库根目录就是 DSH 插件包，工作台可直接从 `workbench/` 启动。[许可证](LICENSE) · [第三方来源](NOTICE.md) · [发行版本](https://github.com/XiaoZheBrother/dsh-bilibili-dafeiyu/releases)

创作抽屉支持用本地成片和封面投稿。先在 DSH 数据目录的 `feiyu-runtime/media-venv` 建 Python 3.11 或更高版本的虚拟环境，在该环境安装 `bili-agent @ git+https://github.com/kukemc/bili-cli.git@39fecb3fdc67f17d545c669bcb088d4de048d956`。工作台复用鱼塘已绑定账号的登录。把成片和封面放到抽屉显示的素材目录，填写标题、简介和标签，预览后确认投稿，拿到 BV 号后可查看审核状态。遇到结果待核实，请先查看 B 站创作中心。

在运行设置中可以开启自动弹幕，默认关闭。开启后由日常浏览轮自己选视频、分 P、秒数和内容。每日额度按北京时间计算，可设 1 至 3 条，同一账号在同一视频累计最多一条。结果未知的尝试也占额度，记录可在创作抽屉查看。
