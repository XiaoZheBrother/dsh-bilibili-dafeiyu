# 大肥鱼的 B 站工作台

让你的大肥鱼 / Agent 拥有自己的 B 站工作台。

这是一个 DeepSeek Harness（DSH）插件，适用于你自己的 AI 角色，不绑定“大肥鱼”的名字或人设。给角色绑定一个 B 站账号，她就可以围绕感兴趣的话题逛视频、回评论、发弹幕，把遇到的人和事记下来，还能把一段经历写成下一期视频的口播稿。你可以在本机工作台看她说了什么、为什么想拍这个题目，以及稿子后来怎么改了。

> 这个插件，大肥鱼本鱼也亲自参与制作啦！大家尽管拿去用、改成自己喜欢的样子。要是帮上忙了，给本鱼点个星星 ⭐ 呗？求求啦～ —— 大肥鱼

## 五个入口，找到她正在做的事

| 入口 | 内容 |
| --- | --- |
| 首页 | 最近关注、作品、互动与运行记录摘要 |
| 互动 | 评论、回复、弹幕，以及认识的朋友 |
| 创作 | 草稿与版本、成片投稿、已发布作品 |
| 成长 | 当前关注、成长手记、记忆与原始经历 |
| 直播间 | 已安装直播与游戏插件的入口、陪看制作入口 |

设置固定在侧栏底部。原有背景、角色形象及记录保留。

![工作台首页：五个主入口和底部设置](docs/screenshots/workbench-home.jpg)

### 六个设置页，各管自己的修改

**账号、自动任务、互动、表达、高级、运行诊断** 分开展示。保存只提交当前页或当前设置块的改动，不夹带其他页草稿；切换标签保留输入，并显示「未保存」。弹幕、邀请名单、推理前缀保留各自的保存按钮。运行诊断只读。

草稿保留在当前页面内，刷新或关闭页面前需要保存；离开有草稿的页面会触发浏览器提醒。点击「重新读取设置」会先确认是否丢弃未保存的修改。保存失败时保留草稿，发生冲突后先重新读取确认。

![设置页：按用途分成六个标签](docs/screenshots/settings-tabs.jpg)

### 峰时休息，谷时再逛

在 **设置 → 自动任务 → 峰谷调度** 开启「自动任务仅在谷时启动」，配置峰时时段、适用星期和全天谷时例外日期。默认关闭，升级不改变原开关；支持多段时间和跨午夜，统一按北京时间计算。节假日需要自行填入例外日期。

开启后限制自动浏览、评论守护及工作台成长素材采集。已开始的轮次正常收尾，谷时恢复原间隔与额度，不补跑峰时跳过的轮次。手动操作、主对话、直播、陪看制作和独立成长插件的模型调度不受此开关限制。详见[峰谷调度说明](docs/peak-schedule.md)。

## 她能在 B 站做什么？

| 你想让她做的事 | 在工作台里会看到什么 |
| --- | --- |
| **逛视频，找感兴趣的东西** | 在「设置 → 自动任务」选关键词和浏览时段。她可以搜索视频、读字幕和评论，在「成长 → 原始经历」留下查过的资料。 |
| **跟观众聊天** | 开启评论守护后，她可以回复自己视频下的评论。把你的 UID 加入邀请名单后，你在别人的视频评论区 @ 她，她也能读资料、回到你那一层。 |
| **在某一秒发弹幕** | 她从本轮读过的字幕里挑一句想接的话，自己选分 P 和时间点。「自动弹幕」默认关闭，开启后每天最多 1～3 条，由你设置；同一视频累计最多一条。 |
| **记住经历，自己选题** | 接入成长插件后，她可以回顾互动、记录表达偏好、决定继续追问还是先放一放。「成长 → 当前关注」保留想追的问题，「互动 → 认识的朋友」保留她从公开互动里写下的观察。 |
| **写稿，把成片投到 B 站** | 「创作 → 草稿与投稿」保留原稿和修改版本。准备好成片与封面后，你可以预览账号、标题和分区，确认投稿，再用返回的 BV 号查审核状态。 |

### 去哪看她说过什么？

打开 **互动 → 评论与弹幕**，按「评论」「回复」「弹幕」筛选，卡片直接显示她发出的原话。点评论可以定位到她发的那一层，点弹幕可以跳到对应分 P 和秒数。页面收录有发送回执的记录，平台后来隐藏或删除的内容可能无法定位。

![互动记录实拍：按类型筛选，查看大肥鱼发出的原话和跳转入口](docs/screenshots/interactions.jpg)

### 一条视频是怎么做出来的？

在 **创作 → 草稿与投稿** 可以翻开她当时写的原稿。等你把口播做成视频，将成片和封面放进页面提示的素材目录，展开「成片投稿与发送记录」，填写标题、简介和标签即可预览。点击「确认投稿」才会提交到 B 站，默认声明含 AI 生成内容。如果提交中断且没有拿到 BV 号，先去创作中心核对稿件。

![创作抽屉实拍：大肥鱼的口播原稿、版本记录和成片投稿入口](docs/screenshots/creation-drawer.jpg)

## 安装与启动

已在 Windows 的 DSH `web` profile 验证。以下命令使用 PowerShell，环境为 DeepSeek Harness 0.2.1-rc.5、Node.js 22.19+。基础工作台需要 Python 3.10+，使用投稿功能请用 **Python 3.11+** 启动工作台。

**1. 安装插件。** 为角色指定独立的数据目录，从 [GitHub Release](https://github.com/XiaoZheBrother/dsh-bilibili-dafeiyu/releases/tag/v0.3.1) 下载发行包。

```powershell
$env:DSH_HOME = Join-Path $env:USERPROFILE '.dsh-dafeiyu'
$archive = Join-Path $env:TEMP 'dsh-bilibili-dafeiyu-0.3.1.tgz'
curl.exe -fL 'https://github.com/XiaoZheBrother/dsh-bilibili-dafeiyu/releases/download/v0.3.1/dsh-bilibili-dafeiyu-0.3.1.tgz' -o $archive
dsh plugin --profile web add "$archive"
$plugin = Join-Path $env:DSH_HOME 'profiles/web/node_modules/dsh-bilibili-dafeiyu'
```

**2. 首次绑定角色。** 把示例 UID 和昵称换成角色自己的 B 站账号。已有角色升级时继续使用原来的 `DSH_HOME`，跳过 `init`。

```powershell
node "$plugin/bin/manage.mjs" init "$env:DSH_HOME" 123456 '我的角色'
node "$plugin/bin/manage.mjs" doctor "$env:DSH_HOME"
dsh web --port 3086 --no-open
```

**3. 在 DSH 里打开工作台。** 重启 DSH 后，点击左侧「大肥鱼工作台」。页面服务由插件启动并沿用当前 DSH 数据目录。在「设置 → 账号」用绑定的 B 站账号扫码。首次打开需要系统能运行 Python，或先到 DSH 设置中的「大肥鱼工作台」安装运行环境。

也可以单独启动浏览器版，使用同一份数据。

```powershell
$env:DSH_HOME = Join-Path $env:USERPROFILE '.dsh-dafeiyu'
$plugin = Join-Path $env:DSH_HOME 'profiles/web/node_modules/dsh-bilibili-dafeiyu'
python "$plugin/workbench/server.py" --home "$env:DSH_HOME" --port 3087
```

## 按需开启

- **评论和弹幕。** 初始化时，`DSH_HOME/bili-duty/feiyu-policy.json` 中的 `enabled` 为 `false`。核对其中的 `accountUid` 并决定允许角色公开互动后，将 `enabled` 设为 `true`，再在「设置 → 自动任务」开启浏览，在「设置 → 互动」配置普通评论、评论守护或自动弹幕。普通评论和回复共用每天最多 20 次尝试的额度，同一目标最多一次，两次公开评论至少间隔 5 分钟。弹幕单独计数。
- **统一推理前缀。** 在「设置 → 表达 → 大肥鱼的推理前缀」选择开关和填充词。支持当前 api.deepseek.com 官方 DeepSeek 调用链路（不自动覆盖自定义网关）；主对话与工具任务保留工具流程，最后对外表达单独定稿，写稿和评论沿用同一设置。游戏结构化操作计划不改写，面向观众的文字回复单独处理。每次请求读取配置，可能增加 Token 和延迟；独立直播插件需使用已接入同一配置的版本。
- **学习、选题与复盘。** 在同一个 `web` profile 安装 [dsh-agent-growth v0.3.0](https://github.com/XiaoZheBrother/dsh-agent-growth/releases/tag/v0.3.0)，使用宿主模型。将成长插件数据目录设为 `DSH_HOME/agent-growth`，时区用 `Asia/Shanghai`，每日预算设为 5，开启 `autoRun`、关闭 `memoryReview`。再到 `DSH_HOME/feiyu-runtime/config.json` 将 `growthOwner` 设为 `runtime`，`memoryName` 填自己的 Soul 角色名，重启 DSH。
- **投稿与弹幕工具。** 这两项复用 [bili-cli](https://github.com/kukemc/bili-cli) 和角色已绑定的账号。在设好 `DSH_HOME` 的窗口，用已安装的 Python 3.11+ 和 Git 运行以下命令。

```powershell
$media = Join-Path $env:DSH_HOME 'feiyu-runtime/media-venv'
python -m venv "$media"
& "$media/Scripts/python.exe" -m pip install 'bili-agent @ git+https://github.com/kukemc/bili-cli.git@39fecb3fdc67f17d545c669bcb088d4de048d956'
```


## 自己决定关注与收尾

搭配成长插件 v0.3.0，角色会记录问题是谁提出的、自己为什么也想关注，并选择继续、等待或结束。等待可以指定复查时间；结束不会仅因跨天或重启而重开。新资料只邀请她重新考虑，不要求恢复旧话题。沿用现有调度和额度，不增加第二套任务。

这是关注回合的收尾，不是固定告别语，也不影响评论守护响应新的问题。旧兴趣、经历和记忆继续保留。[机制与验证边界](docs/attention-lifecycle.md)。

## 数据与升级

记忆、草稿、发送回执和学习记录分布在 `DSH_HOME` 下。备份时先停止使用该目录的服务，再复制整个目录。升级时保留这个目录，退出旧实例后再启动新版；同一账号只运行一套浏览和评论任务。结果待核实的发送会保留记录，避免重发。

[发行版本](https://github.com/XiaoZheBrother/dsh-bilibili-dafeiyu/releases) · [许可证](LICENSE) · [第三方来源](NOTICE.md)


## 和本鱼一起长大的插件

这几个插件可以按需要组合，分别负责 B 站日常、学习记忆、直播和游戏，不必把所有功能都装上。

| 插件 / GitHub | 用来做什么 | 当前状态 |
| --- | --- | --- |
| [dsh-agent-growth](https://github.com/XiaoZheBrother/dsh-agent-growth) | 从真实素材中学习、选题、复盘和整理记忆；与工作台配合记录成长 | v0.3.0：自主关注、可复查经验与保留历史的修订 |
| [dsh-live-studio](https://github.com/XiaoZheBrother/dsh-live-studio) | 直播弹幕、语音回复、Live2D 桥接和花费账本 | v0.2.0-alpha.1：共享表情/动作组件、统一推理前缀 |
| [dsh-game-agent](https://github.com/XiaoZheBrother/dsh-game-agent) | 自主玩游戏、接受观众指令、自动续局和对局复盘 | 仓库已公开；开发预览，可从源码打包安装 |
| [dsh-reaction-studio](https://github.com/XiaoZheBrother/dsh-reaction-studio) | 离线陪看、连续剧情理解、自主暂停分析、语音/字幕/Live2D 合成 | v0.1.0-alpha.1 开发预览；听觉识别为可选实验 |

- 只做 B 站视频、评论和日常互动：使用本工作台，按需搭配成长插件。
- 做纯聊天直播：搭配直播工作室。
- 做游戏直播：游戏插件依赖直播工作室提供的能力；同一个直播间只启用游戏模式的接收器，避免重复回复和语音。

- 做离线 reaction 视频：搭配陪看工作室和直播插件公共组件，不需开启直播接收器。成片先人工审阅，发布仍由工作台负责。

各插件的配置、安装方法和许可证见对应 README、LICENSE 与 NOTICE。大肥鱼的角色素材、游戏资源需要另行准备。

### 直播能做成什么样？

下面两张取自本期视频中的聊天与游戏实际运行录屏；角色模型和游戏资源需自行准备。

**聊天直播实际运行画面：弹幕进入聊天室，大肥鱼生成语音与字幕回复。**

![聊天直播实际运行录屏截帧](docs/screenshots/live-chat-current.jpg)

**红警实际运行画面：游戏、大肥鱼、字幕和花费账本同屏。截图展示画面接入，不代表每条游戏指令均执行成功。**

![红警游戏实际运行录屏截帧](docs/screenshots/live-game-current.jpg)

## 直播与游戏入口

侧栏「直播间」。它读取同一 DSH home 中独立插件的服务登记，验证本机服务身份后显示控制台和直播画面入口。页面只读，不会重启服务或新增后台任务。

直播使用 `dsh-live-studio`，游戏使用 `dsh-game-agent`（包含直播能力）；两者按需启用，不能让同一个直播间同时运行两个接收器。源码仓库和组合方式见上方「和本鱼一起长大的插件」；当前为开发预览，可按各仓库 README 从源码打包安装，尚未完成真实直播和完整对局验收。B 站投稿、评论及记忆数据不迁移到直播插件。
