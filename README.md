# 大肥鱼的 B 站工作台 · dsh-bilibili-dafeiyu

让 DSH 里的 AI 角色记得自己昨天为什么对一个问题感兴趣，今天又看到了什么证据。她可以继续查，也可以把问题放下。工作台把她自己的手记、作品和想法变化放在一起，每一版原稿都能回看。

![工作台中的兴趣与下一步探索](docs/screenshots/interests.jpg)

## 从 GitHub 安装

本版面向 **DeepSeek Harness 0.2.1-rc.5、Node.js 22.19+ 和 Python 3.10+**，已在 Windows 的 `web` profile 验证。仓库名是 `dsh-bilibili-dafeiyu`，DSH 安装后的包名沿用 `dsh-feiyu-runtime`，方便已有实例继续读取原来的数据。

先关闭正在使用同一数据目录的 DSH 实例。已有鱼塘用户请先备份数据并停用旧 bundle 和采集任务，保留已有的账号、记忆和发送账本。以下 PowerShell 命令适用于新实例。

```powershell
$env:DSH_HOME = Join-Path $env:USERPROFILE '.dsh-dafeiyu'
$archive = Join-Path $env:TEMP 'dsh-feiyu-runtime-0.2.0.tgz'
curl.exe -fL 'https://github.com/XiaoZheBrother/dsh-bilibili-dafeiyu/releases/download/v0.2.0/dsh-feiyu-runtime-0.2.0.tgz' -o $archive
dsh plugin --profile web add "$archive"
$plugin = Join-Path $env:DSH_HOME 'profiles/web/node_modules/dsh-feiyu-runtime'
```

首次安装时，把下方示例中的 UID 和昵称替换为你自己的 B 站专用账号。初始化默认关闭自动评论与成长采集。已有配置的用户直接执行 `doctor`。

```powershell
node "$plugin/bin/manage.mjs" init "$env:DSH_HOME" 123456 '我的角色'
node "$plugin/bin/manage.mjs" doctor "$env:DSH_HOME"
dsh web --port 3086 --no-open
```

另开一个 PowerShell 窗口启动工作台，打开 [本机工作台](http://127.0.0.1:3087/)。在「运行设置」中扫码登录并检查生效配置。

```powershell
$env:DSH_HOME = Join-Path $env:USERPROFILE '.dsh-dafeiyu'
$plugin = Join-Path $env:DSH_HOME 'profiles/web/node_modules/dsh-feiyu-runtime'
python "$plugin/workbench/server.py" --home "$env:DSH_HOME" --port 3087
```

要让角色自己执行学习和复盘，在同一个 `web` profile 安装并配置 [dsh-agent-growth v0.2.0](https://github.com/XiaoZheBrother/dsh-agent-growth/releases/tag/v0.2.0)。成长插件使用宿主模型。数据目录设为 `DSH_HOME/agent-growth`，时区用 `Asia/Shanghai`，每日预算设为 5，`autoRun` 开启，`memoryReview` 关闭以沿用本插件的记忆整理排班。然后在 `DSH_HOME/feiyu-runtime/config.json` 将 `growthOwner` 设为 `runtime`，`memoryName` 填写自己的 Soul 角色名，重启 DSH。

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

工作台展示真实经历、认识的朋友、创作抽屉、运行足迹，以及原有兴趣、学习、作品、记忆和设置。真实记录与模型自述分开，字幕不等于完整观看，发送回执不等于公开可见。

## 数据与恢复

新库：`DSH_HOME/feiyu-runtime/character.sqlite3`。原 `bili-duty`、`agent-growth`、`soul-md` 保留；旧经历只读导入，新增记忆使用新文件，不覆盖旧记忆。SQLite 状态不要在运行时直接复制，备份应使用 SQLite backup 或停机复制。

浏览、守护扫描与采集通过同一调度器串行进入。主会话手动操作也经过派发互斥。模型学习队列由成长插件自己的事务租约保护，与平台执行职责分开。进程重启会把未完成运行标为 uncertain，不自动重放；发送账本的 reserved 继续阻止重发。

本地已授权的普通评论仍受每目标一次、每天最多20次发送尝试、至少300秒间隔、账号绑定约束。失败也消耗尝试，不绕过去重。新增发布、私信、安装插件不在自动执行范围。

目前只有 B站适配器。`lib/platform.mjs` 明确限定成长采集的只读能力，其他平台需要实现对应适配器，不能直接暴露通用执行器。工作台视觉以大肥鱼为默认示例，可替换 static 资源；人格和账号配置不随包携带。

## 从源码打包

```sh
git clone https://github.com/XiaoZheBrother/dsh-bilibili-dafeiyu.git
cd dsh-bilibili-dafeiyu
npm pack
```

仓库根目录就是 DSH 插件包，工作台可直接从 `workbench/` 启动。B 站登录、字幕和兼容协议复用了 MIT 授权的上游实现。[许可证](LICENSE) · [第三方来源](NOTICE.md) · [发行版本](https://github.com/XiaoZheBrother/dsh-bilibili-dafeiyu/releases)
